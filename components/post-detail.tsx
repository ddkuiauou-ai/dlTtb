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

  useEffect(() => {
    const el = contentRef.current;
    const enrichments = Array.isArray(post.imageEnrichments) ? post.imageEnrichments : [];
    if (!el || enrichments.length === 0) return;

    const normalizeUrl = (raw: string) => {
      if (!raw) return '';
      try {
        const url = new URL(raw, typeof window !== 'undefined' ? window.location.href : 'https://example.invalid');
        if (url.protocol === 'http:') url.protocol = 'https:';
        return url.href;
      } catch {
        return raw;
      }
    };

    const enrichmentMap = new Map<string, (typeof enrichments)[number]>();
    for (const item of enrichments) {
      if (!item?.imageUrl) continue;
      const full = normalizeUrl(item.imageUrl);
      const noHash = full.split('#')[0] ?? full;
      const noQuery = noHash.split('?')[0] ?? noHash;
      for (const key of [full, noHash, noQuery]) {
        if (key && !enrichmentMap.has(key)) enrichmentMap.set(key, item);
      }
    }

    const ensureFigure = (img: HTMLImageElement) => {
      const existing = img.closest('figure');
      if (existing) {
        existing.classList.add('reader-ai-figure');
        return existing as HTMLElement;
      }

      const wrapper = document.createElement('figure');
      wrapper.classList.add('reader-ai-figure');
      wrapper.dataset.aiWrapper = '1';

      const anchor = img.closest('a');
      const parent = anchor?.parentElement ?? img.parentElement;
      if (!parent) return null;

      if (anchor && anchor.contains(img) && anchor.querySelectorAll('img').length === 1 && anchor.textContent?.trim() === '') {
        parent.insertBefore(wrapper, anchor);
        wrapper.appendChild(anchor);
      } else {
        parent.insertBefore(wrapper, img);
        wrapper.appendChild(img);
      }

      return wrapper;
    };

    const buildCaption = (item: (typeof enrichments)[number]) => {
      const caption = document.createElement('figcaption');
      caption.classList.add('ai-figcaption');

      const titleRow = document.createElement('div');
      titleRow.classList.add('ai-figcaption-title');
      titleRow.textContent = 'AI 이미지 설명';
      caption.appendChild(titleRow);

      const captionText = document.createElement('p');
      captionText.classList.add('ai-figcaption-text');
      captionText.textContent = item.caption?.trim() || '설명을 가져오지 못했습니다.';
      caption.appendChild(captionText);

      const detailsContent: HTMLElement[] = [];

      if (Array.isArray(item.labels) && item.labels.length > 0) {
        const dd = document.createElement('dd');
        dd.textContent = item.labels.map((label: unknown) => String(label)).join(', ');
        const dt = document.createElement('dt');
        dt.textContent = '키워드';
        detailsContent.push(dt, dd);
      }

      if (Array.isArray(item.ocrLines)) {
        const lines = item.ocrLines.map((line: unknown) => String(line).trim()).filter(Boolean);
        if (lines.length > 0) {
          const dt = document.createElement('dt');
          dt.textContent = 'OCR';
          const dd = document.createElement('dd');
          lines.forEach((line, idx) => {
            const span = document.createElement('span');
            span.textContent = line;
            dd.appendChild(span);
            if (idx < lines.length - 1) dd.appendChild(document.createElement('br'));
          });
          detailsContent.push(dt, dd);
        }
      }

      if (Array.isArray(item.objects) && item.objects.length > 0) {
        const formatted = item.objects.map((obj: any) => {
          const parts = [String(obj?.name ?? '')];
          if (typeof obj?.count === 'number' && obj.count > 0) parts.push(`x${obj.count}`);
          if (typeof obj?.confidence === 'number') parts.push(`${Math.round(obj.confidence * 100)}%`);
          return parts.filter(Boolean).join(' ');
        }).filter(Boolean);
        if (formatted.length > 0) {
          const dt = document.createElement('dt');
          dt.textContent = '감지 객체';
          const dd = document.createElement('dd');
          dd.textContent = formatted.join(', ');
          detailsContent.push(dt, dd);
        }
      }

      if (item.safety && typeof item.safety === 'object') {
        const safetyEntries = Object.entries(item.safety as Record<string, unknown>)
          .filter(([, value]) => typeof value === 'number');
        if (safetyEntries.length > 0) {
          const dt = document.createElement('dt');
          dt.textContent = '안전성';
          const dd = document.createElement('dd');
          dd.textContent = safetyEntries
            .map(([key, value]) => `${key}: ${(value as number).toFixed(2)}`)
            .join(', ');
          detailsContent.push(dt, dd);
        }
      }

      if (item.model) {
        const dt = document.createElement('dt');
        dt.textContent = '모델';
        const dd = document.createElement('dd');
        dd.textContent = String(item.model);
        detailsContent.push(dt, dd);
      }

      if (item.enrichedAt) {
        try {
          const dt = document.createElement('dt');
          dt.textContent = '생성 시간';
          const dd = document.createElement('dd');
          const date = new Date(String(item.enrichedAt));
          dd.textContent = Number.isNaN(date.valueOf())
            ? String(item.enrichedAt)
            : date.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
          detailsContent.push(dt, dd);
        } catch {
          /* ignore date parse errors */
        }
      }

      if (detailsContent.length > 0) {
        const details = document.createElement('details');
        details.classList.add('ai-figcaption-details');
        const summary = document.createElement('summary');
        summary.textContent = '추가 정보 보기';
        details.appendChild(summary);

        const dl = document.createElement('dl');
        dl.classList.add('ai-figcaption-meta');
        detailsContent.forEach((node) => dl.appendChild(node));
        details.appendChild(dl);
        caption.appendChild(details);
      }

      return caption;
    };

    const applyCaptions = () => {
      const images = Array.from(el.querySelectorAll<HTMLImageElement>('img'));
      images.forEach((img) => {
        const srcAttr = img.getAttribute('src') || img.currentSrc || img.src;
        if (!srcAttr) return;
        const normalizedSrc = normalizeUrl(srcAttr);
        const lookupKeys = [
          normalizedSrc,
          normalizedSrc.split('#')[0] ?? normalizedSrc,
          normalizedSrc.split('?')[0] ?? normalizedSrc,
        ];

        let data: (typeof enrichments)[number] | undefined;
        for (const key of lookupKeys) {
          if (!key) continue;
          data = enrichmentMap.get(key);
          if (data) break;
        }

        if (!data) return;

        const figure = ensureFigure(img);
        if (!figure) return;

        const signature = JSON.stringify({
          caption: data.caption ?? '',
          labels: Array.isArray(data.labels) ? data.labels : [],
          ocr: Array.isArray(data.ocrLines) ? data.ocrLines : [],
          model: data.model ?? '',
          safety: data.safety ?? null,
          enrichedAt: data.enrichedAt ?? '',
        });

        if (figure.dataset.aiCaptionKey === signature && figure.querySelector('.ai-figcaption')) {
          return;
        }

        figure.querySelectorAll('.ai-figcaption').forEach((node) => node.remove());
        const caption = buildCaption(data);
        figure.appendChild(caption);
        figure.dataset.aiCaptionKey = signature;
      });
    };

    // Initial pass once content is ready
    applyCaptions();

    // Observe future changes (lazy image loading, ads stripped, etc.)
    const observer = new MutationObserver(() => {
      // Run in next frame to batch rapid mutations
      requestAnimationFrame(applyCaptions);
    });
    observer.observe(el, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, [post.id, post.imageEnrichments, post.imageEnrichmentUpdatedAt]);

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
