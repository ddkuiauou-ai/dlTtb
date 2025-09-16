"use client";

import { useEffect, useRef, useState, useCallback, useMemo, useLayoutEffect } from "react";
import { useSearchParams } from "next/navigation";
import { PostCard } from "@/components/post-card";
export type { Post as CardPost } from "@/lib/types";
import { onCommunity, onCommunities } from "@/lib/communityFilter";
import { getManifest as cacheGetManifest, readPage as cacheReadPage, writePage as cacheWritePage } from "@/lib/idb-cache";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { readAndClearRestore } from "@/lib/restore-session";
import { usePostCache } from "@/context/post-cache-context";

// --- Constants ---
const MISSING_LIMIT = 2;
const RETRY_BACKOFFS = [200, 400, 800];
const FAILED_PAGE_RETRY_WINDOW = 10000; // 10s
const MAX_PAGES_PER_CALL = 2;
const READ_POSTS_KEY = 'readPosts:v1';

const MISSING_LOOKAHEAD = 4; // pages to probe ahead before declaring no more content (slightly more tolerant of sparse tails)
const FIRST_JSON_PAGE = 2; // page-1.json은 존재하지 않음. SSR(DB) 결과가 논리적 1페이지.

// --- Debug ---
const DEBUG_IPL = process.env.NODE_ENV !== 'production';
const dlog = (...args: any[]) => {
  if (DEBUG_IPL) {
    // Prefix with component tag and timestamp for easier tracing
    const ts = new Date().toISOString();
    // eslint-disable-next-line no-console
    console.log(`[InfinitePostList ${ts}]`, ...args);
  }
};

// --- Types ---
type LoadStatus = "ok-new" | "ok-dup" | "missing" | "error";
type LoadResult = { status: LoadStatus; newPosts: CardPost[] };

// --- Restore Hook (extract) ---
function useRestoreFromDetail(params: {
  storageKeyPrefix: string | undefined;
  initialPage: number;
  cols: number;
  virtualizer: ReturnType<typeof useWindowVirtualizer>;
  loadMore: () => Promise<void>;
  hasMoreRef: React.MutableRefObject<boolean>;
  pageRef: React.MutableRefObject<number>;
  colsReadyRef: React.MutableRefObject<boolean>;
  visiblePostsRef: React.MutableRefObject<CardPost[]>;
  seenIdsRef: React.MutableRefObject<Set<string>>;
  postIdToPageNumRef: React.MutableRefObject<Map<string, number>>;
  rootRef: React.MutableRefObject<HTMLDivElement | null>;
  restoringRef: React.MutableRefObject<boolean>;
  ensureBelowBufferRows: (anchorId: string) => Promise<void>;
}) {
  const {
    storageKeyPrefix,
    initialPage,
    cols,
    virtualizer,
    loadMore,
    hasMoreRef,
    pageRef,
    colsReadyRef,
    visiblePostsRef,
    seenIdsRef,
    postIdToPageNumRef,
    rootRef,
    restoringRef,
    ensureBelowBufferRows,
  } = params;

  useEffect(() => {
    if (!storageKeyPrefix || restoringRef.current) return;

    const restore = readAndClearRestore(storageKeyPrefix);
    if (!restore.should) return;

    restoringRef.current = true;

    const run = async () => {
      const prevScrollBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';

      const waitFrames = (n: number) => new Promise<void>((res) => {
        let i = 0; const step = () => { if (++i >= n) return res(); requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });

      const waitForAnchorStable = async (id: string) => {
        let el: HTMLElement | null = null;
        for (let i = 0; i < 60; i++) {
          el = document.getElementById(`post-${id}`) as HTMLElement | null;
          if (el) break;
          await waitFrames(1);
        }
        if (!el) return null;

        let stable = 0;
        let prev = -99999;
        for (let i = 0; i < 60; i++) {
          const top = el.getBoundingClientRect().top;
          if (Math.abs(top - prev) <= 0.5) {
            stable++;
            if (stable >= 3) break;
          } else {
            stable = 0;
            prev = top;
          }
          await waitFrames(1);
        }
        return el;
      };

      const computeScrollOffset = () => {
        try {
          let offset = 0;
          // 1) Collect sticky/chrome heights
          const sel = [
            'header.sticky',
            '[data-sticky="top"]',
            '[data-slot="app-header"]',
            '.site-header',
            'nav.sticky',
          ];
          for (const s of sel) {
            const e = document.querySelector(s) as HTMLElement | null;
            if (e) offset = Math.max(offset, e.getBoundingClientRect().height || 0);
          }
          // 2) Section title or previous sibling under the header (if exists)
          const prevSibling = rootRef.current?.previousElementSibling as HTMLElement | null;
          if (prevSibling) offset += (prevSibling.getBoundingClientRect().height || 0) + 8;
          // 3) Prefer to keep the anchor a bit lower than the very top (≈12vh)
          const prefer = Math.round((typeof window !== 'undefined' ? window.innerHeight : 0) * 0.12);
          offset += prefer;
          // 4) Clamp to a sensible max: at most ~33vh and not above 360px
          const maxClamp = Math.max(96, Math.round(Math.min((typeof window !== 'undefined' ? window.innerHeight : 0) * 0.33, 360)));
          return Math.min(maxClamp, Math.max(0, Math.round(offset + 8)));
        } catch {
          // Fallback to a modest offset if anything goes wrong
          const safe = Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.2);
          return Math.min(120, Math.max(64, safe));
        }
      };

      let anchorId: string | null = null;
      try {
        anchorId = restore.anchorPostId || null;
        const targetPage = Math.max(parseInt(String(restore.anchorPage ?? initialPage), 10) || initialPage, 1);

        // 컬럼 측정 + 가상행 생성까지 대기
        for (let i = 0; i < 60; i++) {
          try {
            if (colsReadyRef.current && virtualizer.getVirtualItems().length > 0) break;
          } catch { /* ignore */ }
          await waitFrames(1);
        }

        // 타겟 페이지까지 로딩
        while (pageRef.current < targetPage && hasMoreRef.current) {
          await loadMore();
          await waitFrames(2);
        }

        // 앵커 id가 목록에 들어올 때까지(필요시 더 로드)
        if (anchorId) {
          let guard = 0;
          while (!seenIdsRef.current.has(anchorId) && hasMoreRef.current && guard < 50) {
            guard++;
            await loadMore();
            await waitFrames(2);
          }
        }

        // 1차: 해당 행으로 거칠게 이동
        if (anchorId) {
          const idx = visiblePostsRef.current.findIndex((p) => p.id === anchorId);
          if (idx >= 0) {
            const rowIndex = Math.floor(idx / Math.max(1, cols));
            try { virtualizer.scrollToIndex(rowIndex, { align: 'start' } as any); } catch { /* ignore */ }
            await waitFrames(2);
          }

          // 2차: 요소가 DOM에 안정적으로 올라온 뒤 scroll-margin-top으로 정확히 맞추기
          const el2 = await waitForAnchorStable(anchorId);
          if (el2) {
            const off = computeScrollOffset();
            (el2.style as any).scrollMarginTop = `${off}px`;
            el2.scrollIntoView({ behavior: 'auto', block: 'start' });
            // post-correct on the next frame if we still ended up too high/low
            await waitFrames(1);
            try {
              const top = el2.getBoundingClientRect().top;
              const delta = top - off; // negative => scroll up a bit; positive => scroll down a bit
              if (Math.abs(delta) > 6) {
                window.scrollBy({ top: delta, behavior: 'auto' });
              }
            } catch { /* ignore */ }
          }

          await ensureBelowBufferRows(anchorId);

          // Second-pass correction after tail priming & potential re-measure
          await waitFrames(2);
          try { virtualizer.measure(); } catch { /* ignore */ }
          await waitFrames(1);
          try {
            const el3 = document.getElementById(`post-${anchorId}`) as HTMLElement | null;
            if (el3) {
              const off = computeScrollOffset();
              const rect = el3.getBoundingClientRect();
              const topDelta = rect.top - off; // negative => need to scroll up; positive => scroll down
              const bottomGuard = 16;
              const outOfView = (topDelta < -6) || (rect.bottom > window.innerHeight - bottomGuard);
              if (outOfView) {
                window.scrollBy({ top: topDelta, behavior: 'auto' });
              }
            }
          } catch { /* ignore */ }

          // Third-pass: watch for late reflow on the anchor for a short window
          try {
            const anchorEl = document.getElementById(`post-${anchorId}`) as HTMLElement | null;
            if (anchorEl && 'ResizeObserver' in window) {
              const desiredTop = computeScrollOffset();
              let raf = 0;
              const ro = new ResizeObserver(() => {
                if (raf) cancelAnimationFrame(raf);
                raf = requestAnimationFrame(() => {
                  try {
                    const rect = anchorEl.getBoundingClientRect();
                    const delta = rect.top - desiredTop;
                    if (Math.abs(delta) > 10) {
                      window.scrollBy({ top: delta, behavior: 'auto' });
                    }
                  } catch { /* ignore */ }
                });
              });
              ro.observe(anchorEl);
              setTimeout(() => {
                try { ro.disconnect(); } catch { }
                if (raf) cancelAnimationFrame(raf);
              }, 800);
            }
          } catch { /* ignore */ }


          // 복원 완료 후 URL의 ?page=를 앵커 카드의 JSON 페이지로 정규화
          try {
            const setPageInUrl = (n: number) => {
              const u = new URL(window.location.href);
              if (n <= 1) u.searchParams.delete('page');
              else u.searchParams.set('page', String(n));
              const qs = u.searchParams.toString();
              window.history.replaceState(
                null,
                '',
                u.pathname + (qs ? `?${qs}` : '') + u.hash
              );
            };
            if (anchorId) {
              const n = postIdToPageNumRef.current.get(anchorId);
              if (typeof n === 'number' && Number.isFinite(n)) {
                setPageInUrl(n);
              }
            }
          } catch { /* noop */ }
        }
      } finally {
        document.documentElement.style.scrollBehavior = prevScrollBehavior || '';
        restoringRef.current = false;
        // Schedule neon highlight AFTER all scrolling/restoration is complete
        try {
          const id = anchorId;
          if (id) {
            const RESTORE_MS = 850; // keep in sync with CSS --restore-ms
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const t = document.getElementById(`post-${id}`) as HTMLElement | null;
                if (t) {
                  t.classList.remove('restore-glow');
                  void t.offsetWidth; // restart animation timeline without layout shifts
                  t.classList.add('restore-glow');
                  setTimeout(() => { try { t.classList.remove('restore-glow'); } catch { } }, RESTORE_MS + 50);
                }
              });
            });
          }
        } catch { /* ignore */ }
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKeyPrefix, initialPage, cols, virtualizer, loadMore]);
}

