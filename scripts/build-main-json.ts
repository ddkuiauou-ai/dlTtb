/**
 * post-grid.tsx와 동일한 매핑으로 2페이지 이후 JSON 생성
 * - /public/data/home/v1/{range}/{section}/page-2.json, ...
 *
 * 규칙
 *  - 1페이지는 getMainPagePosts({ perSite: 6, hours: 24*7 })와 동일 파라미터로 재계산해 중복 제거
 *  - 썸네일 우선순위: postImages.url → postEmbeds(type='youtube').thumbnail → '/placeholder.svg'
 *  - 날짜 포맷: post-grid.tsx가 만드는 문자열과 완전 동일(ko-KR, Y년 M월 D일 HH:MM)
 */

import "dotenv/config";

import fs from "fs";
import path from "path";
import { db } from "../lib/db";
import { posts, postImages, postEmbeds, clusterTrends, clusters, clusterPosts, sites, postEnrichment, postComments } from "../lib/schema";
import { and, desc, eq, inArray, gt } from "drizzle-orm";
import { getMainPagePosts, getClusterTopPosts } from "../lib/queries";
import { sql } from "drizzle-orm";
import { manifestFsPathForBaseFromPublic } from "./utils/manifest";

// ===== 설정 =====
const PAGE_SIZE = Number(process.env.PAGE_SIZE ?? 20);
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 50);
// 시간범위(3h|6h|24h|1w)와 섹션(fresh|trending|top 등)을 환경변수로 받아 경로를 결정
const RANGE = (process.env.RANGE ?? "24h").toString();
const SECTION = (process.env.SECTION ?? "fresh").toString();
const OUT_DIR = path.join(process.cwd(), "public", "data", "home", "v1", RANGE, SECTION);


const RANGE_TO_MIN: Record<string, number> = { "3h": 180, "6h": 360, "24h": 1440, "1w": 10080 };
const WINDOW_MINUTES = RANGE_TO_MIN[RANGE] ?? 1440;
type SectionMode = "fresh" | "trending" | "top" | "ranked" | "category";
const MODE = SECTION as SectionMode;
const SINCE = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

const RANGE_TO_INTERVAL: Record<string, string> = { "3h": "3 hours", "6h": "6 hours", "24h": "24 hours", "1w": "7 days" };
const INTERVAL_LITERAL = RANGE_TO_INTERVAL[RANGE] ?? "24 hours";
const FRESH_WEIGHT_BY_RANGE: Record<string, number> = { "3h": 10, "6h": 8, "24h": 6, "1w": 4 };
const FRESH_DECAY_HOURS = 24; // decay constant for recent-activity boost

// ===== 타입 =====
type RankedRow = {
  id: string;
  site: string;
  title: string | null;
  comment_count: number | null;
  like_count: number | null;
  viewCount: number | null; // (2)
  timestamp: string;
  score: number;
};

export type Row = {
  id: string;
  title: string | null;
  site: string | null;
  siteName?: string | null;
  commentCount: number | null;
  likeCount: number | null;
  viewCount: number | null;   // (4)
  timestamp: Date | string | null;
  content: string | null;     // (4)
};

