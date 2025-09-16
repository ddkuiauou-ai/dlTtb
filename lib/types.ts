export type Post = {
  id: string;
  url: string;
  title: string | null;
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

export type TimeRange = "3h" | "6h" | "24h" | "1w";

export const ALL_TIME_RANGES: TimeRange[] = ["3h", "6h", "24h", "1w"];
