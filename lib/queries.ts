/**
 * FEEDS – ranking notes (fresh vs ranked)
 *
 * Fresh feed ("최신")
 * - Source: mv_post_trends_30m  (post_snapshots_asset 이후 10분 주기 리프레시)
 * - Fields: 30분 구간 델타와 hot_score_30m (hot_score_30m = views + 3*comments + 2*likes)
 * - Boost : fresh_boost = log1p(hot_score_30m) * 10  // 최신 섹션 가산치
 * - Goal  : 아주 가볍게 최근 스파이크를 감지. 여기서는 강한 정규화/캡을 쓰지 않음.
 *
 * Ranked feed ("추천/랭킹")
 * - Source: mv_post_trends_agg  (post_trends_asset 이후 10분 주기 리프레시; 3h/6h/24h/1w 합산)
 * - Robust normalization (per range r∈{3h,6h,24h,1w}):
 *     median m_r, MAD s_r 기반 + p05/p95 클리핑
 *     z_r    = clamp( (x_r - m_r) / (1.4826*s_r + 1e-6), -3, +3 )
 *     norm_r = (z_r + 3) / 6   // [0,1] 매핑
 * - Combine : 최근 창일수록 가중치가 크도록 w_3h ≥ w_6h ≥ w_24h ≥ w_1w (정확 값은 랭킹 상수 참조)
 * - Dynamic site cap: 사이트 편중을 줄이기 위해 사이트별 노출 상한 동적 산정, 초과분은 "최하 점수"부터 제거
 * - Cooldown: 최근 노출(≈12h)에는 페널티/억제, 20분 이상 공백이면 연속 카운트 리셋
 * - Final score(개념): score = Σ_r w_r * norm_r  → 쿨다운/사이트캡 후 정렬
 *
 * Notes
 * - MV들은 “최종 랭킹”을 계산하지 않고, 빠르게 읽을 재료를 준비한다.
 * - 가중치/캡/쿨다운 상수를 바꿨다면, 이 헤더 주석도 같이 업데이트할 것.
 */
import { db } from "./db";
import { normalizeCrawledHtml } from "./html-normalize";
import { Post } from "./types";
import {
  posts,
  postImages,
  postEmbeds,
  postComments,
  sites,
  keywordTrends,
  clusterTrends,
  clusters,
  clusterRotation,
  postRotation,
  mvPostTrends30m,
  mvPostTrendsAgg,
  postEnrichment,
  postImageEnrichment,
} from "./schema";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { boolean, pgTable, text } from "drizzle-orm/pg-core";

// Locally define cluster_posts based on usage in queries
const clusterPosts = pgTable("cluster_posts", {
  postId: text("post_id").notNull(),
  clusterId: text("cluster_id").notNull(),
  isRepresentative: boolean("is_representative"),
});

// === Main page ranking helpers (site-normalized + decay + depth penalty + site cap) ===
const RANGE_TO_INTERVAL: Record<string, string> = { "3h": "3 hours", "6h": "6 hours", "24h": "24 hours", "1w": "7 days" };
const RANGE_TO_HOURS: Record<string, number> = { "3h": 3, "6h": 6, "24h": 24, "1w": 168 };
const FEED_CONST = {
  FORCED_SCORE: 1e9,
} as const;
type RankedRow = { id: string; site: string; title: string | null; comment_count: number | null; like_count: number | null; view_count: number | null; timestamp: string; score: number };

/**
 * Ranked candidates builder (DB-side robust normalization)
 * Inputs  : mv_post_trends_agg rows for a given range.
 * Steps   :
 *   1) rate     – per-minute rates from deltas (views/comments/likes)
 *   2) log x    – LN(1+rate) stabilizer
 *   3) med/p05/p95 per-site robust center & clipping
 *   4) dev/mad  – deviations then Median Absolute Deviation per site
 *   5) z-scores – per metric; combine as 1.0*view + 2.0*comment + 1.5*like
 *   6) recency  – exp(- age_hours / 6.0) decay (≈6h time constant)
 * Filters: drop items in post_rotation with active suppression for the range.
 * Output : base candidates with `score`; web layer applies site-cap interleaving & hydration.
 */
export function buildRankedCandidatesQuery(
  intervalLiteral: string,
  limit: number,
  rangeLabel: "3h" | "6h" | "24h" | "1w",
) {
  const epochInSeconds = (RANGE_TO_HOURS[rangeLabel] ?? 24) * 3600;

  return sql`
    WITH agg AS (
      SELECT a.post_id, p.site,
             a.window_end AS activity_ts,
             a.view_delta, a.comment_delta, a.like_delta
      FROM mv_post_trends_agg a
      JOIN posts p ON p.id = a.post_id
      WHERE a.range_label = ${rangeLabel}
        AND a.window_end >= NOW() - INTERVAL '${sql.raw(intervalLiteral)}'
    ),
    rate AS (
      SELECT site, post_id, activity_ts,
             (view_delta    / NULLIF(${epochInSeconds},0)) * 60.0 AS view_rate,
             (comment_delta / NULLIF(${epochInSeconds},0)) * 60.0 AS comment_rate,
             (like_delta    / NULLIF(${epochInSeconds},0)) * 60.0 AS like_rate
      FROM agg
    ),
    xr AS (
      SELECT site, post_id, activity_ts,
             LN(1+GREATEST(view_rate,0))    AS x_view,
             LN(1+GREATEST(comment_rate,0)) AS x_comment,
             LN(1+GREATEST(like_rate,0))    AS x_like
      FROM rate
    ),
    med AS (
      SELECT site,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x_view)    AS med_v,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x_comment) AS med_c,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x_like)    AS med_l,
             PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY x_view)    AS p05_v,
             PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY x_view)    AS p95_v,
             PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY x_comment) AS p05_c,
             PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY x_comment) AS p95_c,
             PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY x_like)    AS p05_l,
             PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY x_like)    AS p95_l
      FROM xr GROUP BY site
    ),
    dev AS (
      SELECT r.site, r.post_id, r.activity_ts,
             LEAST(GREATEST(r.x_view,    m.p05_v), m.p95_v)    - m.med_v AS d_view,
             LEAST(GREATEST(r.x_comment, m.p05_c), m.p95_c)    - m.med_c AS d_comment,
             LEAST(GREATEST(r.x_like,    m.p05_l), m.p95_l)    - m.med_l AS d_like
      FROM xr r JOIN med m USING(site)
    ),
    mad AS (
      SELECT site,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ABS(d_view))    AS mad_v,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ABS(d_comment)) AS mad_c,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ABS(d_like))    AS mad_l
      FROM dev GROUP BY site
    ),
    z AS (
      SELECT d.post_id, d.site, d.activity_ts,
             d.d_view    / NULLIF(GREATEST(m.mad_v*1.4826, 0.001),0.001)   AS z_view,
             d.d_comment / NULLIF(GREATEST(m.mad_c*1.4826, 0.001),0.001)   AS z_comment,
             d.d_like    / NULLIF(GREATEST(m.mad_l*1.4826, 0.001),0.001)   AS z_like
      FROM dev d JOIN mad m USING(site)
    ),
    score AS (
      SELECT z.post_id, z.activity_ts,
             (1.0*LEAST(GREATEST(z_view,   -5), 5)
            + 2.0*LEAST(GREATEST(z_comment,-5), 5)
            + 1.5*LEAST(GREATEST(z_like,   -5), 5))*
           EXP(- EXTRACT(EPOCH FROM (NOW()-z.activity_ts))/3600.0 / 6.0) AS base
      FROM z
    ),
    penalty AS (
      SELECT pc.post_id,
             CASE WHEN MAX(pc.depth) FILTER (WHERE pc.timestamp >= NOW() - INTERVAL '${sql.raw(intervalLiteral)}') >= 3
                  THEN 0.9 ELSE 1.0 END AS depth_penalty
      FROM post_comments pc
      GROUP BY pc.post_id
    ),
    cooldown AS (
      SELECT pr.post_id
      FROM post_rotation pr
      WHERE pr.window_label = ${rangeLabel}
        AND pr.suppressed_until IS NOT NULL
        AND pr.suppressed_until >= NOW()
    )
    SELECT p.id, p.site, p.title, p.comment_count, p.like_count, p.view_count, p.timestamp,
           (s.base * COALESCE(pe.depth_penalty,1.0)) AS score
    FROM score s
    JOIN posts p ON p.id = s.post_id
    LEFT JOIN penalty pe ON pe.post_id = p.id
    WHERE p.is_deleted = FALSE
      AND p.id NOT IN (SELECT post_id FROM cooldown)
    ORDER BY score DESC
    LIMIT ${limit}
  `;
}

