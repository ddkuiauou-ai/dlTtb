# 문서와 구현의 차이 및 현행화 기준

작성일: 2026-10-04 KST

이 문서는 Isshoo 프로젝트 조사에서 발견한 문서와 코드의 차이를 후속 독립 채팅에 전달하기 위한 기록이다.
조사 범위는 `is` 웹 저장소와 인접한 `dag` 저장소의 IS 관련 소스·문서이며, 실제 DB·배포 환경은 조회하지 않았다.
빌드, 크롤러 실행, Dagster materialization, 외부 사이트 접속, 라이브러리 최신 버전 조회는 수행하지 않았다.
여기에 적힌 구현은 작성일의 로컬 소스에서 확인한 상태이며, 배포 성공이나 운영 상태를 보증하지 않는다.

## 1. 문서를 읽는 기준

현재 동작을 설명할 때는 코드의 실행 경로, 설정, 등록된 자산·스케줄을 먼저 확인한다.
기존 문서는 당시의 목표, 설계, 운영 방법, 이전 구현을 이해하는 자료로 읽는다.
문서에 “완료”, “운영 중”, “실시간”, “최신 코드베이스”라고 쓰여 있어도 현재 운영 증거로 취급하지 않는다.
소스에 기능이 존재하는지, 배포되어 있는지, 실제 성공적으로 실행되는지는 각각 다른 확인 항목이다.
계획한 기능과 구현한 기능을 구분하고, 구현한 기능과 사용자가 실제 받는 기능도 구분한다.
이 기록의 상대 링크는 `is/doc/`를 기준으로 하며, `../../dag/` 링크는 인접한 별도 저장소를 가리킨다.

사용자가 설명한 전략은 대중용 콘텐츠 소비 사이트를 먼저 발전시키면서 공통 수집·분석 기술을 축적하는 것이다.
기업·소상공인 대상 감지·분석·대응 서비스는 그 기술을 사용하는 별도 제품으로 확장하려는 방향이다.
기존 문서는 주로 대중용 큐레이션에 집중하므로, 이 사업 전략은 [README](../README.md)의 사용자 설명과 함께 읽는다. 후속 아키텍처에서도 공통 기술과 제품별 목적을 구분한다.

## 2. 기존 문서의 역할

| 문서 | 현재 읽어야 할 역할 | 현행화 시 주의할 점 |
| --- | --- | --- |
| [GEMINI.md](../GEMINI.md) | 웹 프로젝트 개요와 개발 관례 | 배포·빌드 경로를 실제 설정으로 다시 확인한다. |
| [doc/spec.md](spec.md) | 초기 페이지네이션·선정 기준 설계 | 예시 API·Pages Router 설명을 실제 App Router 구조와 구분한다. |
| [doc/ui.md](ui.md) | 무한 스크롤 설계 및 가상화 설명 | 예시 훅, 라이브러리, 버퍼 상수를 실제 컴포넌트와 대조한다. |
| [doc/service.md](service.md) | 초기 Cloudflare 배포 가이드 | 워크플로우 예시를 현재 CI로 간주하지 않는다. |
| [doc/IS_ROADMAP.md](IS_ROADMAP.md) | 2025년 랭킹·클러스터·큐레이션 설계 기록 | 구현 완료 여부와 자산 이름, 기간·공식을 다시 확인한다. |
| [DEPLOYMENT.md](../DEPLOYMENT.md) | Pages/R2 분리 배포 의도와 설정 안내 | 실제 업로드 대상, Secrets 이름, R2 읽기 경로를 대조한다. |
| [DB_SETUP.md](../DB_SETUP.md) | DB 전환을 포함한 과거 설정 설명 | 자동 Neon 전환 설명은 현재 `lib/db.ts`와 맞지 않는다. |
| [NEON_SETUP.md](../NEON_SETUP.md) | Neon 전환 후보의 변경 가이드 | 적용된 구성으로 설명하지 말고 도입 여부부터 결정한다. |
| [POSTGREST_SETUP.md](../POSTGREST_SETUP.md) | PostgREST/Tunnel 대안의 운영 가이드 | 현재 웹 코드에 연동되어 있다고 가정하지 않는다. |
| [dag/README.md](../../dag/README.md) | 여러 데이터 제품을 포함한 Dagster 저장소 개요 | IS의 옛 잡·스케줄 설명을 현재 등록부와 대조한다. |
| [dag/docs/is.md](../../dag/docs/is.md) | IS 수집·정규화·AI·집계 파이프라인 설명 | 사이트 목록, 경로, 자산 조건, 지연 설명이 일부 오래되었다. |

