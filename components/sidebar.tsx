import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Filter } from "lucide-react";
import { getTrendingKeywords, getHomeStats24h } from "@/lib/queries";
import { CategoryList } from "./category-list.client";
import { CountingNumber } from "@/components/animate-ui/text/counting-number";
import { TrendingKeywordList } from "./TrendingKeywordList.client";
import { ReadPostList } from "./ReadPostList.client";

export const dynamic = "force-static";
export const revalidate = false;

// 약 20분 동안 서서히 움직이도록 하는 목표값 (30분 속도 기반, 약간의 여유 포함)
function projectToLongDrift(current: number, previous: number) {
  const recent = Math.max(0, current - previous); // 30분 증가량
  const delta10m = Math.max(1, Math.round(recent / 3)); // 10분 환산
  const slack = Math.ceil(delta10m * 1.5); // 10분 목표에 여유를 더해 ~20분까지 움직임 유지
  return current + Math.max(2, slack); // 최소 +2로 미세변화 보장
}

// 약 20분 스케일로 매우 천천히 수렴하게 하는 스프링 값
const twentyMinuteSpring = { stiffness: 3, damping: 120 };

export async function Sidebar() {
  const trendingKeywords = await getTrendingKeywords("24h");
  const stats = await getHomeStats24h(); // `previous` is now `current - recent_additions`

  const builtLabel = new Date().toLocaleString("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Spring options for a slow, 10-minute-like animation.
  const slowSpring = { stiffness: 15, damping: 80 };

  return (
    <div className="space-y-6">
      {/* Trending Keywords */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            실시간 인기 키워드
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TrendingKeywordList keywords={trendingKeywords} />
        </CardContent>
      </Card>

      {/* Category Filter */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            카테고리
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryList />
        </CardContent>
      </Card>

      {/* Statistics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">오늘의 통계</CardTitle>
          <div className="text-xs text-gray-500">지난 24시간 내 · 빌드 {builtLabel} · 다음 빌드까지 서서히 수렴</div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">총 게시글</span>
              <span className="font-medium">
                <CountingNumber
                  fromNumber={stats.posts.current}
                  number={projectToLongDrift(stats.posts.current, stats.posts.previous)}
                  transition={twentyMinuteSpring}
                />
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">총 댓글</span>
              <span className="font-medium">
                <CountingNumber
                  fromNumber={stats.comments.current}
                  number={projectToLongDrift(stats.comments.current, stats.comments.previous)}
                  transition={twentyMinuteSpring}
                />
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">활성 사용자</span>
              <span className="font-medium">
                <CountingNumber
                  fromNumber={stats.activeUsers.current}
                  number={projectToLongDrift(stats.activeUsers.current, stats.activeUsers.previous)}
                  transition={twentyMinuteSpring}
                />
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Read Posts */}
      <ReadPostList />
    </div>
  );
}
