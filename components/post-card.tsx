"use client";
import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, ThumbsUp, Clock, Eye } from "lucide-react";
import { SignedIn, SignedOut } from "@clerk/clerk-react";
import Image from "next/image";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import {
  markPreviewActive,
  markPreviewInactive,
} from "@/lib/preview-activation-store";

import { useModal } from "@/context/modal-context";
import { usePostList } from "@/context/post-list-context";
import { usePostCache } from "@/context/post-cache-context";
import type { Post } from "@/lib/types";

// Compact time for list layout (ko-KR locale strings like "2025년 8월 24일 오후 06:52")
function formatPostTime(s: string): { display: string, full: string } {
  if (!s) return { display: s, full: s };
  const m = s.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(오전|오후)\s*(\d{1,2}):(\d{2})/);
  if (!m) return { display: s, full: s };
  const [, yStr, moStr, dStr, ampm, hStr, min] = m;
  const Y = parseInt(yStr, 10), M = parseInt(moStr, 10), D = parseInt(dStr, 10);
  let h = parseInt(hStr, 10);
  // convert to 24h
  if (ampm === "오전") { if (h === 12) h = 0; }
  else { if (h < 12) h += 12; }
  const hh = String(h).padStart(2, "0");

  const now = new Date();
  const sameDay = (now.getFullYear() === Y && (now.getMonth() + 1) === M && now.getDate() === D);

  if (sameDay) {
    const time = `${hh}:${min}`;
    return { display: time, full: time };
  }

  if (now.getFullYear() === Y) {
    const full = `${M}/${D} ${hh}:${min}`;
    const display = `${M}/${D}`;
    return { display, full };
  }

  const YY = String(Y).slice(-2);
  const full = `${YY}/${M}/${D} ${hh}:${min}`;
  const display = `${YY}/${M}/${D}`;
  return { display, full };
}

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

function formatViewCount(n: number): string {
  if (n === undefined || n === null) return '0';
  if (n < 10000) {
    return n.toLocaleString();
  }
  if (n < 100000) {
    return `${(n / 10000).toFixed(1).replace('.0', '')}만`;
  }
  return `${Math.floor(n / 10000)}만`;
}

function getVisualLength(s: string): number {
  let len = 0;
  for (let i = 0; i < s.length; i++) {
    // Characters outside the ASCII range are treated as wide characters
    if (s.charCodeAt(i) > 127) {
      len += 2;
    } else {
      len += 1;
    }
  }
  return len;
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
        if (getVisualLength(buf + sep + p) <= maxChars) {
          buf = buf + sep + p;
        } else {
          merged.push(buf);
          buf = p;
        }
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
    if (getVisualLength(cur + " " + w) <= maxChars) {
      cur = cur + " " + w;
    } else {
      chunks.push(cur);
      cur = w;
    }
  }
  if (cur) chunks.push(cur);
  return chunks.length > 1 ? chunks : [t];
}

function useTitleSegments(title: string, isMobile: boolean) {
  // Conservative limits so one line fits across typical list/grid widths
  const maxChars = isMobile ? 30 : 44; // tweak as needed
  return toRotatingSegments(title, maxChars);
}

function TitleRotator({ title, className }: { title: string; className?: string }) {
  const isMobile = useIsMobile();
  const segments = useTitleSegments(title, isMobile);
  const innerClass = `${className ?? ''} whitespace-nowrap leading-[1.2]`;
  const segmentsKey = React.useMemo(() => segments.join("\u0001"), [segments]);
  const segmentsLength = segments.length;

  // Hooks must be called unconditionally in the same order.
  // 준비/로테이션 관련 훅은 항상 선언하고, 내부에서 조건으로 동작을 가드한다.
  const containerRef = React.useRef<HTMLSpanElement | null>(null);
  const measureRef = React.useRef<HTMLSpanElement | null>(null);
  const [fits, setFits] = React.useState<boolean | null>(null);
  const [ready, setReady] = React.useState(false);
  const startDelay = React.useMemo(() => Math.floor(Math.random() * 1200), []);
  React.useEffect(() => {
    if (segmentsLength <= 1) return; // 단일 세그먼트면 타이머 불필요
    const t = setTimeout(() => setReady(true), startDelay);
    return () => clearTimeout(t);
  }, [startDelay, segmentsLength]);

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
  }, [title, segmentsKey]);

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
  const segDurationsKey = React.useMemo(() => segDurations.join(','), [segDurations]);

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
  }, [ready, segmentsKey, segDurationsKey]);

  // 컨테이너 래퍼: 실제 폭 측정용 + 회전/정적 컨텐츠 담는 그릇
  // 높이를 고정해 레이아웃 점프 방지
  return (
    <span ref={containerRef} className="inline-block overflow-hidden h-[1.4em] align-middle w-full">
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
          containerClassName="overflow-hidden h-[1.4em]"
          className={innerClass}
          duration={segDurations[idx] || 2000}
          text={[segments[idx], segments[(idx + 1) % segments.length]]}
        />
      )}
    </span>
  );
}

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefers(mq.matches);

    update();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }

    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  return prefers;
}