## 3. 웹 문서와 코드의 주요 차이

| 항목 | 문서에 적힌 내용 | 작성일 코드에서 확인한 내용과 근거 |
| --- | --- | --- |
| 정적 export | `GEMINI.md`는 `output: "export"`와 `out/` 결과물을 설명한다. | [next.config.mjs](../next.config.mjs)의 `nextConfig`에서 export 설정은 주석 처리되어 있다. |
| Pages 빌드 결과 | `doc/service.md`는 `.next`를 배포 디렉터리로 제시한다. | [build-contents.yml](../.github/workflows/build-contents.yml)의 `deploy_main_site`는 `next-on-pages`를 실행하고 `.vercel/output/static`을 배포한다. |
| 자동 DB 전환 | `DB_SETUP.md`는 `DATABASE_URL`로 Neon과 로컬 PostgreSQL이 자동 전환된다고 설명한다. | [lib/db.ts](../lib/db.ts)의 `pool`·`db`는 `pg`와 `drizzle-orm/node-postgres`만 사용한다. |
| Neon/PostgREST 적용 | 설정 가이드가 함께 있어 둘 다 사용 가능한 현행 구성처럼 보일 수 있다. | 웹 코드에서 `DATABASE_URL`·`NEXT_PUBLIC_POSTGREST_URL` 소비 경로를 찾지 못했다. [package.json](../package.json)도 함께 확인한다. |
| 모든 JSON의 R2 저장 | `DEPLOYMENT.md`는 목록·홈·키워드까지 모두 R2에 저장한다고 설명한다. | `deploy_main_site`는 검색·홈·카테고리·전체 목록·키워드 JSON을 Pages에 합치고, `upload_json_to_r2`는 상세글 JSON을 R2에 올린다. |
| R2 읽기 연결 | 저장소 분리 구조는 설명하지만 웹 요청의 연결 설정은 명확하지 않다. | [post-viewer-modal.tsx](../components/post-viewer-modal.tsx)의 `getStaticPost`는 같은 도메인의 `/data/posts/v1/{id}.json`을 요청한다. 외부 라우팅 확인이 필요하다. |
| 홈 시간 범위 | 로드맵은 헤더 시간 탭과 URL `?range=` 연동이 완료되었다고 설명한다. | [홈 `Home`](<../app/(feed)/page.tsx>)는 `selectedRange`를 `24h`로 고정한다. [HeaderClient](../components/header-client.tsx)에는 해당 시간 탭을 찾지 못했다. |
| 인기 키워드 | 로드맵은 홈의 24시간 TOP10을 추가 예정으로 기록한다. | [Sidebar](../components/sidebar.tsx)는 `getTrendingKeywords("6h")`를 사용한다. 홈 본문에는 별도의 TODO가 남아 있다. |
| 랭킹 소스 | 로드맵은 30분 `post_trends` 델타를 설명한다. | [buildRankedCandidatesQuery](../lib/queries.ts)는 기간별 `mv_post_trends_agg`를 조회한다. |
| 랭킹 정규화·감쇠 | 로드맵은 중앙값/표준편차와 게시글 나이 감쇠를 설명한다. | 같은 함수는 5–95% 절삭, MAD 기반 정규화, 활동 시각 `activity_ts` 감쇠를 사용한다. |
| 예전 분석 자산 | 로드맵은 `post_keywords_asset`·`post_categorize_asset`와 룰·TF-IDF 기반 처리를 제시한다. | [IS 자산 등록부](../../dag/dag/definitions.py)의 `all_is_assets`와 관련 모듈에는 해당 이름을 찾지 못했다. 현재 최종 분류·키워드는 `fusion_worker_asset` 경로를 확인한다. |
| 상세글 범위 | JSON 상세 제공과 직접 상세 페이지의 범위가 문서에서 구분되지 않는다. | [PostPage 및 generateStaticParams](<../app/(feed)/posts/[id]/page.tsx>)는 100개 ID를 생성하며 `dynamicParams=false`이다. 모달은 별도 JSON을 읽는다. |
| 무한 스크롤 훅 | `doc/ui.md`는 SWR/React Query 기반 `useInfinitePosts` 예시를 제공한다. | [InfinitePostList](../components/infinite-post-list.tsx)는 자체 fetch, [IndexedDB 캐시](../lib/idb-cache.ts), `@tanstack/react-virtual`을 사용한다. |
| 가상화 버퍼 | `doc/ui.md`는 0.5 viewport 버퍼와 1.5배 선행 로딩을 설명한다. | `deriveVirtualBufferSizing` 관련 상수는 `HALF_VIEWPORT_BUFFER_RATIO=0.3`, `LOAD_AHEAD_VIEWPORT_MULTIPLIER=1.0`이다. |
| CI 알림·디버그 | `doc/service.md`는 Slack 알림, `DEPLOYMENT.md`는 R2 디버그 워크플로우를 설명한다. | 작성일 `.github/workflows/`에서는 `build-contents.yml`만 확인했다. 외부 구성의 존재 여부는 별도 확인한다. |

