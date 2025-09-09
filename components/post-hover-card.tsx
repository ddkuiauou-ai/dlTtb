import Image from 'next/image';
import * as React from 'react';

interface Post {
  id: string;
  title: string;
  content: string;
  thumbnail: string;
  hoverPlayerKind?: 'youtube' | 'mp4' | 'x' | null;
  hoverPlayerUrl?: string | null;
}

interface PostHoverCardProps {
  post: Post;
}

function toYouTubeEmbed(url: string): string {
  try {
    // Accept watch URLs, share URLs, or already-embed URLs
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      // watch?v=VIDEOID or embed/VIDEOID
      if (u.pathname.startsWith('/embed/')) return url;
      const id = u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : url;
    }
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace('/', '');
      return id ? `https://www.youtube.com/embed/${id}` : url;
    }
    return url;
  } catch {
    return url;
  }
}

function extractTweetId(raw: string): string | null {
  try {
    const u = new URL(raw.replace('://x.com', '://twitter.com'));
    const seg = u.pathname.split('/').filter(Boolean);

    // /{user}/status/{id}
    if (seg.length >= 3 && seg[1] === 'status') return seg[2];

    // /i/status/{id} 또는 /i/web/status/{id}
    if (seg[0] === 'i' && (seg[1] === 'status' || (seg[1] === 'web' && seg[2] === 'status'))) {
      return seg[seg.length - 1];
    }
    return null;
  } catch {
    return null;
  }
}

function toXEmbed(url: string): string {
  const id = extractTweetId(url);
  if (id) {
    // ✅ 공식 임베드 iframe
    return `https://platform.twitter.com/embed/Tweet.html?id=${encodeURIComponent(id)}`;
  }
  // id를 못 캐면 차선: publish.twitter.com로 변환해서 얻은 embed 코드(서버측 oEmbed) 사용 고려
  return `https://platform.twitter.com/embed/Tweet.html`; // 최소한 실패 시 빈 프레임 방지
}

import { cn } from "@/lib/utils";

export function PostHoverCard({ post }: PostHoverCardProps) {
  const kind = post.hoverPlayerKind ?? null;
  const src = post.hoverPlayerUrl ?? null;
  // Clean up text: collapse nbsp/multiple spaces and excessive newlines, trim trailing blank lines
  const text = React.useMemo(() => {
    const raw = (post.content || '').replace(/\u00a0/g, ' ');
    const collapsedSpaces = raw.replace(/[\t ]+/g, ' ');
    const collapsedNewlines = collapsedSpaces.replace(/\n{2,}/g, '\n');
    return collapsedNewlines.replace(/\n+$/g, '').trim();
  }, [post.content]);
  const nl = (text.match(/\n/g) || []).length;
  const isLong = text.length > 120 || nl >= 2;
  const isShort = text.length <= 60 && nl === 0;
  // Hover media sizing now controlled by HoverCardContent width.
  // Keep inner containers full-width of the hover card.
  const [thumbOk, setThumbOk] = React.useState(true);

  if (kind === 'youtube' && src) {
    const embed = toYouTubeEmbed(src);
    return (
      <div className="p-4 space-y-3">
        <div className={cn("w-full rounded-lg overflow-hidden mx-auto") }>
          <div className="relative w-full aspect-video">
            <iframe
              className="absolute inset-0 w-full h-full"
              src={embed}
              title={post.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
        <div className={cn("mx-auto max-w-[62ch] max-h-40 overflow-y-auto text-[0.95rem] leading-6 text-gray-800 whitespace-pre-line", isLong && 'pr-1')}>{text}</div>
      </div>
    );
  }

  if (kind === 'x' && src) {
    const embed = toXEmbed(src);
    return (
      <div className="p-4 space-y-3">
        <div className={cn("w-full rounded-lg overflow-hidden mx-auto") }>
          <iframe
            className={cn("w-full", isLong ? 'h-[360px]' : 'h-[420px]')}
            src={embed}
            title={post.title}
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
          />
        </div>
        <div className={cn("mx-auto max-w-[62ch] max-h-40 overflow-y-auto text-[0.95rem] leading-6 text-gray-800 whitespace-pre-line", isLong && 'pr-1')}>{text}</div>
      </div>
    );
  }

  if (kind === 'mp4' && src) {
    return (
      <div className="p-4 space-y-3">
        <div className={cn("relative w-full rounded-lg overflow-hidden mx-auto") }>
          <video
            src={src}
            autoPlay
            muted
            loop
            playsInline
            controls
            className="w-full h-auto"
            style={{ maxHeight: isLong ? '50vh' : '60vh' }}
          />
        </div>
        <div className={cn("mx-auto max-w-[62ch] max-h-40 overflow-y-auto text-[0.95rem] leading-6 text-gray-800 whitespace-pre-line", isLong && 'pr-1')}>{text}</div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {post.thumbnail && thumbOk && (
        <div className={cn("rounded-lg overflow-y-auto mx-auto w-full")} style={{ maxHeight: '60vh' }}>
          <Image
            src={post.thumbnail}
            alt={post.title}
            width={720}
            height={405}
            className="w-full h-auto"
            sizes="(max-width: 1024px) 90vw, 720px"
            onError={() => setThumbOk(false)}
          />
        </div>
      )}
      <div className={cn("mx-auto max-w-[62ch] max-h-40 overflow-y-auto text-[0.95rem] leading-6 text-gray-800 whitespace-pre-line", isLong && 'pr-1')}>{text}</div>
    </div>
  );
}