// --- Read Status Helpers ---
const getReadSet = (): Set<string> => {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(READ_POSTS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return new Set(Object.keys(obj));
  } catch (e) {
    return new Set();
  }
};

interface InfinitePostListProps {
  initialPosts: CardPost[];
  initialPage?: number;
  layout?: "list" | "grid";
  jsonBase?: string;
  storageKeyPrefix?: string;
  enablePaging?: boolean;
  community?: string;
  onColsChange?: (n: number) => void;
  readFilter?: string;
  /**
   * Virtualized list column mode.
   * - 'auto-2': 1 → 2 columns at md breakpoint (default)
   * - '3-2-1': 1 → 2 → 3 columns at md/lg breakpoints
   */
  listColumns?: 'auto-2' | '3-2-1';
  /**
   * When using list virtualization, render cards using this layout style.
   * Useful for category pages wanting grid-style cards with virtualized loading.
   */
  cardLayoutOverride?: 'grid' | 'list';
  /**
   * Breakpoint for 3 columns when listColumns='3-2-1'. Default 'lg' (1024). Set 'xl' for 1280.
   */
  threeColAt?: 'lg' | 'xl';
  /**
   * Force grid column count for layout="grid" path. When set, overrides auto-fit.
   */
  gridColumnsOverride?: number;
  /**
   * Virtualizer tuning: how many rows before the end to trigger loadMore (list layout).
   * Smaller = 바닥 더 가까이에서 로드, Larger = 더 일찍 로드. Default 2.
   */
  loadAheadRows?: number;
  /**
   * Virtualizer overscan rows. Larger = 더 미리 렌더해서 부드럽지만 메모리/연산 증가. Default 22.
   */
  virtualOverscan?: number;
}