// ===== 랭킹 후보 =====
async function fetchRankedCandidates(limit: number): Promise<RankedRow[]> {
  const q = `
    WITH w AS (
      SELECT *
      FROM post_trends
      WHERE window_end >= NOW() - INTERVAL '${INTERVAL_LITERAL}'
    ),
    rate AS (
      SELECT p.site, p.id AS post_id, p.timestamp,
             (w.view_delta    / NULLIF(EXTRACT(EPOCH FROM INTERVAL '${INTERVAL_LITERAL}'),0)) * 60.0 AS view_rate,
             (w.comment_delta / NULLIF(EXTRACT(EPOCH FROM INTERVAL '${INTERVAL_LITERAL}'),0)) * 60.0 AS comment_rate,
             (w.like_delta    / NULLIF(EXTRACT(EPOCH FROM INTERVAL '${INTERVAL_LITERAL}'),0)) * 60.0 AS like_rate
      FROM w JOIN posts p ON p.id = w.post_id
    ),
    site_stats AS (
      SELECT site,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY LN(1+GREATEST(view_rate,0)))    AS med_v,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY LN(1+GREATEST(comment_rate,0))) AS med_c,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY LN(1+GREATEST(like_rate,0)))    AS med_l,
             GREATEST(STDDEV_POP(LN(1+GREATEST(view_rate,0))),0.001)    AS sd_v,
             GREATEST(STDDEV_POP(LN(1+GREATEST(comment_rate,0))),0.001) AS sd_c,
             GREATEST(STDDEV_POP(LN(1+GREATEST(like_rate,0))),0.001)    AS sd_l
      FROM rate GROUP BY site
    ),
    z AS (
      SELECT r.post_id, r.site, r.timestamp,
             (LN(1+GREATEST(view_rate,0))    - med_v)/sd_v   AS z_view,
             (LN(1+GREATEST(comment_rate,0)) - med_c)/sd_c   AS z_comment,
             (LN(1+GREATEST(like_rate,0))    - med_l)/sd_l   AS z_like
      FROM rate r JOIN site_stats s USING(site)
    ),
    score AS (
      SELECT z.post_id,
             (1.0*z_view + 2.0*z_comment + 1.5*z_like)
             * EXP(- EXTRACT(EPOCH FROM (NOW()-z.timestamp))/3600.0 / 6.0) AS base
      FROM z
    ),
    penalty AS (
      SELECT pc.post_id,
             CASE WHEN MAX(pc.depth) FILTER (WHERE pc.timestamp >= NOW()-INTERVAL '${INTERVAL_LITERAL}') >= 3
                  THEN 0.9 ELSE 1.0 END AS depth_penalty
      FROM post_comments pc
      GROUP BY pc.post_id
    )
    SELECT p.id, p.site, p.title, p.comment_count, p.like_count, p.view_count AS "viewCount", p.timestamp,
           (s.base * COALESCE(pe.depth_penalty,1.0)) AS score
    FROM score s
    JOIN posts p ON p.id = s.post_id
    LEFT JOIN penalty pe ON pe.post_id = p.id
    WHERE p.is_deleted = FALSE
    ORDER BY score DESC
    LIMIT ${limit};
  `;
  const res: any = await db.execute(sql.raw(q));
  const rows: RankedRow[] = (res?.rows ?? res) as RankedRow[];
  return rows ?? [];
}

function interleaveProportionalCap(rows: RankedRow[], pageSize: number, perSiteCap = 3): RankedRow[] {
  const bySite = new Map<string, RankedRow[]>();
  for (const r of rows) {
    const s = r.site ?? "기타";
    if (!bySite.has(s)) bySite.set(s, []);
    bySite.get(s)!.push(r);
  }
  for (const [, arr] of bySite) arr.sort((a, b) => (b.score - a.score));

  const sites = [...bySite.keys()];
  const weights = sites.map(s => bySite.get(s)!.length);
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const desired = new Map<string, number>(sites.map((s, i) => [s, weights[i] / sumW]));
  const taken = new Map<string, number>(sites.map(s => [s, 0]));
  const cursor = new Map<string, number>(sites.map(s => [s, 0]));

  const out: RankedRow[] = [];
  while (out.length < pageSize) {
    let bestSite: string | null = null;
    let bestDef = -Infinity;
    for (const s of sites) {
      const cur = cursor.get(s)!;
      const arr = bySite.get(s)!;
      if (cur >= arr.length) continue;
      if ((taken.get(s) || 0) >= perSiteCap) continue;
      const target = (desired.get(s) || 0) * (out.length + 1);
      const deficit = target - (taken.get(s) || 0);
      if (deficit > bestDef) { bestDef = deficit; bestSite = s; }
    }
    if (!bestSite) break;
    const idx = cursor.get(bestSite)!;
    out.push(bySite.get(bestSite)![idx]);
    cursor.set(bestSite, idx + 1);
    taken.set(bestSite, (taken.get(bestSite) || 0) + 1);
    if (sites.every(s => (cursor.get(s)! >= bySite.get(s)!.length) || (taken.get(s) || 0) >= perSiteCap)) break;
  }
  return out;
}

