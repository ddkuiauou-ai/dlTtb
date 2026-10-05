/** Page payloads belong to one base and generation, even when post IDs overlap. */
export const PAGE_CACHE_SHAPE = 2;

export type CachedPostPage<T extends { id: string }> = {
  cacheShape: typeof PAGE_CACHE_SHAPE;
  version: string;
  base: string;
  page: number;
  postIds: string[];
  posts: T[];
  storedAt: number;
  lastAccess: number;
};

export function createCachedPostPage<T extends { id: string }>(base: string, page: number, version: string, posts: T[], now: number): CachedPostPage<T> {
  return { cacheShape: PAGE_CACHE_SHAPE, version, base, page, postIds: posts.map(post => post.id), posts: [...posts], storedAt: now, lastAccess: now };
}

/** Legacy ID-only entries and incomplete payloads must be fetched again. */
export function readCachedPostPage<T extends { id: string }>(value: unknown, base: string, page: number, version: string): T[] | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<CachedPostPage<T>>;
  if (entry.cacheShape !== PAGE_CACHE_SHAPE || entry.base !== base || entry.page !== page || entry.version !== version) return null;
  if (!Array.isArray(entry.postIds) || !Array.isArray(entry.posts) || entry.postIds.length !== entry.posts.length) return null;
  for (let index = 0; index < entry.posts.length; index++) {
    const post = entry.posts[index];
    if (!post || typeof post !== 'object' || typeof post.id !== 'string' || !post.id || post.id !== entry.postIds[index]) return null;
  }
  return [...entry.posts];
}
