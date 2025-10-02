"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import InfinitePostList from "@/components/infinite-post-list";
import { PostListProvider } from "@/context/post-list-context";
import type { Post } from "@/lib/types";

function SkeletonCard() {
    return (
        <div className="w-full rounded-lg bg-gray-100 overflow-hidden">
            <div className="w-full aspect-[16/9] bg-gray-200 animate-pulse" />
            <div className="p-3 space-y-2">
                <div className="h-4 w-5/6 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-2/3 bg-gray-200 rounded animate-pulse" />
                <div className="flex items-center gap-2 pt-1">
                    <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
                    <div className="h-3 w-12 bg-gray-200 rounded animate-pulse" />
                    <div className="h-3 w-10 bg-gray-200 rounded animate-pulse" />
                </div>
            </div>
        </div>
    );
}

function mulberry32(seed: number) {
    return function () {
        let t = (seed += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function pickRandom<T>(arr: T[], k: number, seed: number) {
    const a = arr.slice();
    const rand = mulberry32(seed);
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, Math.min(k, a.length));
}

export default function ClientRandomClamp({
    items,
    sampleMax,
    layout = "grid",
    community,
    jsonBase,
    storageKeyPrefix,
    seedIntervalMs = 120000,
    rows = 1,
    randomizeOnEachMount = false,
    initialSampled,
    initialSeed,
}: {
    items: Post[];
    sampleMax: number;
    layout?: "grid" | "list";
    community?: string;
    jsonBase?: string;
    storageKeyPrefix: string;
    seedIntervalMs?: number;
    rows?: number; // 최대 표시 줄 수 (그리드 컬럼 수 * rows 만큼 표시)
    /**
     * true이면 컴포넌트가 마운트될 때마다 새로운 랜덤 샘플을 선택합니다.
     * (페이지 새로고침마다 구성이 달라짐)
     */
    randomizeOnEachMount?: boolean;
    initialSampled?: Post[];
    initialSeed?: number;
}) {
    const measureRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [measuredCols, setMeasuredCols] = useState(0);

    const [cols, setCols] = useState(1);
    const [isXl, setIsXl] = useState<boolean>(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return false;
        return window.matchMedia('(min-width: 1280px)').matches;
    });
    const [mounted, setMounted] = useState(false);

    // 씨드 계산
    // - randomizeOnEachMount: 마운트마다 고정된 난수 씨드
    // - 아니면 시간 버킷 씨드(예: seedIntervalMs 단위로 바뀜; 새로고침 기준)
    const seedRef = useRef<number>(initialSeed ?? Math.floor(Math.random() * 1e9));
    const seed = useMemo(() => {
        if (randomizeOnEachMount) {
            return seedRef.current;
        }
        if (initialSeed != null) {
            return initialSeed;
        }
        return Math.floor(Date.now() / seedIntervalMs);
    }, [initialSeed, randomizeOnEachMount, seedIntervalMs]);
    const sampled = useMemo(() => {
        if (initialSampled && initialSampled.length > 0) {
            return initialSampled;
        }
        return pickRandom(items, sampleMax, seed);
    }, [initialSampled, items, sampleMax, seed]);

    // 🔍 디버깅용 로그
    useEffect(() => {
        console.log("[ClientRandomClamp]", {
            itemsLen: items?.length,
            sampleMax,
            sampledLen: sampled?.length,
            readyCols: cols || measuredCols,
            seed,
            randomizeOnEachMount,
            initialSeed,
        });
    }, [items, sampleMax, sampled, cols, measuredCols, seed, randomizeOnEachMount, initialSeed]);

    useEffect(() => {
        const el = measureRef.current;
        if (!el) return;

        let raf = 0;
        const compute = () => {
            try {
                const cs = window.getComputedStyle(el);
                const cols = (cs.gridTemplateColumns || '')
                    .split(' ')
                    .filter(Boolean).length || 1;
                setMeasuredCols(prev => (prev === cols ? prev : cols));
            } catch { }
        };
        const onResize = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(compute);
        };

        const ro = new ResizeObserver(onResize);
        ro.observe(el);
        compute();
        return () => {
            if (raf) cancelAnimationFrame(raf);
            ro.disconnect();
        };
    }, []);

    useEffect(() => { setMounted(true); }, []);

    // 컨테이너 실측 기반으로 컬럼 계산 (브레이크 전/후 구간 안정)
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        let raf = 0;
        const compute = () => {
            try {
                const w = el.clientWidth || 0;
                const GAP = 16; // gap-4
                const MIN_ITEM = 22 * 16; // 22rem
                let c = Math.max(1, Math.floor((w + GAP) / (MIN_ITEM + GAP)));
                c = Math.min(c, 3); // 최대 3
                if (!isXl && c >= 3) c = 2; // 3열은 xl 이상에서만 허용
                setCols((prev) => (prev === c ? prev : c));
            } catch { }
        };
        const onResize = () => { if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(compute); };
        const ro = new ResizeObserver(onResize);
        ro.observe(el);
        compute();
        return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
    }, [isXl]);

    // 실제 컬럼 수: 컨테이너 측정 우선, 없으면 보조 측정/보고치 사용
    const readyCols = cols || measuredCols;
    // 3열은 xl 이상에서만 허용 (보루)
    const finalCols = Math.max(1, Math.min(readyCols || 1, isXl ? 3 : 2));

    // xl 미디어쿼리 리스너
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mql = window.matchMedia('(min-width: 1280px)');
        const handler = () => setIsXl(mql.matches);
        try { mql.addEventListener('change', handler); } catch { (mql as MediaQueryList).addListener(handler); }
        handler();
        return () => { try { mql.removeEventListener('change', handler); } catch { (mql as MediaQueryList).removeListener(handler); } };
    }, []);

    // 아직 마운트 전이거나 컬럼 수를 모르기 전엔, 얇은 스켈레톤 렌더
    if (!mounted || !finalCols) {
        return (
            <div ref={containerRef} className="relative">
                {/* 동일한 템플릿으로 컬럼 수를 측정하는 보조 그리드 (보이지 않게) */}
                <div
                    ref={measureRef}
                    aria-hidden
                    className="opacity-0 pointer-events-none absolute inset-0 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(22rem,1fr))]"
                >
                    <div className="h-0" />
                </div>

                {/* 사용자에게 보이는 얇은 스켈레톤 */}
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(22rem,1fr))]">
                    {Array.from({ length: Math.min(sampleMax, Math.max(1, rows) * 3) }).map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            </div>
        );
    }

    // 컬럼이 파악되면, (컬럼 수 * rows)만큼 샘플링된 카드로 교체 렌더
    const displayCount = Math.min(sampleMax, Math.max(1, rows) * finalCols);
    const toShow = sampled.slice(0, displayCount);

    return (
        <div ref={containerRef} className="relative">
            <PostListProvider postIds={toShow.map(p => p.id)}>
                <InfinitePostList
                    key={`${storageKeyPrefix}-${finalCols}-${seed}-${sampleMax}`}
                    initialPosts={toShow}
                    community={community}
                    layout={layout}
                    jsonBase={jsonBase}
                    enablePaging={false}
                    storageKeyPrefix={storageKeyPrefix}
                    onColsChange={(n) => setCols((prev) => (prev === n ? prev : n))}
                    gridColumnsOverride={finalCols}
                />
            </PostListProvider>
        </div>
    );
}