### 실제 데이터 제공 경로

- 홈·카테고리·키워드 초기 화면은 [queries.ts](../lib/queries.ts)의 DB 조회를 사용하는 서버 컴포넌트가 구성한다.
- 다음 목록은 [scripts/](../scripts/)에서 만든 `/data/...` JSON을 클라이언트가 읽는다.
- 상세 모달은 `getStaticPost`로 글별 JSON을 읽는다.
- 직접 상세 URL은 제한된 ID의 정적 생성 경로를 가진다.
- 검색은 [buildSearchIndex](../scripts/build-search-index.ts)가 제목·본문·키워드를 MiniSearch JSON으로 만든다.
- [SearchPageClient](../app/search/SearchPageClient.tsx)는 그 인덱스 전체를 브라우저에서 로드해 검색한다.
- 이 경로의 신선도는 DB 적재뿐 아니라 JSON 생성·웹 빌드·배포·캐시 갱신에도 의존한다.

## 4. 빌드 명령의 차이

`pnpm build:data`, `build-parallel.sh`, CI는 동일한 작업 집합이 아니다.
문서에서 어느 명령을 권장할지 결정하기 전에 결과 디렉터리와 실행 범위를 맞춰야 한다.

| 진입점 | 확인한 실행 범위 | 차이와 확인 기준 |
| --- | --- | --- |
| [package.json](../package.json)의 `build:data` | 검색 → 홈 → 카테고리 → 키워드 → 상세 JSON | 별도 `build-allposts-json.ts` 호출이 없고 카테고리에 `it`·`sports`·`game`이 빠져 있다. |
| [build-parallel.sh](../build-parallel.sh) | 단일 작업, 홈 조합, 17개 카테고리, 전체 목록을 병렬 실행 | 홈은 여러 조합을 호출하지만 실제 생성 함수의 게이트를 확인해야 한다. 동시 실행·실패 전달도 검증 대상이다. |
| [CI](../.github/workflows/build-contents.yml) | 단일 작업 3개, 홈 `24h/fresh`, 카테고리별 4개 기간, 전체 목록별 4개 기간 | 현재 서비스 경로와 가장 가까운 작업 집합이지만 배포 성공 여부는 확인하지 않았다. |
| [build-main-json.ts](../scripts/build-main-json.ts)의 `main` | `24h/fresh`만 생성 | 다른 홈 기간·섹션은 건너뛰므로 예전 전체 조합 설명을 그대로 사용하면 안 된다. |
| [build-keyword-json.ts](../scripts/build-keyword-json.ts)의 `main` | 상위 50개 키워드, 기본 `1w` 기간 | 임의 기업 키워드를 지속 감시하는 기능과 다르며, 기간 추가 여부는 인자·소비 코드와 맞춰야 한다. |
| [build-post-json.ts](../scripts/build-post-json.ts)의 `buildAllPosts` | `getAllPosts`로 ID를 가져와 상세 JSON 생성 | 이름의 “all”만으로 전체 이력 보존을 추정하지 않는다. 조회 기본 기간·개수 제한·정리 정책을 확인한다. |

웹 CI의 트리거는 main push와 수동 실행이다.
이 저장소의 CI에는 정기 실행 `schedule`이 없으므로, 백엔드 분석 주기를 웹 갱신 주기와 동일하게 설명할 수 없다.
외부 배포 훅이나 다른 자동화가 실제 사용되는지는 운영 확인이 필요하다.

## 5. Dagster 문서와 코드의 차이

