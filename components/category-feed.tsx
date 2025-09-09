import InfinitePostList from "@/components/infinite-post-list";
import type { Post } from "@/components/post-card";

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

  const mapped = initialPosts.map((post: any) => ({
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
  }));

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <InfinitePostList
        initialPosts={mapped}
        layout="list"
        jsonBase={`/data/category/${category}/v1`}
        storageKeyPrefix={`category-${category}`}
        enablePaging={true}
      />
    </div>
  );
}
