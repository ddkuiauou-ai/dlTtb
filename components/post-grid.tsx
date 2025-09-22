import InfinitePostList from "@/components/infinite-post-list";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ClientRandomClamp from "@/components/client-random-clamp";
import { PostListProvider } from "@/context/post-list-context";

interface PostGridProps {
  title: string;
  range?: "3h" | "6h" | "24h" | "1w"; // 시간 필터
  perSiteCap?: number;                // 사이트 캡
  layout?: "list" | "grid";
  mode?: "ranked" | "fresh";          // 선정 기준
  /**
   * 서버 상위 컴포넌트에서 미리 선별/중복제거한 포스트가 있다면 주입.
   * 주입되면 내부에서 쿼리를 호출하지 않고 해당 데이터로 그대로 그립니다.
   * (섹션 간 중복 제거 및 차별화 목적)
   */
  initialPosts?: any[];
  initialSampledPosts?: any[];
  clampSeed?: number;
  jsonBase?: string;
  enablePaging?: boolean;
  community?: string;
  category?: string;
  sampleMax?: number;
  rows?: number;
  randomizeOnEachMount?: boolean;
  refreshToken?: string | number;
  // Virtualized list customizations for category pages
  listColumns?: 'auto-2' | '3-2-1';
  cardLayoutOverride?: 'grid' | 'list';
  threeColAt?: 'lg' | 'xl';
  readFilter?: string;
}

export default function PostGrid({
  title,
  range = "24h",
  perSiteCap = 6,
  layout = "grid",
  mode = "ranked",
  initialPosts,
  initialSampledPosts,
  clampSeed,
  jsonBase,
  enablePaging = true,
  community,
  category,
  sampleMax,
  rows,
  randomizeOnEachMount,
  refreshToken,
  listColumns,
  cardLayoutOverride,
  threeColAt,
  readFilter,
}: PostGridProps) {
  // For the "최신" section, enforce fresh mode; for both "최신" and "지금 주목" display range in the title.
  const isLatestTimeline = title.includes("최신");
  const isSpotlight = title.includes("지금 주목");
  const effectiveMode: "ranked" | "fresh" = isLatestTimeline ? "fresh" : mode;
  const selectedRange: "3h" | "6h" | "24h" | "1w" = range;
  const effectiveRange: "3h" | "6h" | "24h" | "1w" = selectedRange;
  const RANGE_LABEL: Record<typeof effectiveRange, string> = { "3h": "3시간", "6h": "6시간", "24h": "24시간", "1w": "1주일" } as const;
  const rangeLabel = RANGE_LABEL[effectiveRange];
  const displayTitle = isLatestTimeline
    ? `최신 (${rangeLabel})`
    : isSpotlight
      ? `지금 주목 (${rangeLabel} 랭킹)`
      : title;
  const posts = initialPosts ?? [];

  const mapped = posts; // Data from hydratePosts is already in the correct shape for PostCard

  const defaultSection = effectiveMode === "fresh" ? "fresh" : "ranked";
  // If a category is provided, page JSONs live under /data/category/<category>/v1
  const base = enablePaging
    ? (jsonBase ?? (category ? `/data/category/${category}/v1` : `/data/home/v1/${effectiveRange}/${defaultSection}`))
    : undefined;
  // Make restoration keys distinct per section/mode/range to avoid bleed across range changes
  const storageKey = `${title} [${defaultSection}|${effectiveRange}]`;
  console.log(`11111 [${defaultSection}|${effectiveRange}] ${title}`)
  return (
    <div className="space-y-4">
      {displayTitle && <h2 className="text-xl font-semibold text-gray-900">{displayTitle}</h2>}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>
          {title.includes("급상승") && "최근 3시간 내 반응 급증 글을 균형 있게 보여줘요."}
          {title.includes("지금 주목") && `${rangeLabel} 범위에서 주목받는 글을 랭킹으로 보여줘요.`}
          {title.includes("오늘의 이슈") && "최근 24시간 이슈를 묶음(클러스터)으로 대표 글만 보여줘요."}
          {title.includes("이번주") && "최근 1주 이슈를 묶음(클러스터)으로 대표 글만 보여줘요."}
          {title.includes("최신") && `선택한 시간 범위(${rangeLabel}) 내에서 활동도 기반 점수로 정렬된 최신 글이에요. 아래로 더 내리면 계속 이어집니다.`}
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button aria-label="설명" className="inline-flex items-center text-gray-400 hover:text-gray-600">
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>
                {title.includes("급상승") && "3시간 기준, 사이트 편중을 줄이고 최근성 가중치로 선별합니다."}
                {title.includes("지금 주목") && `${rangeLabel} 범위에 따라 랭킹이 동적으로 바뀝니다.`}
                {title.includes("오늘의 이슈") && "유사 이슈는 하나로 묶어 대표 글만 노출합니다."}
                {title.includes("이번주") && "1주 기준 이슈 묶음의 대표 글을 보여줍니다."}
                {title.includes("최신") && `무한 스크롤은 현재 선택한 범위(${rangeLabel})의 ‘최신’ 피드를 이어붙입니다. (시간순 정렬이 아닌 활동도 가중 점수 정렬)`}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {/* 샘플링 조건: 페이징 비활성 + sampleMax 지정됨 */}
      {(!enablePaging && !!sampleMax) ? (
        <ClientRandomClamp
          key={refreshToken != null ? `${title}-${refreshToken}` : undefined}
          items={mapped}
          sampleMax={sampleMax}
          layout={layout}
          community={community}
          jsonBase={base}
          storageKeyPrefix={storageKey}
          rows={rows}
          randomizeOnEachMount={!!randomizeOnEachMount}
          initialSampled={initialSampledPosts}
          initialSeed={clampSeed}
        />
      ) : (
        <PostListProvider postIds={mapped.map(p => p.id)}>
          <InfinitePostList
            initialPosts={mapped}
            community={community}
            layout={layout}
            jsonBase={base}
            enablePaging={enablePaging}
            storageKeyPrefix={storageKey}
            listColumns={listColumns}
            cardLayoutOverride={cardLayoutOverride}
            threeColAt={threeColAt}
            readFilter={readFilter}
          />
        </PostListProvider>
      )}
    </div>
  );
}
