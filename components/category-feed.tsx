import InfinitePostList from "@/components/infinite-post-list";
import type { Post } from "@/lib/types";
import { PostListProvider } from "@/context/post-list-context";
import { usePostCache } from "@/context/post-cache-context";
import { useEffect } from "react";
import type { Post as CardPost } from "@/components/infinite-post-list";

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
  const { addPosts } = usePostCache();

  const mapped: CardPost[] = initialPosts.map((post: Post) => ({
    id: post.id,
    title: post.title,
    community: post.site,
    communityId: post.site,
    communityLabel: post.siteName || post.site,
    comments: post.commentCount ?? 0,
    upvotes: post.likeCount ?? 0,
    viewCount: post.viewCount ?? 0,
    timeAgo:
      typeof post.timestamp === "string"
        ? new Date(post.timestamp).toLocaleString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : post.timestamp?.toLocaleString?.("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }) ?? "",
    thumbnail: post.image || "/placeholder.svg",
    content: post.content,
    hoverPlayerKind: post.hoverPlayerKind ?? null,
    hoverPlayerUrl: post.hoverPlayerUrl ?? null,
    clusterId: post.clusterId,
    clusterSize: post.clusterSize,
    hasYouTube: post.hasYouTube,
    hasX: post.hasX,
    url: post.url,
  }));

  useEffect(() => {
    addPosts(mapped);
  }, [mapped, addPosts]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <PostListProvider postIds={mapped.map(p => p.id)}>
        <InfinitePostList
          initialPosts={mapped}
          layout="list"
          jsonBase={`/data/category/${category}/v1`}
          storageKeyPrefix={`category-${category}`}
          enablePaging={true}
        />
      </PostListProvider>
    </div>
  );
}
