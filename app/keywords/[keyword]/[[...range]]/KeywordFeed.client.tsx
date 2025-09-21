"use client";

import PostGrid from "@/components/post-grid";
import type { Post } from "@/components/post-card";
import { FeedControls } from "@/components/feed-controls";
import { useScopedFeedPrefs } from "@/lib/feed-prefs";

interface KeywordFeedProps {
  initialPosts: Post[];
  keyword: string;
  initialRange: string;
}

export default function KeywordFeed({ initialPosts, keyword, initialRange }: KeywordFeedProps) {
  const { viewMode, readFilter, range, setRange, setViewMode, setReadFilter } = useScopedFeedPrefs({
    type: "keyword",
    id: keyword,
    defaults: { rg: initialRange as any, vm: 'list' },
  });

  // Sync storage to the range from the URL
  useEffect(() => {
    setRange(initialRange as any);
  }, [initialRange, setRange]);

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
          setRange={setRange}
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
        range={range as any}
        readFilter={readFilter}
      />
    </>
  );
}