async function fetchRankedCandidates(
  intervalLiteral: string,
  limit: number,
  rangeLabel: "3h" | "6h" | "24h" | "1w",
): Promise<RankedRow[]> {
  const q = buildRankedCandidatesQuery(intervalLiteral, limit, rangeLabel);
  const res: any = await db.execute(q);
  return (res?.rows ?? res) as RankedRow[];
}


/**
 * 주어진 게시물 목록을 사이트별 비율에 따라 인터리빙합니다.
 * 각 사이트가 전체 결과에서 차지하는 비율을 원래 목록에서의 비율과 유사하게 유지하면서,
 * 사이트별 최대 게시물 수를 제한합니다.
 *
 * 알고리즘:
 * 1. 게시물을 사이트별로 그룹화하고, 각 그룹 내에서 점수 순으로 정렬합니다.
 * 2. 각 사이트의 가중치(게시물 수)를 기반으로 목표 비율을 계산합니다.
 * 3. 매 단계에서, 목표 비율에 가장 미치지 못하는 '결손(deficit)'이 가장 큰 사이트를 선택합니다.
 * 4. 해당 사이트에서 가장 점수가 높은 다음 게시물을 결과 목록에 추가합니다.
 * 5. 이 과정을 결과 목록이 꽉 차거나 모든 사이트가 한도에 도달할 때까지 반복합니다.
 *
 * @param rows - 정렬 및 인터리빙할 게시물 목록. 각 항목은 'site'와 'score' 속성을 가져야 합니다.
 * @param pageSize - 반환할 최대 게시물 수.
 * @param perSiteCap - 사이트당 선택될 수 있는 최대 게시물 수.
 * @returns 인터리빙된 게시물 목록.
 */
