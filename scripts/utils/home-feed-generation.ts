import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const HOME_FEED_SEED_POLICY = "live-seed-dedupe" as const;

export type HomeFeedManifest = {
  generatedAt: string;
  pageSize: number;
  maxPages: number;
  lastPage: number;
  /** Number of JSON pages, excluding the SSR first page. */
  pages: number;
  hasMore: boolean;
  /** SSR is live; these JSON pages are a complete, independently versioned continuation. */
  seedPolicy: typeof HOME_FEED_SEED_POLICY;
  range: string;
  section: string;
};

export function createHomeFeedManifest(input: Omit<HomeFeedManifest, "pages" | "hasMore" | "seedPolicy">): HomeFeedManifest {
  return { ...input, pages: input.lastPage - 1, hasMore: input.lastPage >= 2, seedPolicy: HOME_FEED_SEED_POLICY };
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function requireContract(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid home feed generation: ${message}`);
}

/** Validate the prepared files without opening a database connection. */
export function validateHomeFeedGeneration(directory: string): HomeFeedManifest {
  const manifest = readJson(path.join(directory, "manifest.json"));
  requireContract(record(manifest), "manifest must be an object");
  requireContract(typeof manifest.generatedAt === "string" && Number.isFinite(Date.parse(manifest.generatedAt)), "generatedAt must be a date");
  requireContract(Number.isInteger(manifest.pageSize) && Number(manifest.pageSize) > 0, "pageSize must be positive");
  requireContract(Number.isInteger(manifest.maxPages) && Number(manifest.maxPages) >= 1, "maxPages must include the SSR page");
  requireContract(Number.isInteger(manifest.lastPage) && Number(manifest.lastPage) >= 1 && Number(manifest.lastPage) <= Number(manifest.maxPages), "lastPage must be within maxPages");
  const lastPage = Number(manifest.lastPage);
  requireContract(manifest.pages === lastPage - 1, "pages must count the JSON pages starting at 2");
  requireContract(manifest.hasMore === (lastPage >= 2), "hasMore must agree with lastPage");
  requireContract(manifest.seedPolicy === HOME_FEED_SEED_POLICY, "seedPolicy must declare live-seed-dedupe");
  requireContract(typeof manifest.range === "string" && manifest.range.length > 0, "range is required");
  requireContract(typeof manifest.section === "string" && manifest.section.length > 0, "section is required");

  const expectedFiles = new Set(["manifest.json"]);
  const seenIds = new Set<string>();
  for (let page = 2; page <= lastPage; page++) {
    const filename = `page-${page}.json`;
    expectedFiles.add(filename);
    const payload = readJson(path.join(directory, filename));
    requireContract(record(payload), `${filename} must be an object`);
    requireContract(payload.page === page && payload.pageSize === manifest.pageSize, `${filename} page metadata does not match`);
    requireContract(payload.range === manifest.range && payload.section === manifest.section, `${filename} feed does not match`);
    requireContract(payload.generatedAt === manifest.generatedAt, `${filename} generation does not match`);
    requireContract(Array.isArray(payload.posts) && payload.posts.length > 0 && payload.posts.length <= Number(manifest.pageSize), `${filename} must contain a nonempty page`);
    for (const post of payload.posts) {
      requireContract(record(post), `${filename} post must be an object`);
      for (const field of ["id", "title", "url", "communityId", "communityLabel", "timeAgo", "timestamp"]) {
        requireContract(typeof post[field] === "string", `${filename} post.${field} must be a string`);
      }
      requireContract((post.id as string).length > 0, `${filename} post.id must not be empty`);
      requireContract(Number.isFinite(Date.parse(post.timestamp as string)), `${filename} post.timestamp must be a date`);
      for (const field of ["comments", "upvotes", "viewCount"]) {
        requireContract(typeof post[field] === "number" && Number.isFinite(post[field]), `${filename} post.${field} must be finite`);
      }
      requireContract(!seenIds.has(post.id as string), `${filename} duplicates post ${post.id}`);
      seenIds.add(post.id as string);
    }
  }
  const files = fs.readdirSync(directory);
  requireContract(files.length === expectedFiles.size && files.every((file) => expectedFiles.has(file)), "unexpected or stale files are present");
  return manifest as HomeFeedManifest;
}

export function createHomeFeedStagingDirectory(outputDirectory: string): string {
  const parent = path.dirname(outputDirectory);
  fs.mkdirSync(parent, { recursive: true });
  return fs.mkdtempSync(path.join(parent, `.${path.basename(outputDirectory)}.pending-`));
}

/** Publish only a complete generation, retaining the previous one on failure. */
export function publishHomeFeedGeneration(stagingDirectory: string, outputDirectory: string): HomeFeedManifest {
  const manifest = validateHomeFeedGeneration(stagingDirectory);
  const backup = `${outputDirectory}.previous-${randomUUID()}`;
  const hadPrevious = fs.existsSync(outputDirectory);
  if (hadPrevious) fs.renameSync(outputDirectory, backup);
  try {
    fs.renameSync(stagingDirectory, outputDirectory);
  } catch (error) {
    if (hadPrevious) fs.renameSync(backup, outputDirectory);
    throw error;
  }
  if (hadPrevious) fs.rmSync(backup, { recursive: true, force: true });
  return manifest;
}
