// components/post-detail-loader.tsx

import { getPostDetail } from "@/lib/queries";
import { PostDetail } from "@/components/post-detail";

/**
 * A server component that fetches post details by ID and passes them to the client component.
 */
export async function PostDetailLoader({ id, inDialog = false }: { id: string, inDialog?: boolean }) {
  const post = await getPostDetail(id);

  if (!post) {
    return <div>Post not found.</div>;
  }

  return <PostDetail post={post} inDialog={inDialog} />;
}
