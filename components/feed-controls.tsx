"use client";

import * as React from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { LayoutGrid, List, Clock as ClockIcon, CircleDot, Circle } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { Range, ViewMode, ReadFilter } from "@/lib/feed-prefs";
import { useIsMobile } from "@/components/ui/use-mobile";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CountingNumber } from "@/components/animate-ui/text/counting-number";

/** 기본 라벨(원하는 값으로 오버라이드 가능) */
const DEFAULT_RANGE_LABELS: Record<Range, string> = {
    "3h": "3시간",
    "6h": "6시간",
    "24h": "24시간",
    "1w": "1주일",
};

export interface FeedControlsProps {
    type: "category" | "keyword";
    id: string;
    range: Range;
    viewMode: ViewMode;
    readFilter: ReadFilter;
    setRange: (r: Range) => void;
    setViewMode: (v: ViewMode) => void;
    setReadFilter: (f: ReadFilter) => void;
    rangeOrder?: Range[];
    rangeLabels?: Partial<Record<Range, string>>;
    metricsKey?: string;
}

export function FeedControls({
    type,
    id,
    range,
    viewMode,
    readFilter,
    setRange,
    setViewMode,
    setReadFilter,
    rangeOrder,
    rangeLabels,
    metricsKey,
}: FeedControlsProps) {
    const order = (rangeOrder && rangeOrder.length ? rangeOrder : ["3h", "6h", "24h", "1w"]) as Range[];
    const labels = { ...DEFAULT_RANGE_LABELS, ...(rangeLabels || {}) } as Record<Range, string>;

    const [isPending, startTransition] = React.useTransition();

    const [metrics, setMetrics] = React.useState<{ total: number; read: number; unread: number } | null>(null);
    const lastRxRef = React.useRef<{ total: number; read: number; unread: number } | null>(null);
    const rxRafRef = React.useRef<number | null>(null);
    React.useEffect(() => {
        const onMetrics = (e: Event) => {
            try {
                const ce = e as CustomEvent<any>;
                const d = ce.detail as { key: string; total: number; read: number; unread: number } | undefined;
                if (!d) return;
                if (metricsKey && d.key !== metricsKey) {
                    if (process.env.NODE_ENV !== 'production') {
                        // eslint-disable-next-line no-console
                        console.log('[FeedControls] metrics event', {
                            incomingKey: d.key, expectKey: metricsKey,
                            total: d.total, read: d.read, unread: d.unread
                        });
                    }
                    return;
                }

                if (lastRxRef.current && lastRxRef.current.total === d.total && lastRxRef.current.read === d.read && lastRxRef.current.unread === d.unread) {
                    if (process.env.NODE_ENV !== 'production') {
                        // eslint-disable-next-line no-console
                        console.log('[FeedControls] metrics unchanged, skip');
                    }
                    return;
                }
                lastRxRef.current = { total: d.total, read: d.read, unread: d.unread };
                if (rxRafRef.current != null) cancelAnimationFrame(rxRafRef.current);
                rxRafRef.current = requestAnimationFrame(() => {
                    rxRafRef.current = null;
                    setMetrics(lastRxRef.current);
                });
            } catch { /* ignore */ }
        };
        window.addEventListener('feed:metrics', onMetrics);
        return () => {
            window.removeEventListener('feed:metrics', onMetrics);
            if (rxRafRef.current != null) cancelAnimationFrame(rxRafRef.current);
        };
    }, [metricsKey]);

    const isMobile = useIsMobile();

    return (
        <div className={`flex items-center gap-3 transition-opacity ${isPending ? 'opacity-75' : ''}`}>
            <fieldset disabled={isPending} className="contents">
                {isMobile ? (
                    <>
                        <Popover>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    aria-label={`시간 범위: ${labels[range]}`}
                                    aria-haspopup="menu"
                                    className="rounded-md border px-2 py-1 text-sm inline-flex items-center gap-2"
                                    title="시간 범위 선택"
                                >
                                    <ClockIcon className="h-4 w-4" />
                                    <span aria-hidden>{labels[range]}</span>
                                </button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-44 p-1" sideOffset={6}>
                                <div className="px-2 py-1 text-[13px] text-gray-500" aria-hidden>
                                    최근 글 범위
                                </div>
                                <div role="menu" aria-label="시간 범위" className="pb-1">
                                    {order.map((r) => (
                                        <button
                                            key={r}
                                            role="menuitemradio"
                                            aria-checked={range === r}
                                            className={`w-full text-left px-2 py-1.5 rounded-md text-sm ${range === r ? 'bg-gray-100 dark:bg-neutral-800 font-medium' : 'hover:bg-gray-50 dark:hover:bg-neutral-900'}`}
                                            onClick={() => setRange(r)}
                                        >
                                            {labels[r]}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-1 pt-1 border-t">
                                    <button
                                        type="button"
                                        className="w-full text-left px-2 py-1.5 rounded-md text-sm inline-flex items-center justify-between hover:bg-gray-50 dark:hover:bg-neutral-900"
                                        onClick={() => setReadFilter('read')}
                                        aria-label="읽은 글만 보기"
                                        title="읽은 글만 보기"
                                    >
                                        <span>읽은 글만 보기</span>
                                        {metrics && (
                                            <Badge variant="secondary" className="px-1.5 py-0 h-5 text-xs bg-gray-100 text-gray-800 border-0" aria-label={`읽은 글 ${metrics.read}개`}>
                                                <CountingNumber number={metrics.read} />
                                            </Badge>
                                        )}
                                    </button>
                                </div>
                            </PopoverContent>
                        </Popover>

                        <button
                            type="button"
                            aria-label={readFilter === 'unread' ? '안 읽은 글만: 켜짐' : '안 읽은 글만: 꺼짐'}
                            aria-pressed={readFilter === 'unread'}
                            className="rounded-md border px-2 py-1 text-sm inline-flex items-center gap-2"
                            onClick={() => setReadFilter(readFilter === 'unread' ? 'all' : 'unread')}
                            title="안 읽은 글만 보기 토글"
                        >
                            {readFilter === 'unread' ? <CircleDot className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                            <span className="sr-only">안 읽은 글만</span>
                            {metrics && (
                                <Badge
                                    variant="secondary"
                                    className="px-1.5 py-0 h-5 text-xs bg-blue-100 text-blue-800 border-0"
                                    aria-label={
                                        readFilter === 'read'
                                            ? `전체 ${metrics.total}개`
                                            : `${readFilter === 'unread' ? '안 읽은 글' : '전체'} ${readFilter === 'unread' ? metrics.unread : metrics.total}개`
                                    }
                                >
                                    <CountingNumber number={readFilter === 'read'
                                        ? metrics.total
                                        : (readFilter === 'unread' ? metrics.unread : metrics.total)} />
                                </Badge>
                            )}
                            <span className="sr-only">{readFilter === 'read' ? '현재 보기: 읽은 글만' : '현재 보기: 전체/안 읽은 글 필터'}</span>
                        </button>

                        <button
                            type="button"
                            aria-label="보기 모드"
                            className="rounded-md border px-2 py-1"
                            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                            title="그리드/리스트 전환"
                        >
                            {viewMode === 'grid' ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                        </button>
                    </>
                ) : (
                    <>
                        <Popover>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    aria-label={`시간 범위: ${labels[range]}`}
                                    aria-haspopup="menu"
                                    className="rounded-md border px-2 py-1 text-sm inline-flex items-center gap-2"
                                    title="시간 범위 선택"
                                >
                                    <ClockIcon className="h-4 w-4" />
                                    <span aria-hidden>{labels[range]}</span>
                                </button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-44 p-1" sideOffset={6}>
                                <div className="px-2 py-1 text-[13px] text-gray-500" aria-hidden>
                                    최근 글 범위
                                </div>
                                <div role="menu" aria-label="시간 범위" className="pb-1">
                                    {order.map((r) => (
                                        <button
                                            key={r}
                                            role="menuitemradio"
                                            aria-checked={range === r}
                                            className={`w-full text-left px-2 py-1.5 rounded-md text-sm ${range === r ? 'bg-gray-100 dark:bg-neutral-800 font-medium' : 'hover:bg-gray-50 dark:hover:bg-neutral-900'}`}
                                            onClick={() => setRange(r)}
                                        >
                                            {labels[r]}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-1 pt-1 border-t">
                                    <button
                                        type="button"
                                        className="w-full text-left px-2 py-1.5 rounded-md text-sm inline-flex items-center justify-between hover:bg-gray-50 dark:hover:bg-neutral-900"
                                        onClick={() => setReadFilter('read')}
                                        aria-label="읽은 글만 보기"
                                        title="읽은 글만 보기"
                                    >
                                        <span>읽은 글만 보기</span>
                                        {metrics && (
                                            <Badge variant="secondary" className="px-1.5 py-0 h-5 text-xs bg-gray-100 text-gray-800 border-0" aria-label={`읽은 글 ${metrics.read}개`}>
                                                <CountingNumber number={metrics.read} />
                                            </Badge>
                                        )}
                                    </button>
                                </div>
                            </PopoverContent>
                        </Popover>

                        <button
                            type="button"
                            aria-label={readFilter === 'unread' ? '안 읽은 글만: 켜짐' : '안 읽은 글만: 꺼짐'}
                            aria-pressed={readFilter === 'unread'}
                            className="rounded-md border px-2 py-1 inline-flex items-center gap-2"
                            onClick={() => setReadFilter(readFilter === 'unread' ? 'all' : 'unread')}
                            title="안 읽은 글만 보기 토글"
                        >
                            {readFilter === 'unread' ? <CircleDot className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                            {metrics && (
                                <Badge
                                    variant="secondary"
                                    className="px-1.5 py-0 h-5 text-xs bg-blue-100 text-blue-800 border-0"
                                    aria-label={
                                        readFilter === 'read'
                                            ? `전체 ${metrics.total}개`
                                            : `${readFilter === 'unread' ? '안 읽은 글' : '전체'} ${readFilter === 'unread' ? metrics.unread : metrics.total}개`
                                    }
                                >
                                    <CountingNumber number={readFilter === 'read'
                                        ? metrics.total
                                        : (readFilter === 'unread' ? metrics.unread : metrics.total)} />
                                </Badge>
                            )}
                            <span className="sr-only">{readFilter === 'read' ? '현재 보기: 읽은 글만' : '현재 보기: 전체/안 읽은 글 필터'}</span>
                        </button>

                        <ToggleGroup
                            type="single"
                            value={viewMode}
                            onValueChange={(value) => { if (value) setViewMode(value as any); }}
                            aria-label="보기 모드"
                        >
                            <ToggleGroupItem value="grid" aria-label="그리드 보기">
                                <LayoutGrid className="h-4 w-4" />
                            </ToggleGroupItem>
                            <ToggleGroupItem value="list" aria-label="리스트 보기">
                                <List className="h-4 w-4" />
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </>
                )}
            </fieldset>
            <span className="sr-only" aria-live="polite">
                {metrics ? `전체 ${metrics.total}개, 안 읽은 글 ${metrics.unread}개, 읽은 글 ${metrics.read}개` : ''}
            </span>
        </div>
    );
}