function interleaveProportionalCap<T extends { site: string; score?: number }>(rows: T[], pageSize: number, perSiteCap = 3): T[] {
  // 1. 사이트별로 게시물을 그룹화하고 점수 순으로 정렬합니다.
  const postsBySite = new Map<string, T[]>();
  for (const row of rows) {
    const site = row.site ?? "기타";
    if (!postsBySite.has(site)) postsBySite.set(site, []);
    postsBySite.get(site)!.push(row);
  }
  for (const site of postsBySite.keys()) {
    postsBySite.get(site)!.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  // 2. 인터리빙 알고리즘을 위한 변수를 초기화합니다.
  const sites = [...postsBySite.keys()];
  const siteWeights = new Map(sites.map(site => [site, postsBySite.get(site)!.length]));
  const totalWeight = sites.reduce((sum, site) => sum + (siteWeights.get(site) || 0), 0) || 1;

  // 각 사이트의 목표 비율
  const desiredProportions = new Map(sites.map(site => [site, (siteWeights.get(site) || 0) / totalWeight]));

  // 각 사이트에서 이미 선택된 게시물 수
  const itemsTakenPerSite = new Map<string, number>(sites.map(site => [site, 0]));
  // 각 사이트의 다음 게시물을 가리키는 커서
  const cursors = new Map<string, number>(sites.map(site => [site, 0]));

  const interleaved: T[] = [];
  while (interleaved.length < pageSize) {
    let bestSite: string | null = null;
    let maxDeficit = -Infinity;

    // 3. 목표 비율에 가장 못 미치는 사이트를 찾습니다 (가장 큰 결손).
    for (const site of sites) {
      const currentIndex = cursors.get(site)!;
      const sitePosts = postsBySite.get(site)!;
      const takenCount = itemsTakenPerSite.get(site)!;

      // 더 이상 가져올 게시물이 없거나 사이트별 한도에 도달하면 건너뜁니다.
      if (currentIndex >= sitePosts.length || takenCount >= perSiteCap) {
        continue;
      }

      // 결손(deficit) 계산: (목표 수) - (실제 수)
      // 현재 결과 길이에 비례하여 각 사이트가 가져가야 할 목표량을 계산합니다.
      const targetCount = (desiredProportions.get(site) || 0) * (interleaved.length + 1);
      const deficit = targetCount - takenCount;

      if (deficit > maxDeficit) {
        maxDeficit = deficit;
        bestSite = site;
      }
    }

    // 4. 가장 결손이 큰 사이트에서 게시물을 하나 선택합니다.
    if (!bestSite) {
      break; // 선택할 수 있는 사이트가 없으면 종료합니다.
    }

    const postIndex = cursors.get(bestSite)!;
    interleaved.push(postsBySite.get(bestSite)![postIndex]);

    // 커서와 선택된 카운트를 업데이트합니다.
    cursors.set(bestSite, postIndex + 1);
    itemsTakenPerSite.set(bestSite, itemsTakenPerSite.get(bestSite)! + 1);

    // 모든 사이트가 게시물을 소진했거나 한도에 도달했는지 확인합니다.
    const allSitesExhausted = sites.every(s =>
      (cursors.get(s)! >= postsBySite.get(s)!.length) || (itemsTakenPerSite.get(s)! >= perSiteCap)
    );
    if (allSitesExhausted) break;
  }

  return interleaved;
}

// === Dynamic cap helpers ===
/**
 * Dynamic site caps
 * - Estimate site share from candidate mix, then allocate caps ≈ share*pageSize (with +5% slack)
 * - Bound each site to [1, maxPerSiteCap]; used by interleaveWithCaps
 */
function computeDynamicCaps<T extends { site: string }>(rows: T[], pageSize: number, maxPerSiteCap: number) {
  const bySite = new Map<string, number>();
  for (const r of rows) bySite.set(r.site ?? "기타", (bySite.get(r.site ?? "기타") || 0) + 1);
  const total = [...bySite.values()].reduce((a, b) => a + b, 0) || 1;
  const caps = new Map<string, number>();
  for (const [s, c] of bySite) {
    const expect = Math.ceil((c / total) * pageSize * 1.05); // +5% 여유
    caps.set(s, Math.max(1, Math.min(maxPerSiteCap, expect)));
  }
  return caps;
}

/**
 * Interleave with dynamic caps
 * - Greedy pick: at each step choose the site with available cap whose next item has the highest score
 * - Produces diversity while preserving item-level ordering within each site
 */
/**
 * 주어진 게시물 목록을 사이트별 동적 한도(cap)에 따라 인터리빙합니다.
 * 이 함수는 전체적인 점수 순서를 최대한 보존하면서, 각 사이트가 정해진 한도를 넘지 않도록 합니다.
 *
 * 알고리즘:
 * 1. 게시물을 사이트별로 그룹화하고, 각 그룹 내에서 점수 순으로 정렬합니다.
 * 2. 매 단계에서, 아직 한도에 도달하지 않은 모든 사이트의 다음 게시물들을 후보로 간주합니다.
 * 3. 이 후보들 중에서 가장 점수가 높은 게시물을 선택하여 결과 목록에 추가합니다.
 * 4. 이 과정을 결과 목록이 꽉 차거나 더 이상 선택할 수 있는 게시물이 없을 때까지 반복합니다.
 *
 * @param rows - 정렬 및 인터리빙할 게시물 목록.
 * @param pageSize - 반환할 최대 게시물 수.
 * @param caps - 각 사이트별 최대 게시물 수를 정의한 맵.
 * @returns 인터리빙된 게시물 목록.
 */
function interleaveWithCaps<T extends { site: string; score?: number }>(rows: T[], pageSize: number, caps: Map<string, number>): T[] {
  // 1. 사이트별로 게시물을 그룹화하고 점수 순으로 정렬합니다.
  const postsBySite = new Map<string, T[]>();
  for (const row of rows) {
    const site = (row as any).site ?? "기타";
    if (!postsBySite.has(site)) postsBySite.set(site, []);
    postsBySite.get(site)!.push(row);
  }
  for (const site of postsBySite.keys()) {
    postsBySite.get(site)!.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  // 2. 인터리빙 알고리즘을 위한 변수를 초기화합니다.
  const sites = [...postsBySite.keys()];
  const itemsTakenPerSite = new Map<string, number>(sites.map((s) => [s, 0]));
  const cursors = new Map<string, number>(sites.map((s) => [s, 0]));

  const interleaved: T[] = [];
  while (interleaved.length < pageSize) {
    let bestCandidate: T | null = null;
    let bestSite: string | null = null;

    // 3. 모든 사이트의 다음 게시물 중 가장 점수가 높은 것을 찾습니다.
    for (const site of sites) {
      const siteCap = caps.get(site) ?? 0;
      const takenCount = itemsTakenPerSite.get(site)!;
      const currentIndex = cursors.get(site)!;
      const sitePosts = postsBySite.get(site)!;

      // 사이트 한도에 도달했거나 더 이상 게시물이 없으면 건너뜁니다.
      if (takenCount >= siteCap || currentIndex >= sitePosts.length) {
        continue;
      }

      const candidate = sitePosts[currentIndex];
      if ((candidate.score ?? 0) > (bestCandidate?.score ?? -Infinity)) {
        bestCandidate = candidate;
        bestSite = site;
      }
    }

    // 4. 가장 점수가 높은 후보를 결과에 추가합니다.
    if (bestCandidate && bestSite) {
      interleaved.push(bestCandidate);
      cursors.set(bestSite, cursors.get(bestSite)! + 1);
      itemsTakenPerSite.set(bestSite, itemsTakenPerSite.get(bestSite)! + 1);
    } else {
      // 더 이상 선택할 후보가 없으면 종료합니다.
      break;
    }
  }
  return interleaved;
}

// === Post rotation cooldown constants & recorder ===
const POST_ROTATION_MAX_CONSECUTIVE = 3;
const POST_ROTATION_COOLDOWN_HOURS = 12;
const POST_ROTATION_CONSEC_RESET_MINUTES = 20;

const CLUSTER_ROTATION_MAX_CONSECUTIVE = 3;
const CLUSTER_ROTATION_COOLDOWN_HOURS = 24;
const CLUSTER_ROTATION_CONSEC_RESET_MINUTES = 20;

async function recordClusterRotation(
  range: "3h" | "6h" | "24h" | "1w",
  selections: Array<{ clusterId: string, score: number }>,
) {
  if (!selections?.length) return;
  for (const s of selections) {
    const q = sql`
      INSERT INTO cluster_rotation (cluster_id, window_label, consecutive_hits, last_shown_at, suppressed_until, last_score)
      VALUES (${s.clusterId}, ${range}, 1, NOW(), NULL, ${Number.isFinite(s.score) ? s.score : 0})
      ON CONFLICT (cluster_id, window_label) DO UPDATE SET
        consecutive_hits = CASE
          WHEN cluster_rotation.last_shown_at IS NOT NULL
           AND cluster_rotation.last_shown_at >= NOW() - INTERVAL \'${sql.raw(`${CLUSTER_ROTATION_CONSEC_RESET_MINUTES} minutes`)}\'
            THEN LEAST(cluster_rotation.consecutive_hits + 1, ${CLUSTER_ROTATION_MAX_CONSECUTIVE})
          ELSE 1
        END,
        last_shown_at = NOW(),
        last_score = EXCLUDED.last_score,
        suppressed_until = CASE
          WHEN (
            CASE
              WHEN cluster_rotation.last_shown_at IS NOT NULL
               AND cluster_rotation.last_shown_at >= NOW() - INTERVAL \'${sql.raw(`${CLUSTER_ROTATION_CONSEC_RESET_MINUTES} minutes`)}\'
                THEN cluster_rotation.consecutive_hits + 1
              ELSE 1
            END
          ) >= ${CLUSTER_ROTATION_MAX_CONSECUTIVE}
          THEN NOW() + INTERVAL \'${sql.raw(`${CLUSTER_ROTATION_COOLDOWN_HOURS} hours`)}\'
          ELSE NULL
        END
    `;
    await db.execute(q);
  }
}

/**
 * Post rotation recorder (cooldown bookkeeping)
 * - consecutive_hits increments if the previous show was within POST_ROTATION_CONSEC_RESET_MINUTES; otherwise resets to 1
 * - when hits >= POST_ROTATION_MAX_CONSECUTIVE, apply cooldown ≈ POST_ROTATION_COOLDOWN_HOURS
 */
async function recordPostRotation(range: "3h" | "6h" | "24h" | "1w", selections: Array<{ id: string, score: number }>) {
  if (!selections?.length) return;
  for (const s of selections) {
    const q = sql`
      INSERT INTO post_rotation (post_id, window_label, consecutive_hits, last_shown_at, suppressed_until, last_score)
      VALUES (${s.id}, ${range}, 1, NOW(), NULL, ${Number.isFinite(s.score) ? s.score : 0})
      ON CONFLICT (post_id, window_label) DO UPDATE SET
        consecutive_hits = CASE
          WHEN post_rotation.last_shown_at IS NOT NULL AND post_rotation.last_shown_at >= NOW() - INTERVAL \'${sql.raw(`${POST_ROTATION_CONSEC_RESET_MINUTES} minutes`)}\'
            THEN LEAST(post_rotation.consecutive_hits + 1, ${POST_ROTATION_MAX_CONSECUTIVE})
          ELSE 1
        END,
        last_shown_at = NOW(),
        last_score = EXCLUDED.last_score,
        suppressed_until = CASE
          WHEN (
            CASE
              WHEN post_rotation.last_shown_at IS NOT NULL AND post_rotation.last_shown_at >= NOW() - INTERVAL \'${sql.raw(`${POST_ROTATION_CONSEC_RESET_MINUTES} minutes`)}\'
                THEN post_rotation.consecutive_hits + 1
              ELSE 1
            END
          ) >= ${POST_ROTATION_MAX_CONSECUTIVE}
          THEN NOW() + INTERVAL \'${sql.raw(`${POST_ROTATION_COOLDOWN_HOURS} hours`)}\'
          ELSE NULL
        END
    `;
    await db.execute(q);
  }
}

export async function getSites() {
  // 전체 사이트 목록 조회 (활성화된 것만)
  return db.select({
    id: sites.id,
    board: sites.board,
    name: sites.name,
  }).from(sites).where(eq(sites.isActive, true));
}

export async function getRecentPosts(limit = 20) {
  // 최신 게시글 N개 조회 (삭제된 글 제외)
  return db.select()
    .from(posts)
    .where(eq(posts.isDeleted, false))
    .orderBy(desc(posts.timestamp))
    .limit(limit);
}

// 대표 이미지 포함 게시글 조회
export async function getRecentPostsWithImage(limit = 20) {
  // posts의 주요 컬럼 + postImages.url as image
  const rows = await db.select({
    id: posts.id,
    title: posts.title,
    site: posts.site,
    commentCount: posts.commentCount,
    likeCount: posts.likeCount,
    viewCount: posts.viewCount,
    timestamp: posts.timestamp,
    image: postImages.url,
  })
    .from(posts)
    .leftJoin(postImages, eq(posts.id, postImages.postId))
    .where(eq(posts.isDeleted, false))
    .orderBy(desc(posts.timestamp))
    .limit(limit);
  return rows;
}

export async function getAllPostIds() {
  // 모든 게시글 id만 반환 (SSG용)
  const rows = await db.select({ id: posts.id }).from(posts).where(eq(posts.isDeleted, false));
  return rows.map((row) => row.id);
}

export async function getPostDetail(id: string) {
  // 기본 본문 + 사이트/LLM enrichment
  const [row] = await db
    .select({
      id: posts.id,
      postId: posts.postId,
      site: posts.site,
      board: posts.board,
      url: posts.url,
      title: posts.title,
      author: posts.author,
      avatar: posts.avatar,
      timestamp: posts.timestamp,
      content: posts.content,
      contentHtml: posts.contentHtml,
      commentCount: posts.commentCount,
      likeCount: posts.likeCount,
      viewCount: posts.viewCount,
      siteName: sites.name,
      categories: postEnrichment.fusedCategories,
      keywords: postEnrichment.fusedKeywords,
    })
    .from(posts)
    .leftJoin(sites, and(eq(posts.site, sites.id), eq(posts.board, sites.board)))
    .leftJoin(postEnrichment, eq(postEnrichment.postId, posts.id))
    .where(eq(posts.id, id))
    .limit(1);

  if (!row) return null;

  // timestamp 문자열화
  const safePost = {
    ...row,
    timestamp: typeof row.timestamp === "string" ? row.timestamp : row.timestamp?.toISOString?.() ?? "",
  };

  // 이미지/임베드/댓글
  const images = await db.select().from(postImages).where(eq(postImages.postId, id));
  const embeds = await db.select().from(postEmbeds).where(eq(postEmbeds.postId, id));
  const comments = await db
    .select()
    .from(postComments)
    .where(and(eq(postComments.postId, id), eq(postComments.isDeleted, false)))
    .orderBy(desc(postComments.timestamp));

  const imageEnrichments = await db.select().from(postImageEnrichment).where(eq(postImageEnrichment.postId, id));

  const processedContentHtml = row.contentHtml;

  const safeImageEnrichments = imageEnrichments.map((item: any) => ({
    ...item,
    embedding: null,
    enrichedAt: typeof item?.enrichedAt === 'string'
      ? item.enrichedAt
      : item?.enrichedAt?.toISOString?.() ?? null,
  }));

  const imageEnrichmentUpdatedAt = safeImageEnrichments.reduce<string | null>((latest, item) => {
    const ts = typeof item?.enrichedAt === 'string' ? item.enrichedAt : null;
    if (!ts) return latest;
    if (!latest) return ts;
    return ts > latest ? ts : latest;
  }, null);

  const formattedComments = comments.map((c) => ({
    id: c.id,
    parentId: c.parentId,
    depth: c.depth,
    path: c.path,
    author: c.author,
    avatar: c.avatar,
    contentHtml: c.contentHtml,
    content: c.content,
    timestamp: typeof c.timestamp === "string" ? c.timestamp : c.timestamp.toISOString(),
    likeCount: c.likeCount ?? 0,
  }));

  // 트리 구성
  const sortedComments = [...formattedComments].sort((a, b) => (a.path ?? "").localeCompare(b.path ?? ""));
  const nestedComments: typeof formattedComments = [];
  const stack: Array<any> = [];
  for (const comment of sortedComments) {
    const node = { ...comment, replies: [] as any[] };
    while (stack.length > (comment.depth ?? 0)) stack.pop();
    if (stack.length === 0) nestedComments.push(node); else stack[stack.length - 1].replies.push(node);
    stack.push(node);
  }

  // 클러스터 정보(있다면 멤버 목록 포함)
  const [clusterInfo] = await db
    .select({ clusterId: clusterPosts.clusterId })
    .from(clusterPosts)
    .where(eq(clusterPosts.postId, id))
    .limit(1);
  const clusterId: string | null = clusterInfo?.clusterId ?? null;

  let clusterMembers: Array<{ id: string; title: string; site: string; siteName?: string | null; timestamp: string }> = [];
  if (clusterId) {
    const mRes = await db
      .select({
        id: posts.id,
        title: posts.title,
        site: posts.site,
        timestamp: posts.timestamp,
        siteName: sites.name,
        pri: sql<number>`CASE WHEN ${clusterPosts.isRepresentative} THEN 0 ELSE 1 END`,
      })
      .from(clusterPosts)
      .innerJoin(posts, eq(posts.id, clusterPosts.postId))
      .leftJoin(sites, and(eq(sites.id, posts.site), eq(sites.board, posts.board)))
      .where(and(eq(clusterPosts.clusterId, clusterId), eq(posts.isDeleted, false)))
      .orderBy(sql`CASE WHEN ${clusterPosts.isRepresentative} THEN 0 ELSE 1 END`, desc(posts.timestamp))
      .limit(30);

    clusterMembers = mRes.map((r: any) => ({
      id: r.id,
      title: r.title,
      site: r.site,
      siteName: r.siteName,
      timestamp: typeof r.timestamp === "string" ? r.timestamp : r.timestamp?.toISOString?.() ?? "",
    }));
  }

  return {
    ...safePost,
    contentHtml: typeof processedContentHtml === 'string' ? normalizeCrawledHtml(processedContentHtml) : processedContentHtml,
    images,
    embeds,
    comments: nestedComments,
    categories: safePost.categories ?? [],
    keywords: safePost.keywords ?? [],
    clusterId,
    clusterMembers,
    imageEnrichments: safeImageEnrichments,
    imageEnrichmentUpdatedAt,
  };
}

// === 관련 게시글: enrichment 기반 유사도 + 같은 게시판/사이트/최신글 ===
export async function getRelatedPosts(postId: string, limit = 8) {
  const q = sql`
    WITH me AS (
      SELECT p.id, p.site, p.board,
             COALESCE(pe.fused_categories,'[]'::jsonb) AS categories,
             COALESCE(pe.fused_keywords,'[]'::jsonb)   AS keywords
      FROM posts p
      LEFT JOIN post_enrichment pe ON pe.post_id = p.id
      WHERE p.id = ${postId}
      LIMIT 1
    ),
    kw AS (
      SELECT DISTINCT x AS kw FROM me, LATERAL jsonb_array_elements_text(me.keywords) AS x
      UNION
      SELECT DISTINCT x AS kw FROM me, LATERAL jsonb_array_elements_text(me.categories) AS x
    ),
    cand AS (
      SELECT p.id, p.title, p.site, p.board, p.timestamp,
             s.name AS site_name,
             COALESCE(pe.fused_categories,'[]'::jsonb) AS categories,
             COALESCE(pe.fused_keywords,'[]'::jsonb)   AS keywords
      FROM posts p
      LEFT JOIN post_enrichment pe ON pe.post_id = p.id
      LEFT JOIN sites s ON s.id = p.site AND s.board = p.board
      WHERE p.is_deleted = FALSE AND p.id <> ${postId}
      ORDER BY p.timestamp DESC
      LIMIT 500
    )
    SELECT c.id, c.title, c.site, c.board, c.timestamp, c.site_name,
           (SELECT COALESCE(SUM( (c.keywords ? k.kw)::int + (c.categories ? k.kw)::int ),0) FROM kw k) AS overlap,
           (SELECT CASE WHEN c.site = me.site THEN TRUE ELSE FALSE END FROM me)   AS same_site,
           (SELECT CASE WHEN c.board = me.board THEN TRUE ELSE FALSE END FROM me) AS same_board
    FROM cand c
    ORDER BY overlap DESC, same_board DESC, c.timestamp DESC
    LIMIT ${limit}
  `;
  const res: any = await db.execute(q);
  const rows = (res?.rows ?? res) as any[];
  return rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    site: r.site,
    siteName: r.site_name,
    timestamp: typeof r.timestamp === "string" ? r.timestamp : r.timestamp?.toISOString?.() ?? "",
    overlap: Number(r.overlap) || 0,
    sameSite: !!r.same_site,
    sameBoard: !!r.same_board,
  }));
}

