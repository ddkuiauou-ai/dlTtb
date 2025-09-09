import { pgTable, pgMaterializedView, text, varchar, integer, timestamp, boolean, uuid, index, unique, primaryKey, jsonb, doublePrecision, customType } from "drizzle-orm/pg-core"; import { sql } from "drizzle-orm";

// Drizzle 버전에 따라 bytea 내장이 없을 수 있어 customType로 정의
export const pgBytea = customType<{ data: Buffer | null; driverData: Buffer | null }>({
  dataType() { return "bytea"; },
});

// 1. Posts
export const posts = pgTable("posts", {
  id: text("id").primaryKey(), // internal UUID/hash
  postId: text("post_id").notNull(), // site의 고유 ID
  site: varchar("site", { length: 50 }).notNull(),
  board: varchar("board", { length: 100 }).notNull(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  author: text("author"),
  avatar: text("avatar"), // author avatar URL
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  content: text("content"),
  contentHtml: text("content_html"),
  contentHash: text("content_hash").notNull(),
  category: text("category"),
  tags: jsonb("tags").default(sql`'[]'::jsonb`), // 기본 빈 배열
  viewCount: integer("view_count").default(0),
  likeCount: integer("like_count").default(0),
  dislikeCount: integer("dislike_count").default(0),
  commentCount: integer("comment_count").default(0),
  imageCount: integer("image_count").default(0),
  embedCount: integer("embed_count").default(0), // 추가: embed 개수
  crawledAt: timestamp("crawled_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(), // NOTE: defaultNow는 생성 시점에만, 앱 레벨에서 갱신 필요
  isDeleted: boolean("is_deleted").default(false),
}, (table) => [
  // Unique constraint for site + postId (중복 방지)
  unique("posts_site_post_id_unique").on(table.site, table.postId),
  // Index for timestamp-based queries
  index("posts_timestamp_idx").on(table.timestamp),
  // Index for site-based queries
  index("posts_site_idx").on(table.site),
  // Composite index for board feed queries (site+board 정렬)
  index("posts_site_board_timestamp_idx").on(table.site, table.board, table.timestamp),
]);

// 2. Post Versions
export const postVersions = pgTable("post_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  title: text("title"),
  content: text("content"),
  contentHtml: text("content_html"),
  contentHash: text("content_hash").notNull(),
  changeType: varchar("change_type", { length: 10 }), // title, content, both
  changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  unique("post_versions_post_id_version_uq").on(table.postId, table.version),
  unique("post_versions_post_id_content_hash_uq").on(table.postId, table.contentHash),
]);

// 3. Post Images
export const postImages = pgTable("post_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  urlHash: varchar("url_hash", { length: 32 }).notNull(), // md5(url) 32-hex
  alt: text("alt"),
  width: integer("width"),
  height: integer("height"),
}, (table) => [
  index("post_images_post_id_idx").on(table.postId),
  unique("post_images_post_id_url_uq").on(table.postId, table.urlHash),
]);

// 4. Post Embeds
export const postEmbeds = pgTable("post_embeds", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(), // youtube, X, iframe, etc.
  url: text("url").notNull(),
  urlHash: varchar("url_hash", { length: 32 }).notNull(), // md5(url)
  videoId: text("video_id"),
  thumbnail: text("thumbnail"),
  title: text("title"),
  description: text("description"),
  mimeType: varchar("mime_type", { length: 20 }),
}, (table) => [
  index("post_embeds_post_id_idx").on(table.postId),
  unique("post_embeds_post_id_url_uq").on(table.postId, table.urlHash),
]);

