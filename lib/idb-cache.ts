// Client-only IndexedDB cache for paged post JSON with manifest-based invalidation.
// - Stores:
//   - manifests: key = manifestKey (derived from base), value = { generatedAt, pageSize?, pages?, baseDir?, fetchedAt }
//   - posts: legacy ID-only payload store; retained for database compatibility
//   - pages: key = `${base}|${page}`, value includes the complete generation's ordered posts
// - LRU: limit number of page-entries globally (default 3000). Oldest lastAccess are evicted.

import { createCachedPostPage, readCachedPostPage } from './page-cache-entry';
import type { CachedPostPage } from './page-cache-entry';

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
  timestamp?: string;
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
  lastPage?: number;   // includes the SSR first page; 1 means no JSON tail
  hasMore?: boolean;   // whether this generation has pages after the SSR page
  seedPolicy?: 'live-seed-dedupe'; // live SSR IDs are deduplicated by the client
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

type PageEntry = CachedPostPage<ClientPost>;

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
    let blocked = false;
    req.onblocked = () => { blocked = true; resolve(null); };
    req.onsuccess = () => { if (blocked) req.result.close(); else resolve(req.result); };
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
  const dbPromise = openDB().catch(() => null);
  const { manifestUrl, manifestKey } = deriveManifestRoot(base);

  // Try network first to learn freshest generatedAt; fallback to cache
  try {
    const res = await fetch(manifestUrl, { cache: 'no-cache' });
    if (res.ok) {
      const m = (await res.json()) as Manifest;
      // Storage is optional; denial or a blocked IDB connection must not delay the network result.
      void dbPromise.then(db => {
        if (!db) return;
        try {
          const t = tx(db, 'readwrite', STORE_MANIFESTS);
          t.objectStore(STORE_MANIFESTS).put({ ...m, fetchedAt: Date.now() }, manifestKey);
        } catch { /* ignore */ }
      });
      return m;
    }
  } catch { /* ignore */ }

  const db = await dbPromise;
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const t = tx(db, 'readonly', STORE_MANIFESTS);
      const req = t.objectStore(STORE_MANIFESTS).get(manifestKey);
      req.onsuccess = () => resolve((req.result as Manifest) || null);
      req.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
    } catch { resolve(null); }
  });
}

export async function readPage(base: string, page: number, version: string): Promise<ClientPost[] | null> {
  const db = await openDB().catch(() => null);
  if (!db) return null;
  const key = `${base}|${page}`;
  return new Promise((resolve) => {
    const t = tx(db, 'readwrite', STORE_PAGES);
    const pages = t.objectStore(STORE_PAGES);
    const req = pages.get(key);
    req.onsuccess = () => {
      const entry = req.result as PageEntry | undefined;
      const payload = readCachedPostPage<ClientPost>(entry, base, page, version);
      if (!entry || payload === null) { resolve(null); return; }
      // touch LRU
      entry.lastAccess = Date.now();
      pages.put(entry, key);
      resolve(payload);
    };
    req.onerror = () => resolve(null);
    t.onabort = () => resolve(null);
  });
}

export async function writePage(base: string, page: number, version: string, items: ClientPost[]): Promise<void> {
  const db = await openDB().catch(() => null);
  if (!db) return;
  const key = `${base}|${page}`;
  const now = Date.now();
  await new Promise<void>((resolve) => {
    const t = tx(db, 'readwrite', STORE_PAGES);
    const pages = t.objectStore(STORE_PAGES);
    const entry = createCachedPostPage(base, page, version, items, now);
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
