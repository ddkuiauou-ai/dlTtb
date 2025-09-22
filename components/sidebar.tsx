import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Filter } from "lucide-react";
import { getTrendingKeywords, getHomeStats24h } from "@/lib/queries";
import { CategoryList } from "./category-list.client";
import { TrendingKeywordList } from "./TrendingKeywordList.client";
import { ReadPostList } from "./ReadPostList.client";
import { SidebarStats } from "./sidebar-stats.client";

export const dynamic = "force-static";
export const revalidate = false;

export async function Sidebar() {
  const trendingKeywords = await getTrendingKeywords("6h");
  const stats = await getHomeStats24h(); // `previous` is now `current - recent_additions`

  const builtLabel = new Date().toLocaleString("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      {/* Trending Keywords */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            실시간 인기 키워드
          </CardTitle>
          <div className="text-xs text-gray-500">최근 6시간 기준</div>
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
          <div className="text-xs text-gray-500">
            지난 24시간 내 · 빌드 {builtLabel}
          </div>
        </CardHeader>
        <CardContent>
          <SidebarStats stats={stats} />
        </CardContent>
      </Card>

      {/* Read Posts */}
      <ReadPostList />
    </div>
  );
}