// 4‑b. Post Enrichment (LLM 결과 저장: 카테고리/키워드)
export const postEnrichment = pgTable("post_enrichment", {
  postId: text("post_id").primaryKey().references(() => posts.id, { onDelete: "cascade" }),                                   // FK posts.id
  // === 최종 결과(소비 1순위) ===
  fusedCategories: jsonb("fused_categories").notNull().default(sql`'[]'::jsonb`),
  fusedKeywords: jsonb("fused_keywords").notNull().default(sql`'[]'::jsonb`),
  fusedAt: timestamp("fused_at", { withTimezone: true }),

  // === 리비전 키(멱등/게이트) ===
  textRev: varchar("text_rev", { length: 64 }),                          // md5(title|content|sorted(tags))
  imageRev: varchar("image_rev", { length: 64 }),                          // md5(sorted(url_hash)|image_agg_hash)
  fuseRev: varchar("fuse_rev", { length: 64 }),                          // md5(textRev + ':' + imageRev)

  // === (참고) 이미지 롤업 결과: 프롬프트 입력/디버깅용 ===
  imageSummary: text("image_summary"),
  imageKeywords: jsonb("image_keywords").default(sql`'[]'::jsonb`),
  imageObjects: jsonb("image_objects").default(sql`'[]'::jsonb`),
  imageColors: jsonb("image_colors").default(sql`'[]'::jsonb`),
  imageOcr: text("image_ocr"),
  imageSafety: jsonb("image_safety").default(sql`'{}'::jsonb`),

  // === 메타 ===
  fusedModel: varchar("fused_model", { length: 64 }),                      // LLM name used for fusion
  fusedVersion: varchar("fused_version", { length: 32 }),
  enrichedAt: timestamp("enriched_at", { withTimezone: true }).defaultNow(), // 롤업 등 업데이트 시각
}, (t) => [
  index("post_enrichment_rev_idx").on(t.textRev, t.imageRev, t.fuseRev),
  index("post_enrichment_fused_at_idx").on(t.fusedAt),
]);

