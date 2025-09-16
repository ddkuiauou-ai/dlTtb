"use client";
import * as React from "react"; import { Card, CardContent } from "@/components/ui/card"; import { Badge } from "@/components/ui/badge";
import { MessageCircle, ThumbsUp, Clock, Eye } from "lucide-react";
import { ClerkProvider, SignedIn, SignedOut } from '@clerk/nextjs'
import Image from "next/image";
import Link from "next/link";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/animate-ui/radix/hover-card";
import { PostHoverCard } from "./post-hover-card";
import { useIsMobile } from "./ui/use-mobile";
import { BrandIcon } from "./brand-icon";
import { RotatingText } from "@/components/animate-ui/text/rotating";
import { cn } from "@/lib/utils";
import { markNavigateToPost } from "@/lib/restore-session";
import { markPostAsRead } from "@/lib/read-marker";

import { useModal } from "@/context/modal-context";
import { usePostList } from "@/context/post-list-context";
import { usePostCache } from "@/context/post-cache-context";

// List thumbnail sizing constants
const LIST_THUMB_SIZE = 60; // 고정 크기

// Compact time for list layout (ko-KR locale strings like "2025년 8월 24일 오후 06:52")
function compactKoTime(s: string): string {
  if (!s) return s;
  const m = s.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(오전|오후)\s*(\d{1,2}):(\d{2})/);
  if (!m) return s; // fallback if format unexpected
  const [, yStr, moStr, dStr, ampm, hStr, min] = m;
  const Y = parseInt(yStr, 10), M = parseInt(moStr, 10), D = parseInt(dStr, 10);
  let h = parseInt(hStr, 10);
  // convert to 24h
  if (ampm === "오전") { if (h === 12) h = 0; } 
  else { if (h < 12) h += 12; }
  const hh = String(h).padStart(2, "0");
  // if same day, show HH:MM only
  const now = new Date();
  const sameDay = (now.getFullYear() === Y && (now.getMonth() + 1) === M && now.getDate() === D);
  if (sameDay) return `${hh}:${min}`;
  // within current year -> "M/D HH:MM"
  if (now.getFullYear() === Y) return `${M}/${D} ${hh}:${min}`;
  // else "YY/M/D HH:MM"
  const YY = String(Y).slice(-2);
  return `${YY}/${M}/${D} ${hh}:${min}`;
}

// Split long titles into rotating segments so we can keep a single-line layout
function toRotatingSegments(title: string, maxChars: number): string[] {
  const t = (title || "").trim();
  if (!t) return [];

  // Prefer splitting by common separators first
  const seps = [" - ", " | ", ": ", " · ", " — ", " • "];
  for (const sep of seps) {
    if (t.includes(sep)) {
      const parts = t.split(sep).map(s => s.trim()).filter(Boolean);
      // Merge small neighboring parts so each is under maxChars
      const merged: string[] = [];
      let buf = "";
      for (const p of parts) {
        if (!buf) { buf = p; continue; }
        if ((buf + sep + p).length <= maxChars) { buf = buf + sep + p; }
        else { merged.push(buf); buf = p; }
      }
      if (buf) merged.push(buf);
      return merged.length > 1 ? merged : [t];
    }
  }

  // Fallback: chunk by words to approximate width (no DOM measuring)
  const words = t.split(/\s+/);
  const chunks: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + " " + w).length <= maxChars) cur = cur + " " + w;
    else { chunks.push(cur); cur = w; }
  }
  if (cur) chunks.push(cur);
  return chunks.length > 1 ? chunks : [t];
}

function useTitleSegments(title: string, isMobile: boolean) {
  // Conservative limits so one line fits across typical list/grid widths
  const maxChars = isMobile ? 26 : 38; // tweak as needed
  return toRotatingSegments(title, maxChars);
}