export default function InfinitePostList({
  initialPosts,
  initialPage = 1,
  layout = "list",
  jsonBase,
  storageKeyPrefix = "",
  enablePaging = true,
  community,
  onColsChange,
  listColumns = 'auto-2',
  cardLayoutOverride,
  threeColAt = 'lg',
  gridColumnsOverride,
  loadAheadRows = 2,
  virtualOverscan = 44, // 비디오 재시작을 줄이기 위해 기본값을 높게 설정 (메모리 사용량 증가)
  readFilter = 'all',
}: InfinitePostListProps) {
  const { addPosts } = usePostCache();
  const searchParams = useSearchParams();
  // --- Column change observer (for grid layout) ---
  const prevColsRef = useRef<number>(0);
  useEffect(() => {
    if (!onColsChange || layout !== 'grid') return;
    const el = rootRef.current;
    if (!el) return;

    const compute = () => {
      try {
        const cs = window.getComputedStyle(el);
        const cols = (cs.gridTemplateColumns || '').split(' ').filter(Boolean).length || 1;
        const next = Math.max(1, cols);
        if (prevColsRef.current !== next) {
          prevColsRef.current = next;
          onColsChange(next);
        }
      } catch { }
    };

    let raf = 0;
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        compute();
      });
    };
    const ro = new window.ResizeObserver(onResize);
    ro.observe(el);
    compute();
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [onColsChange, layout]);
  useEffect(() => {
    dlog("mount", { initialPage, layout, jsonBase, storageKeyPrefix, enablePaging, community });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- State & Refs ---
  const [posts, setPosts] = useState<CardPost[]>(initialPosts);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(true);
  // --- Live postsRef for up-to-date list ---
  const postsRef = useRef(posts);
  useEffect(() => { postsRef.current = posts; }, [posts]);
  // Refs to observe page/hasMore changes during async restore
  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);
  const hasMoreRef = useRef(hasMore);
  const urlBootstrapDoneRef = useRef(false);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  // Gating: avoid re-triggering loadMore for the same (rowCount,page) tail state
  const lastLoadTriggerRef = useRef<{ rowCount: number; page: number }>({ rowCount: -1, page: -1 });
  // Tracks the latest visiblePosts snapshot during restore (already exists below)
  // Tracks when columns have been measured at least once
  const colsReadyRef = useRef(false);

  // Guard to ensure we run restore only once
  const restoringRef = useRef(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const isFetchingRef = useRef(false);
  const fetchTokenRef = useRef(0);
  const seenIdsRef = useRef<Set<string>>(new Set(initialPosts.map((p) => p.id)));
  const postIdToPageNumRef = useRef<Map<string, number>>(
    new Map(initialPosts.map((p) => [p.id, initialPage]))
  );
  const recentFailRef = useRef<Map<number, number>>(new Map());
  const missingStreakRef = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [activeCommunity, setActiveCommunity] = useState<string>(community ?? "전체");
  const [activeCommunities, setActiveCommunities] = useState<string[] | null>(null); // null => 전체
  const [readPostIds, setReadPostIds] = useState(() => getReadSet());
  useEffect(() => {
    const onReadUpdated = () => setReadPostIds(getReadSet());
    window.addEventListener("readPosts:updated", onReadUpdated);
    return () => window.removeEventListener("readPosts:updated", onReadUpdated);
  }, []);

  // Community filtering is view-only; section reset is keyed only by base.
  const sectionKey = useMemo(
    () => `${jsonBase}|${storageKeyPrefix}`,
    [jsonBase, storageKeyPrefix]
  );
  const prevSectionKeyRef = useRef(sectionKey);
  const currentAbortRef = useRef<AbortController | null>(null);
  const manifestRef = useRef<{ generatedAt: string; lastPage?: number } | null>(null);
  const prefetchingRef = useRef<Set<string>>(new Set());
  // Expose minimal navigation API for modal to query sequence and request more
  const navRegistryKey = jsonBase || storageKeyPrefix || "__default__";
  const navApiRef = useRef<{ getIds: () => string[]; hasMore: () => boolean; requestLoadMore: () => void } | null>(null);

  useEffect(() => {
    if (community !== undefined) {
      setActiveCommunity(community || "전체");
      setActiveCommunities(null);
      return;
    }
    const off1 = onCommunity((v) => {
      setActiveCommunities(null);
      setActiveCommunity(v || "전체");
    });
    const off2 = onCommunities((ids) => {
      if (ids && ids.length > 0) {
        setActiveCommunity(ids.length === 1 ? ids[0] : "전체");
        setActiveCommunities([...ids]);
      } else {
        // null or empty => 전체
        setActiveCommunity("전체");
        setActiveCommunities(null);
      }
    });
    return () => { off1(); off2(); };
  }, [community]);

  // No resume/restore or user-interaction gating.

  // --- Core Data Fetching ---
  const loadPage = useCallback(
    async (pageNum: number, signal?: AbortSignal): Promise<LoadResult> => {
      // Community does not affect network base; it is a pure client-side filter.
      const base = jsonBase;
      if (!base) return { status: "missing", newPosts: [] };
      dlog("loadPage:start", { pageNum, url: `${base}/page-${pageNum}.json` });

      const url = `${base}/page-${pageNum}.json`;

      // Manifest (version) — fetch once per section
      if (!manifestRef.current) {
        const m = await cacheGetManifest(base);
        if (m?.generatedAt) {
          manifestRef.current = { generatedAt: m.generatedAt, lastPage: (m as any).lastPage };
        }
      }

      if (Date.now() - (recentFailRef.current.get(pageNum) ?? 0) < FAILED_PAGE_RETRY_WINDOW) {
        return { status: "error", newPosts: [] };
      }

      // 1) Try IndexedDB cache (if manifest/version available)
      if (manifestRef.current?.generatedAt) {
        try {
          const cached = await cacheReadPage(base, pageNum, manifestRef.current.generatedAt);
          if (cached && cached.length >= 0) {
            const uniques = cached.filter((p: any) => !seenIdsRef.current.has(p.id));
            dlog("loadPage:cache-hit", { pageNum, cachedCount: cached.length, uniques: uniques.length });
            return { status: uniques.length > 0 ? "ok-new" : "ok-dup", newPosts: uniques as CardPost[] };
          }
        } catch { /* ignore */ }
      }

      // 2) Network with retries
      for (let i = 0; i <= RETRY_BACKOFFS.length; i++) {
        try {
          const res = await fetch(url, { signal });
          if (res.status === 404) {
            dlog("loadPage:404", { pageNum });
            recentFailRef.current.set(pageNum, Date.now());
            return { status: "missing", newPosts: [] };
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const data = await res.json();
          const incomingRaw = (Array.isArray(data.posts) ? data.posts : []) as CardPost[];
          // Normalize community fields for filtering/display
          const incoming = incomingRaw.map((p: any) => ({
            ...p,
            communityId: p.communityId || p.community || p.site || undefined,
            communityLabel: p.communityLabel || p.community || p.site || undefined,
          })) as CardPost[];
          // Write-through to cache (best-effort)
          try {
            const ver = manifestRef.current?.generatedAt || (await cacheGetManifest(base))?.generatedAt;
            if (ver) await cacheWritePage(base, pageNum, ver, incoming as any);
          } catch { /* ignore */ }
          // Prefetch next page in background
          try {
            const next = pageNum + 1;
            const key = `${base}|${next}`;
            if (!prefetchingRef.current.has(key)) {
              prefetchingRef.current.add(key);
              (async () => {
                try {
                  const r = await fetch(`${base}/page-${next}.json`, { cache: 'no-store' });
                  if (r.ok) {
                    const d = await r.json();
                    const arr = (Array.isArray(d.posts) ? d.posts : []) as CardPost[];
                    const norm = arr.map((p: any) => ({
                      ...p,
                      communityId: p.communityId || p.community || p.site || undefined,
                      communityLabel: p.communityLabel || p.community || p.site || undefined,
                    })) as CardPost[];
                    const ver2 = manifestRef.current?.generatedAt || (await cacheGetManifest(base))?.generatedAt;
                    if (ver2) await cacheWritePage(base, next, ver2, norm as any);
                  }
                } catch { /* ignore */ }
                finally { prefetchingRef.current.delete(key); }
              })();
            }
          } catch { /* ignore */ }
          const sampleIds = incoming.slice(0, 5).map((p) => p.id);
          dlog("loadPage:ok", { pageNum, incomingCount: incoming.length, sampleIds });
          const uniques = incoming.filter((p) => !seenIdsRef.current.has(p.id));
          dlog("loadPage:dedup", {
            pageNum,
            uniquesCount: uniques.length,
            status: uniques.length > 0 ? "ok-new" : "ok-dup",
          });
          return {
            status: uniques.length > 0 ? "ok-new" : "ok-dup",
            newPosts: uniques,
          };
        } catch (e: any) {
          dlog("loadPage:error", { pageNum, attempt: i, message: (e as Error)?.message, aborted: signal?.aborted });
          if (signal?.aborted) {
            recentFailRef.current.set(pageNum, Date.now());
            return { status: "error", newPosts: [] };
          }
          if (i === RETRY_BACKOFFS.length) {
            recentFailRef.current.set(pageNum, Date.now());
            return { status: "error", newPosts: [] };
          }
          dlog("loadPage:retrying", { pageNum, backoffMs: RETRY_BACKOFFS[i] });
          await new Promise((r) => setTimeout(r, RETRY_BACKOFFS[i]));
        }
      }
      return { status: "error", newPosts: [] };
    },
    [jsonBase]
  );

  const loadMore = useCallback(async () => {
    if (isFetchingRef.current || !hasMoreRef.current) return;

    // Pre-flight check: if manifest is missing, assume no pages and stop.
    if (!manifestRef.current) {
      const base = jsonBase;
      if (base) {
        const m = await cacheGetManifest(base);
        if (m?.generatedAt) {
          manifestRef.current = { generatedAt: m.generatedAt, lastPage: (m as any).lastPage };
        } else {
          setHasMore(false);
          return;
        }
      } else {
        // no jsonBase, no paging
        setHasMore(false);
        return;
      }
    }

    isFetchingRef.current = true;
    setIsFetching(true);
    dlog("loadMore:start", { page: pageRef.current, hasMore: hasMoreRef.current, firstJson: FIRST_JSON_PAGE, streak: missingStreakRef.current });
    const ac = new AbortController();
    currentAbortRef.current?.abort();
    currentAbortRef.current = ac;
    const myToken = ++fetchTokenRef.current;

    let currentPage = pageRef.current;
    let collected: CardPost[] = [];
    let appendedCount = 0;
    let lastSuccessfulPage = currentPage;
    let pagesTried = 0;
    let collectedPairs: { post: CardPost; pageNum: number }[] = [];
    let hadError = false;

    while (pagesTried < MAX_PAGES_PER_CALL && hasMoreRef.current) {
      const lastPage = manifestRef.current?.lastPage;
      const nextPage = Math.max(currentPage + 1, FIRST_JSON_PAGE);
      if (typeof lastPage === 'number' && nextPage > lastPage) {
        setHasMore(false);
        break;
      }
      currentPage = nextPage;
      pagesTried++;
      const { status, newPosts } = await loadPage(currentPage, ac.signal);
      dlog("loadMore:pageResult", {
        triedPage: currentPage,
        pagesTried,
        status,
        newCount: newPosts.length,
        appendedCount,
        missingStreak: missingStreakRef.current,
      });

      if (fetchTokenRef.current !== myToken) {
        isFetchingRef.current = false;
        setIsFetching(false);
        return;
      }

      if (status === "ok-new") {
        collected.push(...newPosts);
        for (const p of newPosts) collectedPairs.push({ post: p, pageNum: currentPage });
        appendedCount += newPosts.length;
        lastSuccessfulPage = currentPage;
        missingStreakRef.current = 0;
        dlog("loadMore:append", { page: currentPage, appendedNow: newPosts.length, totalAppended: appendedCount });
      } else if (status === "ok-dup") {
        // Page exists but no new items; still advance the page pointer so we don't get stuck
        lastSuccessfulPage = currentPage;
        missingStreakRef.current = 0;
        dlog("loadMore:ok-dup", { page: currentPage, lastSuccessfulPage });
      } else if (status === "missing") {
        if (manifestRef.current?.lastPage && currentPage >= manifestRef.current.lastPage) {
          setHasMore(false);
          break;
        }
        missingStreakRef.current++;
        dlog("loadMore:missing", { page: currentPage, missingStreak: missingStreakRef.current });
        if (missingStreakRef.current >= MISSING_LIMIT) {
          // Look ahead a few pages to see if it's just a hole in the sequence
          let foundAhead = false;
          for (let k = 1; k <= MISSING_LOOKAHEAD; k++) {
            const probePage = currentPage + k;
            const probe = await loadPage(probePage, ac.signal);
            if (probe.status !== "missing") {
              dlog("loadMore:lookahead-hit", { probePage, probeStatus: probe.status, newCount: probe.newPosts.length });
              foundAhead = true;
              // reset streak since there's still content beyond the hole
              missingStreakRef.current = 0;
              if (probe.status === "ok-new" && probe.newPosts.length > 0) {
                collected.push(...probe.newPosts);
                for (const p of probe.newPosts) collectedPairs.push({ post: p, pageNum: probePage });
                appendedCount += probe.newPosts.length;
              }
              // whether ok-new or ok-dup, we have consumed up to probePage
              lastSuccessfulPage = probePage;
              currentPage = probePage; // jump forward past the hole
              break;
            }
          }
          if (!foundAhead) {
            dlog("loadMore:lookahead-exhausted", { fromPage: currentPage, lookahead: MISSING_LOOKAHEAD });
            setHasMore(false);
            break;
          }
        }
      } else { // error
        dlog("loadMore:error-stop", { atPage: currentPage, fromPageState: pageRef.current });
        setHasMore(false); // prevent endless IO retriggers at the tail when next page returns 5xx or network errors
        hadError = true;
        break;
      }
    }
    dlog("loadMore:loop-end", { appendedCount, lastSuccessfulPage, prevPage: pageRef.current });
    if (appendedCount > 0) {
      addPosts(collected);
      // Commit visibility before rendering
      collectedPairs.forEach(({ post, pageNum }) => {
        seenIdsRef.current.add(post.id);
        postIdToPageNumRef.current.set(post.id, pageNum);
      });
      setPosts((prev) => [...prev, ...collected]);
    } else if (pagesTried > 0) {
      // We tried fetching but got no new posts (all duplicates or missing)
      // so stop trying.
      setHasMore(false);
    } else if (pagesTried > 0) {
      // We tried fetching but got no new posts (all duplicates or missing)
      // so stop trying.
      setHasMore(false);
    }
    // Even if nothing new was appended (ok-dup), advance the page pointer when we successfully traversed pages
    if (lastSuccessfulPage > pageRef.current) {
      setPage(lastSuccessfulPage);
    }

    isFetchingRef.current = false;
    setIsFetching(false);
    dlog("loadMore:end", { newPage: lastSuccessfulPage > pageRef.current ? lastSuccessfulPage : pageRef.current, hasMore: hasMoreRef.current });

    if (hadError) {
      return;
    }

    // --- Auto-prime the tail after a programmatic jump/restore ---
    // 콘텐츠가 뷰포트를 아직 못 채웠거나, 이미 거의 바닥에 붙어 있으면
    // 다음 틱에 loadMore를 한 번 더 스케줄해 무한스크롤을 깨운다.
    try {
      const doc = document.documentElement;
      const scrollTop = (doc.scrollTop || window.scrollY || 0);
      const winBottom = scrollTop + window.innerHeight;
      const docHeight = doc.scrollHeight;

      const NEED_FILL_THRESHOLD_PX = 48;    // 화면보다 살짝만 짧아도 채우자
      const NEAR_BOTTOM_THRESHOLD_PX = 800; // 리스트 4~6행 정도

      const needFill = docHeight <= window.innerHeight + NEED_FILL_THRESHOLD_PX;
      const nearBottom = (docHeight - winBottom) <= NEAR_BOTTOM_THRESHOLD_PX;

      if ((needFill || nearBottom) && hasMoreRef.current) {
        // 재진입 방지: 다음 틱으로 미뤄서 게이트 재확인
        setTimeout(() => {
          if (!isFetchingRef.current && hasMoreRef.current) {
            loadMore();
          }
        }, 0);
      }
    } catch {
      // no-op
    }
  }, [loadPage, addPosts]);

  const ensureBelowBufferRows = useCallback(async (anchorId: string) => {
    const BELOW_BUFFER = 12; // 앵커 아래 최소 확보할 행 수
    let guard = 0;
    while (guard < 5 && hasMoreRef.current) {
      const list = postsRef.current;
      const idx = list.findIndex(p => p.id === anchorId);
      if (idx === -1) break;
      const below = list.length - idx - 1;
      if (below >= BELOW_BUFFER) break;
      await loadMore();
      await new Promise(r => setTimeout(r, 0));
      guard++;
    }
  }, [loadMore]);

  // --- Effects ---

  // No initial restore; just ensure we abort inflight on unmount
  useEffect(() => {
    return () => { currentAbortRef.current?.abort(); };
  }, []);

  // --- Rendering ---

  // --- Rendering ---
  const communityFilteredPosts = (
    activeCommunities && activeCommunities.length > 0
      ? posts.filter((p: any) => activeCommunities.includes(p.communityId || p.community))
      : (activeCommunity === "전체"
        ? posts
        : posts.filter((p: any) => (p.communityId || p.community) === activeCommunity))
  );

  const visiblePosts = useMemo(() => {
    if (readFilter === 'all') {
      return communityFilteredPosts;
    }
    return communityFilteredPosts.filter(post => {
      const isRead = readPostIds.has(post.id);
      if (readFilter === 'unread') {
        return !isRead;
      }
      if (readFilter === 'read') {
        return isRead;
      }
      return true; // Should not happen
    });
  }, [communityFilteredPosts, readFilter, readPostIds]);
  // Keep a ref to always point to the latest visiblePosts
  const visiblePostsRef = useRef<CardPost[]>(visiblePosts);
  useEffect(() => { visiblePostsRef.current = visiblePosts; }, [visiblePosts]);

  // --- Feed metrics (read/unread counts) broadcast ---
type FeedMetrics = { key: string; total: number; read: number; unread: number };
const lastMetricsRef = useRef<{ total: number; read: number; unread: number } | null>(null);
const metricsRafRef = useRef<number | null>(null);
const emitMetrics = useCallback(() => {
  try {
    const list = communityFilteredPosts; // before readFilter applied
    const total = list.length;
    let read = 0;
    for (const p of list) { if (readPostIds.has(p.id)) read++; }
    const unread = Math.max(0, total - read);

    const prev = lastMetricsRef.current;
    if (prev && prev.total === total && prev.read === read && prev.unread === unread) {
      return; // no change -> skip dispatch
    }
    lastMetricsRef.current = { total, read, unread };

    const detail: FeedMetrics = { key: navRegistryKey, total, read, unread };
    window.dispatchEvent(new CustomEvent<FeedMetrics>('feed:metrics', { detail } as any));
  } catch { /* no-op */ }
}, [communityFilteredPosts, readPostIds, navRegistryKey]);

// Emit on initial mount and whenever list or read set changes (coalesced to next frame)
useLayoutEffect(() => {
  if (metricsRafRef.current != null) cancelAnimationFrame(metricsRafRef.current);
  metricsRafRef.current = requestAnimationFrame(() => {
    metricsRafRef.current = null;
    emitMetrics();
  });
  return () => {
    if (metricsRafRef.current != null) {
      cancelAnimationFrame(metricsRafRef.current);
      metricsRafRef.current = null;
    }
  };
}, [emitMetrics]);

  // Register feed order + loadMore hook for modal navigation while dialog is open
  useEffect(() => {
    const w = typeof window !== 'undefined' ? (window as any) : null;
    if (!w) return;
    if (!w.__FEED_NAV__) w.__FEED_NAV__ = new Map<string, any>();
    const map: Map<string, any> = w.__FEED_NAV__;
    navApiRef.current = {
      getIds: () => visiblePosts.map((p) => p.id),
      hasMore: () => hasMore,
      requestLoadMore: () => { if (!isFetchingRef.current && hasMore) loadMore(); },
    };
    map.set(navRegistryKey, navApiRef.current);
    return () => { try { map.delete(navRegistryKey); } catch { /* no-op */ } };
  }, [navRegistryKey, visiblePosts, hasMore, loadMore]);

  // Page sentinel -> URL sync via IntersectionObserver (layout-agnostic)
  useEffect(() => {
    if (!enablePaging) return;
    const root = rootRef.current;
    if (!root) return;

    let raf = 0;
    const io = new IntersectionObserver((entries) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          // Choose the sentinel closest to a top anchor (≈18% from top)
          const anchorY = Math.round((typeof window !== 'undefined' ? window.innerHeight : 0) * 0.18);
          let bestPage: number | null = null;
          let bestDist = Infinity;

          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const el = e.target as HTMLElement;
            const n = Number((el.dataset as any).pageSentinel);
            if (!Number.isFinite(n)) continue;
            const rect = el.getBoundingClientRect();
            // Only consider sentinels within the top 60% of the viewport to reduce jitter
            if (rect.bottom < 0 || rect.top > (typeof window !== 'undefined' ? window.innerHeight : 0) * 0.6) continue;
            const dist = Math.abs(rect.top - anchorY);
            if (dist < bestDist || (dist === bestDist && (bestPage === null || n > bestPage))) {
              bestDist = dist;
              bestPage = n;
            }
          }

          if (bestPage !== null) {
            const u = new URL(window.location.href);
            if (bestPage <= 1) u.searchParams.delete('page');
            else u.searchParams.set('page', String(bestPage));
            const qs = u.searchParams.toString();
            window.history.replaceState(null, '', u.pathname + (qs ? `?${qs}` : '') + u.hash);
          }
        } catch { /* ignore */ }
      });
    }, {
      root: null,
      // Make the active detection zone the TOP 40% of the viewport (smoother, earlier updates)
      rootMargin: '0px 0px -60% 0px',
      threshold: 0,
    });

    const els = Array.from(root.querySelectorAll('[data-page-sentinel]')) as HTMLElement[];
    els.forEach((el) => io.observe(el));

    return () => { io.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [enablePaging, visiblePosts]);

  // Virtualized list rendering (responsive 1→2 columns at md breakpoint)
  if (layout === 'list') {
    // (removed) suppressAnimRef
    const [cols, setCols] = useState(1);
    const [containerWidth, setContainerWidth] = useState(0);
    useEffect(() => {
      const el = rootRef.current;
      if (!el) return;
      let raf = 0;
      const mqlWide = typeof window !== 'undefined'
        ? window.matchMedia(`(min-width: ${threeColAt === 'xl' ? 1280 : 1024}px)`)
        : null;
      const compute = () => {
        try {
          const w = el.clientWidth || 0;
          setContainerWidth((prev) => (prev === w ? prev : w));
          const GAP = 16; // gap-4
          const MIN_ITEM = 22 * 16; // 22rem
          const maxCols = listColumns === '3-2-1' ? 3 : 2;
          let c = Math.max(1, Math.floor((w + GAP) / (MIN_ITEM + GAP)));
          c = Math.min(c, maxCols);
          // Gate 3 columns by requested breakpoint
          if (c >= 3 && listColumns === '3-2-1' && mqlWide && !mqlWide.matches) c = 2;
          if (c !== cols) setCols(c);
          // mark columns as measured at least once
          colsReadyRef.current = true;
        } catch { /* noop */ }
      };
      const onResize = () => { if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(compute); };
      const ro = new ResizeObserver(onResize);
      ro.observe(el);
      compute();
      return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
    }, [listColumns, threeColAt, cols]);

    // (removed) container debug logs

    const rowCount = Math.ceil(visiblePosts.length / cols);
    const estimateRowSize = useCallback(() => {
      const effectiveLayout = cardLayoutOverride ?? layout;
      const isMobile = (containerWidth || (rootRef.current?.clientWidth || 0)) < 768; // md breakpoint
      const ROW_GAP = 16;
      if (effectiveLayout === 'grid') {
        const GAP = 16;
        const w = Math.max(0, containerWidth || (rootRef.current?.clientWidth || 0));
        const c = Math.max(1, cols);
        const cardW = c > 0 ? (w - (c - 1) * GAP) / c : w;
        const imgH = Math.max(120, Math.round(cardW * 2 / 3)); // 3:2
        const textH = c >= 3 ? 140 : c === 2 ? 146 : 152;      // 텍스트/패딩 반영해 상향
        return imgH + textH + ROW_GAP;
      }
      // list(썸네일+텍스트) 행 높이도 상향
      const LIST_ROW_EST = 100;
      return LIST_ROW_EST + ROW_GAP;
    }, [cols, cardLayoutOverride, layout, containerWidth]);

    // Instant window scroll (no easing). Animation is suppressed during restore to avoid jank.
    const scrollToFn = useCallback((offset: number) => {
      try {
        const y = Math.max(0, Math.round(offset));
        // We intentionally do not animate here. All programmatic jumps should be instant.
        window.scrollTo({ top: y, behavior: 'auto' });
      } catch {
        // Fallback (older browsers)
        window.scrollTo({ top: Math.max(0, Math.round(offset)), behavior: 'auto' as ScrollBehavior });
      }
    }, []);

    const virtualizer = useWindowVirtualizer({
      count: rowCount,
      estimateSize: estimateRowSize,
      overscan: virtualOverscan,
      scrollToFn,
      getItemKey: (row) => {
        const idx0 = row * cols;
        return visiblePosts[idx0]?.id ?? row;
      },
    });
    // Expose virtualizer + current column count for restore effect
    useEffect(() => {
      if (!DEBUG_IPL) return;
      try {
        const w: any = window;
        w.__VLIST__ = { scrollToIndex: (i: number) => virtualizer.scrollToIndex(i) };
        w.__LIST_COLS__ = String(cols);
      } catch { /* no-op */ }
    }, [virtualizer, cols]);

    const items = virtualizer.getVirtualItems();
    // When column count changes, remeasure to prevent transient overlaps
    useEffect(() => { virtualizer.measure(); }, [cols, containerWidth, virtualizer]);
    // (removed) first-item debug logs

    // Virtualizer-based load-more: when the last virtual row comes into view (gated)
    useEffect(() => {
      if (restoringRef.current) return;
      if (!enablePaging || !hasMoreRef.current) return;
      const last = items[items.length - 1];
      if (!last) return;
      const threshold = Math.max(0, rowCount - Math.max(1, Math.floor(loadAheadRows))); // within last N rows
      const inTail = last.index >= threshold;
      if (!inTail) return;

      // Avoid retriggering for the same (rowCount, page) state
      const prev = lastLoadTriggerRef.current;
      const cur = { rowCount, page: pageRef.current };
      if (prev.rowCount === cur.rowCount && prev.page === cur.page) {
        return;
      }
      lastLoadTriggerRef.current = cur;

      if (!isFetchingRef.current) {
        loadMore();
      }
    }, [items, rowCount, enablePaging, loadMore, loadAheadRows]);

    // Ensure the browser doesn't fight our programmatic restoration
    useEffect(() => {
      let prev: string | null = null;
      try {
        // Some browsers may throw if not supported; guard with try/catch
        prev = (window.history as any).scrollRestoration || null;
        (window.history as any).scrollRestoration = 'manual';
      } catch { /* ignore */ }
      return () => {
        try {
          (window.history as any).scrollRestoration = prev || 'auto';
        } catch { /* ignore */ }
      };
    }, []);

    useRestoreFromDetail({
      storageKeyPrefix,
      initialPage,
      cols,
      virtualizer,
      loadMore,
      hasMoreRef,
      pageRef,
      colsReadyRef,
      visiblePostsRef,
      seenIdsRef,
      postIdToPageNumRef,
      rootRef,
      restoringRef,
      ensureBelowBufferRows,
    });

    // URL ?page= 부트스트랩 (세션 복귀 중이 아닐 때만)
    useEffect(() => {
      if (!enablePaging) return;
      if (restoringRef.current) return;
      if (urlBootstrapDoneRef.current) return; // run only once
      urlBootstrapDoneRef.current = true;

      // read from current URL (avoid reacting to our own replaceState)
      const pStr = (typeof window !== 'undefined'
        ? new URL(window.location.href).searchParams.get('page')
        : null;
      const target = pStr ? Math.max(1, parseInt(pStr, 10) || 1) : 1;
      if (target <= 1) return; // 기본값

      let cancelled = false;
      const waitFrames = (n: number) => new Promise<void>((res) => {
        let i = 0; const step = () => { if (cancelled) return; if (++i >= n) return res(); requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });

      const run = async () => {
        const prevScrollBehavior = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';

        const waitFrames = (n: number) => new Promise<void>((res) => {
          let i = 0; const step = () => { if (++i >= n) return res(); requestAnimationFrame(step); };
          requestAnimationFrame(step);
        });

        // Ensure target page is loaded and pick an anchor id on that page
        while (pageRef.current < target && hasMoreRef.current && !cancelled) {
          await loadMore();
          await waitFrames(1);
        }

        const findAnchorOnTarget = () => {
          const list = visiblePostsRef.current;
          // Prefer the first post exactly on the target page
          for (let i = 0; i < list.length; i++) {
            const id = list[i].id;
            const pn = postIdToPageNumRef.current.get(id);
            if ((pn ?? 1) === target) return id;
          }
          // Fallback 1: first post after target page
          for (let i = 0; i < list.length; i++) {
            const id = list[i].id;
            const pn = postIdToPageNumRef.current.get(id) ?? 1;
            if (pn > target) return id;
          }
          // Fallback 2: last post before target page
          for (let i = list.length - 1; i >= 0; i--) {
            const id = list[i].id;
            const pn = postIdToPageNumRef.current.get(id) ?? 1;
            if (pn < target) return id;
          }
          // Final fallback: first visible post, or null if none
          return list[0]?.id ?? null;
        };

        let anchorId: string | null = findAnchorOnTarget();
        // Try a few more loads if we still couldn't pick an anchor on/near the target
        {
          let guard = 0;
          while (!anchorId && hasMoreRef.current && guard < 4 && !cancelled) {
            guard++;
            await loadMore();
            await waitFrames(1);
            anchorId = findAnchorOnTarget();
          }
        }

        // Scroll to the anchor if found
        if (anchorId) {
          const idx = visiblePostsRef.current.findIndex((p) => p.id === anchorId);
          if (idx >= 0) {
            const rowIndex = Math.floor(idx / Math.max(1, cols));
            try { virtualizer.scrollToIndex(rowIndex, { align: 'start' } as any); } catch { }
            await waitFrames(1);
          }
          const el = document.getElementById(`post-${anchorId}`) as HTMLElement | null;
          if (el) {
            el.scrollIntoView({ behavior: 'auto', block: 'start' });
          }
          await ensureBelowBufferRows(anchorId);
        }

        // 5) URL 페이지 정규화
        try {
          const setPageInUrl = (n: number) => {
            const u = new URL(window.location.href);
            if (n <= 1) u.searchParams.delete('page'); else u.searchParams.set('page', String(n));
            const qs = u.searchParams.toString();
            window.history.replaceState(null, '', u.pathname + (qs ? `?${qs}` : '') + u.hash);
          };
          if (anchorId) {
            const n = postIdToPageNumRef.current.get(anchorId);
            if (typeof n === 'number' && Number.isFinite(n)) setPageInUrl(n);
            else setPageInUrl(target);
          } else {
            setPageInUrl(target);
          }
        } catch { /* ignore */ }
        finally {
          document.documentElement.style.scrollBehavior = prevScrollBehavior || '';
          restoringRef.current = false;
        }
      };

      run();
      return () => { cancelled = true; };
    }, [enablePaging, loadMore, cols, virtualizer]);

    return (
      <>
        <style jsx global>{`
        /* Restore neon glow effect for the post anchor on return from detail */
        .post-anchor.restore-glow { --restore-ms: 850ms; }
        .post-anchor { position: relative; }
        .post-anchor.restore-glow::after,
        .post-anchor.restore-glow::before { content: ""; position: absolute; inset: 0; border-radius: 12px; pointer-events: none; }

        /* Dim the content briefly so the neon ring pops on light backgrounds */
        .post-anchor.restore-glow::before {
          background: #000;
          opacity: 0;
          z-index: 2; /* above children */
          animation: restore-dim var(--restore-ms) ease-out forwards;
        }

        /* Rainbow neon ring that swirls once around the card and fades out */
        .post-anchor.restore-glow::after {
          z-index: 3; /* top-most */
          /* Draw only the border using CSS masking */
          padding: 2px; /* ring thickness */
          border-radius: 14px; /* slightly larger than card corners */
          background: conic-gradient(
            from 0turn,
            #ff0066, #ff8a00, #ffdc00, #00e676, #00b0ff, #8e24aa, #ff0066
          );
          /* Mask to keep only the ring */
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          filter: saturate(1.6) brightness(1.2) blur(0.2px);
          box-shadow: 0 0 18px rgba(255,255,255,0.18);
          will-change: filter, opacity;
          animation: hue-spin var(--restore-ms) linear forwards,
                     ring-fade var(--restore-ms) ease-out forwards;
        }

        @keyframes hue-spin { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(360deg); } }
        @keyframes ring-fade { from { opacity: 1; } to { opacity: 0; } }
        @keyframes restore-dim {
          0% { opacity: 0; }
          10% { opacity: .32; }
          30% { opacity: .18; }
          55% { opacity: .26; }
          100% { opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .post-anchor.restore-glow::after, .post-anchor.restore-glow::before { animation: none !important; opacity: 0 !important; }
        }
      `}</style>
        <div ref={rootRef} className="grid grid-cols-1 gap-4">
          <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
            {items.map((vi) => {
              const start = vi.index * cols;
              const rowPosts = visiblePosts.slice(start, start + cols);
              if (rowPosts.length === 0) return null;
              return (
                <div
                  key={`row-${vi.index}-${rowPosts[0].id}`}
                  ref={virtualizer.measureElement}
                  data-index={vi.index}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translate3d(0, ${vi.start}px, 0)`, willChange: 'transform' }}
                >
                  <div
                    className="grid gap-4"
                    style={{ gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0, 1fr))` }}
                  >
                    {rowPosts.map((post, i) => (
                      <div
                        key={post.id}
                        id={`post-${post.id}`}
                        className="post-anchor relative isolate"
                        style={{ scrollMarginTop: 'var(--sticky-top, 0px)' }}
                      >
                        {(() => {
                          const indexGlobal = start + i;
                          const pageNum = postIdToPageNumRef.current.get(post.id) || initialPage;
                          const prevId = visiblePosts[indexGlobal - 1]?.id;
                          const prevPage = prevId ? postIdToPageNumRef.current.get(prevId) : undefined;
                          const isPageStart = indexGlobal === 0 || pageNum !== prevPage;
                          return isPageStart ? (
                            <div data-page-sentinel={pageNum} aria-hidden="true" style={{ display: 'block', height: 1 }} />
                          ) : null;
                        })()}
                        <PostCard
                          postId={post.id}
                          layout={cardLayoutOverride ?? layout}
                          page={postIdToPageNumRef.current.get(post.id) || initialPage}
                          storageKeyPrefix={storageKeyPrefix}
                          isNew={(start + i) >= initialPosts.length}
                          isPriority={(start + i) < 5}
                        />
                      </div>
                    ))}
                  </div>
                  {/* spacer between virtual rows: 16px */}
                  <div className="h-4" aria-hidden />
                </div>
              );
            })}
          </div>

          {enablePaging && <div ref={loaderRef} aria-label="infinite-loader" className="col-span-full h-1" />}
          {isFetching && hasMore && (
            <div className="text-center text-gray-400 py-4 col-span-full">불러오는 중...</div>
          )}
          {!hasMore && (
            <div className="text-center text-gray-400 py-4 col-span-full">더 이상 글이 없습니다.</div>
          )}
        </div>
      </>
    );
  }

  // Grid path
  return (
    <>
      {DEBUG_IPL && (
        <div style={{ position: 'fixed', top: '50px', left: '10px', background: 'rgba(255,0,0,0.8)', color: 'white', padding: '5px', zIndex: 9999, fontSize: '12px', borderRadius: '4px' }}>
          DEBUG: jsonBase=&quot;{jsonBase || 'UNDEFINED'}&quot;
        </div>
      )}
      <style jsx global>{`
        /* Restore neon glow effect for the post anchor on return from detail */
        .post-anchor.restore-glow { --restore-ms: 1500ms; }
        .post-anchor { position: relative; }
        .post-anchor.restore-glow::after,
        .post-anchor.restore-glow::before { content: ""; position: absolute; inset: 0; border-radius: 12px; pointer-events: none; }
        .post-anchor.restore-glow::before { background: #000; opacity: 0; z-index: 2; animation: restore-dim var(--restore-ms) ease-out forwards; }
        .post-anchor.restore-glow::after {
          z-index: 3; padding: 2px; border-radius: 14px;
          background: conic-gradient(from 0turn, #ff0066, #ff8a00, #ffdc00, #00e676, #00b0ff, #8e24aa, #ff0066);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          filter: saturate(1.6) brightness(1.2) blur(0.2px);
          box-shadow: 0 0 18px rgba(255,255,255,0.18);
          will-change: filter, opacity;
          animation: hue-spin var(--restore-ms) linear forwards,
                     ring-fade var(--restore-ms) ease-out forwards;
        }
        @keyframes hue-spin { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(360deg); } }
        @keyframes ring-fade { from { opacity: 1; } to { opacity: 0; } }
        @keyframes restore-dim { 0% { opacity: 0; } 10% { opacity: .32; } 30% { opacity: .18; } 55% { opacity: .26; } 100% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .post-anchor.restore-glow::after, .post-anchor.restore-glow::before { animation: none !important; opacity: 0 !important; } }
      `}</style>
      <div
        ref={rootRef}
        className={"grid gap-4"}
        style={gridColumnsOverride && gridColumnsOverride > 0
          ? { gridTemplateColumns: `repeat(${Math.max(1, Math.floor(gridColumnsOverride))}, minmax(0, 1fr))` }
          : { gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 22rem), 1fr))` }}
      >
        {visiblePosts.map((post, index) => (
          <div key={post.id} id={`post-${post.id}`} className="post-anchor relative isolate" style={{ scrollMarginTop: 'var(--sticky-top, 0px)' }}>
            {(() => {
              const pageNum = postIdToPageNumRef.current.get(post.id) || initialPage;
              const prevId = visiblePosts[index - 1]?.id;
              const prevPage = prevId ? postIdToPageNumRef.current.get(prevId) : undefined;
              const isPageStart = index === 0 || pageNum !== prevPage;
              return isPageStart ? (
                <div data-page-sentinel={pageNum} aria-hidden="true" style={{ display: 'block', height: 1 }} />
              ) : null;
            })()}
            <PostCard
              postId={post.id}
              layout={layout}
              page={postIdToPageNumRef.current.get(post.id) || initialPage}
              storageKeyPrefix={storageKeyPrefix}
              isNew={index >= initialPosts.length}
              isPriority={index < 10}
            />
          </div>
        ))}
        {enablePaging && <div ref={loaderRef} aria-label="infinite-loader" className="col-span-full h-1" />}
        {isFetching && hasMore && (
          <div className="text-center text-gray-400 py-4 col-span-full">불러오는 중...</div>
        )}
        {!hasMore && (
          <div className="text-center text-gray-400 py-4 col-span-full">더 이상 글이 없습니다.</div>
        )}
      </div>
    </>
  );
}