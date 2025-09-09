'use client';

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import PostGrid from "@/components/post-grid";
import type { Post } from "@/components/post-card";
import { FeedControls } from "@/components/feed-controls";
import { ViewMode, Range } from "@/lib/feed-prefs";

interface CategoryFeedProps {
  initialPosts: Post[];
  category: string;
  categoryLabel: string;
  initialRange: string;
}

const CATEGORY_DEFAULT_VIEW_MODES: Record<string, ViewMode> = {
  video: 'grid',
  zzal: 'grid',
  humor: 'grid',
  news: 'list',
  info: 'list',
  qna: 'list',
  review: 'list',
  debate: 'list',
  politics: 'list',
  shopping: 'list',
  etc: 'list',
  all: 'list',
  back: 'grid',
};

export default function CategoryFeed({
  initialPosts,
  category,
  categoryLabel,
  initialRange,
}: CategoryFeedProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [posts, setPosts] = useState(initialPosts);
  const [viewMode, setViewMode] = useState<ViewMode>(CATEGORY_DEFAULT_VIEW_MODES[category] ?? 'list');
  const [readFilter, setReadFilter] = useState<"all" | "read" | "unread">('all');

  const urlRange = searchParams.get('range') as Range | null;
  const [range, setRange] = useState<Range>(urlRange || initialRange as Range);

  useEffect(() => {
    if (urlRange && urlRange !== range) {
      setRange(urlRange);
    }
  }, [urlRange, range]);

  useEffect(() => {
    if (range === initialRange) {
      setPosts(initialPosts);
      return;
    }

    const fetchData = async () => {
      try {
        const res = await fetch(`/data/category/${category}/v1/${range}/page-1.json`);
        const data = await res.json();
        setPosts(data.posts || []);
      } catch (error) {
        console.error("Failed to fetch posts for range:", error);
        setPosts([]);
      }
    };

    fetchData();
  }, [range, category, initialPosts, initialRange]);

  const handleRangeChange = (newRange: Range) => {
    setRange(newRange);
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', newRange);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const gridKey = `cat:${category}|rg:${range}|rf:${readFilter}|vm:${viewMode}`;
  const jsonBase = `/data/category/${category}/v1/${range}`;
  const metricsKey = jsonBase;

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">{categoryLabel}</h1>
        <FeedControls
          type="category"
          id={category}
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
        title={categoryLabel}
        category={category}
        initialPosts={posts}
        layout="list"
        listColumns={viewMode === "grid" ? "3-2-1" : "auto-2"}
        cardLayoutOverride={viewMode === "grid" ? "grid" : "list"}
        threeColAt="xl"
        loadAheadRows={viewMode === "list" ? 1 : 0}
        virtualOverscan={viewMode === "list" ? 18 : 10}
        jsonBase={jsonBase}
        range={range as any}
        readFilter={readFilter}
      />
    </>
  );
}