// Hydrate posts by ids (with image/cluster meta, YouTube/mp4/image priority)
export async function hydratePosts(ids: string[]) {
  if (!ids.length) return [];

  const rows = await db
    .select({
      id: posts.id,
      url: posts.url,
      title: posts.title,
      site: posts.site,
      commentCount: posts.commentCount,
      likeCount: posts.likeCount,
      viewCount: posts.viewCount,
      timestamp: posts.timestamp,
      siteName: sites.name,
      boardName: sites.boardName,
      content: posts.content,
      clusterId: clusterPosts.clusterId,
      clusterSize: clusters.size,
      hasYouTube: sql<boolean>`EXISTS(SELECT 1 FROM ${postEmbeds} e WHERE e.post_id = ${posts.id} AND e.type = 'youtube')`,
      hasX: sql<boolean>`EXISTS(SELECT 1 FROM ${postEmbeds} e WHERE e.post_id = ${posts.id} AND e.type = 'X')`,
      yt_thumb: sql<string>`(SELECT e.thumbnail FROM ${postEmbeds} e WHERE e.post_id = ${posts.id} AND e.type = 'youtube' AND e.thumbnail IS NOT NULL ORDER BY (CASE WHEN POSITION(e.url IN COALESCE(${posts.content}, '')) > 0 THEN 0 ELSE 1 END), (e.thumbnail IS NULL), e.url ASC LIMIT 1)`,
      yt_url: sql<string>`(SELECT e.url FROM ${postEmbeds} e WHERE e.post_id = ${posts.id} AND e.type = 'youtube' ORDER BY (CASE WHEN POSITION(e.url IN COALESCE(${posts.content}, '')) > 0 THEN 0 ELSE 1 END), (e.thumbnail IS NULL), e.url ASC LIMIT 1)`,
      x_thumb: sql<string>`(SELECT e.thumbnail FROM ${postEmbeds} e WHERE e.post_id = ${posts.id} AND e.type = 'X' AND e.thumbnail IS NOT NULL ORDER BY (CASE WHEN POSITION(e.url IN COALESCE(${posts.content}, '')) > 0 THEN 0 ELSE 1 END), e.url ASC LIMIT 1)`,
      x_url: sql<string>`(SELECT e.url FROM ${postEmbeds} e WHERE e.post_id = ${posts.id} AND e.type = 'X' ORDER BY (CASE WHEN POSITION(e.url IN COALESCE(${posts.content}, '')) > 0 THEN 0 ELSE 1 END), e.url ASC LIMIT 1)`,
      mp4_url: sql<string>`(SELECT e.url FROM ${postEmbeds} e WHERE e.post_id = ${posts.id} AND e.type IN ('video','mp4') ORDER BY (CASE WHEN POSITION(e.url IN COALESCE(${posts.content}, '')) > 0 THEN 0 ELSE 1 END), e.url ASC LIMIT 1)`,
      img_url: sql<string>`(SELECT url FROM ${postImages} WHERE post_id = ${posts.id} ORDER BY width DESC NULLS LAST, url ASC LIMIT 1)`,
    })
    .from(posts)
    .leftJoin(sites, and(eq(posts.site, sites.id), eq(posts.board, sites.board)))
    .leftJoin(clusterPosts, eq(clusterPosts.postId, posts.id))
    .leftJoin(clusters, eq(clusters.id, clusterPosts.clusterId))
    .where(and(inArray(posts.id, ids), eq(posts.isDeleted, false)));

  const hmap = new Map(rows.map((r) => [r.id, r]));

  // inArray doesn't preserve order, so we map back to the original order
  const hydrated: Post[] = [];
  for (const id of ids) {
    const r = hmap.get(id);
    if (!r) continue;

    const image = r.yt_thumb || r.x_thumb || r.img_url || null;
    const hoverPlayerKind = r.yt_url ? "youtube" : r.x_url ? "x" : r.mp4_url ? "mp4" : null;
    const hoverPlayerUrl = r.yt_url || r.x_url || r.mp4_url || null;

    hydrated.push({
      id: r.id,
      url: r.url ?? "",
      title: r.title ?? "",
      community: r.site,
      communityId: r.site,
      communityLabel: r.siteName || r.site,
      boardLabel: r.boardName ?? null,
      comments: r.commentCount ?? 0,
      upvotes: r.likeCount ?? 0,
      viewCount: r.viewCount ?? 0,
      timestamp: typeof r.timestamp === "string" ? r.timestamp : r.timestamp?.toISOString?.() ?? "",
      timeAgo:
        typeof r.timestamp === "string"
          ? new Date(r.timestamp).toLocaleString("ko-KR", {
            year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
          })
          : r.timestamp?.toLocaleString?.("ko-KR", {
            year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
          }) ?? "",
      thumbnail: image,
      content: r.content ?? null,
      embed: hoverPlayerKind && hoverPlayerUrl ? { type: hoverPlayerKind, url: hoverPlayerUrl } : undefined,
      hasYouTube: r.hasYouTube,
      hasX: r.hasX,
      hoverPlayerKind,
      hoverPlayerUrl,
      clusterId: r.clusterId ?? null,
      clusterSize: r.clusterSize ?? null,
    });
  }

  return hydrated;
}

