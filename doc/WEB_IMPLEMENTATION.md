# Isshoo 웹 구현 현황과 후속 검증 기준

확인 날짜: **2026-10-04 KST**.
이 문서는 웹 저장소의 소스를 읽어 확인한 구현 상태를 후속 채팅과 개발 작업에 전달하기 위한 기록이다.

전체 방향은 [README](../README.md), 수집·분석 구조는 [데이터 파이프라인](DATA_PIPELINE.md), 다음 업데이트 작업은 [업그레이드 인수인계](UPGRADE_HANDOFF.md)를 참고한다.

## 1. 조사 범위와 해석

- 조사 대상은 페이지, 컴포넌트, 브라우저 저장소, DB 조회, JSON 생성 스크립트, 저장소의 배포 워크플로다.
- 개발 서버·빌드·테스트·DB 조회·라이브 서비스 접속은 실행하지 않았다.
- 아래의 “구현”은 호출 경로와 로직이 소스에 존재한다는 뜻이며, 실행 성공이나 운영 정상 상태를 뜻하지 않는다.
- “정적 점검 항목”은 소스에서 발견한 범위 차이 또는 미완성 연결이며, 재현 테스트로 확인할 대상이다.
- 로컬 `public/data`에는 오래되거나 빈 JSON이 섞여 있다. 이를 현재 운영 데이터나 크롤러 가동 상태의 증거로 사용하지 않는다.
- 라이브러리 버전은 저장소 선언을 기록했다. 최신 버전·업그레이드 적합성은 조사하지 않았다.

문서의 상태 구분은 **사용자 설명 / 코드 확인 / 정적 점검 항목 / 운영 미확인 / 제안**이다.
기술·페이지·저장 범위는 코드 확인, 6절은 정적 점검 항목, 배포의 실제 적용 상태는 운영 미확인, 8절은 제안에 해당한다.

**사용자 설명:**
사용자가 설명한 사업 방향은 대중용 커뮤니티 집계 사이트로 이용자를 확보하고 광고·유료 전환의 접점을 만드는 것이다.
크롤링·LLM 분석·분류·키워드 추출·그룹화 기술은 별도 기업/소상공인용 평판 감시·키워드 감지·대응 서비스의 기반이다.
따라서 현재 웹 UI의 완성도와 공통 데이터·분석 기술의 완성도는 구분하여 평가해야 한다.

## 2. 기술과 데이터 경계

| 구성 | 저장소에서 확인한 역할 | 근거와 코드 심볼 |
| --- | --- | --- |
| Next.js / React | App Router 기반 웹; 선언 버전은 Next.js `15.5.4`, React `^19.1.1` | [package.json](../package.json), `dependencies`; [RootLayout](../app/layout.tsx), `RootLayout` |
| PostgreSQL / Drizzle | `pg.Pool` 연결과 Drizzle 조회; 피드·상세·키워드·통계 데이터를 읽음 | [DB 연결](../lib/db.ts), `pool`, `db`; [조회](../lib/queries.ts), `getMainPagePosts`, `getPostDetail` |
| Clerk | 로그인 UI, 로그인 여부에 따른 카드·읽은 글 동선 | [Provider](../components/clerk-provider.tsx), `ClientClerkProvider`; [헤더](../components/header-client.tsx), `HeaderClient` |
| MiniSearch | 빌드한 제목·본문·키워드 검색 인덱스를 브라우저에서 조회 | [인덱스 생성](../scripts/build-search-index.ts), `buildSearchIndex`; [검색 화면](../app/search/SearchPageClient.tsx), `SearchPageClient` |
| 정적 JSON | 목록의 후속 페이지, 기간 변경 데이터, 모달 상세를 제공 | [목록](../components/infinite-post-list.tsx), `InfinitePostList`; [모달](../components/post-viewer-modal.tsx), `getStaticPost` |
| Tailwind / Radix / shadcn 계열 UI | 반응형 카드·대화상자·필터·버튼 구성 | [의존성](../package.json), `dependencies`; [카드](../components/post-card.tsx), `PostCard` |
| TanStack Virtual | 긴 피드의 행 가상화와 선행 로딩 | [무한 목록](../components/infinite-post-list.tsx), `useWindowVirtualizer` |

웹은 DB에 이미 적재된 수집·분석 결과를 조회하고 보여준다.
상세에서는 분석 결과의 카테고리·태그를, 홈에서는 클러스터 대표 글과 인기도를 소비한다.
근거: [상세 UI](../components/post-detail.tsx)의 `PostDetail`, [홈](../app/(feed)/page.tsx)의 `Home`, [조회](../lib/queries.ts)의 `getClusterTopPosts`.

