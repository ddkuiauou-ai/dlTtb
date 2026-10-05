# Next.js 16 및 관련 라이브러리 업그레이드 현황 조사

> 이 문서는 업그레이드 **전** 현황과 당시 판단을 보존한 조사 기록이다. 승인한 업그레이드는 이후 실행했으며, 현재 버전·코드·검증 결과는 [실행 결과](/Users/craigchoi/silla/is/doc/NEXT16_UPGRADE_RESULT_2026-10-05.md)를 기준으로 확인한다.

조사일: 2026-10-05, Asia/Seoul. 대상: `/Users/craigchoi/silla/is`. 기준 커밋: `35c645b52e46b3456127809b0233cf3839cc6fa1` (`main`). 시작 작업 트리는 깨끗했다.

사용자는 **현황 조사 → 계획 수립 → 계획에 따른 업그레이드** 순서로 진행하며, **Cloudflare를 계속 사용**한다고 확인했다. 후속 지시로 **use cache를 도입하지 않고 현재 캐시·피드 구조를 유지하며 TanStack 조사도 포함**하기로 했다. 이후 제안에 맞춰 **Workers + OpenNext를 이전 목표로 두고 로컬 구현·검증 후 실제 배포는 사용자가 수작업으로 확인**하는 계획으로 갱신했다. 이 문서는 그 조건을 반영한 조사 결과다. 앱 코드, 의존성, 잠금 파일, DB, 배포는 변경하지 않았다. 인접 `dag`·`tem` 프로젝트는 업그레이드 대상에 포함하지 않았다.

## 1. 핵심 판단

- 실제 설치 및 잠금 버전은 Next.js **15.5.4**, React/React DOM **19.1.1**이다. 조회한 npm `latest`는 Next.js **16.3.8**, React/React DOM **19.3.0**이다. 단순히 16.0.0으로 올리는 목표는 적합하지 않다.
- `unstable_cache`, React 서버 `cache()`, `next/cache`, `use cache`, tag/path 재검증은 사용하지 않는다. 현재 핵심인 **사전 생성 HTML·JSON + 브라우저 IndexedDB·메모리 캐시**를 유지한다. **cacheComponents/PPR/use cache 이전은 이번 계획에서 제외**한다.
- TanStack 사용은 **@tanstack/react-virtual 3.13.12**와 간접 의존성 **virtual-core 3.13.12**다. Query/Router/Table/Start는 실제 앱에 없다. 가상화와 데이터 캐시는 역할이 다르다.
- CI의 `@cloudflare/next-on-pages`는 deprecated이고 Next16을 지원하지 않는다. **Workers + OpenNext로 이전하는 계획**이며, 실제 Cloudflare 배포 성공을 기다리지 않고 로컬 어댑터 build·Workers preview까지 검증한다.
- 홈의 일부 조회 함수에는 DB 쓰기가 섞여 있다. 현재 행위를 유지하며 fixture 빌드로 검증한다. 서버 캐시 도입용 읽기/쓰기 재설계를 필수 이전 작업으로 두지 않는다.
- 보안 검사에는 직접·간접 의존성 경고가 있다. TypeScript 등은 최신끼리도 peer 지원 범위가 충돌한다. 목표는 **호환성과 보안 패치를 확인한 최신 조합**이어야 한다.