// post-grid.tsx와 동일
const MAIN_PER_SITE = 6;

// ===== 유틸 =====
function ensureDir(p: string) {
  // 디렉터리를 삭제하고 다시 생성하여 오래된 파일을 정리합니다.
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
  }
  fs.mkdirSync(p, { recursive: true });
}

function atomicWriteJson(filepath: string, data: unknown) {
  const tmp = `${filepath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filepath);
}

function toGridTimeString(ts: Date | string | null): string {
  const d =
    typeof ts === "string"
      ? new Date(ts)
      : ts instanceof Date
        ? ts
        : new Date();
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ===== 보조 쿼리 =====
async function loadClusterSizesByPostIds(ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await db
    .select({ postId: clusterPosts.postId, size: clusters.size })
    .from(clusterPosts)
    .leftJoin(clusters, eq(clusters.id, clusterPosts.clusterId))
    .where(inArray(clusterPosts.postId, ids));
  const m = new Map<string, number>();
  for (const r of rows as any[]) {
    if (!m.has(r.postId) && typeof r.size === "number") m.set(r.postId, r.size);
  }
  return m;
}

async function hydrateThumbnails(rows: Row[]) {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return {
    imagesMap: new Map<string, string>(),
    ytMap: new Map<string, string>(),
    ytUrlMap: new Map<string, string>(),
    mp4UrlMap: new Map<string, string>(),
    xMap: new Map<string, boolean>(),
  };

  const [images, youtubeEmbeds, videoEmbeds, xEmbeds] = await Promise.all([
    db
      .select({ postId: postImages.postId, url: postImages.url })
      .from(postImages)
      .where(inArray(postImages.postId, ids)),
    db
      .select({ postId: postEmbeds.postId, type: postEmbeds.type, thumbnail: postEmbeds.thumbnail, url: postEmbeds.url })
      .from(postEmbeds)
      .where(and(inArray(postEmbeds.postId, ids), sql`LOWER(${postEmbeds.type}) = 'youtube'`)),
    db
      .select({ postId: postEmbeds.postId, url: postEmbeds.url })
      .from(postEmbeds)
      .where(and(inArray(postEmbeds.postId, ids), sql`LOWER(${postEmbeds.type}) IN ('video', 'mp4')`)),
    db
      .select({ postId: postEmbeds.postId })
      .from(postEmbeds)
      .where(and(inArray(postEmbeds.postId, ids), sql`LOWER(${postEmbeds.type}) = 'x'`)),
  ]);

  const imagesMap = new Map<string, string>();
  for (const img of images) {
    if (!imagesMap.has(img.postId)) imagesMap.set(img.postId, img.url);
  }
  const ytMap = new Map<string, string>();
  const ytUrlMap = new Map<string, string>();
  for (const e of youtubeEmbeds) {
    if (!ytMap.has(e.postId) && e.thumbnail) ytMap.set(e.postId, e.thumbnail);
    if (!ytUrlMap.has(e.postId) && e.url) ytUrlMap.set(e.postId, e.url);
  }
  const mp4UrlMap = new Map<string, string>();
  for (const e of videoEmbeds) {
    if (!mp4UrlMap.has(e.postId) && e.url) mp4UrlMap.set(e.postId, e.url);
  }
  const xMap = new Map<string, boolean>();
  for (const e of xEmbeds) {
    if (!xMap.has(e.postId)) xMap.set(e.postId, true);
  }
  return { imagesMap, ytMap, ytUrlMap, mp4UrlMap, xMap };
}

function mapToClientPost(
  row: any,
  imagesMap: Map<string, string>,
  ytMap: Map<string, string>,
  ytUrlMap?: Map<string, string>,
  mp4UrlMap?: Map<string, string>,
  xMap?: Map<string, boolean>,
) {
  const ytUrl = ytUrlMap?.get(row.id);
  const mp4Url = mp4UrlMap?.get(row.id);
  const hoverPlayerKind = ytUrl ? "youtube" : mp4Url ? "mp4" : undefined;
  const hoverPlayerUrl = ytUrl || mp4Url || undefined;

  return {
    id: row.id,
    url: row.url,
    title: row.title ?? "",
    community: row.site ?? "unknown",
    communityId: row.site ?? "unknown",
    communityLabel: row.siteName ?? row.site ?? "unknown",
    comments: Number(row.commentCount ?? 0),
    upvotes: Number(row.likeCount ?? 0),
    viewCount: Number(row.viewCount ?? 0),
    timeAgo: toGridTimeString(row.timestamp),
    thumbnail: ytMap.get(row.id) || imagesMap.get(row.id) || "/placeholder.svg",
    content: row.content ?? "",
    clusterSize: Number(row._clusterSize ?? 1),
    hasYouTube: !!(ytMap && ytMap.get(row.id)),
    hasX: !!(xMap && xMap.get(row.id)),
    hoverPlayerKind,
    hoverPlayerUrl,
  };
}

// ===== 페이지 빌드용 쿼리 =====
async function fetchClusterPage(offset: number) {
  const base = db
    .select({
      clusterId: clusterTrends.clusterId,
      rank: clusterTrends.rank,
      hotScore: clusterTrends.hotScore,
      windowEnd: clusterTrends.windowEnd,
      repPostId: clusters.representativePostId,
      size: clusters.size,
    })
    .from(clusterTrends)
    .innerJoin(clusters, sql`${clusters.id} = ${clusterTrends.clusterId}`)
    .where(sql`${clusterTrends.windowEnd} >= ${SINCE}`);

  const ordered = MODE === "trending"
    ? base.orderBy(
      sql`CASE WHEN ${clusterTrends.rank} IS NULL THEN 1 ELSE 0 END`,
      clusterTrends.rank,
      desc(clusterTrends.hotScore)
    )
    : base.orderBy(desc(clusterTrends.hotScore));

  const rows = await ordered.limit(PAGE_SIZE).offset(offset);
  if (rows.length === 0) return [] as any[];

  const ids = rows.map(r => r.repPostId).filter(Boolean) as string[];
  const postsRows = await db
    .select({
      id: posts.id,
      url: posts.url,
      title: posts.title,
      site: posts.site,
      siteName: sites.name,
      commentCount: posts.commentCount,
      likeCount: posts.likeCount,
      viewCount: posts.viewCount,
      timestamp: posts.timestamp,
      content: posts.content,
    })
    .from(posts)
    .leftJoin(sites, sql`${sites.id} = ${posts.site} AND ${sites.board} = ${posts.board}`)
    .where(inArray(posts.id, ids));

  const repList = postsRows as Row[];
  const { imagesMap, ytMap, ytUrlMap, mp4UrlMap, xMap } = await hydrateThumbnails(repList);

  return repList.map(r => ({
    ...r,
    _clusterSize: rows.find(x => x.repPostId === r.id)?.size ?? 1,
  })).map(r => mapToClientPost(r as any, imagesMap, ytMap, ytUrlMap, mp4UrlMap, xMap));
}

async function fetchPage(offset: number, whereClause: any) {
  const rows = await db
    .select({
      id: posts.id,
      url: posts.url,
      title: posts.title,
      site: posts.site,
      siteName: sites.name,
      commentCount: posts.commentCount,
      likeCount: posts.likeCount,
      viewCount: posts.viewCount,
      timestamp: posts.timestamp,
      content: posts.content,
    })
    .from(posts)
    .leftJoin(sites, sql`${sites.id} = ${posts.site} AND ${sites.board} = ${posts.board}`)
    .where(whereClause)
    .orderBy(desc(posts.timestamp))
    .limit(PAGE_SIZE)
    .offset(offset);

  return rows as Row[];
}

async function fetchCategoryPage(category: string, offset: number) {
  const rows = await db
    .select({
      id: posts.id,
      url: posts.url,
      title: posts.title,
      site: posts.site,
      siteName: sites.name,
      commentCount: posts.commentCount,
      likeCount: posts.likeCount,
      viewCount: posts.viewCount,
      timestamp: posts.timestamp,
      content: posts.content,
    })
    .from(posts)
    .leftJoin(sites, sql`${sites.id} = ${posts.site} AND ${sites.board} = ${posts.board}`)
    .leftJoin(postEnrichment, eq(posts.id, postEnrichment.postId))
    .where(sql`${postEnrichment.fusedCategories} ? ${category}`)
    .orderBy(desc(posts.timestamp))
    .limit(PAGE_SIZE)
    .offset(offset);

  return rows as Row[];
}

// ===== Fresh score-ordered page (matches SSR fresh scoring) =====
async function fetchFreshScorePage(offset: number, siteId?: string) {
  const K = FRESH_WEIGHT_BY_RANGE[RANGE] ?? 6;
  const whereSite = siteId ? `AND p.site = '${siteId.replace(/'/g, "''")}'` : "";
  const q = `
    WITH base AS (
      SELECT p.id, p.url, p.title, p.site, p.comment_count AS "commentCount", p.like_count AS "likeCount",
             p.view_count AS "viewCount", p.timestamp, p.content,
             s.name AS "siteName",
             COALESCE(m.hot_score, 0) AS hot30,
             (EXTRACT(EPOCH FROM (NOW() - p.timestamp)) / 3600.0) AS age_hours
      FROM posts p
      LEFT JOIN sites s ON s.id = p.site AND s.board = p.board
      LEFT JOIN mv_post_trends_30m m ON m.post_id = p.id
      WHERE p.is_deleted = FALSE
        AND p.timestamp >= '${SINCE.toISOString()}'::timestamp
        ${whereSite}
    )
    SELECT *,
           ((COALESCE("likeCount",0)*3 + COALESCE("commentCount",0)*2 + COALESCE("viewCount",0))
             + LN(1+GREATEST(hot30,0)) * ${K} * EXP(- age_hours / ${FRESH_DECAY_HOURS})) AS score
    FROM base
    ORDER BY score DESC
    LIMIT ${PAGE_SIZE}
    OFFSET ${offset};
  `;
  const res: any = await db.execute(sql.raw(q));
  const rows = (res?.rows ?? res) as Row[];
  return rows;
}