function TitleRotator({ title, className }: { title: string; className?: string }) {
  const isMobile = useIsMobile();
  const segments = useTitleSegments(title, isMobile);
  const innerClass = `${className ?? ''} whitespace-nowrap leading-[1.2]`;

  // Hooks must be called unconditionally in the same order.
  // 준비/로테이션 관련 훅은 항상 선언하고, 내부에서 조건으로 동작을 가드한다.
  const containerRef = React.useRef<HTMLSpanElement | null>(null);
  const measureRef = React.useRef<HTMLSpanElement | null>(null);
  const [fits, setFits] = React.useState<boolean | null>(null);
  const [ready, setReady] = React.useState(false);
  const startDelay = React.useMemo(() => Math.floor(Math.random() * 1200), []);
  React.useEffect(() => {
    if (segments.length <= 1) return; // 단일 세그먼트면 타이머 불필요
    const t = setTimeout(() => setReady(true), startDelay);
    return () => clearTimeout(t);
  }, [startDelay, segments.length]);

  // 실제 컨테이너 폭에서 원제목이 한 줄로 들어가는지 측정
  React.useEffect(() => {
    const c = containerRef.current;
    const m = measureRef.current;
    if (!c || !m) return;

    let raf = 0;
    const compute = () => {
      try {
        // scrollWidth는 실제 내용 폭, clientWidth는 가용 폭
        const ok = m.scrollWidth <= c.clientWidth + 0.5; // 여유 버퍼
        setFits((prev) => (prev === ok ? prev : ok));
      } catch { } 
    };
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(c);
    compute();
    return () => { if (raf) cancelAnimationFrame(raf); ro.disconnect(); };
  }, [title, segments.join('\u0001')]);

  const segDurations = React.useMemo(() => {
    const perChar = isMobile ? 120 : 100; // ms per non-space char
    const min = 2000;
    const max = 8000;
    return segments.map((s) => {
      const len = Math.max(4, s.replace(/\s+/g, "").length);
      const d = len * perChar;
      return Math.min(max, Math.max(min, Math.round(d)));
    });
  }, [segments, isMobile]);

  const [idx, setIdx] = React.useState(0);
  const [tickKey, setTickKey] = React.useState(0);
  const transitionMs = 320;

  React.useEffect(() => {
    if (!ready || segments.length <= 1) return;
    let i = idx;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const loop = () => {
      const dwell = segDurations[i % segDurations.length] || 2000;
      timer = setTimeout(() => {
        if (cancelled) return;
        i = (i + 1) % segments.length;
        setIdx(i);
        setTickKey((k) => k + 1);
        loop();
      }, dwell + transitionMs);
    };

    loop();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, segments.join('\u0001'), segDurations.map(String).join(',')] );

  // 컨테이너 래퍼: 실제 폭 측정용 + 회전/정적 컨텐츠 담는 그릇
  // 높이를 고정해 레이아웃 점프 방지
  return (
    <span ref={containerRef} className="inline-block overflow-hidden h-[1.25em] align-middle w-full">
      {/* 측정 전용: 화면에 보이지 않지만 동일 스타일로 폭 계산 */}
      <span ref={measureRef} className={`pointer-events-none absolute -z-10 opacity-0 ${innerClass}`} aria-hidden>
        {title}
      </span>

      {/* 회전 여부 결정: fits 가 true이면 전체 제목을 고정으로 출력 */}
      {(segments.length <= 1 || fits) ? (
        <span className={innerClass}>{title}</span>
      ) : !ready ? (
        <span className={innerClass}>{segments[0]}</span>
      ) : (
        <RotatingText
          key={tickKey}
          containerClassName="overflow-hidden h-[1.25em]"
          className={innerClass}
          duration={segDurations[idx] || 2000}
          text={[segments[idx], segments[(idx + 1) % segments.length]]}
        />
      )}
    </span>
  );
}



interface PostCardProps {
  postId: string;
  layout: "list" | "grid";
  page?: number;
  storageKeyPrefix?: string;
  isNew?: boolean;
  isPriority?: boolean;
}