type PreviewActivationReason = "hover" | "focus" | "touch" | "hovercard";

const activatedHoverPreviewIds = new Set<string>();

function usePreviewActivationTracker(postId: string) {
  const activeReasonsRef = React.useRef<Set<PreviewActivationReason>>(new Set());
  const isActiveRef = React.useRef(false);

  const updateGlobalState = React.useCallback(() => {
    const nextActive = activeReasonsRef.current.size > 0;
    if (isActiveRef.current === nextActive) return;
    isActiveRef.current = nextActive;
    if (nextActive) {
      markPreviewActive(postId);
    } else {
      markPreviewInactive(postId);
    }
  }, [postId]);

  const setReasonActive = React.useCallback(
    (reason: PreviewActivationReason, active: boolean) => {
      const reasons = activeReasonsRef.current;
      if (active) {
        if (!reasons.has(reason)) {
          reasons.add(reason);
          updateGlobalState();
        }
        return;
      }
      if (reasons.delete(reason)) {
        updateGlobalState();
      }
    },
    [updateGlobalState],
  );

  React.useEffect(() => {
    const reasons = activeReasonsRef.current;
    return () => {
      reasons.clear();
      if (isActiveRef.current) {
        isActiveRef.current = false;
        markPreviewInactive(postId);
      }
    };
  }, [postId]);

  return { setReasonActive } as const;
}

interface InlinePreviewMediaProps {
  post: Post;
  priority?: boolean;
  sizes: string;
  className?: string;
  mediaClassName?: string;
  onActivationChange?: (reason: PreviewActivationReason, active: boolean) => void;
}

