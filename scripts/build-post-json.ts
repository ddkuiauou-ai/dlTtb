

import "dotenv/config";
import fs from "fs";
import path from "path";
import { getAllPosts, getPostDetail } from "../lib/queries";

// ===== Helpers =====
function atomicWriteJson(filepath: string, data: unknown) {
  const tmp = `${filepath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filepath);
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readJson<T>(filepath: string): T | null {
  try {
    const raw = fs.readFileSync(filepath, "utf8");
    return JSON.parse(raw) as T;
  } catch (_) {
    return null;
  }
}

// Simple concurrency limiter (no external deps)
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let next = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// Decide if the on-disk JSON is identical enough to skip writing (incremental build)
function isUnchanged(existing: any, incoming: any): boolean {
  if (!existing || !incoming) return false;
  // Prefer strong keys if present; fall back to a few cheap comparators
  const keysToCheck = [
    ["contentHash", "contentHash"],
    ["updatedAt", "updatedAt"],
    ["commentCount", "commentCount"],
    ["likeCount", "likeCount"],
    ["viewCount", "viewCount"],
    ["imageEnrichmentUpdatedAt", "imageEnrichmentUpdatedAt"],
  ] as const;

  let comparableFound = false;
  for (const [ek, ik] of keysToCheck) {
    const ev = existing?.[ek as keyof typeof existing];
    const iv = incoming?.[ik as keyof typeof incoming];
    if (ev === undefined || iv === undefined) continue;
    comparableFound = true;
    if (ev !== iv) return false;
  }
  // If we found nothing to compare, be conservative and do not skip
  return comparableFound;
}

async function buildAllPosts() {
  const started = Date.now();
  const outDir = path.join(process.cwd(), "public/data/posts/v1");
  ensureDir(outDir);

  // Read previous manifest if exists to allow incremental behavior and clean-up
  const manifestPath = path.join(outDir, "manifest.json");
  const prevManifest = readJson<{ generatedAt: string; ids: string[] }>(manifestPath);

  console.log(`Building all post pages (incremental, concurrent)...`);

  // Fetch IDs to build. Keep using the existing query in getAllPosts.
  const pageSize = Number(process.env.BUILD_PAGE_SIZE ?? 10000);
  const allPosts = await getAllPosts({ page: 1, pageSize });
  const ids: string[] = allPosts.map((p: any) => p.id);

  // Concurrency limit (tune via env)
  const CONCURRENCY = Math.max(1, Number(process.env.BUILD_CONCURRENCY ?? 12));

  // Build each post JSON concurrently, skipping unchanged files when possible
  let written = 0, skipped = 0, failed = 0;

  await mapWithConcurrency(ids, CONCURRENCY, async (postId) => {
    try {
      const filePath = path.join(outDir, `${postId}.json`);
      const existing = readJson<any>(filePath);
      const postDetails = await getPostDetail(postId);
      if (!postDetails) return;

      if (existing && isUnchanged(existing, postDetails)) {
        skipped++;
        return;
      }
      atomicWriteJson(filePath, postDetails);
      written++;
      console.log(`Wrote ${filePath}`);
    } catch (e) {
      failed++;
      console.error(`Failed building post ${postId}:`, e);
    }
  });

  // Remove stale files that are no longer in the current id set (but keep manifest)
  const keep = new Set(ids);
  for (const name of fs.readdirSync(outDir)) {
    if (!name.endsWith(".json") || name === "manifest.json") continue;
    const id = name.replace(/\.json$/, "");
    if (!keep.has(id)) {
      try { fs.unlinkSync(path.join(outDir, name)); } catch (_) {}
    }
  }

  // Write manifest (include a tiny build report)
  const manifest = {
    generatedAt: new Date().toISOString(),
    ids,
    stats: {
      total: ids.length,
      written,
      skipped,
      failed,
      concurrency: CONCURRENCY,
      durationMs: Date.now() - started,
      prevGeneratedAt: prevManifest?.generatedAt ?? null,
    },
  };
  atomicWriteJson(manifestPath, manifest);
  console.log(`Manifest written with ${ids.length} ids. written=${written} skipped=${skipped} failed=${failed}`);
}

async function main() {
  console.log(`Starting build for all posts.`);
  await buildAllPosts();
  console.log("Finished building all posts.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