최신 값은 2026-10-05 npm registry 조회 결과이며 설치·호환 검증을 완료한 목표 조합은 아니다. [Next registry](https://registry.npmjs.org/next/latest), [React registry](https://registry.npmjs.org/react/latest).

## 2. 환경과 실행 경로

| 항목 | 확인한 현황 | 업그레이드 계획에 미치는 영향 |
| --- | --- | --- |
| 프레임워크 | Next App Router, TypeScript, React 19 | Next 15 → 16 한 단계 이전 |
| 로컬 | Node 22.14.0, pnpm 10.7.1 | CI와 버전이 다름 |
| CI | Node 20, pnpm 9, frozen lockfile | Node 20은 조사일 기준 EOL; 지원 중인 LTS와 pnpm 고정 필요 |
| 버전 고정 | engines/packageManager/.nvmrc/.node-version 없음 | 로컬·CI 재현성 보완 대상 |
| Next 설정 | trailingSlash=true, images.unoptimized=true, export 설정은 주석 | 완전한 static export 앱이라고 단정할 수 없음 |
| 빌드 | pnpm build는 Next 빌드만; JSON 생성은 build:data 별도 | CI와 로컬 데이터 생성 범위 차이 정리 필요 |
| 배포 CI | next-on-pages → .vercel/output/static → Pages | Next 16용 배포 경로 검토 필요 |
| 데이터 배포 | 목록/검색/키워드/홈 JSON은 Pages, 상세 JSON은 R2 | /data/posts/v1/ 외부 라우팅과 캐시 규칙 미확인 |
| 갱신 실행 | main push 또는 workflow_dispatch; CI cron 없음 | 프레임워크 캐시 TTL과 데이터 생성 주기가 별개 |
| CI 품질 검사 | 별도 test/tsc/lint/browser step 없음 | Next 16 build의 lint 제거에 대응해 검사 단계를 명시 |

근거: [manifest](/Users/craigchoi/silla/is/package.json:5), [Next 설정](/Users/craigchoi/silla/is/next.config.mjs:1), [CI 환경](/Users/craigchoi/silla/is/.github/workflows/build-contents.yml:31), [배포](/Users/craigchoi/silla/is/.github/workflows/build-contents.yml:380), [Node 지원 상태](https://nodejs.org/en/about/previous-releases).

## 3. 라우트·서버 데이터 현황

| 경로 | 렌더링·초기 데이터 계약 | 근거 |
| --- | --- | --- |
| 홈 / | 순차 조회 함수 호출 5차례: 랭킹 2, 클러스터 2, fresh 1. 각 함수는 여러 SQL을 실행하며 제외 ID를 다음 호출에 전달. dynamic/revalidate 선언 없음 | [Home](</Users/craigchoi/silla/is/app/(feed)/page.tsx:37>) |
| /[category] | 17개 카테고리 정적 생성, 기본 24h 첫 30개; force-static, dynamicParams=false, revalidate=false | [category](/Users/craigchoi/silla/is/app/[category]/page.tsx:5) |
| /keywords/[keyword] | 상위 50개 정적 생성, 기본 1w 첫 20개; 위와 같은 정적 설정 | [keyword](/Users/craigchoi/silla/is/app/keywords/[keyword]/page.tsx:5) |
| /posts/[id] | 100개 ID만 HTML 생성; 본문·댓글·관련 글 DB 조회; 미생성 URL은 404 계약 | [posts](</Users/craigchoi/silla/is/app/(feed)/posts/[id]/page.tsx:13>) |
| /search | 브라우저 MiniSearch와 search-index.json; 클라이언트를 Suspense로 감쌈 | [search](/Users/craigchoi/silla/is/app/search/page.tsx:29) |
| /test-feed 및 fixture API | force-dynamic; production에서는 404, API 응답 no-store | [fixture API](/Users/craigchoi/silla/is/app/api/test-feed/[scenario]/[file]/route.ts:4) |

홈 주석/manifest의 “live SSR” 표기만으로 요청마다 조회한다고 확정하면 안 된다. 요청 시 렌더링을 강제하는 cookies/headers/connection 등의 사용이 없으므로 실제 Next 빌드의 정적/동적 분류와 운영 결과를 확인해야 한다. 이번에는 DB 부작용 때문에 빌드를 재실행하지 않았다.

Header는 getSites(), Sidebar는 getTrendingKeywords("6h") 및 getHomeStats24h()를 조회한다. Sidebar component 안의 dynamic/revalidate export는 app route 설정으로 작동하지 않는다. 키워드 page/layout은 각각 getTopKeywords(50)를 호출하며 서버 조회 memoization은 없다. 상세 ID 조회에는 정렬이 없어 “최근 100개”를 보장하지 않는다. [Header](/Users/craigchoi/silla/is/components/header.tsx:4), [Sidebar](/Users/craigchoi/silla/is/components/sidebar.tsx:10), [ID 조회](/Users/craigchoi/silla/is/lib/queries.ts:481).

## 4. 현재 캐시와 갱신 방식

| 층 | 저장·갱신 방식 | Next 16 도입 시 고려할 점 |
| --- | --- | --- |
| 서버 HTML | 정적 라우트는 revalidate=false, 재배포로 갱신 | 버전업만으로 데이터가 더 자주 갱신되지 않음 |
| 생성 JSON | manifest generatedAt으로 세대 구분; 홈 page에도 generatedAt 포함, 홈 staging 검증 후 교체 | 카테고리/키워드 page에는 generatedAt가 없어 검증 강도가 다름 |
| IndexedDB | `isshoo-v1`, 페이지 최대 3,000개 LRU; base/page 및 generatedAt 검증 | Next 서버 캐시와 목적이 다름; 그대로 보존할 수 있음 |
| manifest 요청 | 브라우저 no-cache 네트워크 우선, 실패 시 IDB fallback; 인스턴스별 요청 시 재확인 최소 간격 5초 | 정기 polling이나 서버 Data Cache 사용을 뜻하지 않음 |
| 피드 페이지 | IDB hit 우선, miss 네트워크, write-through, 다음 페이지 prefetch | 홈 세대 검증과 append 중단·갱신 안내 유지; page 세대 없는 경로는 별도 계약 확인 |
| 메모리 | PostCacheProvider의 섹션별 Map | 카드/목록 데이터; 모달 열림·ID·순서는 별도 ModalProvider가 관리 |
| 사용자 기록 | 읽음 localStorage 30일/5,000개; 스크롤 sessionStorage | 공유 서버 캐시에 사용자 기록 포함 금지 |
| 키워드 manifest | 모듈 변수/Promise; TTL 없음, 실패도 빈 결과로 고정 | 갱신/재시도 정책 검토 후보 |
| 상세 모달 | posts/v1/id.json 브라우저 fetch; 별도 세대 검증·IDB 상세 캐시 없음 | 공개 URL/CDN freshness를 별도로 확인 |

근거: [IDB](/Users/craigchoi/silla/is/lib/idb-cache.ts:47), [페이지 계약](/Users/craigchoi/silla/is/lib/page-cache-entry.ts:20), [generation 검증](/Users/craigchoi/silla/is/components/infinite-post-list.tsx:1689), [생성기 계약](/Users/craigchoi/silla/is/scripts/utils/home-feed-generation.ts:5), [읽음](/Users/craigchoi/silla/is/lib/read-marker.ts:21), [키워드 manifest](/Users/craigchoi/silla/is/hooks/use-keyword-manifest.ts:10), [상세 fetch](/Users/craigchoi/silla/is/components/post-viewer-modal.tsx:20).

홈 상단 갱신은 router.refresh()이다. 이 호출이 새 HTML 초기 데이터와 기존 피드 목록을 어떻게 조정하는지 현재 동작을 회귀 검증한다. router.refresh는 Data/Full Route Cache 무효화 API가 아니지만, 이번에는 별도 서버 캐시/태그 무효화 계층을 추가하지 않는다. [현재 코드](/Users/craigchoi/silla/is/components/top-refresh-on-scroll.tsx:54), [공식 useRouter](https://nextjs.org/docs/app/api-reference/functions/use-router).

## 5. 확정한 범위: 현재 캐시 구조 유지

Next16 이전에서 `cacheComponents`를 활성화하지 않고 `use cache`, cacheLife/cacheTag, 새 태그 무효화 구조를 추가하지 않는다. Cache Components는 선택 기능이며, 비활성 상태에서는 현재 route의 dynamic/revalidate/dynamicParams 설정을 버전업만을 이유로 제거할 필요가 없다. 기존 정적 생성 범위와 미생성 상세·키워드 URL의 404 계약을 보존한다. [Next 설정](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents), [route 설정](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config).

기존 조사에서 Cache Components 활성화를 전제로 제안한 공개 조회 캐시화, Suspense 재배치, Activity 상태 보존 대응, 노출 기록 재설계, 지속 캐시·태그 연결은 이번 이전의 필수 작업에서 제외한다. Next16 자체 기능을 쓰는 데 Cache Components 활성화가 필요한 것은 아니다. React Compiler도 이번 버전업의 기본 작업에 포함하지 않는다.

현재 홈 ranked/cluster 함수의 rotation UPSERT는 기존 동작으로 남아 있다. 이를 바꾸지 않더라도 빌드·검증에서 업무 DB에 쓰지 않는 fixture 사용은 필요하다. 이전 후 조회 횟수나 정적/동적 분류가 달라지면 기존 DB 부작용이 언제 발생하는지 확인한다. [기록 helper](/Users/craigchoi/silla/is/lib/queries.ts:372), [ranked](/Users/craigchoi/silla/is/lib/queries.ts:916), [cluster](/Users/craigchoi/silla/is/lib/queries.ts:1176).

JSON·IndexedDB·manifest 세대·중복 제거·스크롤 복원 계약은 유지한다. TanStack Virtual 업그레이드도 이 캐시 정책을 대체하지 않는다. 성능 이익은 보안 패치, Turbopack 빌드, React/Virtual 호환 수정 등 실제 변경과 측정 결과로 평가한다.

## 6. TanStack 사용 현황과 공식 연구

### 실제 사용 범위

| 패키지 | 현재 잠금/설치 | 조회한 이전 후보 | 역할 |
| --- | --- | --- | --- |
| @tanstack/react-virtual | 3.13.12 | 3.14.13 | React 가상화 adapter |
| @tanstack/virtual-core | 3.13.12, 간접 의존성 | adapter 3.14.13의 정확 의존성 3.17.11 | 측정·가시 범위·스크롤 엔진 |
| Query / Router / Table / Start | 미설치·앱 사용 없음 | 새 도입하지 않음 | 현재 기능 이전에 필요하지 않음 |

React/DOM peer는 현재와 목표 모두 ^16.8.0 || ^17 || ^18 || ^19이다. React19는 선언 범위 안이지만 실제 동작 검증을 대신하지 않는다. 두 adapter 버전과 core의 Node engines는 미선언이다. adapter와 core 버전 번호를 같게 맞추는 것이 아니라 adapter가 요구한 core를 잠금 파일로 재현한다. [manifest](/Users/craigchoi/silla/is/package.json:64), [현재 registry](https://registry.npmjs.org/@tanstack/react-virtual/3.13.12), [목표 registry](https://registry.npmjs.org/@tanstack/react-virtual/3.14.13).

TanStack Virtual은 화면에 필요한 목록 요소의 렌더링·측정 도구다. JSON fetch/retry/중복 제거/manifest 세대/IndexedDB는 이 앱의 자체 로직이다. 과거 doc/ui.md의 React Query 예시를 실제 도입으로 간주하지 않는다. TanStack Query는 서버 데이터 상태·요청·캐시 라이브러리지만, 현재 데이터 계층을 교체할 필요성이 확인되지 않았으므로 이번 이전에 추가하지 않는다. Router/Start로의 프레임워크 이전도 이번 범위 밖이다. [Virtual 소개](https://tanstack.com/virtual/latest/docs/introduction), [Query 역할](https://tanstack.com/query/latest/docs/framework/react/overview).

### 화면별 실제 적용

| 화면 | 실제 렌더링과 근거 |
| --- | --- |
| 홈 최신 피드 | layout=list → useWindowVirtualizer. [호출](</Users/craigchoi/silla/is/app/(feed)/page.tsx:172>) |
| 홈 상단 4개 섹션 | layout=grid, paging=false → 일반 grid/샘플. [호출](</Users/craigchoi/silla/is/app/(feed)/page.tsx:109>) |
| 카테고리 목록·그리드 보기 | layout=list를 유지하고 grid 카드·최대 3열을 적용하므로 두 보기 모두 가상행. [호출](/Users/craigchoi/silla/is/components/CategoryFeed.client.tsx:125) |
| 키워드 | layout 관련 props를 전달하지 않아 PostGrid 기본 grid → 일반 grid. viewMode UI/state가 렌더러에 전달되지 않는 현황도 기록한다. [호출](/Users/craigchoi/silla/is/components/KeywordFeed.client.tsx:85) |

가상화는 layout=list 분기에서만 작동하며 일반 layout=grid는 visiblePosts 전체 DOM을 렌더한다. 카테고리의 grid 카드 보기와 일반 grid 렌더러를 구분한다. 카드를 1–3열 행으로 묶는 방식이며 TanStack lanes/masonry는 사용하지 않는다. 이것은 사용 현황이며 키워드 화면의 별도 동작 수정은 업그레이드 필수 범위로 추가하지 않는다. [분기](/Users/craigchoi/silla/is/components/infinite-post-list.tsx:2265), [일반 grid](/Users/craigchoi/silla/is/components/infinite-post-list.tsx:2340).

### 버전 변경에서 실제 영향을 받는 계약

- overscan은 viewport의 0.3 비율, 최소 2/최대 64행이며 load-ahead는 약 1 viewport다. count는 글 수/열 수의 올림, getItemKey는 행 첫 글 ID다. rangeExtractor는 활성 미리보기·복원 앵커 행을 유지한다. [상수](/Users/craigchoi/silla/is/components/infinite-post-list.tsx:30), [설정](/Users/craigchoi/silla/is/components/infinite-post-list.tsx:794).
- 실제 피드 문서 위치를 관측하는 scrollMargin과 vi.start-scrollMargin transform을 함께 사용한다. append·상단 높이·필터·폭/열 변경·뒤로가기에서 읽던 글 위치를 보존해야 한다. [관측](/Users/craigchoi/silla/is/hooks/use-feed-scroll-margin.ts:51), [행 배치](/Users/craigchoi/silla/is/components/infinite-post-list.tsx:1181).
- default measureElement/ResizeObserver와 자체 행 높이 추정치를 사용한다. 일반 append는 기존 측정값을 유지하고 레이아웃 변경 때만 measure와 DOM 앵커 보정을 수행한다. [측정](/Users/craigchoi/silla/is/components/infinite-post-list.tsx:735), [레이아웃 처리](/Users/craigchoi/silla/is/components/infinite-post-list.tsx:807).
- 현재 상세/URL 복원은 getOffsetForIndex → scrollToOffset 후 DOM 앵커 보정으로 구현돼 있다. 목표 core는 scrollToOffset에도 scroll state/reconcile loop를 사용하므로 **현재 코드의 한 번 이동이라는 주석을 새 버전 동작으로 보장하면 안 된다**. wheel/touch/pointer/key 취소 이후 라이브러리 보정이 다시 스크롤을 강제하지 않는지 검증한다. [복원 helper](/Users/craigchoi/silla/is/components/infinite-post-list.tsx:109).
- 초기 SSR용 initialRect/측정 snapshot 설정은 없고 실제 행은 클라이언트 관측 후 계산한다. 첫 표시·수화·Strict Mode cleanup을 이전 전후 비교하며 SSR 설계 자체는 바꾸지 않는다. Virtual은 DOM 수를 제한할 뿐 전체 목록 데이터·메모리 캐시를 자동으로 줄이지 않는다.

### 공식 릴리스·태그 소스에서 확인한 변화

1. adapter 3.14.13은 measureElement ref callback의 React commit 중 flushSync만 생략해 경고를 줄인다. ResizeObserver/스크롤 알림은 계속 동기 처리한다. useFlushSync 옵션은 3.13.15에 생겼으므로 현재 3.13.12 기능으로 설명하지 않는다. 목표에서도 기본 true를 유지하고 false를 성능 개선으로 임의 적용하지 않는다. [릴리스](https://github.com/TanStack/virtual/releases/tag/%40tanstack%2Freact-virtual%403.14.13), [PR1282](https://github.com/TanStack/virtual/pull/1282).
2. 목표 core는 측정값이 있는 ref 재실행에서 동기 DOM 측정을 건너뛰고 ResizeObserver 갱신을 기다린다. 처음 측정과 재측정의 스크롤 보정 조건도 다르며, backward 스크롤과 iOS momentum 처리에 변화가 있다. 이미지·폰트·높이 변화·빠른 양방향 스크롤을 검증한다. [목표 core 소스](https://github.com/TanStack/virtual/blob/%40tanstack%2Freact-virtual%403.14.13/packages/virtual-core/src/index.ts).
3. directDomUpdates는 3.14.0부터의 선택 옵션이며 기본 false다. 켜면 container size와 행 위치를 라이브러리가 소유해야 하는데 현재 JSX는 height/transform을 직접 지정한다. 이번에는 새 옵션·마크업 변경·lanes를 도입하지 않는다. [목표 adapter 소스](https://github.com/TanStack/virtual/blob/%40tanstack%2Freact-virtual%403.14.13/packages/react-virtual/src/index.tsx).
4. core의 count 변경 notify 패치는 중간 버전에서 되돌려졌다. 필터 시 높이가 자동으로 고쳐진다는 확정 이익으로 설명하지 않는다. React19 peer 지원과 React Compiler 호환 완료도 구분한다. Compiler는 현재 꺼져 있고 이번 계획에서도 유지한다. [core changelog](https://github.com/TanStack/virtual/blob/%40tanstack%2Freact-virtual%403.14.13/packages/virtual-core/CHANGELOG.md), [공식 Compiler 이슈](https://github.com/TanStack/virtual/issues/1119).

### TanStack 검증 기준

기존 좌표 시험은 7,560 조합 및 같은 virtualizer의 연속 360 변화를 확인한다. harness가 internal _willUpdate와 measurementsCache를 직접 사용하므로 core 변경 후 테스트 모델도 검토하되 실제 DOM 회귀를 숨기기 위해 기대값만 바꾸지 않는다. 기존 Chromium 33개 시험에는 잘못된 margin 대조군 1개가 포함된다. 초기 표시·가변 높이·append·누락/재시도·필터·폭/열·상세 복원·URL 진입·IDB/세대·사용자 취소 검증에 이 시험을 재사용한다. [좌표 시험](/Users/craigchoi/silla/is/lib/__tests__/virtual-feed-geometry.test.ts:6), [브라우저 기준](/Users/craigchoi/silla/is/tests/browser/README.md:11).

기존 허용치는 측정된 행 배치/해당 reference 비교 1px, 읽던 글·상세 복원 화면 위치 2px다. 미측정 prefix 전체 문서 좌표의 66px 차이는 별도 제한이며 모든 복원을 1px 기준으로 바꿔 주장하지 않는다. Safari/실제 모바일은 기존 증거 밖이므로 가능한 WebKit 시험과 실제 iOS 확인 여부를 구분해 기록한다. **이 후속 조사는 문서 갱신이며 새 버전 설치·브라우저 재검증을 수행하지 않았다.**

연구 메타데이터·현재/목표 태그·검증 후보는 [TanStack 조사 JSON](/Users/craigchoi/silla/is/doc/validation/tanstack-assessment-2026-10-05.json)에 보존한다.

## 7. Cloudflare를 유지할 때의 변경 범위

현 next-on-pages는 deprecated/archived이고 Edge runtime 중심이다. Next 자체 build 성공과 next-on-pages/Pages 배포 성공은 별개의 검증이다. 개발용 force-dynamic Node route도 남아 있어 기존 어댑터와의 충돌 가능성을 실제 빌드로 확인해야 한다. [next-on-pages 저장소](https://github.com/cloudflare/next-on-pages).

공식 Next 빌드 산출물과 Turbopack을 유지하는 **Workers + OpenNext를 이전 목표로 정한다.** Cache Components 없이 사용할 수 있으며, 조사 시 최신 **@opennextjs/cloudflare 1.20.8은 Next 16.3.8 또는 15.5.27 이상을 요구**한다. Next 자체 build뿐 아니라 어댑터 preview의 로컬 런타임 검증을 포함한다. [지원 범위](https://opennext.js.org/cloudflare), [1.20.8](https://github.com/opennextjs/opennextjs-cloudflare/releases/tag/@opennextjs%2Fcloudflare@1.20.8).

**완전한 static export + 기존 Pages**는 조사에서 확인한 대안이지만 후속 계획의 비교·결정 단계에서 제외한다. Workers + OpenNext를 진행하는 데 static export 가능성 검증을 선행 조건으로 두지 않는다. 현재 output=export가 꺼져 있고 force-dynamic fixture page/API가 있으며, 개발 fixture 검증은 별도 실행 경로로 보존한다. [Next static export](https://nextjs.org/docs/app/guides/static-exports), [Cloudflare static Pages](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/).

조사일의 Cloudflare 기본 가이드는 **vinext(beta)**를 권장하고 OpenNext 및 static export Pages 경로도 제공한다. 따라서 “Cloudflare 공식 기본 권장은 OpenNext”라고 단정하지 않는다. vinext는 빌드 도구·구현 변경도 포함하므로 이번 계획의 기본 작업으로 추가하지 않는다. [Cloudflare 가이드](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/).

OpenNext 이전 계획에는 다음 사항이 현재 구성에 추가된다.

- Wrangler/OpenNext 설정, nodejs_compat, 로컬 Workers preview, CI 빌드 산출물과 수동 배포·도메인·R2 경로 인계 문서.
- 전역 pg Pool/Drizzle db는 **실제 Workers 런타임 DB 경로가 있을 때** 연결 수명과 요청 간 재사용을 검토한다. 빌드 전용 조회라면 Next16만을 이유로 요청별 factory를 강제할 필요가 없다. [현재 DB](/Users/craigchoi/silla/is/lib/db.ts:8), [OpenNext DB](https://opennext.js.org/cloudflare/howtos/db).
- 런타임 DB가 필요할 때 접근 방법을 결정한다. Hyperdrive는 선택지이며 필수로 확정하지 않았다. 선택 시 pg 최소 8.16.3이 필요하고 현재는 8.16.1이다. [Cloudflare pg/Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/).
- 완전 SSG인 경로는 read-only Static Assets incremental cache 구성을 검토할 수 있으며 재검증 Queue·Tag Cache가 필요하지 않다. 새 R2/DO/D1 캐시·태그 계층 전체를 기본 요구로 잡지 않는다. R2 상세 JSON은 현재 별도 데이터 저장소로서의 역할을 유지한다. [OpenNext SSG 캐시](https://opennext.js.org/cloudflare/caching).

**원격 배포와 로컬 검증은 분리한다.** 공식 CLI의 build는 Next 산출물을 Workers용으로 변환하고 preview는 로컬 캐시·Wrangler 개발 서버를 사용한다. 로컬 어댑터 build/Workers preview를 구현 완료 기준에 포함하되 실제 계정·도메인·리소스 바인딩·운영 연결 성공은 사용자의 후속 수작업 확인으로 남긴다. 원격 deploy/upload·버킷 생성은 이번 로컬 작업에서 수행하지 않는다. [OpenNext 로컬 실행](https://opennext.js.org/cloudflare/get-started), [CLI build/preview/deploy](https://opennext.js.org/cloudflare/cli).

특히 앱의 상세 fetch는 같은 origin의 `/data/posts/v1/{id}.json`이다. CI는 상세 JSON을 앱 public 자산과 별도 R2에 업로드하므로 **Workers 전환 후 기존 R2 경로 연결은 실제 배포 인수 항목**이다. 로컬 fixture JSON 응답을 R2 연결 성공으로 판단하지 않는다. [상세 fetch](/Users/craigchoi/silla/is/components/post-viewer-modal.tsx:22), [앱 자산 병합](/Users/craigchoi/silla/is/.github/workflows/build-contents.yml:332), [R2 업로드](/Users/craigchoi/silla/is/.github/workflows/build-contents.yml:400).

## 8. 라이브러리 이전 부담

직접 의존성은 runtime 57개 + dev 14개, 총 **71개**다. 65개는 최신과 차이가 있고 6개는 같다. 전체 선언·설치·최신·peer 메타데이터는 아래 부록과 별도 JSON에 기록했다.

| 묶음 | 현재 → 조회한 최신 후보 | 필요한 검토 |
| --- | --- | --- |
| Next + eslint-config-next | 15.5.4 → 16.3.8 | 함께 이전; next lint/nextConfig.eslint 제거, CLI·flat config, CI lint 명시 |
| React + DOM | 19.1.1 → 19.3.0 | 같은 버전, 타입 패키지와 UI/auth peer 검증 |
| TypeScript | 5.9.2 → 7.0.2 | 최신 typescript-eslint 8.71.0은 TS >=4.8.4 <6.1.0만 지원; TS7 일괄 적용은 충돌. TS6 최신 6.0.3은 범위 내 후보 |
| ESLint | 9.35.0 → 10.12.0 | 최신 react/import/jsx-a11y plugin도 peer는 ESLint9까지; ESLint9 최신 패치 조합부터 검토 |
| Tailwind + merge | 3.4.17/2.6.0 → 4.3.3/3.7.0 | PostCSS plugin·CSS 진입점·config·container query·animate 및 UI 시각 검증 |
| Clerk | clerk-react 5.47.0 → 구 패키지 latest 5.61.3 | 구 패키지 deprecated; @clerk/react 6.17.5로 rename/Core 3 이전 후보 |
| Drizzle + pg | ORM 0.44.4, kit 0.31.4, pg 8.16.1 → 0.45.3/0.31.11/8.23.1 | 보안 패치, 쿼리/타입/Workers 연결 확인; 자동 DB migration 금지 |
| 폼/검증 | Zod 3.25.67, resolvers 3.10.0 → 4.6.5/5.9.1 | 소비 경로·스키마 API·react-hook-form peer 확인 |
| UI wrapper | day-picker 8.10.1, resizable 2.1.9, Recharts 2.15.0 → 10.0.2/4.14.2/3.10.1 | 로컬 calendar/resizable/chart 코드와 새 API 대응 |
| motion/icon | 12.23.12/0.454.0 → 14.0.0/1.52.0 | 애니메이션·export·타입·렌더링 검증 |
| virtual/search | react-virtual 3.13.12, MiniSearch 7.1.2 → 3.14.13/7.2.0 | 가상화 좌표·복원, 검색 인덱스 호환성 |

현재 조합에도 peer 불일치가 있다. next-on-pages 1.13.16의 Next peer는 >=14.3.0 <=15.5.2라 현재 15.5.4와 어긋난다. day-picker 8은 React18까지/date-fns2·3을 지원하는데 현재는 React19/date-fns4다. vaul 0.9.9도 React18까지다. 현재 검사 통과와 공식 지원 조합인지는 구분한다.

일부 폼/달력/차트/리사이즈 패키지는 앱 진입점에서의 사용이 정적 분석으로 확인되지 않지만 wrapper 파일 자체가 TypeScript 검사 대상이다. “화면에서 미사용이니 최신으로 올려도 영향 없음”으로 처리하지 않는다. 정적 import 추적은 dynamic import·config·생성 스크립트 등 모든 사용을 보증하지 않는다. [wrapper 예시](/Users/craigchoi/silla/is/components/ui/resizable.tsx:11), [TS 포함 범위](/Users/craigchoi/silla/is/tsconfig.json:25).

캐시 관련 잔여 코드도 구분했다. PostDetailLoader는 정의만 있고 호출처가 없으며, useScopedFeedPrefs의 유일한 component 호출은 page 파일이 없는 중첩 경로 안에 있다. 실제 CategoryFeed/KeywordFeed 주 경로에 그 영속 preference 훅이 적용됐다고 간주하지 않는다. [미사용 loader](/Users/craigchoi/silla/is/components/post-detail-loader.tsx:9), [별도 client 파일](/Users/craigchoi/silla/is/app/keywords/[keyword]/[[...range]]/KeywordFeed.client.tsx:25).

React request API 이전은 비교적 적다. 현재 해당 서버 route의 params/searchParams는 Promise + await이며, 서버 cookies/headers/draftMode, middleware/proxy, next/font 사용은 없다. next/image는 2곳이지만 unoptimized=true이므로 버전업만으로 이미지 최적화 이익을 기대할 수 없다. React Compiler도 현재 미사용이며 도입은 별도 검증 대상이다. [Next 16 이전 가이드](https://nextjs.org/docs/app/guides/upgrading/version-16).

Clerk의 rename은 공식 Core 3 가이드와 npm deprecation을 확인했다. 현재 client provider를 유지하는 이전과 @clerk/nextjs 서버 인증 도입은 다른 범위다. [Clerk Core 3](https://clerk.com/docs/guides/development/upgrading/upgrade-guides/core-3).

## 9. 보안 검사 결과와 적용 전제

pnpm audit 조회는 **Critical 4 / High 69 / Moderate 52 / Low 12 = 137건**을 집계했다. 응답에는 영향 버전별 advisory 레코드 130개, 고유 advisory URL 104개가 있다. 동일 advisory의 여러 버전·경로가 포함되므로 137개 독립 취약점이나 운영상 137개 공격 경로를 의미하지 않는다. 원본 집계와 패키지/영향 버전/경로/출처를 JSON으로 보존했다.

| 주요 항목 | 확인한 영향과 현재 코드의 적용 전제 |
| --- | --- |
| Next RSC RCE | 15.5.4는 패치 전 버전. 실제 운영이 정적 Pages인지 RSC 서버를 노출하는지에 따라 적용이 달라짐. 최신 패치 우선 |
| Next Windows RCE | 버전 경고는 있으나 CI는 Linux, 로컬은 macOS. Windows 운영 증거 없음 |
| Next AVIF optimizer RCE | 버전 경고는 있으나 현재 images.unoptimized=true. optimizer 노출은 미확인 |
| Clerk shared critical | clerk-react → shared 3.25.0. middleware matcher 우회이며 현재 앱에는 해당 middleware/matcher 사용 없음 |
| Clerk React high | 조직/결제/reverification 검사 조합 우회. 구 패키지 latest 5.61.3도 audit 패치 범위 >=5.61.6에 미달; rename 및 기능 적용 전제 확인 |
| Drizzle high | ORM 0.44.4가 SQL identifier escaping 경고 범위; patch >=0.45.2. 실제 입력 경로 별도 평가 |
| PostCSS 및 개발·배포 도구 | 직접/간접 패치 경고 존재. next-on-pages/Vercel/Wrangler 하위 경로도 다수 포함 |

즉시 침해가 있었다고 판단한 결과는 아니다. 보안상 패치할 근거는 확인됐으며, 계획에서는 runtime·개발·빌드·배포 경로별로 적용 여부와 해결 버전을 구분한다. 이전 후 audit를 다시 실행해 남은 경고를 검토한다.

출처: [Next RSC 공지](https://nextjs.org/blog/CVE-2025-66478), [Clerk shared 공지](https://github.com/clerk/javascript/security/advisories/GHSA-vqx2-fgx2-5wq9), [Clerk React advisory](https://github.com/advisories/GHSA-w24r-5266-9c3c), [Drizzle advisory](https://github.com/advisories/GHSA-gpj5-g38j-94v9). 모든 경고의 원문 URL은 보안 JSON에 포함한다.

## 10. 이전 단계 검사와 이번 후속 조사

| 검사 | 이전 단계 결과 및 후속 상태 |
| --- | --- |
| pnpm test | 30 passed, 2 skipped, 0 failed. 두 skip은 DB fixture opt-in 통합 검사 |
| pnpm exec tsc --noEmit --incremental false | 통과 |
| pnpm lint | 통과: 오류 0, 기존 경고 14. next lint 폐기 예정 경고와 상위 잠금 파일로 인한 workspace root 추론 경고도 있음 |
| npm 최신·peer·deprecation 조회 | 직접 71개 모두 조회 |
| pnpm audit | 조회 완료, 위 집계 |
| Next/어댑터 production build | 이번 미실행. 홈 조회·생성 단계의 DB 쓰기를 피함 |
| 브라우저·운영 DB·Cloudflare 배포 | 이번 미실행 |

이번 후속 작업은 TanStack 및 OpenNext 로컬 실행의 공식 자료 확인과 문서 갱신만 수행했다. 위 test/tsc/lint/audit는 앞선 현황 조사 결과이며 앱 코드가 바뀌지 않아 다시 실행하지 않았다. 어댑터 설치·로컬 preview·원격 배포도 아직 실행하지 않았다.

기존 2026-10-05 피드 검증 문서는 Next 15.5.4 자체 production build·타입·lint와 Chromium 33개 시험의 통과를 기록한다. 이번 재실행이나 현재 Pages 어댑터·운영 배포 성공 증거로 대체하지 않는다. [기존 검증 기록](/Users/craigchoi/silla/is/doc/FEED_RECOVERY_VERIFICATION_2026-10-05.md:32).

외부 미확인 정보는 실제 배포 버전/최근 CI 결과, Cloudflare 프로젝트·플랜·라우팅·캐시 규칙, 운영 DB 접근, JSON 갱신 주기와 허용 지연이다. 이를 모두 확인할 때까지 로컬 업그레이드를 보류하지 않고 사용자 배포 인수 항목으로 기록한다. 런타임 DB 필요 여부는 로컬 route 분류로 확인한다. 성능 향상률은 아직 측정하지 않았고 빌드 시간·DB 조회 수·첫 화면·피드 갱신·뒤로가기/모달/스크롤 복원을 로컬 비교 후보로 둔다. 실제 Workers cold start/운영 오류율은 배포 후 확인 대상이다.

## 11. 다음 계획의 작업 단위 후보

이 순서는 use cache 미도입, TanStack 업그레이드, Workers + OpenNext 전환 및 로컬 완료/사용자 수동 배포 분리를 반영한다. 상세 변경·검증·완료 기준은 [계획 초안](/Users/craigchoi/silla/is/doc/NEXT16_UPGRADE_PLAN_2026-10-05.md)에 기록한다. 실제 업그레이드를 시작한 것이 아니다.

1. fixture 환경에서 현재 route 분류와 URL/JSON 계약 및 Node/pnpm 기준을 기록. Workers + OpenNext를 목표로 진행.
2. Next/React/타입과 lint 도구를 호환 조합으로 이전; Virtual 현재 버전 유지는 이 단계 검증 동안만.
3. OpenNext 설정·어댑터 build·로컬 Workers preview 검증. 실제 Cloudflare 배포 성공을 다음 단계의 조건으로 두지 않음.
4. TanStack Virtual/core를 별도 묶음으로 이전; 기존 마크업·옵션·캐시 정책을 유지하고 측정/스크롤/복원 회귀 검증.
5. Tailwind/UI/auth/폼·검증/DB·나머지 라이브러리를 연관된 묶음별로 이전.
6. 보안 재검사, fixture·브라우저·성능·로컬 통합 검증 후 수동 배포·운영 확인·복구 절차 인계. cacheComponents/React Compiler/새 TanStack 제품 도입은 제외.

## 부록: 전체 직접 의존성

아래 최신은 registry latest 조회값이다. 원래 선언, 현재 설치 버전, 최신 안정 태그 값을 구분한다. 이미 최신인 패키지도 포함한다. deprecated 또는 교체가 필요한 패키지를 단순 버전 상승 대상으로 취급하지 않는다.
### Runtime dependencies

| 패키지 | 선언 | 현재 설치 | npm latest | 상태 |
| --- | --- | --- | --- | --- |
| `@clerk/clerk-react` | `^5.47.0` | 5.47.0 | 5.61.3 | deprecated |
| `@hookform/resolvers` | `^3.9.1` | 3.10.0 | 5.9.1 | 업데이트 후보 |
| `@radix-ui/react-accordion` | `1.2.2` | 1.2.2 | 1.2.20 | 업데이트 후보 |
| `@radix-ui/react-alert-dialog` | `1.1.4` | 1.1.4 | 1.1.23 | 업데이트 후보 |
| `@radix-ui/react-aspect-ratio` | `1.1.1` | 1.1.1 | 1.1.15 | 업데이트 후보 |
| `@radix-ui/react-avatar` | `1.1.2` | 1.1.2 | 1.2.6 | 업데이트 후보 |
| `@radix-ui/react-checkbox` | `1.1.3` | 1.1.3 | 1.3.11 | 업데이트 후보 |
| `@radix-ui/react-collapsible` | `1.1.2` | 1.1.2 | 1.1.20 | 업데이트 후보 |
| `@radix-ui/react-context-menu` | `2.2.4` | 2.2.4 | 2.3.7 | 업데이트 후보 |
| `@radix-ui/react-dialog` | `1.1.4` | 1.1.4 | 1.1.23 | 업데이트 후보 |
| `@radix-ui/react-dropdown-menu` | `2.1.4` | 2.1.4 | 2.1.24 | 업데이트 후보 |
| `@radix-ui/react-hover-card` | `1.1.4` | 1.1.4 | 1.1.23 | 업데이트 후보 |
| `@radix-ui/react-label` | `2.1.1` | 2.1.1 | 2.1.15 | 업데이트 후보 |
| `@radix-ui/react-menubar` | `1.1.4` | 1.1.4 | 1.1.24 | 업데이트 후보 |
| `@radix-ui/react-navigation-menu` | `1.2.3` | 1.2.3 | 1.2.22 | 업데이트 후보 |
| `@radix-ui/react-popover` | `1.1.4` | 1.1.4 | 1.1.23 | 업데이트 후보 |
| `@radix-ui/react-progress` | `1.1.1` | 1.1.1 | 1.1.16 | 업데이트 후보 |
| `@radix-ui/react-radio-group` | `1.2.2` | 1.2.2 | 1.4.7 | 업데이트 후보 |
| `@radix-ui/react-scroll-area` | `1.2.2` | 1.2.2 | 1.2.18 | 업데이트 후보 |
| `@radix-ui/react-select` | `2.1.4` | 2.1.4 | 2.3.7 | 업데이트 후보 |
| `@radix-ui/react-separator` | `1.1.1` | 1.1.1 | 1.1.15 | 업데이트 후보 |
| `@radix-ui/react-slider` | `1.2.2` | 1.2.2 | 1.4.7 | 업데이트 후보 |
| `@radix-ui/react-slot` | `1.1.1` | 1.1.1 | 1.3.3 | 업데이트 후보 |
| `@radix-ui/react-switch` | `1.1.2` | 1.1.2 | 1.3.7 | 업데이트 후보 |
| `@radix-ui/react-tabs` | `1.1.2` | 1.1.2 | 1.1.21 | 업데이트 후보 |
| `@radix-ui/react-toast` | `1.2.4` | 1.2.4 | 1.2.23 | 업데이트 후보 |
| `@radix-ui/react-toggle` | `1.1.1` | 1.1.1 | 1.1.18 | 업데이트 후보 |
| `@radix-ui/react-toggle-group` | `1.1.1` | 1.1.1 | 1.1.19 | 업데이트 후보 |
| `@radix-ui/react-tooltip` | `1.1.6` | 1.1.6 | 1.2.16 | 업데이트 후보 |
| `@tanstack/react-virtual` | `^3.13.12` | 3.13.12 | 3.14.13 | 업데이트 후보 |
| `autoprefixer` | `^10.4.20` | 10.4.21 | 10.6.1 | 업데이트 후보 |
| `class-variance-authority` | `^0.7.1` | 0.7.1 | 0.7.1 | 현재=latest |
| `clsx` | `^2.1.1` | 2.1.1 | 2.1.1 | 현재=latest |
| `cmdk` | `1.0.4` | 1.0.4 | 1.1.1 | 업데이트 후보 |
| `date-fns` | `4.1.0` | 4.1.0 | 4.4.0 | 업데이트 후보 |
| `dotenv` | `^16.5.0` | 16.5.0 | 18.0.5 | 업데이트 후보 |
| `drizzle-orm` | `^0.44.4` | 0.44.4 | 0.45.3 | 업데이트 후보 |
| `embla-carousel-react` | `8.5.1` | 8.5.1 | 8.6.0 | 업데이트 후보 |
| `input-otp` | `1.4.1` | 1.4.1 | 1.5.0 | 업데이트 후보 |
| `lucide-react` | `^0.454.0` | 0.454.0 | 1.52.0 | 업데이트 후보 |
| `minisearch` | `^7.1.2` | 7.1.2 | 7.2.0 | 업데이트 후보 |
| `motion` | `^12.23.12` | 12.23.12 | 14.0.0 | 업데이트 후보 |
| `next` | `15.5.4` | 15.5.4 | 16.3.8 | 업데이트 후보 |
| `next-themes` | `^0.4.4` | 0.4.6 | 0.4.6 | 현재=latest |
| `pg` | `^8.16.1` | 8.16.1 | 8.23.1 | 업데이트 후보 |
| `radix-ui` | `^1.4.3` | 1.4.3 | 1.6.7 | 업데이트 후보 |
| `react` | `^19.1.1` | 19.1.1 | 19.3.0 | 업데이트 후보 |
| `react-day-picker` | `8.10.1` | 8.10.1 | 10.0.2 | 업데이트 후보 |
| `react-dom` | `^19.1.1` | 19.1.1 | 19.3.0 | 업데이트 후보 |
| `react-hook-form` | `^7.54.1` | 7.58.1 | 7.89.0 | 업데이트 후보 |
| `react-resizable-panels` | `^2.1.7` | 2.1.9 | 4.14.2 | 업데이트 후보 |
| `recharts` | `2.15.0` | 2.15.0 | 3.10.1 | 업데이트 후보 |
| `sonner` | `^1.7.1` | 1.7.4 | 2.0.8 | 업데이트 후보 |
| `tailwind-merge` | `^2.5.5` | 2.6.0 | 3.7.0 | 업데이트 후보 |
| `tailwindcss-animate` | `^1.0.7` | 1.0.7 | 1.0.7 | 현재=latest |
| `vaul` | `^0.9.6` | 0.9.9 | 1.1.2 | 업데이트 후보 |
| `zod` | `^3.24.1` | 3.25.67 | 4.6.5 | 업데이트 후보 |

### Dev dependencies

| 패키지 | 선언 | 현재 설치 | npm latest | 상태 |
| --- | --- | --- | --- | --- |
| `@cloudflare/next-on-pages` | `^1.13.16` | 1.13.16 | 1.13.16 | deprecated |
| `@tailwindcss/container-queries` | `^0.1.1` | 0.1.1 | 0.1.1 | 현재=latest |
| `@types/node` | `^24.5.2` | 24.5.2 | 26.6.4 | 업데이트 후보 |
| `@types/pg` | `^8.15.4` | 8.15.4 | 8.23.1 | 업데이트 후보 |
| `@types/react` | `^19.1.15` | 19.1.15 | 19.3.0 | 업데이트 후보 |
| `@types/react-dom` | `^19` | 19.1.6 | 19.3.0 | 업데이트 후보 |
| `drizzle-kit` | `^0.31.4` | 0.31.4 | 0.31.11 | 업데이트 후보 |
| `eslint` | `^9` | 9.35.0 | 10.12.0 | 업데이트 후보 |
| `eslint-config-next` | `15.5.4` | 15.5.4 | 16.3.8 | 업데이트 후보 |
| `playwright` | `1.62.1` | 1.62.1 | 1.63.0 | 업데이트 후보 |
| `postcss` | `^8.5` | 8.5.6 | 8.5.28 | 업데이트 후보 |
| `tailwindcss` | `^3.4.17` | 3.4.17 | 4.3.3 | 업데이트 후보 |
| `tsx` | `^4.20.3` | 4.20.3 | 4.23.15 | 업데이트 후보 |
| `typescript` | `^5.9.2` | 5.9.2 | 7.0.2 | 업데이트 후보 |

메타데이터·peer·정적 사용 분석: [의존성 JSON](/Users/craigchoi/silla/is/doc/validation/next16-dependencies-2026-10-05.json).

전체 audit 집계·영향 버전·설치 경로·advisory URL: [보안 JSON](/Users/craigchoi/silla/is/doc/validation/next16-security-audit-2026-10-05.json).

각 최신 버전 출처는 의존성 JSON의 registry 필드다. audit advisory 객체 수와 고유 URL 수는 별도 JSON 요약에 기록하며, 같은 advisory가 영향 버전별로 중복될 수 있다.