카테고리·키워드·상세 페이지에는 `dynamic = 'force-static'`, `dynamicParams = false`, `revalidate = false`가 선언되어 있다.
근거: [카테고리 페이지](../app/[category]/page.tsx), [키워드 페이지](../app/keywords/[keyword]/page.tsx), [상세 페이지](../app/(feed)/posts/[id]/page.tsx)의 페이지 설정.
`GEMINI.md`의 정적 export 설명과 달리 현재 `next.config.mjs`에서 `output: 'export'`는 주석 처리되어 있다.
실제 저장소의 CI는 `next-on-pages` 어댑터를 사용하므로 단순 `out/` export 구조로 설명하면 현재 소스와 맞지 않는다.
근거: [설정](../next.config.mjs)의 `nextConfig`, [프로젝트 문맥](../GEMINI.md), [워크플로](../.github/workflows/build-contents.yml)의 `Build Next.js with Cloudflare Pages adapter`.

## 3. 페이지와 실제 사용자 동선

| 페이지/기능 | 확인된 구현 | 제약 또는 후속 확인 | 근거와 코드 심볼 |
| --- | --- | --- | --- |
| 홈 `/` | 급상승·지금 주목·오늘의 이슈·이번주·최신; 사이트당 노출 제한과 섹션 간 중복 제외 | 홈의 선택 범위는 현재 `24h` 고정 | [홈](../app/(feed)/page.tsx), `Home`, `selectedRange`, `used` |
| 홈 상단 카드 | 급상승 최대 3개, 지금 주목 최대 6개를 샘플링 | 새로 방문할 때 노출 변화와 중복 제외 결과 확인 | [홈](../app/(feed)/page.tsx), `sampleForClamp`; [샘플](../components/client-random-clamp.tsx), `ClientRandomClamp` |
| 이슈 묶음 | 24h/1w 클러스터 대표 글을 홈에 노출; 카드에 통합 글 수 표시 | 서로 다른 사이트의 같은 이슈가 묶이는 품질은 별도 평가 필요 | [홈](../app/(feed)/page.tsx), `getClusterTopPosts`; [카드](../components/post-card.tsx), `Badges` |
| 카테고리 `/:category` | 17개 경로; 기간·읽음 여부·그리드/리스트 전환·무한 스크롤 | 초기 DB 페이지와 JSON 페이지 범위 일치 확인 | [페이지](../app/[category]/page.tsx), `CATEGORIES`; [피드](../components/CategoryFeed.client.tsx), `CategoryFeed` |
| 키워드 `/keywords/:keyword` | 상위 50개 키워드의 정적 페이지와 태그 이동 | 기본 JSON은 1w만 생성; 다른 기간·보기 모드 연결 확인 | [페이지](../app/keywords/[keyword]/page.tsx), `generateStaticParams`; [피드](../components/KeywordFeed.client.tsx), `KeywordFeed` |
| 검색 `/search?q=...` | 제목·본문·추출 키워드의 prefix/fuzzy 검색 | 의미 검색·고객별 감시 규칙은 없음; 결과 상세 링크 범위 확인 | [검색](../app/search/SearchPageClient.tsx), `miniSearch.search`; [검색 조회](../lib/queries.ts), `getAllPostsForSearch` |
| 내부 상세 모달 | 상세 JSON 로딩; 좌우 글 이동과 키보드 스크롤 | 댓글·관련 글은 전체 상세 페이지에 있음 | [모달](../components/post-viewer-modal.tsx), `PostViewerModal`, `getStaticPost` |
| 전체 상세 `/posts/:id` | 본문 HTML·미디어·원문 링크·카테고리/태그·댓글·관련 글·클러스터 구성원 | 상세 HTML은 조회한 ID 중 첫 100개만 생성; 최근 순서는 미보장 | [상세 페이지](../app/(feed)/posts/[id]/page.tsx), `PostPage`, `generateStaticParams`; [상세 UI](../components/post-detail.tsx), `PostDetail` |
| 사이드바 | 최근 6시간 인기 키워드, 24시간 통계, 카테고리, 최근 읽은 글 | 인기 키워드·통계는 조회 시점의 스냅샷; 운영 갱신 주기는 미확인 | [사이드바](../components/sidebar.tsx), `Sidebar` |
| 헤더 | Clerk 로그인/사용자 버튼, 검색, 커뮤니티 다중 선택 | 비로그인/로그인 콘텐츠 소비 방식이 다름 | [헤더](../components/header-client.tsx), `HeaderClient` |

