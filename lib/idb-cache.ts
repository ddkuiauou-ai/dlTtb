// Client-only IndexedDB cache for paged post JSON with manifest-based invalidation.
// - Stores:
//   - manifests: key = manifestKey (derived from base), value = { generatedAt, pageSize?, pages?, baseDir?, fetchedAt }
//   - posts: key = post.id, value = Post card shape used by client
//   - pages: key = `${base}|${page}`, value = { version: string, postIds: string[], storedAt: number, lastAccess: number }
// - LRU: limit number of page-entries globally (default 3000). Oldest lastAccess are evicted.

export type ClientPost = {
  id: string;
  title: string;
  community?: string;
  communityId?: string;
  communityLabel?: string;
  comments: number;
  upvotes: number;
  viewCount: number;
  timeAgo: string;
  thumbnail: string;
  content: string;
  hoverPlayerKind?: 'youtube' | 'mp4' | 'x' | null;
  hoverPlayerUrl?: string | null;
  clusterId?: string;
  clusterSize?: number;
  hasYouTube?: boolean;
  hasX?: boolean;
};

export type Manifest = {
  generatedAt: string;
  pageSize?: number;
  pages?: number;      // for category
  maxPages?: number;   // for home
  range?: string;
  section?: string;
  mode?: string;
  windowMinutes?: number;
  baseDir?: string;
};

const DB_NAME = 'isshoo-v1';
const DB_VERSION = 1;
const STORE_MANIFESTS = 'manifests';
const STORE_POSTS = 'posts';
const STORE_PAGES = 'pages';
const LRU_LIMIT_PAGES = 3000; // global cap across bases

type PageEntry = { version: string; postIds: string[]; storedAt: number; lastAccess: number; base: string; page: number };

function hasIDB() { return typeof window !== 'undefined' && !!window.indexedDB; }

async function openDB(): Promise<IDBDatabase | null> {
  if (!hasIDB()) return null;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MANIFESTS)) db.createObjectStore(STORE_MANIFESTS);
      if (!db.objectStoreNames.contains(STORE_POSTS)) db.createObjectStore(STORE_POSTS);
      if (!db.objectStoreNames.contains(STORE_PAGES)) db.createObjectStore(STORE_PAGES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode, ...stores: string[]) {
  return db.transaction(stores, mode);
}

function deriveManifestRoot(base: string): { manifestUrl: string; manifestKey: string } {
  const parts = (base || '').split('/').filter(Boolean);
  const root = '/' + parts.join('/');
  return { manifestUrl: `${root}/manifest.json`, manifestKey: root };
}

export async function getManifest(base: string): Promise<Manifest | null> {
  if (!base) return null;
  const db = await openDB();
  const { manifestUrl, manifestKey } = deriveManifestRoot(base);

  // Try network first to learn freshest generatedAt; fallback to cache
  try {
    const res = await fetch(manifestUrl, { cache: 'no-cache' });
    if (res.ok) {
      const m = (await res.json()) as Manifest;
      if (db) {
        const t = tx(db, 'readwrite', STORE_MANIFESTS);
        t.objectStore(STORE_MANIFESTS).put({ ...m, fetchedAt: Date.now() }, manifestKey);
      }
      return m;
    }
  } catch { /* ignore */ }

  if (!db) return null;
  return new Promise((resolve, _reject) => {
    const t = tx(db, 'readonly', STORE_MANIFESTS);
    const req = t.objectStore(STORE_MANIFESTS).get(manifestKey);
    req.onsuccess = () => resolve((req.result as Manifest) || null);
    req.onerror = () => resolve(null);
  });
}

export async function readPage(base: string, page: number, version: string): Promise<ClientPost[] | null> {
  const db = await openDB();
  if (!db) return null;
  const key = `${base}|${page}`;
  return new Promise((resolve) => {
    const t = tx(db, 'readwrite', STORE_PAGES, STORE_POSTS);
    const pages = t.objectStore(STORE_PAGES);
    const posts = t.objectStore(STORE_POSTS);
    const req = pages.get(key);
    req.onsuccess = async () => {
      const entry = req.result as PageEntry | undefined;
      if (!entry || entry.version !== version) { resolve(null); return; }
      // touch LRU
      entry.lastAccess = Date.now();
      pages.put(entry, key);
      // hydrate posts
      const out: ClientPost[] = [];
      let remaining = entry.postIds.length;
      if (remaining === 0) { resolve(out); return; }
      entry.postIds.forEach((id) => {
        const r = posts.get(id);
        r.onsuccess = () => { if (r.result) out.push(r.result as ClientPost); if (--remaining === 0) resolve(out); };
        r.onerror = () => { if (--remaining === 0) resolve(out); };
      });
    };
    req.onerror = () => resolve(null);
  });
}

export async function writePage(base: string, page: number, version: string, items: ClientPost[]): Promise<void> {
  const db = await openDB();
  if (!db) return;
  const key = `${base}|${page}`;
  const now = Date.now();
  await new Promise<void>((resolve) => {
    const t = tx(db, 'readwrite', STORE_PAGES, STORE_POSTS);
    const pages = t.objectStore(STORE_PAGES);
    const posts = t.objectStore(STORE_POSTS);
    // write posts
    for (const p of items) posts.put(p, p.id);
    // write page entry
    const entry: PageEntry = { version, postIds: items.map(p => p.id), storedAt: now, lastAccess: now, base, page };
    pages.put(entry, key);
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
    t.onabort = () => resolve();
  });
  await prunePagesLRU(db);
}

async function prunePagesLRU(db: IDBDatabase): Promise<void> {
  // Simple global LRU by lastAccess across all pages
  await new Promise<void>((resolve) => {
    const t = tx(db, 'readwrite', STORE_PAGES);
    const store = t.objectStore(STORE_PAGES);
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result as PageEntry[]) || [];
      if (items.length <= LRU_LIMIT_PAGES) { resolve(); return; }
      const over = items.length - LRU_LIMIT_PAGES;
      // sort by lastAccess asc
      items.sort((a, b) => (a.lastAccess || 0) - (b.lastAccess || 0));
      for (let i = 0; i < over; i++) {
        const k = `${items[i].base}|${items[i].page}`;
        store.delete(k);
      }
      resolve();
    };
    req.onerror = () => resolve();
  });
}

export function manifestRootForBase(base: string): string {
  return deriveManifestRoot(base).manifestKey;
}

export const idbCache = {
  getManifest,
  readPage,
  writePage,
  manifestRootForBase,
};

export default idbCache;