const InlinePreviewMedia = React.forwardRef<HTMLDivElement, InlinePreviewMediaProps>(
  ({
    post,
    priority = false,
    sizes,
    className,
    mediaClassName,
    onActivationChange,
  }, forwardedRef) => {
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
    const warmupLinksRef = React.useRef<HTMLLinkElement[]>([]);
    const prefersReducedMotion = usePrefersReducedMotion();
    const initialActivated = React.useMemo(
      () => activatedHoverPreviewIds.has(post.id),
      [post.id]
    );
    const [prefetched, setPrefetched] = React.useState(initialActivated);
    const [hasActivated, setHasActivated] = React.useState(initialActivated);
    const [isVisible, setIsVisible] = React.useState(false);
    const [iframeLoaded, setIframeLoaded] = React.useState(false);
    const pendingCommandRef = React.useRef<"play" | "pause" | null>(null);
    const lastPostedCommandRef = React.useRef<"play" | "pause" | null>(null);

    const enablePreview = React.useMemo(
      () =>
        post.hoverPlayerKind === "mp4" &&
        !post.hasYouTube &&
        !post.hasX &&
        Boolean(post.hoverPlayerUrl),
      [post.hasX, post.hasYouTube, post.hoverPlayerKind, post.hoverPlayerUrl]
    );

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        containerRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      },
      [forwardedRef]
    );

    const postCommandToIframe = React.useCallback(
      (command: "play" | "pause") => {
        if (typeof window === "undefined") return;
        const iframeNode = iframeRef.current;
        if (!iframeNode) return;
        try {
          iframeNode.contentWindow?.postMessage({ type: command }, window.location.origin);
        } catch {
          // Swallow cross-origin or detached frame errors
        }
      },
      []
    );

    const notifyActivation = React.useCallback(
      (reason: PreviewActivationReason, active: boolean) => {
        onActivationChange?.(reason, active);
      },
      [onActivationChange],
    );

    const activate = React.useCallback(
      (reason: PreviewActivationReason) => {
        if (!enablePreview) return;
        setPrefetched(true);
        setIsVisible(true);
        notifyActivation(reason, true);
      },
      [enablePreview, notifyActivation],
    );

    const deactivate = React.useCallback(
      (reason: PreviewActivationReason) => {
        notifyActivation(reason, false);
      },
      [notifyActivation],
    );

    const handleMouseEnter = React.useCallback(() => {
      activate("hover");
    }, [activate]);

    const handleMouseLeave = React.useCallback(() => {
      deactivate("hover");
    }, [deactivate]);

    const handleFocus = React.useCallback(() => {
      activate("focus");
    }, [activate]);

    const handleBlur = React.useCallback(() => {
      deactivate("focus");
    }, [deactivate]);

    const handleTouchStart = React.useCallback(() => {
      activate("touch");
    }, [activate]);

    const handleTouchEnd = React.useCallback(() => {
      deactivate("touch");
    }, [deactivate]);

    const handleTouchCancel = React.useCallback(() => {
      deactivate("touch");
    }, [deactivate]);

    React.useEffect(() => {
      const activated = activatedHoverPreviewIds.has(post.id);
      setPrefetched(activated);
      setHasActivated(activated);
      setIsVisible(false);
      setIframeLoaded(false);
      pendingCommandRef.current = null;
      lastPostedCommandRef.current = null;
    }, [post.id]);

    React.useEffect(() => {
      if (!enablePreview) {
        setPrefetched(false);
        setIsVisible(false);
        setHasActivated(false);
        activatedHoverPreviewIds.delete(post.id);
        pendingCommandRef.current = null;
        lastPostedCommandRef.current = null;
        notifyActivation("hover", false);
        notifyActivation("focus", false);
        notifyActivation("touch", false);
        return;
      }

      const node = containerRef.current;
      if (!node) return;
      if (typeof window === "undefined") {
        setPrefetched(true);
        setIsVisible(true);
        return;
      }

      if (!("IntersectionObserver" in window)) {
        setPrefetched(true);
        setIsVisible(true);
        return;
      }

      const prefetchObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setPrefetched(true);
              break;
            }
          }
        },
        { rootMargin: "50% 0px 50% 0px" }
      );

      const visibilityObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            setIsVisible(entry.isIntersecting);
          }
        },
        { rootMargin: "5% 0px 5% 0px", threshold: 0.25 }
      );

      prefetchObserver.observe(node);
      visibilityObserver.observe(node);

      return () => {
        prefetchObserver.disconnect();
        visibilityObserver.disconnect();
      };
    }, [enablePreview, notifyActivation, post.id]);

    React.useEffect(() => {
      if (!enablePreview) return;
      if (!prefetched) return;
      if (hasActivated) return;
      setHasActivated(true);
      activatedHoverPreviewIds.add(post.id);
    }, [enablePreview, prefetched, hasActivated, post.id]);

    React.useEffect(() => {
      if (!prefetched) return;
      if (!post.hoverPlayerUrl) return;
      if (typeof document === "undefined") return;
      if (warmupLinksRef.current.length > 0) return;

      const links: HTMLLinkElement[] = [];

      try {
        const targetUrl = new URL(post.hoverPlayerUrl);
        const origin = targetUrl.origin;

        const preconnect = document.createElement("link");
        preconnect.rel = "preconnect";
        preconnect.href = origin;
        preconnect.crossOrigin = "anonymous";
        document.head.appendChild(preconnect);
        links.push(preconnect);

        const dnsPrefetch = document.createElement("link");
        dnsPrefetch.rel = "dns-prefetch";
        dnsPrefetch.href = origin;
        document.head.appendChild(dnsPrefetch);
        links.push(dnsPrefetch);
      } catch {
        // ignore URL parsing issues
      }

      const prefetch = document.createElement("link");
      prefetch.rel = "prefetch";
      prefetch.href = post.hoverPlayerUrl;
      prefetch.as = "document";
      prefetch.crossOrigin = "anonymous";
      document.head.appendChild(prefetch);
      links.push(prefetch);

      warmupLinksRef.current = links;

      return () => {
        for (const link of links) {
          link.remove();
        }
        warmupLinksRef.current = [];
      };
    }, [prefetched, post.hoverPlayerUrl]);

    React.useEffect(() => {
      return () => {
        if (warmupLinksRef.current.length > 0) {
          for (const link of warmupLinksRef.current) {
            link.remove();
          }
          warmupLinksRef.current = [];
        }
      };
    }, []);

    const handleIframeLoad = React.useCallback(() => {
      setIframeLoaded(true);
      const command = pendingCommandRef.current;
      if (!command) return;
      postCommandToIframe(command);
      lastPostedCommandRef.current = command;
    }, [postCommandToIframe]);

    React.useEffect(() => {
      if (!enablePreview) return;
      if (!hasActivated) return;

      const desiredCommand: "play" | "pause" =
        !prefersReducedMotion && isVisible ? "play" : "pause";

      if (pendingCommandRef.current !== desiredCommand) {
        pendingCommandRef.current = desiredCommand;
      }

      if (!iframeLoaded) return;
      if (lastPostedCommandRef.current === desiredCommand) return;

      postCommandToIframe(desiredCommand);
      lastPostedCommandRef.current = desiredCommand;
    }, [
      enablePreview,
      hasActivated,
      iframeLoaded,
      isVisible,
      postCommandToIframe,
      prefersReducedMotion,
    ]);

    const iframeSrc = React.useMemo(() => {
      if (!post.hoverPlayerUrl) return undefined;
      return `/embed/video.html?src=${encodeURIComponent(post.hoverPlayerUrl)}`;
    }, [post.hoverPlayerUrl]);

    const showIframe = enablePreview && hasActivated && Boolean(iframeSrc);
    const videoIsViewable = showIframe && !prefersReducedMotion && isVisible;
    const showThumbnail = !showIframe || !iframeLoaded || !videoIsViewable;

    const baseMediaClasses = cn(
      "absolute inset-0 w-full h-full object-cover",
      mediaClassName
    );

    return (
      <div
        ref={setRefs}
        className={cn("relative", className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        <Image
          src={post.thumbnail || "/placeholder.svg"}
          alt=""
          fill
          sizes={sizes}
          className={cn(
            baseMediaClasses,
            "transition-opacity duration-200",
            showThumbnail ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          priority={priority}
          referrerPolicy="no-referrer"
        />
        {showIframe && iframeSrc ? (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            loading="lazy"
            referrerPolicy="no-referrer"
            className={cn(
              baseMediaClasses,
              "transition-opacity duration-200",
              videoIsViewable ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
            style={{ border: 0 }}
            allow="autoplay; encrypted-media; picture-in-picture"
            onLoad={handleIframeLoad}
            aria-hidden={!videoIsViewable}
          />
        ) : null}
      </div>
    );
  }
);

InlinePreviewMedia.displayName = "InlinePreviewMedia";


interface PostCardProps {
  postId: string;
  layout: "list" | "grid";
  page?: number;
  storageKeyPrefix?: string;
  sectionKey: string;
  isNew?: boolean;
  isPriority?: boolean;
  isRead?: boolean;
}

const communityColors: Record<string, string> = {
  다모앙: "bg-blue-100 text-blue-800",
  뽐뿌: "bg-green-100 text-green-800",
  인벤: "bg-purple-100 text-purple-800",
  MLBpark: "bg-orange-100 text-orange-800",
  디씨: "bg-red-100 text-red-800",
  루리웹: "bg-yellow-100 text-yellow-800",
  보배드림: "bg-indigo-100 text-indigo-800",
  펨코: "bg-indigo-100 text-indigo-800",
  더쿠: "bg-pink-100 text-pink-800",
  클리앙: "bg-teal-100 text-teal-800",
  SLR클럽: "bg-cyan-100 text-cyan-800",
  오유: "bg-lime-100 text-lime-800",
  "82쿡": "bg-fuchsia-100 text-fuchsia-800",
  와이고수: "bg-rose-100 text-rose-800",
  아카라이브: "bg-amber-100 text-amber-800",
};

export const PostCard = React.memo(
  function PostCard({ postId, layout, page, storageKeyPrefix = "", sectionKey, isNew = false, isPriority = false, isRead = false }: PostCardProps) {
    const { openModal } = useModal();
    const { postIds } = usePostList();
    const { posts } = usePostCache(sectionKey);
    const post = posts.get(postId) as Post;
    const { setReasonActive: setPreviewActivationReason } = usePreviewActivationTracker(postId);
    const handleHoverCardOpenChange = React.useCallback(
      (open: boolean) => {
        setPreviewActivationReason("hovercard", open);
      },
      [setPreviewActivationReason],
    );
    const isMobile = useIsMobile();

    if (!post) {
      return null; // Or a loading skeleton
    }

    const timeInfo = formatPostTime(post.timeAgo);

    const GridExtras = () => (
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

    const Badges = () => {
      const isClustered = typeof post.clusterSize === "number" && post.clusterSize > 1;
      return (
        <div className="flex items-center gap-2 flex-shrink-0">
          {isClustered && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-0">
              통합 +{post.clusterSize - 1}
            </Badge>
          )}
          {!isClustered && (
            <Badge
              variant="secondary"
              className={cn(
                communityColors[post.communityLabel || post.community] || "bg-gray-100 text-gray-800",
                "hidden @[10rem]:inline-flex"
              )}
            >
              {post.communityLabel || post.community}
            </Badge>
          )}
          {post.hasYouTube && (
            <span title="YouTube 임베드" className="hidden @[10rem]:inline-flex items-center">
              <BrandIcon name="youtube" useBrandColor className="h-3.5 w-3.5" />
            </span>
          )}
          {post.hasX && (
            <span title="X 임베드" className="hidden @[10rem]:inline-flex items-center">
              <BrandIcon name="X" useBrandColor className="h-3.5 w-3.5" />
            </span>
          )}
          {post.hoverPlayerKind === 'mp4' && (
            <Badge
              variant="secondary"
              className="hidden md:@[12rem]:inline-flex bg-gray-100 text-gray-800 border-0"
            >
              MP4
            </Badge>
          )}
        </div>
      );
    };


    const SignedInCardContent = () => (
      layout === "list"
        ? (
          <CardContent className="flex p-0 h-24">
            <div className="relative flex-shrink-0 w-20 overflow-hidden rounded-l-lg">
              <HoverCard openDelay={1000} onOpenChange={handleHoverCardOpenChange}>
                <HoverCardTrigger asChild>
                  <InlinePreviewMedia
                    post={post}
                    priority={isPriority}
                    sizes="80px"
                    className="absolute inset-0"
                    onActivationChange={setPreviewActivationReason}
                  />
                </HoverCardTrigger>
                {(post.thumbnail || post.hoverPlayerUrl) && (
                  <HoverCardContent className={cn('w-auto', post.hoverPlayerKind === 'youtube' ? ((post.content || '').replace(/\u00a0/g, ' ').trim().length <= 60 && (post.content || '').match(/\n/g) || []).length === 0 ? 'w-[min(95vw,1024px)]' : 'w-[min(90vw,720px)]' : ((post.content || '').replace(/\u00a0/g, ' ').trim().length <= 60 && (post.content || '').match(/\n/g) || []).length === 0 ? 'max-w-2xl' : 'max-w-xl')}>                  <PostHoverCard post={post} />
                  </HoverCardContent>
                )}
              </HoverCard>
            </div>
            <div className="flex-1 min-w-0 p-3 md:p-4">
              <div className="flex flex-col justify-between h-full">
                <h3
                  title={post.title}
                  className="post-title font-semibold text-gray-900 overflow-hidden mb-2"
                >
                  {<TitleRotator title={post.title} className="align-middle" />}
                </h3>
                <div className="@container flex items-center justify-between w-full">
                  <Badges />
                  <TooltipProvider>
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <div className="flex items-center gap-1"><Eye className="h-3 w-3" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{formatViewCount(post.viewCount)}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{post.viewCount.toLocaleString()}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /><span>{post.comments}</span></div>
                      <div className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" /><span>{post.upvotes}</span></div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{timeInfo.display}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{timeInfo.full}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          </CardContent>
        )
        : (
          <CardContent className="p-3 md:p-4">
            <div className="space-y-3">
              {(post.thumbnail || post.hoverPlayerUrl) ? (
                <HoverCard openDelay={1000} onOpenChange={handleHoverCardOpenChange}>
                  <HoverCardTrigger asChild>
                    <div className="relative w-full aspect-[3/2] rounded-lg overflow-hidden">
                      <InlinePreviewMedia
                        post={post}
                        priority={isPriority}
                        sizes="480px"
                        className="absolute inset-0"
                        onActivationChange={setPreviewActivationReason}
                      />
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
                  className="w-full aspect-[3/2] object-cover rounded-lg"
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
                  <GridExtras />
                </div>
                <div className="flex items-center justify-between text-gray-500 pt-1">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-1"><Eye className="h-4 w-4" /><span>{post.viewCount.toLocaleString()}</span></div>
                    <div className="flex items-center gap-1"><MessageCircle className="h-4 w-4" /><span>{post.comments.toLocaleString()}</span></div>
                    <div className="flex items-center gap-1"><ThumbsUp className="h-4 w-4" /><span>{post.upvotes.toLocaleString()}</span></div>
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
          <CardContent className="flex p-0 h-24">
            <div className="relative flex-shrink-0 w-20 overflow-hidden rounded-l-lg">
              <InlinePreviewMedia
                post={post}
                priority={isPriority}
                sizes="80px"
                className="absolute inset-0"
                onActivationChange={setPreviewActivationReason}
              />
            </div>
            <div className="flex-1 min-w-0 p-3 md:p-4">
              <div className="flex flex-col justify-between h-full">
                <h3 title={post.title} className="post-title font-semibold text-gray-900 overflow-hidden mb-2">
                  {<TitleRotator title={post.title} className="align-middle" />}
                </h3>
                <div className="@container flex items-center justify-between w-full">
                  <Badges />
                  <TooltipProvider>
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <div className="flex items-center gap-1"><Eye className="h-3 w-3" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{formatViewCount(post.viewCount)}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{post.viewCount.toLocaleString()}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /><span>{post.comments}</span></div>
                      <div className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" /><span>{post.upvotes}</span></div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{timeInfo.display}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{timeInfo.full}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          </CardContent>
        )
        : (
          <CardContent className="p-3 md:p-4">
            <div className="space-y-3">
              <div className="relative w-full aspect-[3/2] rounded-lg overflow-hidden">
                <InlinePreviewMedia
                  post={post}
                  priority={isPriority}
                  sizes="480px"
                  className="absolute inset-0"
                  onActivationChange={setPreviewActivationReason}
                />
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
                  <GridExtras />
                </div>
                <div className="flex items-center justify-between text-gray-500 pt-1">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-1"><Eye className="h-4 w-4" /><span>{post.viewCount.toLocaleString()}</span></div>
                    <div className="flex items-center gap-1"><MessageCircle className="h-4 w-4" /><span>{post.comments.toLocaleString()}</span></div>
                    <div className="flex items-center gap-1"><ThumbsUp className="h-4 w-4" /><span>{post.upvotes.toLocaleString()}</span></div>
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
      markPostAsRead({ id: post.id, title: post.title, url: post.url });
      if (storageKeyPrefix) {
        try {
          markNavigateToPost(storageKeyPrefix, {
            anchorPostId: post.id,
            anchorPage: page,
            sourceUrl: window.location.pathname + window.location.search,
          });
        } catch { }
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
            className={cn(`block ${isNew ? 'fade-in' : ''}`, isRead && 'is-read')}
            data-read={isRead ? '1' : undefined}
            onClick={handleClick}
          >
            <Card className="transition-shadow cursor-pointer hover:shadow-md">
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
            className={cn(`block ${isNew ? 'fade-in' : ''}`, isRead && 'is-read')}
            data-read={isRead ? '1' : undefined}
            onClick={() => markPostAsRead({ id: post.id, title: post.title, url: post.url })}
          >
            <Card className="transition-shadow cursor-pointer hover:shadow-md">
              <SignedOutCardContent />
            </Card>
          </a>
        </SignedOut>
      </>
    );
  });
