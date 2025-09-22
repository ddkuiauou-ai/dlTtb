import { Suspense } from 'react';
import { Header } from "@/components/header";
import PostGrid from "@/components/post-grid";
import { Sidebar } from "@/components/sidebar";
import { Footer } from "@/components/footer";
import TopRefreshOnScroll from "@/components/top-refresh-on-scroll";
import { getMainPagePosts, getClusterTopPosts } from "@/lib/queries";
import { sampleForClamp } from "@/lib/server-random-clamp";

type Range = "3h" | "6h" | "24h" | "1w";

export default async function Home() {
  const selectedRange: Range = "24h";

  // 섹션 간 중복 방지를 위해 서버에서 순차적으로 선별하고,
  // 이미 노출된 post id는 다음 섹션에서 제외한다.
  const perSiteCap = 3;
  const pageSize = perSiteCap * 12;
  const used = new Set<string>();

  const logSection = (label: string, posts: Array<{ id: string }>) => {
    try {
      let duplicates = 0;
      for (const post of posts) {
        if (used.has(post.id)) duplicates += 1;
      }
      const prevUsed = used.size;
      const newUnique = posts.length - duplicates;
      console.log(
        `[Home][${label}] posts=${posts.length} newUnique=${newUnique} duplicates=${duplicates} usedBefore=${prevUsed}`
      );
    } catch {
      // ignore logging errors
    }
  };

  // 1) 급상승: 3시간 정규화 랭킹
  const rising = await getMainPagePosts({
    range: "3h",
    perSiteCap,
    pageSize,
    mode: "ranked",
    excludeIds: [],
  });
  logSection("rising", rising);
  const risingSample = sampleForClamp(rising, {
    sampleMax: 3,
    randomizeOnEachMount: true,
  });
  const risingDisplayed = risingSample.sampled;
  risingDisplayed.forEach((p) => used.add(p.id));

  // 2) 지금 주목: 사용자 선택 range, 급상승에서 제외된 것 위주
  const spotlight = await getMainPagePosts({
    range: selectedRange,
    perSiteCap,
    pageSize,
    mode: "ranked",
    excludeIds: Array.from(used),
  });
  logSection("spotlight", spotlight);
  const spotlightSample = sampleForClamp(spotlight, {
    sampleMax: 6,
    randomizeOnEachMount: true,
  });
  const spotlightDisplayed = spotlightSample.sampled;
  spotlightDisplayed.forEach((p) => used.add(p.id));

  // 3) 오늘의 이슈: 24시간 클러스터 상위 (대표글만), 이전 섹션 제외
  const todayClusters = await getClusterTopPosts({
    range: "24h",
    perSiteCap,
    pageSize,
    excludeIds: Array.from(used),
  });
  logSection("todayClusters", todayClusters);
  todayClusters.forEach((p) => used.add(p.id));

  // 4) 이번주: 1주 클러스터 상위, 이전 섹션 제외
  const weekClusters = await getClusterTopPosts({
    range: "1w",
    perSiteCap,
    pageSize,
    excludeIds: Array.from(used),
  });
  logSection("weekClusters", weekClusters);
  weekClusters.forEach((p) => used.add(p.id));

  // 5) 최신: 선택 range 기반 신선도 정렬, 앞 섹션 모두 제외
  const fresh = await getMainPagePosts({
    range: selectedRange,
    perSiteCap,
    pageSize,
    mode: "fresh",
    excludeIds: Array.from(used),
  });
  logSection("fresh", fresh);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* When on main ("/"), refresh when the user scrolls up to top */}
      <TopRefreshOnScroll />
      <Header />
      <main className="w-full max-w-screen-xl mx-auto px-0 md:px-4 py-6">
        <div className="flex xl:gap-6">
          <div className="flex-1">
            <div className="space-y-10">
              {/* 섹션별 목적에 맞는 고정/연동 + 교차 중복 제거 */}
              <Suspense fallback={<div>Loading...</div>}>
                <PostGrid
                  title="급상승 (최근 3시간 급상승)"
                  range="3h"
                  perSiteCap={perSiteCap}
                  layout="grid"
                  mode="ranked"
                  initialPosts={rising}
                  initialSampledPosts={risingDisplayed}
                  clampSeed={risingSample.seed}
                  jsonBase="/data/home/v1/3h/ranked"
                  enablePaging={false}
                  sampleMax={3}
                  randomizeOnEachMount={true}
                  refreshToken={Date.now()}
                />
              </Suspense>

              <Suspense fallback={<div>Loading...</div>}>
                <PostGrid
                  title="지금 주목 (선택한 범위 랭킹)"
                  range={selectedRange}
                  perSiteCap={perSiteCap}
                  layout="grid"
                  mode="ranked"
                  initialPosts={spotlight}
                  initialSampledPosts={spotlightDisplayed}
                  clampSeed={spotlightSample.seed}
                  jsonBase={`/data/home/v1/${selectedRange}/ranked`}
                  enablePaging={false}
                  sampleMax={6}
                  rows={2}
                  randomizeOnEachMount={true}
                  refreshToken={Date.now()}
                />
              </Suspense>

              <Suspense fallback={<div>Loading...</div>}>
                <PostGrid
                  title="오늘의 이슈 (24시간 이슈 묶음)"
                  range="24h"
                  perSiteCap={perSiteCap}
                  layout="grid"
                  mode="ranked"
                  initialPosts={todayClusters}
                  jsonBase="/data/home/v1/24h/top"
                  enablePaging={false}
                />
              </Suspense>

              <Suspense fallback={<div>Loading...</div>}>
                <PostGrid
                  title="이번주 (1주 이슈 묶음)"
                  range="1w"
                  perSiteCap={perSiteCap}
                  layout="grid"
                  mode="ranked"
                  initialPosts={weekClusters}
                  jsonBase="/data/home/v1/1w/top"
                  enablePaging={false}
                />
              </Suspense>

              <Suspense fallback={<div>Loading...</div>}>
                <PostGrid
                  title="최신"
                  range={selectedRange}
                  perSiteCap={perSiteCap}
                  layout="list"
                  mode="fresh"
                  initialPosts={fresh}
                  jsonBase={`/data/home/v1/${selectedRange}/fresh`}
                  enablePaging={true}
                />
              </Suspense>

              {/* TODO: 인기 키워드 섹션은 파이프라인 연결 후 추가 */}
            </div>
          </div>
          <div className="hidden xl:block w-80 shrink-0">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-scroll [scrollbar-gutter:stable_both-edges] transform-gpu will-change-transform [contain:layout_paint]">
              <Sidebar />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
