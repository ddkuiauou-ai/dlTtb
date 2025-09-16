export type Post = {
  id: string;
  url: string;
  title: string;
  community: string;
  communityId: string;
  communityLabel: string;
  boardLabel: string | null | undefined;
  comments: number;
  upvotes: number;
  viewCount: number;
  timestamp: string;
  timeAgo: string;
  thumbnail: string | null;
  content: string | null;
  embed?: { type: string; url: string };
  hasYouTube?: boolean;
  hasX?: boolean;
  hoverPlayerKind: 'youtube' | 'x' | 'mp4' | null;
  hoverPlayerUrl: string | null;
  clusterId: string | null;
  clusterSize: number | null;
};

/**
 * Server-side hydrated posts share the same core shape as client posts.
 * The difference is that `embed` is guaranteed to align with the hover
 * player metadata we derive during hydration.
 */
export type HydratedPost = Post & {
  embed?: { type: "youtube" | "x" | "mp4"; url: string };
};

export type TimeRange = "3h" | "6h" | "24h" | "1w";

export const ALL_TIME_RANGES: TimeRange[] = ["3h", "6h", "24h", "1w"];