### 로그인 여부에 따른 피드 소비

`PostCard`의 `SignedIn`에서는 일반 클릭을 가로채 읽음 기록을 남기고 `openModal(post.id, postIds)`를 호출한다.
`SignedOut`에서는 `post.url`을 새 탭으로 열고 읽음 기록을 남긴다.
근거: [카드](../components/post-card.tsx)의 `handleClick`, `SignedIn`, `SignedOut`; [모달 상태](../context/modal-context.tsx)의 `openModal`.

즉 로그인 사용자는 내부 리더에서 연속 소비하고, 비로그인 사용자는 원문 커뮤니티로 이동하는 구조다.
이는 대중용 사이트의 체류·회원 전환·광고 노출을 논의할 때 확인해야 할 현재 제품 선택이다.
이 동선이 전체 상세 페이지의 접근 제한까지 의미하지는 않는다. 상세 페이지에 대한 별도 권한 검증은 확인하지 못했다.

Clerk 공개 키가 없으면 `ClientClerkProvider`는 자식만 반환하지만, 여러 자식은 Clerk의 `SignedIn`/`SignedOut`을 사용한다.
키 누락 상태에서 모든 화면이 정상 동작한다고 단정하지 말고 개발·배포 환경에서 확인해야 한다.
근거: [Provider](../components/clerk-provider.tsx)의 `ClientClerkProvider`; [카드](../components/post-card.tsx)의 `SignedIn`, `SignedOut`.

## 4. 브라우저에 남는 상태와 서버 영속화

| 상태 | 저장 위치·범위 | 서버/계정 동기화 여부 | 근거와 코드 심볼 |
| --- | --- | --- | --- |
| 읽음 기록 | `localStorage['readPosts:v2']`; 최대 30일/5,000개 | 서버 저장이나 계정 간 동기화 경로 없음 | [읽음 기록](../lib/read-marker.ts), `markPostAsRead` |
| 최근 읽은 글 | 위 기록에서 최신 20개 표시 | 같은 브라우저의 기록 사용 | [최근 글](../components/ReadPostList.client.tsx), `loadReadPosts` |
| 커뮤니티 선택 | `localStorage['isshoo:communities:selected:v1']`; 경로 변경 시 재사용 | 브라우저 내 저장·이벤트 전달 | [헤더](../components/header-client.tsx), `COMM_KEY`; [필터](../lib/communityFilter.ts), `emitCommunities` |
| 목록 복귀 위치 | `sessionStorage`; 섹션·글 ID·페이지·이전 URL | 브라우저 탭 세션 범위 | [복귀 상태](../lib/restore-session.ts), `markNavigateToPost`, `readAndClearRestore` |
| 페이지 캐시 | IndexedDB `isshoo-v1`; manifests/posts/pages 저장, 전역 페이지 LRU 제한 3,000개 | 로컬 캐시이며 사용자 계정 데이터가 아님 | [캐시](../lib/idb-cache.ts), `getManifest`, `readPage`, `writePage` |
| 카테고리/키워드 화면 옵션 | 현재 사용 중인 피드는 주로 `useState`와 `?range=` 사용 | 옵션 전체가 영구 저장된다고 설명하면 안 됨 | [카테고리 피드](../components/CategoryFeed.client.tsx), `CategoryFeed`; [키워드 피드](../components/KeywordFeed.client.tsx), `KeywordFeed` |

`useScopedFeedPrefs`는 옵션을 `localStorage`에 저장하는 훅이지만 현재 두 주 경로의 피드에서 사용하지 않는다.
별도의 `app/keywords/[keyword]/[[...range]]/KeywordFeed.client.tsx`에는 사용 코드가 있으나 이를 실행하는 `page.tsx`는 없다.
근거: [저장 훅](../lib/feed-prefs.ts)의 `useScopedFeedPrefs`; [별도 컴포넌트](../app/keywords/[keyword]/[[...range]]/KeywordFeed.client.tsx)의 `KeywordFeed`.

