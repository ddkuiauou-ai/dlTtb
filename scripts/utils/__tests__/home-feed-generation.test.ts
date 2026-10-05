import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createHomeFeedStagingDirectory,
  createHomeFeedManifest,
  publishHomeFeedGeneration,
  validateHomeFeedGeneration,
  type HomeFeedManifest,
} from "../home-feed-generation";

const VERSION = "2026-10-05T01:00:00.000Z";
const post = (id: string) => ({ id, title: id, url: `https://example.test/${id}`, communityId: "fixture", communityLabel: "Fixture", timeAgo: "2026년 10월 5일 오전 10:00", timestamp: VERSION, comments: 0, upvotes: 0, viewCount: 1 });

function fixture(directory: string, ids: string[][], version = VERSION): HomeFeedManifest {
  fs.mkdirSync(directory, { recursive: true });
  const manifest = createHomeFeedManifest({ generatedAt: version, pageSize: 2, maxPages: 50, lastPage: ids.length + 1, range: "24h", section: "fresh" });
  fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(manifest));
  ids.forEach((pageIds, index) => fs.writeFileSync(path.join(directory, `page-${index + 2}.json`), JSON.stringify({ page: index + 2, pageSize: manifest.pageSize, range: manifest.range, section: manifest.section, generatedAt: version, posts: pageIds.map(post) })));
  return manifest;
}

function temp(t: test.TestContext): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "home-feed-contract-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("validates contiguous pages starting at 2 with no first-page JSON", (t) => {
  const directory = temp(t);
  const manifest = fixture(directory, [["a", "b"], ["c"]]);
  assert.deepEqual(validateHomeFeedGeneration(directory), manifest);
  assert.equal(fs.existsSync(path.join(directory, "page-1.json")), false);
});

test("permits an explicitly empty tail but rejects metadata without a page contract", (t) => {
  const directory = temp(t);
  fixture(directory, []);
  assert.equal(validateHomeFeedGeneration(directory).hasMore, false);
  fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({ generatedAt: VERSION, pageSize: 2, maxPages: 50, range: "24h", section: "fresh" }));
  assert.throws(() => validateHomeFeedGeneration(directory), /lastPage/);
});

test("rejects missing pages and leaves the published generation untouched", (t) => {
  const parent = temp(t);
  const output = path.join(parent, "fresh");
  fixture(output, [["old"]]);
  const stage = createHomeFeedStagingDirectory(output);
  fixture(stage, [["new"], ["next"]]);
  fs.unlinkSync(path.join(stage, "page-3.json"));
  assert.throws(() => publishHomeFeedGeneration(stage, output), /ENOENT/);
  assert.match(fs.readFileSync(path.join(output, "page-2.json"), "utf8"), /old/);
});

test("rejects a mixed generation, duplicate IDs, and malformed posts", (t) => {
  const directory = temp(t);
  fixture(directory, [["a"], ["b"]]);
  const file = path.join(directory, "page-3.json");
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify({ ...payload, generatedAt: "2026-10-05T01:01:00.000Z" }));
  assert.throws(() => validateHomeFeedGeneration(directory), /generation does not match/);
  fs.writeFileSync(file, JSON.stringify({ ...payload, posts: [post("a")] }));
  assert.throws(() => validateHomeFeedGeneration(directory), /duplicates post a/);
  fs.writeFileSync(file, JSON.stringify({ ...payload, posts: [{ ...post("b"), timestamp: undefined }] }));
  assert.throws(() => validateHomeFeedGeneration(directory), /post.timestamp/);
});