| 항목 | 기존 설명 | 작성일 코드와 해석 |
| --- | --- | --- |
| 더쿠 | [dag/docs/is.md](../../dag/docs/is.md)는 `theqoo`를 미구현·코드 없음으로 기록한다. | [theqoo/main.ts](../../dag/dag/is_crawlee/theqoo/src/main.ts)의 실행 진입점과 [routes.ts](../../dag/dag/is_crawlee/theqoo/src/routes.ts)의 `BOARDS`·`createRouter`가 존재한다. 운영 성공은 별도 확인한다. |
| 크롤러 옛 경로 | 같은 문서가 `clien-park`, `ppomppu-hot`을 코드 경로로 사용한다. | 실제 디렉터리는 [clien](../../dag/dag/is_crawlee/clien/package.json), [ppomppu](../../dag/dag/is_crawlee/ppomppu/package.json)이다. 게시판 이름과 프로젝트 경로를 구분한다. |
| 커버리지 | 문서는 소수 사이트만 표로 나열한다. | 작성일 `dag/is_crawlee/`에 16개 프로젝트 디렉터리를 확인했다. 파일 존재와 활성 수집 대상은 다르다. |
| 크롤러 스케줄 | [dag/README.md](../../dag/README.md)는 `is_crawler_schedule_10min`을 설명한다. | [schedules.py](../../dag/dag/schedules.py)는 옛 스케줄 제거를 기록하고, [is_node.py](../../dag/dag/is_node.py)의 티어별 discovery와 snapshot 스케줄을 확인한다. |
| 초 단위·실시간 수집 | `dag/docs/is.md`는 초 단위에 가까운 수집을 설명한다. | discovery 정의는 T0 3분, T1 10분, T2 30분이다. 센서 최소 폴링 30초는 수집부터 화면까지의 SLA를 의미하지 않는다. |
| 티어 배정 | 높은 빈도 티어가 모든 사이트에 적용되는 것으로 오해할 수 있다. | `T0_DIRS={""}`, `T1_DIRS={"fmkorea"}`와 `_dir_tier` 기준에서 실제 디렉터리의 T0 대상은 없고 나머지는 T2다. |
| AI 워커 조건 | 문서는 `vlm_worker_asset (ON3)`, `text_only_enqueue_asset (ON2)`라고 적는다. | [is_data_vlm.py](../../dag/dag/is_data_vlm.py)의 `vlm_worker_asset` 조건은 `EAGER`, [is_data_unsync.py](../../dag/dag/is_data_unsync.py)의 `text_only_enqueue_asset`은 `ON3`이다. 잡 스케줄과 자산 조건을 함께 확인한다. |
| 안정성 확보 | 문서는 파이프라인 완결성과 운영 안정성을 선언한다. | [definitions.py](../../dag/dag/definitions.py)의 등록·Freshness 정의는 구현 증거이다. 데몬 실행, 체크 성공, 큐 처리량, 실패율의 운영 증거는 조사하지 않았다. |

확인한 크롤러 디렉터리는 `82cook`, `arca`, `bobae`, `clien`, `damoang`, `dogdrip`, `etoland`, `fmkorea`,
`gasengi`, `humor`, `instiz`, `inven`, `ppomppu`, `ruliweb`, `slrclub`, `theqoo`이다.
[is_node.py](../../dag/dag/is_node.py)의 `BASE_CRAWLER_PATH`와 `list_crawler_dirs` 경로에서 실행 대상 선택을 추적한다.
[is_sensor_output_data.py](../../dag/dag/is_sensor_output_data.py)의 `is_output_data_sensor`는 새 JSON 또는 mtime 변경을 감지한다.
수집 성공률, 변경 감지 누락, 큐 지연, 처리 완료 시각을 확인한 뒤에만 운영 지연을 수치로 설명한다.

## 6. 대중용 서비스와 기업용 서비스의 문서 경계

현재 웹은 인기 글 발견, 중복 이슈 묶음, 카테고리·키워드 탐색, 콘텐츠 소비에 초점을 둔다.
공통 자산에는 글·댓글·버전·스냅샷·이미지·임베드·시그니처·클러스터·분류·키워드 결과가 있다.
근거는 [웹 스키마](../lib/schema.ts)와 [IS 자산 등록부](../../dag/dag/definitions.py), `fusion_worker_asset`·`vlm_worker_asset`이다.
이 자산을 재사용한다는 사실과 기업용 제품 기능이 구현되어 있다는 주장을 구분해야 한다.

기업용 확장 문서에서는 다음을 별도 설계 항목으로 취급한다.

- 기업·브랜드·상품·점포 식별과 동명이인 구분.
- 대상별 감성, 불만 유형, 긴급도, 원문·댓글 근거 연결.
- 고객별 감시 규칙, 새 글·댓글의 변경 이벤트, 알림 전달 상태.
- 담당자 배정, 대응 기록, 조직 권한, 보존·삭제 정책.
- 유료 플랜과 사용량·처리 비용 모델.