글 추천은 `upvoted`, 북마크는 `bookmarked` 상태만 바꾼다. 새로고침 후 유지하는 서버 저장 경로는 없다.
신고 버튼에는 처리기가 없다. 근거: [상세 UI](../components/post-detail.tsx)의 `handleUpvote`, `setBookmarked`, `Flag` 버튼.
댓글 조회·기존 답글 트리 표시는 구현되어 있지만 자체 댓글 작성은 서버 기능으로 완성되지 않았다.
`handleSubmitComment`는 작성자를 “현재사용자”로 설정하고 화면 상태에 추가한다. 인증·DB 저장·다른 사용자 공유는 연결되지 않는다.
작성 데이터는 `content`에 넣지만 출력은 `contentHtml`만 사용하므로 새 댓글 본문 표시도 확인할 대상이다.
댓글 추천·답글·더보기 버튼에도 처리기가 없다.
근거: [댓글 UI](../components/comment-section.tsx)의 `CommentSection`, `handleSubmitComment`, `CommentItem`; [상세 조회](../lib/queries.ts)의 `getPostDetail`.

## 5. JSON 생성·갱신과 배포 의도

데이터의 웹 전달 경로는 다음과 같다.

```text
PostgreSQL의 수집·분석 결과
  → DB 조회 / build-* 스크립트
  → 초기 HTML 데이터 + public/data의 JSON·manifest
  → 저장소 CI의 artifact 취합과 Pages / R2 업로드
  → 브라우저의 상대 URL fetch
  → manifest.generatedAt으로 IndexedDB 페이지 캐시 구분
```

| 생산물 | 생성 로직 | 브라우저 소비 |
| --- | --- | --- |
| 홈 후속 피드 | [build-main-json](../scripts/build-main-json.ts)의 `main`, `buildGlobalPages`; 현재 24h/fresh만 생성 | [무한 목록](../components/infinite-post-list.tsx)의 `InfinitePostList`; 논리적 1페이지 뒤 JSON 2페이지부터 |
| 카테고리 JSON | [build-category-json](../scripts/build-category-json.ts)의 `buildCategory`; 기본 네 기간, 페이지 및 manifest | [카테고리 피드](../components/CategoryFeed.client.tsx)의 `fetchData`와 `InfinitePostList` |
| 키워드 JSON | [build-keyword-json](../scripts/build-keyword-json.ts)의 `buildKeyword`; 상위 50개, 기본 1w, global manifest | [키워드 피드](../components/KeywordFeed.client.tsx)의 `fetchData`; [링크 훅](../hooks/use-keyword-manifest.ts)의 `getKeywordLink` |
| 상세 JSON | [build-post-json](../scripts/build-post-json.ts)의 `buildAllPosts`; 기본 24h DB 목록 1페이지에서 최대 10,000개 ID, 동시 생성·변경 비교 | [모달](../components/post-viewer-modal.tsx)의 `getStaticPost`; `/data/posts/v1/:id.json` |
| 검색 인덱스 | [build-search-index](../scripts/build-search-index.ts)의 `buildSearchIndex`; 비삭제 글 제목·본문·키워드 | [검색](../app/search/SearchPageClient.tsx)의 `MiniSearch.loadJSON` |

manifest는 `generatedAt`, 페이지 수, 페이지 크기 등 캐시·끝 페이지 판단에 필요한 정보를 기록한다.
목록은 필요할 때 manifest를 조회하며 5초 TTL을 적용한다. manifest의 fetch는 `cache: 'no-cache'`를 사용한다.
이는 지속적인 서버 이벤트 구독이나 일정한 주기의 화면 자동 갱신을 의미하지 않는다.
근거: [캐시](../lib/idb-cache.ts)의 `getManifest`, `readPage`; [무한 목록](../components/infinite-post-list.tsx)의 `MANIFEST_TTL_MS`, `maybeRefreshManifest`.

홈 위로 스크롤/당겨서 새로고침은 `router.refresh()`를 호출한다. DB·빌드·CDN까지 최신 상태가 되는지는 별도 검증 대상이다.
“실시간 인기 키워드”는 `Sidebar`가 최근 6시간을 조회해 표시하며, 정적 조회 결과를 주기적으로 교체하는 브라우저 로직은 없다.
근거: [새로고침](../components/top-refresh-on-scroll.tsx)의 `triggerRefresh`; [사이드바](../components/sidebar.tsx)의 `Sidebar`.

저장소의 주 배포 워크플로는 main push와 수동 실행으로 시작하며 예약 트리거는 선언되어 있지 않다.
JSON 빌드 결과를 취합한 뒤 `pnpm exec next-on-pages`로 빌드하고 `.vercel/output/static`을 Pages에 배포한다.
R2 업로드 job은 상세 JSON artifact를 받아 `/data/` 아래에 동기화한다.
근거: [워크플로](../.github/workflows/build-contents.yml)의 `on`, `Combine all artifacts`, `Deploy Main Site to Cloudflare Pages`, `upload_json_to_r2`.

