'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { HydratedPost } from '@/lib/types';
import PostGrid from '@/components/post-grid';
import { FeedControls } from '@/components/feed-controls';
import { ViewMode, Range } from '@/lib/feed-prefs';

export default function KeywordFeed({
  initialPosts,
  keyword,
  initialRange,
}: {
  initialPosts: HydratedPost[];
  keyword: string;
  initialRange: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [posts, setPosts] = useState<HydratedPost[]>(initialPosts);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
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
        const res = await fetch(`/data/keywords/${encodeURIComponent(keyword)}/v1/${range}/page-1.json`);
        const data = await res.json();
        setPosts(data.posts || []);
      } catch (error) {
        console.error("Failed to fetch posts for keyword and range:", error);
        setPosts([]);
      }
    };

    fetchData();
  }, [range, keyword, initialPosts, initialRange]);


  const handleRangeChange = (newRange: Range) => {
    setRange(newRange);
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', newRange);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const gridKey = `key:${keyword}|rg:${range}|rf:${readFilter}|vm:${viewMode}`;
  const jsonBase = `/data/keywords/${encodeURIComponent(keyword)}/v1/${range}`;
  const metricsKey = jsonBase;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Keyword: {keyword}</h1>
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
        title={keyword}
        initialPosts={posts} 
        jsonBase={jsonBase}
        range={range}
        readFilter={readFilter}
      />
    </div>
  );
}