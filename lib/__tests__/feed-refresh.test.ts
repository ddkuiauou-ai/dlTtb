import assert from "node:assert/strict";
import test from "node:test";
import { findSurvivingFeedAnchor, reconcileFeedSeed } from "../feed-refresh";

const post = (id: string, title = id) => ({ id, title });

function reconcile(currentPosts: ReturnType<typeof post>[], nextSeed: ReturnType<typeof post>[], overrides: Partial<Parameters<typeof reconcileFeedSeed<ReturnType<typeof post>>>[0]> = {}) {
  return reconcileFeedSeed({ currentPosts, nextSeed, previousSeedIds: new Set(["seed"]), postIdToPageNum: new Map([["seed", 1], ["tail", 2]]), currentPage: 2, currentHasMore: false, ...overrides });
}

test("an empty mounted feed adopts a new first-page seed", () => {
  const result = reconcile([], [post("new")], { previousSeedIds: new Set(), currentPage: 1, currentHasMore: true });
  assert.deepEqual(result.posts, [post("new")]);
  assert.deepEqual([...result.seenIds], ["new"]);
  assert.equal(result.postIdToPageNum.get("new"), 1);
});

test("a same-generation seed refresh retains appended pages and cursor", () => {
  const tail = post("tail");
  const current = [post("seed", "old"), tail];
  const result = reconcile(current, [post("seed", "new"), post("new-seed")]);
  assert.deepEqual(result.posts.map((item) => item.id), ["seed", "new-seed", "tail"]);
  assert.equal(result.posts[0].title, "new");
  assert.equal(result.posts[2], tail);
  assert.equal(result.postIdToPageNum.get("tail"), 2);
  assert.equal(result.page, 2);
  assert.equal(result.hasMore, false);
});

test("seed data wins overlapping IDs and duplicate IDs never appear twice", () => {
  const result = reconcile([post("seed"), post("tail", "old"), post("tail")], [post("tail", "new"), post("tail", "duplicate")]);
  assert.deepEqual(result.posts, [post("tail", "new")]);
  assert.equal(result.postIdToPageNum.get("tail"), 1);
  assert.deepEqual([...result.seedIds], ["tail"]);
});

test("removes absent old seed items without dropping unrelated appended items", () => {
  const result = reconcile([post("seed"), post("tail")], []);
  assert.deepEqual(result.posts, [post("tail")]);
  assert.deepEqual([...result.seenIds], ["tail"]);
  assert.equal(result.postIdToPageNum.has("seed"), false);
});

test("explicit generation replacement clears old pages and resets all feed metadata", () => {
  const result = reconcile([post("seed"), post("tail")], [post("new")], { policy: "replace-generation", initialHasMore: true });
  assert.deepEqual(result.posts, [post("new")]);
  assert.deepEqual([...result.postIdToPageNum], [["new", 1]]);
  assert.deepEqual([...result.seenIds], ["new"]);
  assert.equal(result.page, 1);
  assert.equal(result.hasMore, true);
});

test("identical input retains the posts reference and does not mutate old metadata", () => {
  const seed = post("seed");
  const tail = post("tail");
  const current = [seed, tail];
  const oldMap = new Map([["seed", 1], ["tail", 2]]);
  const oldSeeds = new Set(["seed"]);
  const result = reconcile(current, [seed], { postIdToPageNum: oldMap, previousSeedIds: oldSeeds });
  assert.equal(result.posts, current);
  assert.notEqual(result.postIdToPageNum, oldMap);
  assert.deepEqual([...oldSeeds], ["seed"]);
  assert.deepEqual([...oldMap], [["seed", 1], ["tail", 2]]);
});

test("anchor preservation prefers the same ID and then its closest surviving neighbor", () => {
  assert.equal(findSurvivingFeedAnchor(["a", "b", "c", "d"], new Set(["b", "d"]), "b"), "b");
  assert.equal(findSurvivingFeedAnchor(["a", "b", "c", "d"], new Set(["a", "d"]), "c"), "d");
  assert.equal(findSurvivingFeedAnchor(["a", "b", "c"], new Set(["a"]), "c"), "a");
  assert.equal(findSurvivingFeedAnchor(["a"], new Set(), "a"), null);
});
