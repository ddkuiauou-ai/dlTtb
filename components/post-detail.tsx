"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { BrandIcon } from "@/components/brand-icon";
import { prepareReturnFromDetail } from "@/lib/restore-session";
import {
  ThumbsUp,
  MessageCircle,
  Eye,
  Share2,
  Bookmark,
  ArrowLeft,
  Flag,
} from "lucide-react";
import Link from "next/link";

import type { getPostDetail } from "@/lib/queries";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useKeywordManifest } from "@/hooks/use-keyword-manifest";

interface PostDetailProps {
  post: Awaited<ReturnType<typeof getPostDetail>> extends infer T
  ? NonNullable<T>
  : never;
  inDialog?: boolean;
}

const communityColors: Record<string, string> = {
  FMKorea: "bg-blue-100 text-blue-800",
  Clien: "bg-green-100 text-green-800",
  Inven: "bg-purple-100 text-purple-800",
  MLBPARK: "bg-orange-100 text-orange-800",
  디시인사이드: "bg-red-100 text-red-800",
  루리웹: "bg-yellow-100 text-yellow-800",
  보배드림: "bg-indigo-100 text-indigo-800",
};

export function PostDetail({ post, inDialog }: PostDetailProps) {
  const [upvoted, setUpvoted] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const { getKeywordLink } = useKeywordManifest();

  const copyShareLink = async () => {
    const shareUrl = `${window.location.origin}/posts/${post.id}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const ta = document.createElement("textarea");
        ta.value = shareUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Failed to copy share link", e);
    }
  };


  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleUpvote = () => {
    setUpvoted(!upvoted);
  };

  // Normalize enrichment arrays
  const categories = Array.isArray(post.categories) ? post.categories : [];
  const tags = Array.isArray(post.keywords) ? post.keywords : [];
  const hasYouTube = post.embeds.some((e) => e.type === 'youtube');
  const hasX = post.embeds.some((e) => e.type === 'X');

  // Enhance media UX inside crawled HTML (open large images in new tab)
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // If user clicks an image without a link, open original in new tab
      if (target.tagName === 'IMG') {
        const img = target as HTMLImageElement;
        const parentLink = img.closest('a');
        if (!parentLink && img.src) {
          window.open(img.src, '_blank', 'noopener,noreferrer');
        }
      }
    };
    el.addEventListener('click', handler);
    return () => el.removeEventListener('click', handler);
  }, [post.id]);

  // When landing on the full page with ?goto=comments or #comments, jump to the comments section
  useEffect(() => {
    if (inDialog) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const wantsComments = params.get("goto") === "comments" || window.location.hash === "#comments";
      if (!wantsComments) return;
      const el = document.getElementById("comments");
      if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
    } catch { /* no-op */ }
  }, [inDialog]);

  // Effect to handle cross-origin videos via client-side fetch and blob URL
  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return;

    const videos = contentEl.querySelectorAll('video');
    
    videos.forEach(async (video) => {
      let originalSrc = video.src;
      if (!originalSrc) {
        const source = video.querySelector('source');
        if (source) {
          originalSrc = source.src;
        }
      }

      if (originalSrc && (originalSrc.startsWith('http:') || originalSrc.startsWith('https:'))) {
        // Avoid re-fetching blob URLs
        if (originalSrc.startsWith('blob:')) {
          return;
        }
        
        // Set a loading state
        video.style.opacity = '0.5';
        const poster = video.poster;
        video.poster = ''; // Clear poster to show loading state if any

        try {
          const response = await fetch(originalSrc, { referrerPolicy: 'no-referrer' });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
          }

          const videoBlob = await response.blob();
          const blobUrl = URL.createObjectURL(videoBlob);
          
          video.src = blobUrl;
          video.style.opacity = '1';
          video.poster = poster; // Restore original poster
        } catch (error) {
          console.error(`[Video Fetch Error] Could not load video from ${originalSrc}. This is likely a CORS issue.`, error);
          // Indicate the error on the video element itself
          video.style.opacity = '0.2';
          video.poster = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZmZmZiI+PHBhdGggZD0iTTEyIDJDNi40OCA MiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0wIDE4Yy00LjQxIDAtOC0zLjU5LTgtOHMzLjU5LTggOC04IDggMy41OSA4IDh6TTExIDE1aDJ2MmgxMXYtMnpNMT EgN2gydjZoLTF6Ii8+PC9zdmc+'; // Simple error icon
        }
      }
    });
  }, [post.id]);

  // Note: previous dev-only overflow logger and runtime image normalization were removed
  // to reduce complexity. Server-side HTML normalization + CSS handle layout now.

  return (
    <div className="space-y-6">
      {/* Back Button */}
      {inDialog ? (
        <Button
          variant="ghost"
          size="sm"
          className="mb-4"
          onClick={() => {
            // In a modal (intercepted route), simply close by navigating back
            router.back();
          }}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          목록으로 돌아가기
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="mb-4"
          onClick={() => {
            try {
              const key = sessionStorage.getItem("lastSectionKey/latest") || "";
              if (key) {
                prepareReturnFromDetail(key, post.id);
                const src = sessionStorage.getItem(`sourceUrl-${key}/latest`);
                if (src) {
                  (router as any).replace(src);
                  return;
                }
              }
              (router as any).replace("/");
            } catch {
              (router as any).replace("/");
            }
          }}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          목록으로 돌아가기
        </Button>
      )}

      {/* Post Header */}
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge
              variant="secondary"
              className={
                communityColors[post.siteName || post.site] || "bg-gray-100 text-gray-800"}
            >
              {post.siteName || post.site}            </Badge>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              {hasYouTube && <BrandIcon name="youtube" useBrandColor className="h-3.5 w-3.5" />}
              {hasX && <BrandIcon name="X" useBrandColor className="h-3.5 w-3.5" />}
              <Eye className="h-4 w-4" />
              <span>{post.viewCount?.toLocaleString?.() ?? 0}</span>
            </div>
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
            {post.title}
          </h1>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                {post.avatar ? (
                  <AvatarImage src={post.avatar} alt={post.author ?? "Avatar"} />
                ) : (
                  <AvatarFallback>{post.author?.[0] ?? "?"}</AvatarFallback>
                )}
              </Avatar>
              <div>
                <div className="font-medium text-sm">
                  {post.author ?? "익명"}
                </div>
                <div className="text-xs text-gray-500">
                  {formatDate(post.timestamp)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBookmarked(!bookmarked)}
              >
                <Bookmark
                  className={`h-4 w-4 ${bookmarked ? "fill-current" : ""}`}
                />
              </Button>
              <Button variant="ghost" size="sm" onClick={copyShareLink} title="링크 복사">                <Share2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <Flag className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 원본 링크 */}
          {post.url && (
            <div className="mt-2">
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 underline hover:text-blue-800"
              >
                원본 게시글 보기 ↗
              </a>
            </div>
          )}

          {/* Categories & Tags (LLM Enrichment) */}
          {(categories.length > 0 || tags.length > 0) && (
            <div className="mt-2 space-y-2">
              {categories.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500">카테고리</span>
                  {categories.map((c: any, idx: number) => (
                    <Badge key={`cat-${idx}`} variant="secondary">
                      {String(c)}
                    </Badge>
                  ))}
                </div>
              )}
              {tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500">태그</span>
                  {tags.map((t: any, idx: number) => (
                    <Link key={`tag-${idx}`} href={getKeywordLink(String(t))} passHref>
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-gray-700 bg-gray-50 hover:bg-gray-100 hover:text-gray-900 cursor-pointer"
                      >
                        #{String(t)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Post Content */}
      <Card>
        <CardContent className="p-6">
          <div
            ref={contentRef}
            className={cn(
              "reader",
              inDialog && "reader--dialog"
            )}
            dangerouslySetInnerHTML={{ __html: post.contentHtml || "" }}
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant={upvoted ? "default" : "outline"}
                size="sm"
                onClick={handleUpvote}
                className="flex items-center gap-2"
              >
                <ThumbsUp className="h-4 w-4" />
                <span>{(post.likeCount ?? 0) + (upvoted ? 1 : 0)}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={() => {
                  console.log("Comment button clicked");
                  console.log("inDialog:", inDialog);
                  if (inDialog) {
                    const url = `/posts/${post.id}?goto=comments`;
                    console.log("Navigating to:", url);
                    try {
                      // 모달(가로채기) 히스토리 항목을 전체 페이지로 교체하여 히스토리 오염 방지
                      window.location.replace(url);
                    } catch (e) {
                      console.error("Error during location.replace:", e);
                      window.location.href = url;
                    }
                  } else {
                    // On the real page, to comments if present
                    console.log("Scrolling to #comments");
                    const el = document.getElementById("comments");
                    if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
                  }
                }}
              >
                <MessageCircle className="h-4 w-4" />
                <span>댓글 {post.commentCount ?? 0}</span>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={copyShareLink} title="링크 복사">
                {copied ? "복사됨!" : "공유하기"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