// 4-d. Post Image Enrichment (VLM per-image 결과 보관)
export const postImageEnrichment = pgTable("post_image_enrichment", {
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  urlHash: varchar("url_hash", { length: 32 }).notNull(),   // md5(image_url)
  imageUrl: text("image_url").notNull(),
  model: varchar("model", { length: 64 }),
  version: integer("version").default(1),
  caption: text("caption"),
  labels: jsonb("labels").default(sql`'[]'::jsonb`),
  ocrText: text("ocr_text"),
  safety: jsonb("safety").default(sql`'{}'::jsonb`),
  objects: jsonb("objects").default(sql`'[]'::jsonb`),
  colors: jsonb("colors").default(sql`'[]'::jsonb`),
  // pgvector 도입 전 임시 저장(나중에 vector(차원)로 마이그레이션)
  embedding: pgBytea("embedding"),
  enrichedAt: timestamp("enriched_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.postId, t.urlHash], name: "post_image_enrichment_pk" }),
  index("post_image_enrichment_post_idx").on(t.postId),
  index("post_image_enrichment_post_enriched_idx").on(t.postId, t.enrichedAt),
]);


// 4‑e. Media Enrichment Jobs (이미지용 잡 큐)
export const mediaEnrichmentJobs = pgTable("media_enrichment_jobs", {
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  urlHash: varchar("url_hash", { length: 32 }).notNull(),
  imageUrl: text("image_url").notNull(),                              // 워커가 바로 사용
  priority: varchar("priority", { length: 2 }).notNull().default('P1'), // 'P0'|'P1'
  status: varchar("status", { length: 12 }).notNull().default('queued'), // queued|processing|done|error|stale
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: varchar("locked_by", { length: 64 }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [
  primaryKey({ columns: [t.postId, t.urlHash], name: "media_enrichment_jobs_pk" }),
  index("media_jobs_ready_idx").on(t.priority, t.status, t.nextAttemptAt),
  index("media_jobs_sched_idx").on(t.status, t.nextAttemptAt, t.priority),
  index("media_jobs_post_idx").on(t.postId),
]);

// 4‑c. Enrichment Jobs (간단 잡 큐: P0/P1 + 상태)
export const fusionJobs = pgTable("fusion_jobs", {
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),  // FK posts.id
  revKey: varchar("rev_key", { length: 64 }).notNull(), // == fuseRev
  priority: varchar("priority", { length: 2 }).notNull().default('P1'),  // 'P0'|'P1'
  status: varchar("status", { length: 12 }).notNull().default('queued'), // queued|processing|done|error|stale
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: varchar("locked_by", { length: 64 }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [
  primaryKey({ columns: [t.postId, t.revKey], name: "fusion_jobs_pk" }),
  index("fusion_jobs_ready_idx").on(t.priority, t.status, t.nextAttemptAt),
]);

// 5. Post Comments (nested/threaded)
export const postComments: any = pgTable("post_comments", {
  id: text("id").primaryKey(), // comment ID (e.g. `${post_id}_comment_1`)
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  parentId: text("parent_id").references((): any => postComments.id, { onDelete: "cascade" }), // null이면 루트 댓글
  rootId: text("root_id").references((): any => postComments.id, { onDelete: "cascade" }), // 스레드 루트(루트는 자기 자신)
  path: text("path").notNull(), //
  //  materialized DFS path (e.g. "001.002")
  depth: integer("depth").notNull().default(0), // 0 = 루트, 1+ = 대댓글 깊이

  author: text("author"),
  avatar: text("avatar"), // comment author avatar URL
  content: text("content"),
  contentHtml: text("content_html"), // 원본 HTML 보관
  raw: text("raw"),                  // 사이트 원문(raw) 보관

  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  likeCount: integer("like_count").default(0),
  dislikeCount: integer("dislike_count").default(0),
  reactionCount: integer("reaction_count").default(0),

  isDeleted: boolean("is_deleted").default(false),
}, (table) => [
  index("post_comments_post_id_idx").on(table.postId),
  index("post_comments_timestamp_idx").on(table.timestamp),
  index("post_comments_parent_id_idx").on(table.parentId),
  index("post_comments_root_id_idx").on(table.rootId),
  index("post_comments_post_id_parent_id_timestamp_idx").on(table.postId, table.parentId, table.timestamp),
  index("post_comments_post_id_root_id_timestamp_idx").on(table.postId, table.rootId, table.timestamp),
  index("post_comments_post_id_path_idx").on(table.postId, table.path),
]);

// 6. Post Snapshots (for trend tracking)
export const postSnapshots = pgTable("post_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  viewCount: integer("view_count").default(0),
  likeCount: integer("like_count").default(0),
  dislikeCount: integer("dislike_count").default(0),
  commentCount: integer("comment_count").default(0),
}, (table) => [
  index("post_snapshots_post_id_timestamp_idx").on(table.postId, table.timestamp),
]);

// 8. Post Trends
export const postTrends = pgTable("post_trends", {
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
  viewDelta: integer("view_delta").notNull(),
  commentDelta: integer("comment_delta").notNull(),
  likeDelta: integer("like_delta").notNull(),
  dislikeDelta: integer("dislike_delta").notNull(),
  hotScore: doublePrecision("hot_score"),
  rank: integer("rank"),
}, (table) => [
  primaryKey({ columns: [table.postId, table.windowStart, table.windowEnd], name: "post_trends_pkey" }),
  index("post_trends_window_idx").on(table.windowEnd, table.hotScore),
  index("post_trends_post_id_window_end_idx").on(table.postId, table.windowEnd),
]);

// 9. Materialized View: 30-minute post trends
export const mvPostTrends30m = pgMaterializedView("mv_post_trends_30m", {
  postId: text("post_id"),
  title: text("title"),
  viewDelta: integer("view_delta"),
  commentDelta: integer("comment_delta"),
  likeDelta: integer("like_delta"),
  dislikeDelta: integer("dislike_delta"),
  hotScore: doublePrecision("hot_score"),
  latestViews: integer("latest_views"),
}).as(sql`
  WITH snap AS (
    SELECT *
    FROM post_snapshots
    WHERE timestamp >= NOW() - INTERVAL '30 minutes'
  ),
  latest AS (
    SELECT DISTINCT ON (post_id)
           post_id, view_count, comment_count, like_count, dislike_count
    FROM   snap
    ORDER  BY post_id, timestamp DESC
  ),
  earliest AS (
    SELECT DISTINCT ON (post_id)
           post_id, view_count, comment_count, like_count, dislike_count
    FROM   snap
    ORDER  BY post_id, timestamp ASC
  )
  SELECT  p.id              AS post_id,
          p.title,
          latest.view_count   - earliest.view_count   AS view_delta,
          latest.comment_count - earliest.comment_count AS comment_delta,
          latest.like_count   - earliest.like_count   AS like_delta,
          latest.dislike_count - earliest.dislike_count AS dislike_delta,
          (latest.view_count   - earliest.view_count)
        + (latest.comment_count - earliest.comment_count) * 3
        + (latest.like_count   - earliest.like_count)   * 2 AS hot_score,
          MAX(latest.view_count) AS latest_views
  FROM    latest
  JOIN    earliest USING (post_id)
  JOIN    posts p ON p.id = latest.post_id
  GROUP BY p.id, p.title, view_delta, comment_delta, like_delta, dislike_delta, hot_score
`);

/*
  ──────────────────────────────────────────────────────────────────────────────
  Manual indexes for mv_post_trends_30m  (copy & run in psql/console)
    - PostgreSQL의 REFRESH MATERIALIZED VIEW CONCURRENTLY 는
      WHERE 절 없는 UNIQUE 인덱스가 MV 위에 반드시 있어야 함.
    - Drizzle index/unique 빌더는 MV 대상에 안정적으로 적용되지 않으므로
      인덱스는 수작업으로 1회만 생성.
 
  -- 1) Unique index (필수: CONCURRENTLY 전제조건)
  -- 2) Hot score 조회 최적화 인덱스 (선택)
 
 CREATE UNIQUE INDEX IF NOT EXISTS mv_post_trends_30m_post_id_uq
 ON public.mv_post_trends_30m (post_id);
  
 CREATE INDEX IF NOT EXISTS mv_post_trends_30m_hot_idx
 ON public.mv_post_trends_30m (hot_score DESC, post_id);
 
  -- 인덱스가 준비되면 동시 리프레시 가능:
  -- REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_post_trends_30m;
  ──────────────────────────────────────────────────────────────────────────────
 */


// 9‑b. Materialized View: Aggregated post trends by common ranges (3h/6h/24h/1w)
export const mvPostTrendsAgg = pgMaterializedView("mv_post_trends_agg", {
  rangeLabel: varchar("range_label", { length: 8 }),
  postId: text("post_id"),
  viewDelta: integer("view_delta"),
  commentDelta: integer("comment_delta"),
  likeDelta: integer("like_delta"),
  dislikeDelta: integer("dislike_delta"),
  hotScore: doublePrecision("hot_score"),
  windowEnd: timestamp("window_end", { withTimezone: true }),
}).as(sql`
  WITH ranges AS (
    SELECT '3h'::text AS range_label, INTERVAL '3 hours' AS iv
    UNION ALL SELECT '6h',  INTERVAL '6 hours'
    UNION ALL SELECT '24h', INTERVAL '24 hours'
    UNION ALL SELECT '1w',  INTERVAL '7 days'
  )
  SELECT
    r.range_label,
    pt.post_id,
    SUM(pt.view_delta)     AS view_delta,
    SUM(pt.comment_delta)  AS comment_delta,
    SUM(pt.like_delta)     AS like_delta,
    SUM(pt.dislike_delta)  AS dislike_delta,
    SUM(pt.hot_score)      AS hot_score,
    MAX(pt.window_end)     AS window_end
  FROM post_trends pt
  JOIN ranges r
    ON pt.window_end >= NOW() - r.iv
  GROUP BY r.range_label, pt.post_id
`);

/*
  ────────────────────────────────────────────────────────────────────────────
  Manual indexes for mv_post_trends_agg (create once in DB console)
    - UNIQUE(range_label, post_id) is required for CONCURRENT refresh.
    - Hot score / lookups by range benefit from a covering index.

  CREATE UNIQUE INDEX IF NOT EXISTS mv_post_trends_agg_uq
    ON public.mv_post_trends_agg (range_label, post_id);

  CREATE INDEX IF NOT EXISTS mv_post_trends_agg_hot_idx
    ON public.mv_post_trends_agg (range_label, hot_score DESC, post_id);

  -- Refresh when needed:
  -- REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_post_trends_agg;
  ────────────────────────────────────────────────────────────────────────────
*/

// 7. Sites Configuration (크롤링 대상 사이트 설정)
export const sites = pgTable("sites", {
  id: varchar("id", { length: 50 }).notNull(), // 사이트 식별자 (e.g., "fmkorea", "clien")
  board: varchar("board", { length: 100 }).notNull(), // 크롤링할 게시판
  name: varchar("name", { length: 100 }), // 사이트 한글 이름
  boardName: varchar("board_name", { length: 100 }), // 게시판 한글 이름
  url: text("url"),
  isActive: boolean("is_active").default(true),
  lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }),
  crawlInterval: integer("crawl_interval").default(300), // seconds
}, (table) => [
  primaryKey({ columns: [table.id, table.board], name: "sites_pk" }),
]);


// 10. Post Signatures (텍스트/갤러리/임베드 시그니처)
export const postSignatures = pgTable("post_signatures", {
  postId: text("post_id").primaryKey().references(() => posts.id, { onDelete: "cascade" }),
  textSimhash64: varchar("text_simhash64", { length: 32 }),
  textMinhash128: pgBytea("text_minhash128"),
  galleryMinhash128: pgBytea("gallery_minhash128"),
  embedMinhash128: pgBytea("embed_minhash128"),
  imageCount: integer("image_count").default(0),
  embedCount: integer("embed_count").default(0),
  computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("post_signatures_computed_at_idx").on(table.computedAt),
]);

// 11. Clusters (이슈 단위)
export const clusters = pgTable("clusters", {
  id: uuid("id").defaultRandom().primaryKey(),
  representativePostId: text("representative_post_id").references(() => posts.id, { onDelete: "set null" }),
  title: text("title"),
  size: integer("size").default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("clusters_updated_at_idx").on(table.updatedAt),
]);

// 12. Cluster Posts (클러스터 멤버십)
export const clusterPosts = pgTable("cluster_posts", {
  clusterId: uuid("cluster_id").notNull().references(() => clusters.id, { onDelete: "cascade" }),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  similarity: doublePrecision("similarity"),
  matchType: varchar("match_type", { length: 16 }), // text|both|embed 등
  isRepresentative: boolean("is_representative").default(false),
}, (table) => [
  primaryKey({ columns: [table.clusterId, table.postId], name: "cluster_posts_pk" }),
  index("cluster_posts_cluster_idx").on(table.clusterId),
  index("cluster_posts_post_idx").on(table.postId),
]);

// 13. Cluster Trends (클러스터 단위 델타/랭킹)
export const clusterTrends = pgTable("cluster_trends", {
  clusterId: uuid("cluster_id").notNull().references(() => clusters.id, { onDelete: "cascade" }),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
  viewDelta: integer("view_delta").notNull(),
  commentDelta: integer("comment_delta").notNull(),
  likeDelta: integer("like_delta").notNull(),
  dislikeDelta: integer("dislike_delta").notNull(),
  hotScore: doublePrecision("hot_score"),
  rank: integer("rank"),
}, (table) => [
  primaryKey({ columns: [table.clusterId, table.windowStart, table.windowEnd], name: "cluster_trends_pk" }),
  index("cluster_trends_window_idx").on(table.windowEnd, table.hotScore),
]);

// 14. Cluster Rotation (노출 회전/감쇠 상태)
export const clusterRotation = pgTable("cluster_rotation", {
  clusterId: uuid("cluster_id").notNull().references(() => clusters.id, { onDelete: "cascade" }),
  windowLabel: varchar("window_label", { length: 8 }).notNull(), // e.g., "3h", "24h", "1w"
  consecutiveHits: integer("consecutive_hits").notNull().default(0),
  lastShownAt: timestamp("last_shown_at", { withTimezone: true }),
  suppressedUntil: timestamp("suppressed_until", { withTimezone: true }),
  lastScore: doublePrecision("last_score"), // 최근 선정 시 사용된(감쇠 후) 점수
}, (table) => [
  primaryKey({ columns: [table.clusterId, table.windowLabel], name: "cluster_rotation_pk" }),
  index("cluster_rotation_suppressed_idx").on(table.suppressedUntil),
  index("cluster_rotation_lastshown_idx").on(table.lastShownAt),
]);

// 14‑b. Post Rotation (개별 포스트 노출 회전/감쇠)
export const postRotation = pgTable("post_rotation", {
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  windowLabel: varchar("window_label", { length: 8 }).notNull(), // e.g., "3h", "24h", "1w"
  consecutiveHits: integer("consecutive_hits").notNull().default(0),
  lastShownAt: timestamp("last_shown_at", { withTimezone: true }),
  suppressedUntil: timestamp("suppressed_until", { withTimezone: true }),
  lastScore: doublePrecision("last_score"),
}, (table) => [
  primaryKey({ columns: [table.postId, table.windowLabel], name: "post_rotation_pk" }),
  index("post_rotation_suppressed_idx").on(table.suppressedUntil),
  index("post_rotation_lastshown_idx").on(table.lastShownAt),
]);

// 15. Keyword Trends (홈 섹션: 인기 키워드 TOP 10 집계용)
// - rangeLabel: 예) "24h" (윈도우 라벨)
// - windowStart/windowEnd: 집계 구간 경계(SSG/캐시 일관성 확보)
// - count: 해당 창에서의 빈도
// - computedAt: 집계 시각 (모니터링/디버깅용)
export const keywordTrends = pgTable("keyword_trends", {
  keyword: varchar("keyword", { length: 100 }).notNull(),
  rangeLabel: varchar("range_label", { length: 10 }).notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
  computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  primaryKey({
    columns: [table.keyword, table.rangeLabel, table.windowStart, table.windowEnd],
    name: "keyword_trends_pkey",
  }),
  index("keyword_trends_range_idx").on(table.rangeLabel, table.windowEnd, table.count),
]);

// 테이블 다 지우는 쿼리
/*
DO $$
DECLARE
    sql TEXT;
BEGIN
    SELECT string_agg(
               format('DROP TABLE IF EXISTS %I.%I CASCADE', schemaname, tablename),
               '; '
           )
    INTO   sql
    FROM   pg_tables
    WHERE  schemaname = 'public';

    EXECUTE sql;
END
$$ LANGUAGE plpgsql;
*/

// 입력 쿼리
/*
INSERT INTO sites (id, board, name, board_name, url)
VALUES
    ('clien', 'park', '클리앙', '자유게시판', 'https://www.clien.net/service/board/park'),
    ('damoang','free', '다모앙', '자유게시판', 'https://damoang.net/free'),
    ('damoang','new', '다모앙', '새로운소식', 'https://damoang.net/new'),
    ('ppomppu','hot', '뽐뿌', '핫게시판', 'https://www.ppomppu.co.kr/hot.php'),
  ('fmkorea','best', '펨코', '베스트', 'https://www.fmkorea.com/best')
ON CONFLICT (id, board)                -- 중복키(=id+board)가 있으면
DO UPDATE SET
    name = EXCLUDED.name,
    board_name = EXCLUDED.board_name,
    url  = EXCLUDED.url,
    is_active = TRUE;                 -- 필요 시 다른 컬럼도 추가 가능
*/

/*
 CREATE UNIQUE INDEX IF NOT EXISTS mv_post_trends_30m_post_id_uq
 ON public.mv_post_trends_30m (post_id);
  
 CREATE INDEX IF NOT EXISTS mv_post_trends_30m_hot_idx
 ON public.mv_post_trends_30m (hot_score DESC, post_id);

CREATE UNIQUE INDEX IF NOT EXISTS mv_post_trends_agg_uq
ON public.mv_post_trends_agg (range_label, post_id);

CREATE INDEX IF NOT EXISTS mv_post_trends_agg_hot_idx
ON public.mv_post_trends_agg (range_label, hot_score DESC, post_id);
*/