// ======================================================================================
// Refactored getMainPagePosts and its helpers
// ======================================================================================

type GetMainPagePostsOptions = {
  range?: "3h" | "6h" | "24h" | "1w";
  pageSize?: number;
  perSiteCap?: number;
  mode?: "ranked" | "fresh";
  excludeIds?: string[];
  forcedPostIds?: string[];
};

/**
 * 메인 페이지에 표시할 게시글 목록을 가져옵니다.
 * ranked 모드와 fresh 모드를 지원하며, 내부적으로 각각의 로직을 처리하는 헬퍼 함수를 호출합니다.
 */
export async function getMainPagePosts(options: GetMainPagePostsOptions = {}) {
  const { mode = "ranked", ...rest } = options;

  if (mode === "ranked") {
    return _getMainPagePostsRanked(rest);
  }
  return _getMainPagePostsFresh(rest);
}

/**
 * [HELPER] ranked 모드의 메인 페이지 게시글을 가져옵니다.
 * 복잡한 랭킹 로직, 클러스터 중복 제거, 동적 사이트 캡 등을 포함합니다.
 */
async function _getMainPagePostsRanked({
  range = "24h",
  pageSize = 30,
  perSiteCap = 6,
  excludeIds = [],
  forcedPostIds = [],
}: Omit<GetMainPagePostsOptions, "mode">) {
  const intervalLiteral = RANGE_TO_INTERVAL[range] ?? "24 hours";
  const excludeSet = new Set(excludeIds);
  const forcedSet = new Set(forcedPostIds);

  // 1) 기본 후보군 가져오기 (버퍼를 크게 잡고, 나중에 중복 제거/캡 적용)
  const base = await fetchRankedCandidates(intervalLiteral, pageSize * 8, range);
  const rows = base.filter((r) => !excludeSet.has(r.id));
  try { console.log(`[getMainPagePosts][ranked ${range}] base=${base.length} afterExclude=${rows.length}`); } catch { }

  const debugRanked = (() => {
    const flag = (process.env.DEBUG_RANKED_FEED ?? "").toLowerCase();
    return ["1", "true", "yes", "on"].includes(flag);
  })();
  if (base.length === 0 || rows.length < pageSize || debugRanked) {
    try {
      const mvRes: any = await db.execute(
        sql`SELECT COUNT(*) AS cnt, MAX(window_end) AS max_ts FROM mv_post_trends_agg WHERE range_label = ${range}`,
      );
      const mvDiag = (mvRes?.rows ?? mvRes)?.[0] ?? null;
      console.log(`[getMainPagePosts][ranked ${range}] mv_diag`, mvDiag);

      const srcRes: any = await db.execute(sql`SELECT MAX(window_end) AS max_ts FROM post_trends`);
      const srcDiag = (srcRes?.rows ?? srcRes)?.[0] ?? null;
      console.log(`[getMainPagePosts][ranked ${range}] post_trends_diag`, srcDiag);
    } catch (err) {
      if (debugRanked) {
        console.error(`[getMainPagePosts][ranked ${range}] diag_failed`, err);
      }
    }
  }

  // 강제 포함 후보군 (쿨다운/시간 창 무시)
  let forcedRows: RankedRow[] = [];
  if (forcedSet.size > 0) {
    const qf = sql`
      SELECT p.id, p.site, p.title, p.comment_count, p.like_count, p.view_count, p.timestamp,
             ${FEED_CONST.FORCED_SCORE}::float8 AS score
      FROM posts p
      WHERE ${inArray(posts.id, [...forcedSet])} AND p.is_deleted = FALSE
    `;
    const rf: any = await db.execute(qf);
    forcedRows = (rf?.rows ?? rf) as RankedRow[];
    try { console.log(`[getMainPagePosts][ranked ${range}] forcedRows=${forcedRows.length}`); } catch { }
  }

  // 강제 포함 게시물과 일반 게시물 병합 (점수가 높은 쪽 우선)
  const mergedMap = new Map<string, RankedRow>();
  for (const r of [...forcedRows, ...rows]) {
    const prev = mergedMap.get(r.id);
    if (!prev || (r.score ?? 0) > (prev.score ?? 0)) mergedMap.set(r.id, r);
  }
  const rowsMerged = [...mergedMap.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  try { console.log(`[getMainPagePosts][ranked ${range}] merged=${rowsMerged.length}`); } catch { }

  // 2) 클러스터 맵 로드 및 쿨다운 적용
  const ids = rowsMerged.map((r) => r.id);
  const [cmap, suppressed] = await Promise.all([
    loadClusterMap(ids),
    loadSuppressedClusters(range),
  ]);

  // 3) 클러스터별 중복 제거 (클러스터당 가장 점수 높은 글만 남김), 쿨다운된 클러스터 제거
  const takenCluster = new Set<string>();
  const dedup: typeof rowsMerged = [];
  for (const r of rowsMerged) {
    const meta = cmap.get(r.id);
    const isForced = forcedSet.has(r.id);
    if (meta?.clusterId) {
      if (!isForced && suppressed.has(meta.clusterId)) continue;
      if (takenCluster.has(meta.clusterId)) continue;
      takenCluster.add(meta.clusterId);
    }
    dedup.push(r);
    if (dedup.length >= pageSize * 3) break;
  }

  // 4) 동적 캡 계산 및 인터리빙
  const caps = computeDynamicCaps(dedup, pageSize, perSiteCap);
  try { console.log(`[getMainPagePosts][ranked ${range}] dedup=${dedup.length} sites=${[...new Set(dedup.map(r => r.site))].length}`); } catch { }
  const inter = interleaveWithCaps(dedup, pageSize, caps);
  const selected = inter.slice(0, pageSize);

  // 5) 선택된 게시물에 대한 로테이션 기록
  const selIds = selected.map((r) => r.id);
  const selMap = await loadClusterMap(selIds);
  const clusterSelections: Array<{ clusterId: string; score: number }> = [];
  selIds.forEach((id, index) => {
    const meta = selMap.get(id);
    if (!meta?.clusterId) return;
    clusterSelections.push({
      clusterId: meta.clusterId,
      score: selected[index]?.score ?? 0,
    });
  });

  await recordClusterRotation(range, clusterSelections);
  await recordPostRotation(range, selected.map((r) => ({ id: r.id, score: r.score })));

  // 6) UI에 필요한 전체 데이터 하이드레이션
  try { console.log(`[getMainPagePosts][ranked ${range}] final=${selected.length}`); } catch { }
  return hydratePosts(selIds);
}

/**
 * [HELPER] fresh 모드의 메인 페이지 게시글을 가져옵니다.
 * 최신 트렌드 점수를 기반으로 하며, 클러스터 중복 제거 및 사이트 캡을 적용합니다.
 */
async function _getMainPagePostsFresh({
  range = "24h",
  pageSize = 30,
  perSiteCap = 6,
  excludeIds = [],
  forcedPostIds = [],
}: Omit<GetMainPagePostsOptions, "mode">) {
  const hours = RANGE_TO_HOURS[range] ?? 24;
  const excludeSet = new Set(excludeIds);
  const forcedSet = new Set(forcedPostIds);

  const FRESH_K_BY_RANGE: Record<string, number> = { '3h': 10, '6h': 8, '24h': 6, '1w': 4 };
  const K = FRESH_K_BY_RANGE[range] ?? 6;
  const DECAY = 24; // hours

  const q = sql`
    WITH base AS (
      SELECT p.id, p.title, p.site, p.comment_count, p.like_count, p.view_count, p.timestamp,
             s.name AS site_name, s.board_name,
             p.content,
             COALESCE(m.hot_score, 0) AS hot30,
             (EXTRACT(EPOCH FROM (NOW() - p.timestamp)) / 3600.0) AS age_hours
      FROM posts p
      LEFT JOIN sites s ON s.id = p.site AND s.board = p.board
      LEFT JOIN mv_post_trends_30m m ON m.post_id = p.id
      WHERE p.is_deleted = FALSE
        AND p.timestamp >= NOW() - INTERVAL \'${sql.raw(`${hours} hours`)}\'
    )
    SELECT *,
           ((COALESCE(like_count,0)*3 + COALESCE(comment_count,0)*2 + COALESCE(view_count,0))
            + LN(1+GREATEST(hot30,0)) * ${K} * EXP(- age_hours / ${DECAY})) AS score
    FROM base
    ORDER BY score DESC
    LIMIT ${pageSize * 8}
  `;
  const res: any = await db.execute(q);
  const fresh = (res?.rows ?? res) as any[];
  const freshRows = fresh.filter((r) => !excludeSet.has(r.id));
  try { console.log(`[getMainPagePosts][fresh ${range}] base=${fresh.length} afterExclude=${freshRows.length}`); } catch { }

  // 클러스터 중복 제거 (쿨다운 없이 다양성만 확보)
  const cmap = await loadClusterMap(freshRows.map((r) => r.id));
  const seenC = new Set<string>();
  let dedupFresh: Array<{ id: string; site: string; score: number }> = [];
  for (const r of freshRows) {
    const meta = cmap.get(r.id);
    if (meta?.clusterId) {
      if (seenC.has(meta.clusterId)) continue;
      seenC.add(meta.clusterId);
    }
    dedupFresh.push({ id: r.id, site: r.site, score: r.score });
    if (dedupFresh.length >= pageSize * 3) break;
  }

  // 강제 포함 게시물 주입
  if (forcedSet.size > 0) {
    const qf = sql`
      SELECT p.id, p.site, ${FEED_CONST.FORCED_SCORE}::float8 AS score
      FROM posts p
      WHERE ${inArray(posts.id, [...forcedSet])} AND p.is_deleted = FALSE
    `;
    const rf: any = await db.execute(qf);
    const forcedSmall = (rf?.rows ?? rf) as Array<{ id: string; site: string; score: number }>;

    const map = new Map<string, { id: string; site: string; score: number }>();
    for (const r of [...forcedSmall, ...dedupFresh]) {
      const prev = map.get(r.id);
      if (!prev || (r.score ?? 0) > (prev.score ?? 0)) map.set(r.id, r);
    }
    dedupFresh = [...map.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  const caps = computeDynamicCaps(dedupFresh, pageSize, perSiteCap);
  const inter = interleaveWithCaps(dedupFresh, pageSize, caps);
  const selIds = inter.slice(0, pageSize).map((r) => r.id);
  try { console.log(`[ getMainPagePosts][fresh ${range}] dedup=${dedupFresh.length} final=${selIds.length}`); } catch { }
  return hydratePosts(selIds);
}

/**
 * [HELPER] 주어진 ID 목록에 대한 클러스터 정보를 로드합니다.
 */
async function loadClusterMap(ids: string[]) {
  if (!ids.length) return new Map<string, { clusterId: string; size: number; isRep: boolean }>();

  const rows = await db
    .select({
      postId: clusterPosts.postId,
      clusterId: clusterPosts.clusterId,
      isRepresentative: clusterPosts.isRepresentative,
      size: clusters.size,
    })
    .from(clusterPosts)
    .innerJoin(clusters, eq(clusters.id, clusterPosts.clusterId))
    .where(inArray(clusterPosts.postId, ids));

  const map = new Map<string, { clusterId: string; size: number; isRep: boolean }>();
  for (const r of rows) {
    map.set(r.postId, {
      clusterId: r.clusterId,
      size: r.size ?? 0,
      isRep: !!r.isRepresentative,
    });
  }
  return map;
}

/**
 * [HELPER] 특정 시간 범위에 대해 현재 쿨다운 상태인 클러스터 ID 목록을 로드합니다.
 */
async function loadSuppressedClusters(range: "3h" | "6h" | "24h" | "1w") {
  const q = sql`
    SELECT cluster_id FROM cluster_rotation
    WHERE window_label = ${range}
      AND suppressed_until IS NOT NULL
      AND suppressed_until >= NOW()
  `;
  const res: any = await db.execute(q);
  return new Set<string>((res?.rows ?? res).map((r: any) => r.cluster_id));
}


// 클러스터 상위 대표글 (섹션 간 중복/유사 포스트 방지)
export async function getClusterTopPosts({
  range = "24h",
  pageSize = 30,
  perSiteCap = 6,
  excludeIds = [],
}: {
  range?: "3h" | "6h" | "24h" | "1w";
  pageSize?: number;
  perSiteCap?: number;
  excludeIds?: string[];
} = {}) {
  const intervalLiteral = RANGE_TO_INTERVAL[range] ?? "24 hours";
  const excludeSet = new Set(excludeIds || []);
  const BATCH = pageSize * 10;

  const q = sql`
    WITH recent AS (
      SELECT ct.cluster_id, MAX(ct.hot_score) AS hot, MAX(ct.window_end) AS last_end
      FROM cluster_trends ct
      WHERE ct.window_end >= NOW() - INTERVAL \'${sql.raw(intervalLiteral)}\'
      GROUP BY ct.cluster_id
    ),
    filtered AS (
      SELECT r.cluster_id, r.hot
      FROM recent r
      LEFT JOIN cluster_rotation cr
        ON cr.cluster_id = r.cluster_id AND cr.window_label = ${range}
      WHERE cr.suppressed_until IS NULL OR cr.suppressed_until < NOW()
    )
    SELECT
      c.id                 AS cluster_id,
      c.size               AS cluster_size,
      p.id,
      p.title,
      p.site,
      p.comment_count      AS "commentCount",
      p.like_count         AS "likeCount",
      p.timestamp,
      s.name               AS "siteName",
      f.hot                AS score
    FROM filtered f
    JOIN clusters c ON c.id = f.cluster_id
    JOIN posts p ON p.id = c.representative_post_id
    LEFT JOIN sites s ON s.id = p.site AND s.board = p.board
    WHERE p.is_deleted = FALSE
    ORDER BY f.hot DESC
    LIMIT ${BATCH};
  `;
  const res: any = await db.execute(q);
  const rows: Array<{ id: string; title: string | null; site: string; commentCount: number | null; likeCount: number | null; timestamp: string; siteName: string | null; score: number; cluster_id: string; cluster_size: number; }> = (res?.rows ?? res) as any;

  if (!rows?.length) {
    try {
      console.log(`[getClusterTopPosts][${range}] base=0 (no clusters returned)`);
    } catch {
      // ignore
    }
    return [];
  }

  // 교차 섹션 중복 제거 후, 사이트 비례 인터리빙
  const filteredRows = rows.filter((r) => !excludeSet.has(r.id));
  const droppedByExclude = rows.length - filteredRows.length;

  try {
    console.log(
      `[getClusterTopPosts][${range}] base=${rows.length} excludeSet=${excludeSet.size} dropped=${droppedByExclude}`
    );
  } catch {
    // ignore
  }

  const filtered = filteredRows.map((r: any) => ({
    ...r,
    clusterId: r.cluster_id,
    clusterSize: r.cluster_size,
  }));
  const picked = interleaveProportionalCap(filtered, pageSize, perSiteCap);

  try {
    console.log(
      `[getClusterTopPosts][${range}] filtered=${filtered.length} picked=${picked.length} pageSize=${pageSize} perSiteCap=${perSiteCap}`
    );
  } catch {
    // ignore
  }

  const ids = picked.map((r: any) => r.id);
  if (ids.length === 0) return [];

  const clusterSelections = picked
    .filter((r: any) => r.clusterId)
    .map((r: any) => ({
      clusterId: r.clusterId,
      score: r.score ?? 0,
    }));
  const postSelections = picked.map((r: any) => ({ id: r.id, score: r.score ?? 0 }));

  await recordClusterRotation(range, clusterSelections);
  await recordPostRotation(range, postSelections);

  const hydrated = await hydratePosts(ids);
  const hmap = new Map(hydrated.map((h: any) => [h.id, h]));
  return picked.map((p: any) => ({
    ...p,
    ...(hmap.get(p.id) || {}),
  }));
}

// 24h home stats for SSG (posts / comments / active unique commenters)
export async function getHomeStats24h() {
  try {
    const intervals = {
      '24h': sql`INTERVAL '24 hours'`,
      '30m': sql`INTERVAL '30 minutes'`,
    };

    const getCount = async (table: 'posts' | 'post_comments', interval: '24h' | '30m') => {
      const q = sql`SELECT COUNT(*)::int AS cnt FROM ${sql.raw(table)} WHERE is_deleted = FALSE AND timestamp >= NOW() - ${intervals[interval]}`;
      const result: any = await db.execute(q);
      const rows = result?.rows ?? result;
      return rows?.[0]?.cnt ?? 0;
    };

    const getActiveUsers = async (interval: '24h' | '30m') => {
      const q = sql`SELECT COUNT(DISTINCT author)::int AS cnt FROM post_comments WHERE is_deleted = FALSE AND author IS NOT NULL AND author <> '' AND timestamp >= NOW() - ${intervals[interval]}`;
      const result: any = await db.execute(q);
      const rows = result?.rows ?? result;
      return rows?.[0]?.cnt ?? 0;
    };

    const [posts_current, posts_recent, comments_current, comments_recent, active_current, active_recent] = await Promise.all([
      getCount('posts', '24h'),
      getCount('posts', '30m'),
      getCount('post_comments', '24h'),
      getCount('post_comments', '30m'),
      getActiveUsers('24h'),
      getActiveUsers('30m'),
    ]);

    return {
      posts: {
        current: posts_current,
        previous: posts_current - posts_recent,
        ratePerMinute: posts_recent / 30,
      },
      comments: {
        current: comments_current,
        previous: comments_current - comments_recent,
        ratePerMinute: comments_recent / 30,
      },
      activeUsers: {
        current: active_current,
        previous: active_current - active_recent,
        ratePerMinute: active_recent / 30,
      },
    };

  } catch (error) {
    console.error("Error fetching simplified home stats:", error);
    return {
      posts: { current: 0, previous: 0, ratePerMinute: 0 },
      comments: { current: 0, previous: 0, ratePerMinute: 0 },
      activeUsers: { current: 0, previous: 0, ratePerMinute: 0 },
    };
  }
}

export async function getTrendingKeywords(range: "3h" | "6h" | "24h" | "1w" = "24h") {
  const latestWindowSubquery = db
    .select({ value: sql`MAX(${keywordTrends.windowEnd})` })
    .from(keywordTrends)
    .where(eq(keywordTrends.rangeLabel, range));

  return db
    .select({
      keyword: keywordTrends.keyword,
      count: keywordTrends.count,
    })
    .from(keywordTrends)
    .where(
      and(
        eq(keywordTrends.rangeLabel, range),
        eq(keywordTrends.windowEnd, latestWindowSubquery)
      )
    )
    .orderBy(desc(keywordTrends.count))
    .limit(10);
}

export async function getAllPostsForSearch() {
  // For minisearch indexing, now includes keywords and an image
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      content: posts.content,
      keywords: postEnrichment.fusedKeywords,
      // Simplified image selection logic, similar to hydratePosts
      yt_thumb: sql<string>`(SELECT e.thumbnail FROM post_embeds e WHERE e.post_id = ${posts.id} AND e.type = 'youtube' AND e.thumbnail IS NOT NULL ORDER BY (CASE WHEN POSITION(e.url IN COALESCE(${posts.content}, '')) > 0 THEN 0 ELSE 1 END), (e.thumbnail IS NULL), e.url ASC LIMIT 1)`,
      x_thumb: sql<string>`(SELECT e.thumbnail FROM post_embeds e WHERE e.post_id = ${posts.id} AND e.type = 'X' AND e.thumbnail IS NOT NULL ORDER BY (CASE WHEN POSITION(e.url IN COALESCE(${posts.content}, '')) > 0 THEN 0 ELSE 1 END), e.url ASC LIMIT 1)`,
      img_url: sql<string>`(SELECT url FROM post_images WHERE post_id = ${posts.id} ORDER BY width DESC NULLS LAST, url ASC LIMIT 1)`,
    })
    .from(posts)
    .leftJoin(postEnrichment, eq(posts.id, postEnrichment.postId))
    .where(eq(posts.isDeleted, false));

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    content: r.content,
    keywords: r.keywords,
    image: r.yt_thumb || r.x_thumb || r.img_url || null,
  }));
}