작성일 웹의 라우트·스키마에서는 이 기업용 제품 계층을 찾지 못했다.
AdSense, 결제, 구독 연동도 웹 코드에서 확인하지 못했으며, 수익화 계획과 구현 상태를 나눠 기록한다.

## 7. 실제 운영 확인이 필요한 항목

- [ ] 현재 배포 URL·커밋·빌드 결과와 로컬 소스가 같은지 확인한다.
- [ ] Pages 배포가 성공하는지, 실제 아티팩트 경로가 설정과 같은지 확인한다.
- [ ] 상세 JSON의 같은 도메인 요청이 R2로 연결되는 설정과 HTTP 응답을 확인한다.
- [ ] 직접 상세 URL, 모달, 검색 결과에서 100개 정적 ID 밖의 글이 어떻게 열리는지 확인한다.
- [ ] 실제 DB가 `POSTGRES_*` 연결인지, 별도 전환 코드나 API가 배포되어 있는지 확인한다.
- [ ] Dagster 데몬·스케줄·센서가 활성화되었는지와 실제 크롤러 대상 목록을 확인한다.
- [ ] DB 테이블·뷰·인덱스와 웹·파이프라인 스키마가 일치하는지 확인한다.
- [ ] 수집 → 적재 → 이미지/텍스트 분석 → 집계 → JSON → 화면의 각 단계 지연을 확인한다.
- [ ] 큐 적체·재시도·처리 실패·중복 제거 품질·소스별 누락을 확인한다.
- [ ] 배포 자동화의 주기, 캐시 갱신·만료, 삭제 글 반영 시점을 확인한다.
- [ ] 실제 선택 모델·프롬프트 버전·엔드포인트와 분석 비용을 확인한다.
- [ ] 문서의 민감정보 예시를 별도 점검한다. 기존 평문 예시를 새 문서에 복사하지 않는다.

## 8. 라이브러리 업데이트 이후 문서 현행화 순서

라이브러리 최신성 조사와 업데이트 실행은 후속 독립 채팅 과제이다.
이번 기록은 업데이트나 버전 선택을 수행하지 않았으며, 특정 버전이 최신이라고 주장하지 않는다.
업데이트가 끝나고 관련 검증 결과가 확보되면 다음 순서로 문서를 맞춘다.

| 순서 | 현행화 대상 | 완료 확인 기준 |
| --- | --- | --- |
| 1 | `GEMINI.md`, 실제 개발·빌드 명령 | 설치된 패키지와 잠금 파일, 개발·lint·test·build 명령의 성공 결과를 설명과 맞춘다. |
| 2 | `DEPLOYMENT.md`, `doc/service.md` | 확정한 어댑터·아티팩트·Secrets 이름·Pages/R2 대상과 검증된 배포 절차를 하나로 정리한다. |
| 3 | `DB_SETUP.md`, `NEON_SETUP.md`, `POSTGREST_SETUP.md` | 실제 DB 드라이버를 기본 경로로 명시하고, 미채택 대안은 전환 가이드로 표시한다. |
| 4 | `dag/docs/is.md`, `dag/README.md`의 IS 부분 | 현재 등록부·자산 조건·티어·경로·사이트 목록을 맞추고 운영 수치에는 확인 시점과 근거를 붙인다. |
| 5 | `doc/spec.md`, `doc/ui.md` | 초기 페이지·JSON·모달·직접 URL·검색의 실제 경로, 가상화 상수, 캐시 갱신 동작을 반영한다. |
| 6 | `doc/IS_ROADMAP.md` | 당시 설계 기록을 보존하면서 완료·폐기·변경·미구현 상태를 표시하고 현행 문서로 연결한다. |
| 7 | 별도 공통 기술·기업용 제품 설계 문서 | 공통 데이터 계약과 품질 지표를 정의하고, 감지·알림·대응 계층의 계획과 구현을 구분한다. |
| 8 | 이 문서 | 해결된 차이에 검증 근거를 붙이고, 남은 차이·운영 미확인 항목을 갱신한다. |

문서 수정의 완료 기준은 표현을 바꾸는 데 그치지 않는다.
재현 가능한 명령, 코드 심볼, 확인한 환경과 날짜, 실행 결과가 서로 일치해야 한다.
운영 확인 없이 완료한 항목은 “소스 기준 정합성 확인”으로 표시한다.
해결되지 않은 항목은 담당 후속 과제와 함께 남기고, 오래된 문서를 다시 단일 진실의 원천으로 선언하지 않는다.
