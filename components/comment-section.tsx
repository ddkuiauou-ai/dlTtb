"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { ThumbsUp, MessageCircle, MoreHorizontal } from "lucide-react"
import { Separator } from "@/components/ui/separator"

interface Comment {
  id: number
  author: string
  content: string
  createdAt: string
  upvotes: number
  downvotes: number
  replies?: Comment[]
}

type CommentItemType = {
  id: string;
  author?: string | null;
  avatar?: string | null;
  contentHtml?: string | null;
  content?: string | null;
  timestamp?: string | Date;
  likeCount?: number | null;
  parentId?: string | null;
  depth?: number;
  replies?: CommentItemType[];
};

interface CommentSectionProps {
  postId: string;
  comments?: CommentItemType[];
}

export function CommentSection({ postId, comments = [] }: CommentSectionProps) {
  const [newComment, setNewComment] = useState("")
  const [commentList, setCommentList] = useState(comments)

  // 댓글(루트) 및 대댓글 전체 개수 계산
  const countReplies = (items: CommentItemType[]): number => {
    let total = 0;
    items.forEach(item => {
      if (item.replies && item.replies.length > 0) {
        total += item.replies.length;
        total += countReplies(item.replies);
      }
    });
    return total;
  };
  const rootCount = commentList.length;
  const replyCount = countReplies(commentList);

  const formatDate = (dateString: string | Date | undefined) => {
    if (!dateString) return ""
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    if (diffInHours < 1) return "방금 전"
    if (diffInHours < 24) return `${diffInHours}시간 전`
    return date.toLocaleDateString("ko-KR")
  }

  const handleSubmitComment = () => {
    if (newComment.trim()) {
      const comment = {
        id: Date.now().toString(),
        author: "현재사용자",
        content: newComment,
        timestamp: new Date().toISOString(),
        likeCount: 0,
      }
      setCommentList([comment, ...commentList])
      setNewComment("")
    }
  }

  const CommentItem = ({
    comment,
    isReply = false,
  }: {
    comment: CommentItemType;
    isReply?: boolean;
  }) => (
    <div className={`space-y-3 ${isReply ? "ml-12 border-l-2 border-gray-100 pl-4" : ""}`}>
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8">
          {comment.avatar ? (
            <AvatarImage src={comment.avatar} alt={comment.author ?? "Avatar"} />
          ) : (
            <AvatarFallback>{comment.author?.[0] ?? "?"}</AvatarFallback>
          )}
        </Avatar>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{comment.author ?? "익명"}</span>
            <span className="text-xs text-gray-500">{formatDate(comment.timestamp)}</span>
          </div>
          <div
            className="text-gray-800 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: comment.contentHtml ?? "" }}
          />
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <ThumbsUp className="h-3 w-3 mr-1" />
              {comment.likeCount ?? 0}
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <MessageCircle className="h-3 w-3 mr-1" />
              답글
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-4 space-y-3">
          {comment.replies.map(reply => (
            <CommentItem key={reply.id} comment={reply} isReply />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <Card id="comments" className="mt-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-4">
          <MessageCircle className="h-5 w-5" />
          <span>댓글 {rootCount}개</span>
          <span>답글 {replyCount}개</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Comment Input */}
        <div className="space-y-3">
          <Textarea
            placeholder="댓글을 입력하세요..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="min-h-[100px]"
          />
          <div className="flex justify-end">
            <Button onClick={handleSubmitComment} disabled={!newComment.trim()}>
              댓글 작성
            </Button>
          </div>
        </div>

        <Separator />

        {/* Comments List */}
        <div className="space-y-6">
          {commentList.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