// ===== 빌드 로직 =====
async function buildGlobalPages(excludeIds: Set<string>) {
  ensureDir(OUT_DIR);
  let page = 2;
  let offset = 0;

  while (page <= MAX_PAGES) {
    if (MODE === "fresh") {
      const rows = await fetchFreshScorePage(offset);
      if (rows.length === 0) break;
      const filteredRows = rows.filter(r => !excludeIds.has(r.id));
      if (filteredRows.length === 0) { offset += PAGE_SIZE; continue; }
      const ids = filteredRows.map(r => r.id);
      const csize = await loadClusterSizesByPostIds(ids);
      const augmented = filteredRows.map(r => ({ ...r, _clusterSize: csize.get(r.id) ?? 1 })) as any[];
      const { imagesMap, ytMap, ytUrlMap, mp4UrlMap, xMap } = await hydrateThumbnails(augmented as Row[]);
      const mapped = augmented.map((r) => mapToClientPost(r, imagesMap, ytMap, ytUrlMap, mp4UrlMap, xMap));
      const filtered = mapped.filter((r: any) => !excludeIds.has(r.id));
      if (filtered.length === 0) { offset += PAGE_SIZE; continue; }
      const payload = { page, pageSize: PAGE_SIZE, range: RANGE, section: SECTION, posts: filtered };
      atomicWriteJson(path.join(OUT_DIR, `page-${page}.json`), payload);
      page += 1; offset += PAGE_SIZE; continue;
    }

    if (MODE === "ranked") {
      const BATCH = PAGE_SIZE * 10;
      const batch = await fetchRankedCandidates(BATCH);
      const available = batch.filter(r => !excludeIds.has(r.id));
      if (available.length === 0) break;
      const pageRows = interleaveProportionalCap(available, PAGE_SIZE, 3);
      if (pageRows.length === 0) break;

      const ids = pageRows.map(r => r.id);
      const postsRows = await db
        .select({
          id: posts.id,
          title: posts.title,
          site: posts.site,
          commentCount: posts.commentCount,
          likeCount: posts.likeCount,
          viewCount: posts.viewCount,
          timestamp: posts.timestamp,
          content: posts.content,
        })
        .from(posts)
        .where(inArray(posts.id, ids));
      const byId = new Map(postsRows.map(p => [p.id, p]));
      const joined: Row[] = ids.map(id => byId.get(id)).filter(Boolean) as Row[];
      const { imagesMap, ytMap, ytUrlMap, mp4UrlMap, xMap } = await hydrateThumbnails(joined);
      const mapped = joined.map((r) => mapToClientPost(r, imagesMap, ytMap, ytUrlMap, mp4UrlMap, xMap));

      const payload = { page, pageSize: PAGE_SIZE, range: RANGE, section: SECTION, posts: mapped };
      atomicWriteJson(path.join(OUT_DIR, `page-${page}.json`), payload);
      page += 1; offset += PAGE_SIZE; continue;
    }

    // 기본(클러스터 기반: trending/top)
    const mapped = await fetchClusterPage(offset);
    if (mapped.length === 0) break;
    const filtered = mapped.filter((r: any) => !excludeIds.has(r.id));
    if (filtered.length === 0) { offset += PAGE_SIZE; continue; }
    const payload = { page, pageSize: PAGE_SIZE, range: RANGE, section: SECTION, posts: filtered };
    atomicWriteJson(path.join(OUT_DIR, `page-${page}.json`), payload);

    page += 1;
    offset += PAGE_SIZE;
  }
}


