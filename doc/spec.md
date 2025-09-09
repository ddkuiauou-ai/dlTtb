# Specification: Pagination & Infinite Scroll

이 문서는 정적 페이지와 클라이언트 사이드 로딩을 결합한 아키텍처를 정의합니다.

## 1. SSG 설정 (Next.js)

- `getStaticPaths`로 초기 페이지(`1 ~ N_STATIC_PAGES`) 생성
- `getStaticProps({ params: { page } })`
  - 전체 게시물 메타데이터(fetch)
  - `pageSize`만큼 슬라이스
  - `posts`, `page`, `totalPages` 반환

```ts
// app/posts/page/[page]/page.tsx
export const revalidate = false; // 완전 SSG

export async function generateStaticParams() {
  const totalPosts = await getTotalPosts();
  const totalPages = Math.ceil(totalPosts / PAGE_SIZE);
  return Array.from({ length: N_STATIC_PAGES }, (_, i) => ({
    page: String(i + 1),
  }));
}

export default async function Page({ params: { page } }) {
  const pageNum = Number(page);
  const { posts, totalPages } = await getPostsPage(pageNum);
  return (
    <PostList posts={posts} currentPage={pageNum} totalPages={totalPages} />
  );
}
```

## 2. JSON 데이터 파일

- 빌드 시 전체 페이지 슬라이스
- `public/data/posts/page-{n}.json` 생성

```js
// scripts/build-posts.js
import fs from "fs";
import path from "path";

async function main() {
  const all = await fetchPostsMeta();
  const totalPages = Math.ceil(all.length / PAGE_SIZE);
  for (let page = 1; page <= totalPages; page++) {
    const slice = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    fs.writeFileSync(
      path.join(process.cwd(), `public/data/posts/page-${page}.json`),
      JSON.stringify({ posts: slice, page, totalPages })
    );
  }
}

main();
```

## 3. API 라우트 (선택)

- `/api/posts/[page].ts`
- 서버리스 함수로 JSON 반환 (SSR 대안)

```ts
// pages/api/posts/[page].ts
export default function handler(req, res) {
  const page = Number(req.query.page);
  const data = JSON.parse(
    fs.readFileSync(`./public/data/posts/page-${page}.json`)
  );
  res.status(200).json(data);
}
```

## 메인 화면 게시글 선정 기준

- 최근 24시간 내 삭제되지 않은 글 중 선정
- 가중치 정렬: 좋아요(likeCount) > 댓글(commentCount) > 조회수(viewCount) > 최신순(timestamp)
- 미디어(이미지/임베드) 포함 글을 우선적으로 일정 비율(mainLimit \* mediaRatio)만큼 배치
- 사이트별 대표 인기글 각 3개씩 추가(중복 제외)
- 최종적으로 중복(동일 id) 제거 후 메인에 노출

### TypeScript 함수 예시

```ts
export async function getMainPagePosts({
  mainLimit = 15,
  perSite = 3,
  hours = 24,
  mediaRatio = 0.5,
} = {}) {
  /* ...상세 구현은 lib/queries.ts 참고 */
}
```

- 향후 가중치 공식, 미디어 비율, 사이트별 개수 등은 서비스 성격에 맞게 조정 가능