[DEPLOYMENT.md](../DEPLOYMENT.md)는 모든 JSON을 R2로 분리하는 의도를 설명하지만, 현재 CI는 검색·키워드·홈·카테고리·전체 목록 artifact를 Pages 빌드에 합치고 상세 JSON artifact는 별도 R2 job에서 받는다.
브라우저 fetch는 같은 origin의 `/data/...`를 사용하므로 R2 연결·라우팅·캐시 헤더가 실제로 어떻게 구성되는지는 운영 확인이 필요하다.
저장소 선언만으로 현재 Pages/R2 설정, 배포 성공, 최신 데이터 도착을 확정하지 않는다.

## 6. 정적 점검 항목: 기능과 데이터 범위의 일치

다음은 확인된 소스 차이이며 사용자 영향은 실행 환경에서 재현해야 한다.

1. **상세 HTML 100개와 모달 JSON 범위:** `generateStaticParams`는 ID 목록의 첫 100개만 생성하며 `dynamicParams=false`다. 주석은 “최근 100개”지만 `getAllPostIds`에 정렬이 없어 최근 순서를 보장하지 않는다. JSON은 기본 24h 목록의 최대 10,000개로 별도 범위다. 검색·공유·최근 읽은 글·댓글 이동에서 대상 HTML과 JSON이 존재하는지 확인한다.
   근거: [상세 페이지](../app/(feed)/posts/[id]/page.tsx)의 `generateStaticParams`; [조회](../lib/queries.ts)의 `getAllPostIds`, `getAllPosts`, `getPostsBy`; [JSON 빌드](../scripts/build-post-json.ts)의 `buildAllPosts`; [상세 UI](../components/post-detail.tsx)의 `copyShareLink`, 댓글 이동 처리.
2. **검색 범위와 상세 범위:** 검색 인덱스는 모든 비삭제 글을 사용하고 검색 결과는 `/posts/:id`로 직접 이동한다. 인덱스에 존재하는 글이 상세 HTML 범위 밖일 수 있다.
   근거: [조회](../lib/queries.ts)의 `getAllPostsForSearch`; [검색 UI](../app/search/SearchPageClient.tsx)의 결과 `Link`.
3. **키워드 페이지 50개와 임의 키워드:** 페이지·JSON은 상위 50개만 생성한다. 목록에 없는 태그는 검색으로 연결하지만 고객별 임의 키워드 감시 기능은 아니다.
   근거: [키워드 페이지](../app/keywords/[keyword]/page.tsx)의 `generateStaticParams`; [링크 훅](../hooks/use-keyword-manifest.ts)의 `getKeywordLink`.
4. **키워드 기간 선택:** 기본 생성은 1w인데 필터는 네 기간을 제공한다. 배포에 필요한 다른 기간의 JSON이 존재하는지 확인한다.
   근거: [키워드 빌드](../scripts/build-keyword-json.ts)의 `rangesToBuild`; [필터](../components/feed-controls.tsx)의 `order`.
5. **홈 기간 및 상단 JSON:** `selectedRange`는 24h 고정이고 상단 네 섹션은 페이징을 끈다. `PostGrid`는 이때 JSON base를 넘기지 않으므로 JSON 교체만으로 상단 카드가 갱신된다고 설명할 수 없다.
   근거: [홈](../app/(feed)/page.tsx)의 `selectedRange`, `enablePaging`; [그리드](../components/post-grid.tsx)의 `base`.
6. **카테고리 초기 페이지 크기:** HTML 초기 조회는 30개, JSON 기본 생성은 20개다. 후속 페이지는 ID 중복 제외가 있더라도 경계와 누락 여부를 확인한다.
   근거: [카테고리 페이지](../app/[category]/page.tsx)의 `options`; [카테고리 빌드](../scripts/build-category-json.ts)의 `PAGE_SIZE`; [무한 목록](../components/infinite-post-list.tsx)의 `seenIdsRef`.
7. **옵션·경로 연결:** 키워드 `viewMode`는 주 경로 `PostGrid`에 전달되지 않는다. 카테고리 사이드바는 저장된 비기본 기간에 `/category/range`로 이동하지만 현재 페이지는 `?range=`를 사용한다.
   근거: [키워드 피드](../components/KeywordFeed.client.tsx)의 `viewMode`, `PostGrid`; [카테고리 목록](../components/category-list.client.tsx)의 `handleCategoryClick`; [카테고리 피드](../components/CategoryFeed.client.tsx)의 `handleRangeChange`.