test("repeated publication removes stale tail pages and supports an empty next generation", (t) => {
  const parent = temp(t);
  const output = path.join(parent, "fresh");
  fixture(output, [["old-a"], ["old-b"], ["old-c"]]);
  const stage = createHomeFeedStagingDirectory(output);
  fixture(stage, [["new"]], "2026-10-05T01:01:00.000Z");
  publishHomeFeedGeneration(stage, output);
  assert.deepEqual(fs.readdirSync(output).sort(), ["manifest.json", "page-2.json"]);
  assert.equal(validateHomeFeedGeneration(output).lastPage, 2);
  assert.deepEqual(fs.readdirSync(parent), ["fresh"]);
  const emptyStage = createHomeFeedStagingDirectory(output);
  fixture(emptyStage, [], "2026-10-05T01:02:00.000Z");
  publishHomeFeedGeneration(emptyStage, output);
  assert.deepEqual(fs.readdirSync(output), ["manifest.json"]);
  assert.equal(validateHomeFeedGeneration(output).lastPage, 1);
});

test("rejects unexpected stale files and incompatible feed metadata", (t) => {
  const directory = temp(t);
  fixture(directory, [["a"]]);
  fs.writeFileSync(path.join(directory, "page-7.json"), "{}");
  assert.throws(() => validateHomeFeedGeneration(directory), /stale files/);
  fs.unlinkSync(path.join(directory, "page-7.json"));
  const file = path.join(directory, "page-2.json");
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify({ ...payload, range: "3h" }));
  assert.throws(() => validateHomeFeedGeneration(directory), /feed does not match/);
});

test("the continuation contract retains candidates beyond an independently selected live seed", (t) => {
  const directory = temp(t);
  const allCandidates = [["a", "b"], ["c", "d"], ["e", "f"]];
  fixture(directory, allCandidates);
  const manifest = validateHomeFeedGeneration(directory);
  assert.equal(manifest.seedPolicy, "live-seed-dedupe");
  const continuation = Array.from({ length: manifest.pages }, (_, index) => JSON.parse(fs.readFileSync(path.join(directory, `page-${index + 2}.json`), "utf8")).posts).flat();
  assert.deepEqual(continuation.map((item: { id: string }) => item.id), ["a", "b", "c", "d", "e", "f"]);
  // Even when the first two JSON pages overlap SSR, later candidates are still published.
  const liveSeedIds = new Set(["a", "b", "c", "d"]);
  assert.deepEqual(continuation.filter((item: { id: string }) => !liveSeedIds.has(item.id)).map((item: { id: string }) => item.id), ["e", "f"]);
});

test("rejects a manifest that claims an unsupported seed relationship", (t) => {
  const directory = temp(t);
  const manifest = fixture(directory, [["a"]]);
  fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({ ...manifest, seedPolicy: "same-snapshot" }));
  assert.throws(() => validateHomeFeedGeneration(directory), /seedPolicy/);
});

test("actual SSR 36 and actual upper IDs are excluded without losing unseen continuation candidates", (t) => {
  const directory = temp(t);
  const candidates = Array.from({ length: 84 }, (_, index) => `post-${index}`);
  fixture(directory, Array.from({ length: candidates.length / 2 }, (_, index) => candidates.slice(index * 2, index * 2 + 2)));
  const manifest = validateHomeFeedGeneration(directory);
  const published = Array.from({ length: manifest.pages }, (_, index) => JSON.parse(fs.readFileSync(path.join(directory, `page-${index + 2}.json`), "utf8")).posts).flat() as { id: string }[];
  const actualSeedIds = new Set(candidates.slice(0, 36));
  const actualUpperIds = new Set(["post-40", "post-41", "post-42", "post-60", "post-61", "post-62", "post-63", "post-64", "post-65"]);
  const expectedIds = candidates.filter((id) => !actualSeedIds.has(id) && !actualUpperIds.has(id));
  const appendedIds = published.filter(({ id }) => !actualSeedIds.has(id) && !actualUpperIds.has(id)).map(({ id }) => id);
  assert.deepEqual(appendedIds, expectedIds);
  assert.ok(appendedIds.includes("post-36"));
  assert.ok(appendedIds.includes("post-71"));
  assert.equal(new Set([...actualSeedIds, ...appendedIds]).size, actualSeedIds.size + appendedIds.length);
});