// compute ids from what page-1 would show for this RANGE/SECTION
async function computePage1Ids(): Promise<string[]> {
  const size = MAIN_PER_SITE * 12;
  if (MODE === "fresh") {
    // Exclude all items which would have already appeared on the SSR home page
    // sections for this RANGE: rising(3h ranked), spotlight(RANGE ranked), clusters(24h/1w), and page-1 of fresh(RANGE)
    const [rank3h, rankR, top24h, top1w, freshR] = await Promise.all([
      getMainPagePosts({ range: "3h" as any, perSiteCap: MAIN_PER_SITE, pageSize: size, mode: "ranked", excludeIds: [] }),
      getMainPagePosts({ range: RANGE as any, perSiteCap: MAIN_PER_SITE, pageSize: size, mode: "ranked", excludeIds: [] }),
      getClusterTopPosts({ range: "24h" as any, perSiteCap: MAIN_PER_SITE, pageSize: size, excludeIds: [] }),
      getClusterTopPosts({ range: "1w" as any, perSiteCap: MAIN_PER_SITE, pageSize: size, excludeIds: [] }),
      getMainPagePosts({ range: RANGE as any, perSiteCap: MAIN_PER_SITE, pageSize: size, mode: "fresh", excludeIds: [] }),
    ]);
    const ids = new Set<string>();
    for (const a of [rank3h, rankR, top24h, top1w, freshR]) for (const p of (a || [])) ids.add(p.id);
    return Array.from(ids);
  }
  if (MODE === "ranked") {
    const base = await fetchRankedCandidates(size * 2);
    const page1 = interleaveProportionalCap(base, size, MAIN_PER_SITE);
    return page1.map(r => r.id);
  }
  const first = await fetchClusterPage(0);
  return first.map((p: any) => p.id);
}

async function main() {
  const exclude = new Set(await computePage1Ids());

  if (MODE === 'category') {
    // buildCategoryPages(exclude);
  } else {
    await buildGlobalPages(exclude);
  }


  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  atomicWriteJson(manifestPath, {
    generatedAt: new Date().toISOString(),
    pageSize: PAGE_SIZE,
    maxPages: MAX_PAGES,
    range: RANGE,
    section: SECTION,
    mode: MODE,
    windowMinutes: WINDOW_MINUTES,
    baseDir: OUT_DIR.replace(process.cwd(), ""),
    excludedFromPage1: exclude.size,
  });

  console.log("✅ 2페이지 이후 JSON 생성 완료 (post-grid.tsx와 동일 포맷)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err, origin) => {
  console.error("Uncaught Exception:", err, "origin:", origin);
});
