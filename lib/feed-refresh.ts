type FeedPost = { id: string };

export type FeedRefreshPolicy = "preserve-pages" | "replace-generation";

/** The caller decides whether a new seed belongs to the current page generation. */
export function reconcileFeedSeed<T extends FeedPost>({
  currentPosts,
  previousSeedIds,
  nextSeed,
  postIdToPageNum,
  currentPage,
  currentHasMore,
  initialPage = 1,
  initialHasMore = true,
  policy = "preserve-pages",
}: {
  currentPosts: T[];
  previousSeedIds: ReadonlySet<string>;
  nextSeed: T[];
  postIdToPageNum: ReadonlyMap<string, number>;
  currentPage: number;
  currentHasMore: boolean;
  initialPage?: number;
  initialHasMore?: boolean;
  policy?: FeedRefreshPolicy;
}) {
  const posts: T[] = [];
  const seenIds = new Set<string>();
  const seedIds = new Set<string>();
  const pages = new Map<string, number>();
  for (const post of nextSeed) {
    if (seenIds.has(post.id)) continue;
    posts.push(post);
    seenIds.add(post.id);
    seedIds.add(post.id);
    pages.set(post.id, initialPage);
  }
  if (policy === "preserve-pages") {
    for (const post of currentPosts) {
      if (previousSeedIds.has(post.id) || seenIds.has(post.id)) continue;
      posts.push(post);
      seenIds.add(post.id);
      pages.set(post.id, postIdToPageNum.get(post.id) ?? initialPage);
    }
  }
  const unchanged = posts.length === currentPosts.length && posts.every((post, index) => post === currentPosts[index]);
  return {
    posts: unchanged ? currentPosts : posts,
    seedIds,
    seenIds,
    postIdToPageNum: pages,
    page: policy === "replace-generation" ? initialPage : currentPage,
    hasMore: policy === "replace-generation" ? initialHasMore : currentHasMore,
  };
}

/** Prefer the current anchor, then the closest surviving neighbor from the old feed. */
export function findSurvivingFeedAnchor(previousIds: readonly string[], nextIds: ReadonlySet<string>, anchorId: string | null): string | null {
  if (anchorId && nextIds.has(anchorId)) return anchorId;
  const index = anchorId ? previousIds.indexOf(anchorId) : -1;
  if (index >= 0) {
    for (let distance = 1; distance < previousIds.length; distance++) {
      const after = previousIds[index + distance];
      if (after && nextIds.has(after)) return after;
      const before = previousIds[index - distance];
      if (before && nextIds.has(before)) return before;
    }
  }
  return nextIds.values().next().value ?? null;
}
