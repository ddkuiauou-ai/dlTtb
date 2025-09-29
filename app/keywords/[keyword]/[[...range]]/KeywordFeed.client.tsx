"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import PostGrid from "@/components/post-grid";
import type { Post, Range } from "@/lib/types";
import { FeedControls } from "@/components/feed-controls";
import { useScopedFeedPrefs } from "@/lib/feed-prefs";

interface KeywordFeedProps {
  initialPosts: Post[];
  keyword: string;
  initialRange: string;
}

export default function KeywordFeed({ initialPosts, keyword, initialRange }: KeywordFeedProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialRangeValidated = (initialRange as Range) || "1w"; // fallback to 1w if invalid
  const urlRange = searchParams.get('range') as Range | null;
  const defaultRange = urlRange || initialRangeValidated;

  const { viewMode, readFilter, range, setRange, setViewMode, setReadFilter } = useScopedFeedPrefs({
    type: "keyword",
    id: keyword,
    defaults: { rg: defaultRange, vm: 'list' },
  });

  const handleRangeChange = (newRange: Range) => {
    setRange(newRange);
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', newRange);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const gridKey = `kw:${keyword}|rg:${range}|rf:${readFilter}|vm:${viewMode}`;
  const keywordSlug = encodeURIComponent(keyword);
  const jsonBase = `/data/keywords/${keywordSlug}/v1/${range}`;
  const metricsKey = jsonBase;

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">키워드: {keyword}</h1>
        <FeedControls
          type="keyword"
          id={keyword}
          range={range}
          viewMode={viewMode}
          readFilter={readFilter}
          setRange={handleRangeChange}
          setViewMode={setViewMode}
          setReadFilter={setReadFilter}
          metricsKey={metricsKey}
        />
      </div>

      <PostGrid
        key={gridKey}
        title=""
        category={keyword}
        initialPosts={initialPosts}
        layout="list"
        listColumns={viewMode === "grid" ? "3-2-1" : "auto-2"}
        cardLayoutOverride={viewMode === "grid" ? "grid" : "list"}
        threeColAt="xl"
        jsonBase={jsonBase}
        range={range}
        readFilter={readFilter}
      />
    </>
  );
}