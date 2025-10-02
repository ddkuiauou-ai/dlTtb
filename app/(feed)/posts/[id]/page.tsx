import { getPostDetail, getRelatedPosts, getAllPostIds } from "@/lib/queries"
import { CommentSection } from "@/components/comment-section"
import { RelatedPosts } from "@/components/related-posts"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { notFound } from "next/navigation"
import { PostDetail } from "@/components/post-detail"
import Link from "next/link"
import { ReadMarker } from "./ReadMarker.client";

// Cloudflare Pages: 빌드 시 정적 생성 (로컬 DB 사용)
// Neon 사용 시: runtime = 'edge', dynamic = 'force-dynamic' 으로 변경
export const dynamic = 'force-static';
export const dynamicParams = false;
export const revalidate = false;

// 빌드 시 생성할 포스트 ID 목록
export async function generateStaticParams() {
  const ids = await getAllPostIds();
  // 최근 100개 포스트만 빌드 (빌드 시간 단축)
  const recentIds = ids.slice(0, 100);
  return recentIds.map((id) => ({ id }));
}

interface PageProps {
  params: Promise<{ id: string }>
}

type ClusterMember = { 
  id: string; 
  title: string; 
  site: string; 
  siteName?: string | null; 
  timestamp: string;
};

export default async function PostPage(props: PageProps) {
  const { id } = await props.params;
  const post = await getPostDetail(id);
  if (!post) return notFound();
  const related = await getRelatedPosts(id, 8);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="w-full max-w-screen-xl mx-auto px-0 md:px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <PostDetail post={post} />
          <ReadMarker canonicalId={post.id} routeId={id} title={post.title} url={post.url} />
          {post.clusterId && (
            <section className="mt-6 mb-4 rounded-lg border bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm text-gray-600">
                <span className="inline-flex items-center rounded bg-indigo-50 px-2 py-1 text-indigo-700">이슈 묶음</span>
                <span>클러스터 ID: {post.clusterId}</span>
                {typeof post.clusterMembers?.length === 'number' && (
                  <span className="text-gray-400">· 관련 글 {post.clusterMembers.length}개</span>
                )}
              </div>
              {Array.isArray(post.clusterMembers) && post.clusterMembers.length > 0 && (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {post.clusterMembers
                    .filter((m: ClusterMember) => m.id !== post.id)
                    .slice(0, 10)
                    .map((m: ClusterMember) => (
                      <li key={m.id} className="truncate">
                        <Link href={`/posts/${m.id}`} className="text-sm text-blue-700 hover:underline">
                          <span className="post-title font-semibold">{m.title || m.id}</span>
                        </Link>
                        <span className="ml-2 text-xs text-gray-400">{m.siteName || m.site}</span>                                  {m.timestamp && (
                          <span className="ml-2 text-xs text-gray-400">{m.timestamp.slice(0, 16).replace('T', ' ')}</span>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </section>
          )}
          <div id="comments" />
          <CommentSection comments={post.comments} />
          <RelatedPosts items={related} />
        </div>
      </main>
      <Footer />
    </div>
  )
}
