# UI: Pagination & Infinite Scroll

이 문서는 사용자에게 게시물 목록을 효율적으로 제공하기 위한 UI 컴포넌트와 훅을 설명합니다.

## 1. Pagination 컴포넌트

- Tailwind CSS + Radix UI 기반
- 페이지 번호, 이전/다음 네비게이션 표시
- `rel="prev"`, `rel="next"` 메타 태그 자동 삽입

```tsx
// components/ui/Pagination.tsx
import Link from "next/link";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
}

export function Pagination({ currentPage, totalPages }: PaginationProps) {
  return (
    <nav aria-label="Page navigation">
      <ul className="flex space-x-2">
        {currentPage > 1 && (
          <li>
            <Link href={`/posts/page/${currentPage - 1}`} rel="prev">
              Prev
            </Link>
          </li>
        )}
        {/* ...existing code... 페이지 번호 리스트 ...existing code... */}
        {currentPage < totalPages && (
          <li>
            <Link href={`/posts/page/${currentPage + 1}`} rel="next">
              Next
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
```

## 2. useInfinitePosts 훅

- 클라이언트 사이드 무한 스크롤 로직
- SWR 또는 React Query 활용 예시

```ts
// hooks/useInfinitePosts.ts
import { useInfiniteQuery } from "@tanstack/react-query";

export function useInfinitePosts() {
  return useInfiniteQuery(
    ["posts"],
    ({ pageParam = 1 }) =>
      fetch(`/data/posts/page-${pageParam}.json`).then((r) => r.json()),
    {
      getNextPageParam: (lastPage) =>
        lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    }
  );
}
```

### IntersectionObserver

```tsx
// components/PostList.tsx
import { useInfinitePosts } from "@/hooks/useInfinitePosts";

export default function PostList() {
  const { data, fetchNextPage, hasNextPage } = useInfinitePosts();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage) fetchNextPage();
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [hasNextPage]);

  return (
    <>
      {data?.pages.map((page) =>
        page.posts.map((post) => <PostCard key={post.id} {...post} />)
      )}
      <div ref={ref} />
    </>
  );
}
```

## 3. InfinitePostList 가상 버퍼 계산

- `components/infinite-post-list.tsx` 는 각 행의 예상 높이(`estimateRowSize`)와 현재 `window.innerHeight` 값을 기반으로 버퍼를 계산합니다.
- `deriveVirtualBufferSizing` 헬퍼는 뷰포트의 절반(0.5 × viewport)을 픽셀 단위로 확보하도록 행 수를 산출하며, 동일한 수의 행을 앞/뒤에 대칭으로 오버스캔합니다.
- `loadAheadRows` 는 뷰포트에 표시될 것으로 추정되는 행 수를 산출한 뒤 약 1.5배를 미리 확보하여, 스크롤 속도가 빨라도 다음 콘텐츠가 부드럽게 준비되도록 합니다.
- tail(목록 끝) 트리거는 이 `loadAheadRows` 값을 기준으로 다음 페이지 로드를 미리 시작하기 때문에, 사용자는 최소 한 화면 이상이 예열(warm-up)된 상태를 경험하게 됩니다.
- 별도의 `virtualOverscan`/`loadAheadRows` override 값을 넘기면 위 계산을 직접 덮어쓸 수 있어, 뷰포트 특성이나 실험 목적에 맞춰 동작을 세밀하게 조정할 수 있습니다.