export async function getTopKeywords(limit: number) {
  const q = sql`
    SELECT keyword, COUNT(*)::int AS count
    FROM (
      SELECT jsonb_array_elements_text(fused_keywords) AS keyword
      FROM post_enrichment
      WHERE fused_keywords IS NOT NULL AND jsonb_typeof(fused_keywords) = 'array'
    ) AS k
    GROUP BY keyword
    HAVING keyword <> ''
    ORDER BY count DESC
    LIMIT ${limit}
  `;
  const res: any = await db.execute(q);
  return (res?.rows ?? res) as Array<{ keyword: string; count: number }>;
}

async function getPostsBy(
  options: { page: number; pageSize: number; range?: "3h" | "6h" | "24h" | "1w" },
  whereClause: any,
) {
  const { page, pageSize, range = "24h" } = options;
  const offset = (page - 1) * pageSize;
  const intervalLiteral = RANGE_TO_INTERVAL[range] ?? "24 hours";

  const q = sql`
    SELECT p.id
    FROM posts p
    ${whereClause}
    AND p.is_deleted = FALSE
    AND p.timestamp >= NOW() - INTERVAL \'${sql.raw(intervalLiteral)}\'
    ORDER BY p.timestamp DESC, p.id ASC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  const res: any = await db.execute(q);
  const postIds = ((res?.rows ?? res) as any[]).map(p => p.id);

  if (postIds.length === 0) return [];
  return hydratePosts(postIds);
}


export async function getPostsByKeyword(
  keyword: string,
  options: { page: number; pageSize: number; range?: "3h" | "6h" | "24h" | "1w" },
) {
  const where = sql`
    JOIN post_enrichment pe ON pe.post_id = p.id
    WHERE pe.fused_keywords @> ${JSON.stringify(keyword)}::jsonb
  `;
  return getPostsBy(options, where);
}

export async function getAllPosts(options: { page: number, pageSize: number, range?: "3h" | "6h" | "24h" | "1w" }) {
  return getPostsBy(options, sql`WHERE 1=1`);
}


export async function getPostsByCategory(
  category: string,
  options: { page: number; pageSize: number; range?: "3h" | "6h" | "24h" | "1w" },
) {
  const base = (category || '').toLowerCase();
  const aliasMap: Record<string, string[]> = {
    'news': ['news', '뉴스'], 'humor': ['humor', '유머'], 'info': ['info', '정보'],
    'qna': ['question', '질문'], 'review': ['review', '후기'], 'debate': ['debate', '토론'],
    'back': ['back', '후방'], 'zzal': ['zzal', '짤'], 'politics': ['politics', '정치'],
    'shopping': ['shopping', '쇼핑'], 'etc': ['etc', '기타'], 'sports': ['sports', 'sport', '스포츠'],
  };
  const tokens = aliasMap[base] ?? [base];
  const likeTokens = tokens.map(t => `${t}%`);

  // IN (...) 절을 위한 파라미터 목록을 명시적으로 생성
  const inClause = sql`LOWER(x.v) IN (${sql.join(tokens.map(t => sql`${t}`), sql`, `)})`;

  // LIKE ... OR LIKE ... 절을 동적으로 생성
  const likeConditions = likeTokens.map(token => sql`LOWER(COALESCE(p.category,'')) LIKE ${token}`);
  const orLikes = sql.join(likeConditions, sql` OR `);

  const where = sql`
    LEFT JOIN post_enrichment pe ON pe.post_id = p.id
    WHERE (
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(pe.fused_categories,'[]'::jsonb)) AS x(v)
        WHERE ${inClause}
      )
      OR (${orLikes})
    )
  `;
  return getPostsBy(options, where);
}

// Convenience helper for SSG: first page of the "news" category
export async function getNewsFirstPage(pageSize = 20) {
  return getPostsByCategory("news", { page: 1, pageSize });
}

export async function getPostsWithVideo(options: { page: number; pageSize: number; range?: "3h" | "6h" | "24h" | "1w" }) {
  const where = sql`
    WHERE EXISTS (
      SELECT 1 FROM post_embeds e
      WHERE e.post_id = p.id
        AND (
          e.type = 'youtube'
          OR (e.type = 'X' AND e.video_id IS NOT NULL)
          OR e.type = 'video'
          OR e.url ILIKE '%.mp4'
          OR e.url ILIKE '%.gif'
        )
    )
  `;
  return getPostsBy(options, where);
}

export async function getPostsByYouTube(options: { page: number; pageSize: number; range?: "3h" | "6h" | "24h" | "1w" }) {
  const where = sql`
    WHERE EXISTS (
      SELECT 1 FROM post_embeds e
      WHERE e.post_id = p.id
        AND (
          e.type = 'youtube'
          )

    )
  `;
  return getPostsBy(options, where);
}
