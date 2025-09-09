import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const communityColors: Record<string, string> = {
  FMKorea: "bg-blue-100 text-blue-800",
  Clien: "bg-green-100 text-green-800",
  Inven: "bg-purple-100 text-purple-800",
  MLBPARK: "bg-orange-100 text-orange-800",
  디시인사이드: "bg-red-100 text-red-800",
  루리웹: "bg-yellow-100 text-yellow-800",
  보배드림: "bg-indigo-100 text-indigo-800",
}

type RelatedItem = {
  id: string;
  title: string | null;
  site: string;
  siteName?: string | null;
  timestamp: string;
  overlap?: number;
  sameSite?: boolean;
  sameBoard?: boolean;
}

interface RelatedPostsProps {
  items: RelatedItem[]
}

function timeAgo(ts: string) {
  const d = new Date(ts); const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff/60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
  return d.toLocaleDateString("ko-KR");
}

function reason(item: RelatedItem) {
  if ((item.overlap ?? 0) >= 2) return `태그 ${item.overlap}개 일치`;
  if (item.sameBoard) return "같은 게시판";
  if (item.sameSite) return "같은 사이트";
  return "최근 글";
}

export function RelatedPosts({ items }: RelatedPostsProps) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>관련 게시글</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((post) => (
            <a
              key={post.id}
              href={`/posts/${post.id}`}
              className="block"
            >
              <div className="flex items-start justify-between gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="min-w-0">
                  <h3 className="post-title font-semibold text-gray-900 line-clamp-2 mb-1">{post.title || post.id}</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Badge
                      variant="secondary"
                      className={communityColors[post.siteName || post.site] || "bg-gray-100 text-gray-800"}
                    >
                      {post.siteName || post.site}
                    </Badge>
                    <span>· {timeAgo(post.timestamp)}</span>
                    <span className="text-gray-400">· {reason(post)}</span>
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
