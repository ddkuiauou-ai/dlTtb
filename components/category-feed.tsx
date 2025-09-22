import InfinitePostList from "@/components/infinite-post-list";
import type { Post } from "@/lib/types";
import { PostListProvider } from "@/context/post-list-context";
import { usePostCache } from "@/context/post-cache-context";
import { useEffect, useMemo } from "react";

interface CategoryFeedProps {
  title: string;
  category: string;
  initialPosts: Post[];
}

export default function CategoryFeed({
  title,
  category,
  initialPosts,
}: CategoryFeedProps) {
  const { addPostsToSection } = usePostCache();
  const jsonBase = useMemo(() => `/data/category/${category}/v1`, [category]);
  const storageKeyPrefix = useMemo(() => `category-${category}`, [category]);
  const sectionKey = useMemo(
    () => `${jsonBase}|${storageKeyPrefix}`,
    [jsonBase, storageKeyPrefix],
  );

  useEffect(() => {
    addPostsToSection(sectionKey, initialPosts);
  }, [addPostsToSection, initialPosts, sectionKey]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <PostListProvider postIds={initialPosts.map(p => p.id)}>
        <InfinitePostList
          initialPosts={initialPosts}
          layout="list"
          jsonBase={jsonBase}
          storageKeyPrefix={storageKeyPrefix}
          enablePaging={true}
        />
      </PostListProvider>
    </div>
  );
}