8. **안내 페이지:** 푸터에는 약관·개인정보·문의·소개 링크가 있지만 해당 정적 페이지 구현은 없다. 광고·유료 전환 전 사용자 안내 동선을 점검한다.
   근거: [푸터](../components/footer.tsx)의 `Footer`; 실제 `app`의 `page.tsx` 목록.

## 7. 기업/소상공인 제품과의 현재 거리

현재 UI는 분석 결과를 콘텐츠 추천·분류·이슈 묶음에 적용하는 대중용 소비 화면이다.
이 웹 조사 범위에서 고객별 조직/권한, 관찰 키워드 등록, 브랜드 평판 추이, 감지 알림, 대응 작업함, 유료 구독/결제, AdSense 연결은 발견하지 못했다.
이를 백엔드 전체에 관련 기술이 없다는 뜻으로 확대하지 않는다. 별도 수집·분석 저장소와 운영 체계는 별도로 조사해야 한다.
근거: [홈](../app/(feed)/page.tsx)의 `Home`, [상세](../components/post-detail.tsx)의 `PostDetail`, [검색](../app/search/SearchPageClient.tsx)의 `SearchPageClient` 및 현재 웹 경로 목록.

대중용 UX 안정화와 기업용 데이터 계약·감지 지연·알림·대응 기록 설계는 후속 과제로 구분한다.
사업 방향에 맞게 사용자 전환 동선을 바꾸더라도 공통 분석 결과의 의미와 품질 기준을 별도로 명시해야 한다.

## 8. 제안: 업그레이드 전후 대표 검증 시나리오

아래 시나리오는 검증 계획이다. 이번 조사에서 실행하거나 통과를 확인하지 않았다.
환경·데이터 생성 시각·계정 상태를 기록하고 업그레이드 전후에 동일한 조건으로 비교한다.

| 시나리오 | 확인할 결과 |
| --- | --- |
| 비로그인 홈 방문 → 카드 클릭 | 카드·통계 표시, 원문 새 탭 이동, 읽음 표시와 최근 읽은 글 반영 |
| 로그인 → 카드 클릭 → 좌우 이동 → 닫기 | 상세 JSON 로딩, 본문·미디어, 현재 목록의 이전/다음 글, 원래 스크롤 위치 유지 |
| 검색 → 최근 글/오래된 글 선택 | 제목·본문·태그 검색, 상세 직접 URL의 존재, 검색 범위 밖/빈 결과의 안내 |
| 모달 → 공유 링크 복사 → 새 탭 → 댓글 이동 | 직접 접근과 댓글 이동이 생성 범위 안팎에서 일관되게 처리되는지 |
| 카테고리 네 기간 전환 → 다중 커뮤니티 필터 | 요청 JSON 경로, 초기·후속 페이지 경계, 중복/누락, 필터 해제 후 목록 회복 |
| 키워드 네 기간·보기 모드 전환 | 생성 파일 존재, 최신 선택 데이터만 표시, 그리드/리스트 실제 전환 |
| 읽음/안읽음 전환 → 새로고침 → 다른 탭 | 로컬 기록 유지, 30일/5,000개 제한, 브라우저 이벤트 반영 |
| 긴 피드 스크롤 → 상세 방문 → 복귀 | 가상화 행 크기, 후속 페이지 선행 로딩, 앵커 복귀, 모바일 레이아웃 |
| manifest 변경 → 기존 캐시로 재방문 | 새 `generatedAt` 페이지 사용, 오래된 페이지 재사용 여부, 로딩 끝 페이지 판단 |
| JSON 404/빈 목록/검색 인덱스 실패 | 무한 로딩·반복 요청 여부, 빈 상태와 실패 상태를 사용자가 이해할 수 있는지 |
| 댓글 작성·추천·북마크 후 새로고침 | 현재 로컬 UI 수준임을 확인; 서버 기능 도입 시 인증·저장·재조회 기준을 새로 정의 |
| Pages 배포·R2 업로드 뒤 확인 | `/data/...` 접근, 콘텐츠/manifest 시각 일치, 캐시 헤더, 상세 직접 링크와 JSON 범위 일치 |

후속 채팅에서는 이 문서를 현재 소스의 기준으로 사용하고, 실제 실행 결과는 환경·확인 시각과 함께 별도로 추가한다.