const communityColors: Record<string, string> = {
  다모앙: "bg-blue-100 text-blue-800",
  뽐뿌: "bg-green-100 text-green-800",
  인벤: "bg-purple-100 text-purple-800",
  MLBpark: "bg-orange-100 text-orange-800",
  디시인사이드: "bg-red-100 text-red-800",
  루리웹: "bg-yellow-100 text-yellow-800",
  보배드림: "bg-indigo-100 text-indigo-800",
  펨코: "bg-indigo-100 text-indigo-800",
};

export const PostCard = React.memo(
  function PostCard({ postId, layout, page, storageKeyPrefix = "", isNew = false, isPriority = false }: PostCardProps) {
  const { openModal } = useModal();
  const { postIds } = usePostList();
  const { posts } = usePostCache();
  const post = posts.get(postId);
  const isMobile = useIsMobile();

  if (!post) {
    return null; // Or a loading skeleton
  }

  const Extras = () => (
    <div className="flex items-center gap-2">
      {typeof post.clusterSize === "number" && post.clusterSize > 1 && (
        <Badge
          variant="secondary"
          className="bg-amber-100 text-amber-800 border-0"
        >
          통합 +{post.clusterSize - 1}
        </Badge>
      )}
      {post.hasYouTube && (
        <span title="YouTube 임베드" className="inline-flex items-center">
          <BrandIcon name="youtube" useBrandColor className="h-3.5 w-3.5" />
        </span>
      )}
      {post.hoverPlayerKind === 'mp4' && (
        <Badge variant="secondary" className="bg-gray-100 text-gray-800 border-0">MP4</Badge>
      )}
      {post.hasX && (
        <span title="X 임베드" className="inline-flex items-center">
          <BrandIcon name="X" useBrandColor className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );

  const SignedInCardContent = () => (
    layout === "list"
      ? (
        <CardContent className="p-3 md:p-4">
          <div className="flex gap-3">
            <HoverCard openDelay={1000}>
              <HoverCardTrigger asChild>
                <div className="relative rounded-none md:rounded-lg overflow-hidden flex-shrink-0" style={{ width: LIST_THUMB_SIZE, height: LIST_THUMB_SIZE }}>
                  {post.hoverPlayerKind === 'mp4' && !post.hasYouTube && !post.hasX ? (
                    <iframe
                      src={`/embed/video.html?src=${encodeURIComponent(post.hoverPlayerUrl || '')}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                      style={{ border: 0 }}
                      allow="encrypted-media; picture-in-picture"
                    />
                  ) : (
                    <Image
                      src={post.thumbnail || "/placeholder.svg"}
                      alt=""
                      fill
                      sizes={`${LIST_THUMB_SIZE}px`}
                      className="object-cover"
                      priority={isPriority}
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
              </HoverCardTrigger>
              {(post.thumbnail || post.hoverPlayerUrl) && (
                <HoverCardContent className={cn('w-auto', post.hoverPlayerKind === 'youtube' ? ((post.content || '').replace(/\u00a0/g, ' ').trim().length <= 60 && (post.content || '').match(/\n/g) || []).length === 0 ? 'w-[min(95vw,1024px)]' : 'w-[min(90vw,720px)]' : ((post.content || '').replace(/\u00a0/g, ' ').trim().length <= 60 && (post.content || '').match(/\n/g) || []).length === 0 ? 'max-w-2xl' : 'max-w-xl')}>                  <PostHoverCard post={post} />
                </HoverCardContent>
              )}
            </HoverCard>
            <div className="flex-1 min-w-0">
              <h3
                title={post.title}
                className="post-title font-semibold text-gray-900 overflow-hidden mb-2"
              >
                {<TitleRotator title={post.title} className="align-middle" />}
              </h3>
              <div className="flex items-center justify-between w-full">
                <Badge
                  variant="secondary"
                  className={communityColors[post.communityLabel || post.community] || "bg-gray-100 text-gray-800"}
                >
                  {post.communityLabel || post.community}
                </Badge>
                <div className="flex items-center gap-3">
                  <Extras />
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <div className="flex items-center gap-1"><Eye className="h-3 w-3" /><span>{post.viewCount}</span></div>
                    <div className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /><span>{post.comments}</span></div>
                    <div className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" /><span>{post.upvotes}</span></div>
                    <div className="flex items-center gap-1"><Clock className="h-3 w-3" /><span>{compactKoTime(post.timeAgo)}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      )
      : (
        <CardContent className="p-3 md:p-4">
          <div className="space-y-3">
            {(post.thumbnail || post.hoverPlayerUrl) ? (
              <HoverCard openDelay={1000}>
                <HoverCardTrigger asChild>
                  <div className="relative w-full aspect-[3/2] rounded-lg overflow-hidden">
                    {post.hoverPlayerKind === 'mp4' && !post.hasYouTube && !post.hasX ? (
                      <iframe
                        src={`/embed/video.html?src=${encodeURIComponent(post.hoverPlayerUrl || '')}`}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ border: 0 }}
                        allow="encrypted-media; picture-in-picture"
                      />
                    ) : (
                      <Image
                        src={post.thumbnail || "/placeholder.svg"}
                        alt=""
                        fill
                        sizes="480px"
                        className="object-cover"
                        priority={isPriority}
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </div>
                </HoverCardTrigger>
                <HoverCardContent className={cn('w-auto', post.hoverPlayerKind === 'youtube' ? ((post.content || '').replace(/\u00a0/g, ' ').trim().length <= 60 && (post.content || '').match(/\n/g) || []).length === 0 ? 'w-[min(95vw,1024px)]' : 'w-[min(90vw,720px)]' : ((post.content || '').replace(/\u00a0/g, ' ').trim().length <= 60 && (post.content || '').match(/\n/g) || []).length === 0 ? 'max-w-2xl' : 'max-w-xl')}>                  <PostHoverCard post={post} />
                </HoverCardContent>
              </HoverCard>
            ) : (
              <Image
                src={post.thumbnail || "/placeholder.svg"}
                alt=""
                width={300}
                height={160}
                className="w-full aspect-[3/2] object-cover rounded-none md:rounded-lg"
                priority={isPriority}
                referrerPolicy="no-referrer"
              />
            )}
            <div className="space-y-2 min-h-[72px] md:min-h-[92px]">
              <h3
                title={post.title}
                className="post-title font-semibold text-gray-900 overflow-hidden"
              >
                {<TitleRotator title={post.title} className="align-middle" />}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="secondary"
                  className={communityColors[post.communityLabel || post.community] || "bg-gray-100 text-gray-800"}
                >
                  {post.communityLabel || post.community}
                </Badge>
                <Extras />
              </div>
              <div className="flex items-center justify-between text-gray-500 pt-1">
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex items-center gap-1"><Eye className="h-4 w-4" /><span>{post.viewCount}</span></div>
                  <div className="flex items-center gap-1"><MessageCircle className="h-4 w-4" /><span>{post.comments}</span></div>
                  <div className="flex items-center gap-1"><ThumbsUp className="h-4 w-4" /><span>{post.upvotes}</span></div>
                </div>
                <span className="text-xs">{compactKoTime(post.timeAgo)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      )
  );

  const SignedOutCardContent = () => (
    layout === "list"
      ? (
        <CardContent className="p-3 md:p-4">
          <div className="flex gap-3">
            <div className="relative rounded-none md:rounded-lg overflow-hidden flex-shrink-0" style={{ width: LIST_THUMB_SIZE, height: LIST_THUMB_SIZE }}>
              {post.hoverPlayerKind === 'mp4' && !post.hasYouTube && !post.hasX ? (
                <iframe
                  src={`/embed/video.html?src=${encodeURIComponent(post.hoverPlayerUrl || '')}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  style={{ border: 0 }}
                  allow="encrypted-media; picture-in-picture"
                />
              ) : (
                <Image src={post.thumbnail || "/placeholder.svg"} alt="" fill sizes={`${LIST_THUMB_SIZE}px`} className="object-cover" priority={isPriority} referrerPolicy="no-referrer" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 title={post.title} className="post-title font-semibold text-gray-900 overflow-hidden mb-2">
                {<TitleRotator title={post.title} className="align-middle" />}
              </h3>
              <div className="flex items-center justify-between w-full">
                <Badge
                  variant="secondary"
                  className={communityColors[post.communityLabel || post.community] || "bg-gray-100 text-gray-800"}
                >
                  {post.communityLabel || post.community}
                </Badge>
                <div className="flex items-center gap-3">
                  <Extras />
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <div className="flex items-center gap-1"><Eye className="h-3 w-3" /><span>{post.viewCount}</span></div>
                    <div className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /><span>{post.comments}</span></div>
                    <div className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" /><span>{post.upvotes}</span></div>
                    <div className="flex items-center gap-1"><Clock className="h-3 w-3" /><span>{compactKoTime(post.timeAgo)}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      )
      : (
        <CardContent className="p-3 md:p-4">
          <div className="space-y-3">
            <div className="relative w-full aspect-[3/2] rounded-lg overflow-hidden">
              {post.hoverPlayerKind === 'mp4' && !post.hasYouTube && !post.hasX ? (
                <iframe
                  src={`/embed/video.html?src=${encodeURIComponent(post.hoverPlayerUrl || '')}`}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ border: 0 }}
                  allow="encrypted-media; picture-in-picture"
                />
              ) : (
                <Image src={post.thumbnail || "/placeholder.svg"} alt="" fill sizes="480px" className="object-cover" priority={isPriority} referrerPolicy="no-referrer" />
              )}
            </div>
            <div className="space-y-2 min-h-[72px] md:min-h-[92px]">
              <h3 title={post.title} className="post-title font-semibold text-gray-900 overflow-hidden">
                {<TitleRotator title={post.title} className="align-middle" />}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="secondary"
                  className={communityColors[post.communityLabel || post.community] || "bg-gray-100 text-gray-800"}
                >
                  {post.communityLabel || post.community}
                </Badge>
                <Extras />
              </div>
              <div className="flex items-center justify-between text-gray-500 pt-1">
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex items-center gap-1"><Eye className="h-4 w-4" /><span>{post.viewCount}</span></div>
                  <div className="flex items-center gap-1"><MessageCircle className="h-4 w-4" /><span>{post.comments}</span></div>
                  <div className="flex items-center gap-1"><ThumbsUp className="h-4 w-4" /><span>{post.upvotes}</span></div>
                </div>
                <span className="text-xs">{compactKoTime(post.timeAgo)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      )
  );

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    markPostAsRead({ id: post.id, title: post.title });
    if (storageKeyPrefix) {
      try {
        markNavigateToPost(storageKeyPrefix, {
          anchorPostId: post.id,
          anchorPage: page,
          sourceUrl: window.location.pathname + window.location.search,
        });
      } catch {} 
    }
    openModal(post.id, postIds);
  };

  return (
    <>
      <SignedIn>
        <Link
          id={`post-${post.id}`}
          href={`/posts/${post.id}`}
          prefetch={!isMobile}
          className={`block ${isNew ? 'fade-in' : ''}`}
          onClick={handleClick}
        >
          <Card className="rounded-none shadow-none border-x-0 border-b md:rounded-lg md:shadow-sm md:border hover:shadow-none md:hover:shadow-md transition-shadow cursor-pointer">
            <SignedInCardContent />
          </Card>
        </Link>
      </SignedIn>
      <SignedOut>
        <a
          id={`post-${post.id}`}
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`block ${isNew ? 'fade-in' : ''}`}
          onClick={() => markPostAsRead({ id: post.id, title: post.title })}
        >
          <Card className="rounded-none shadow-none border-x-0 border-b md:rounded-lg md:shadow-sm md:border hover:shadow-none md:hover:shadow-md transition-shadow cursor-pointer">
            <SignedOutCardContent />
          </Card>
        </a>
      </SignedOut>
    </>
  );
});
