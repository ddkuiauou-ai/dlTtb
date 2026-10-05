# 피드 가상화·후처리 수정 검증

작성: 2026-10-05. 웹 `/Users/craigchoi/silla/is`, Temporal `/Users/craigchoi/tem`.

사용자가 선택한 범위는 **코드 수정과 격리 검증**이다. 실제 수집 재개, 업무 DB migration,
기존 워커 교체 및 운영 예약 변경은 별도로 결정한다. 후속 JSON 세대를 선택한 뒤 다른 세대나 seed·제외 ID의 변화를 감지하면, 읽던 목록과
위치를 유지하고 새로고침 안내를 표시한다. 세대 선택 전에는 새 seed를 반영한다.

## 수정한 원인과 동작

| 원인 | 수정 결과 |
|---|---|
| window 가상화가 목록의 문서 시작 위치를 0으로 계산 | 실제 시작 위치를 관측하고 행 transform에는 `start - scrollMargin` 사용 |
| 상단 높이 변화·일반 append 때 전체 높이 캐시 초기화 | 위치 변화와 append는 기존 측정값 유지; 열 수·카드 형태·컨테이너 폭 변경 때 재측정 |
| 스크롤 보정의 adjustments 무시 및 여러 복원 주체의 경쟁 | 기본 측정 보정을 복구하고 열 변경 중에는 기준 글을 고정해 DOM 위치 안정화; 사용자 입력 시 취소 |
| 초기 열 수로 직접 페이지·상세 복원, 비동기 취소 후 재이동 | 레이아웃 준비·실제 글과 가상 행 반영을 기다리고 원래 입력 소유권 유지; 취소 가능한 단일 coarse 이동 |
| recycled sentinel과 모달 복원 표시 처리 부족 | 실제 DOM 변화에 URL observer 연결, 모달 닫을 때 해당 복원 표시 소비 |
| 새 seed 무시 및 오래된 응답·보관된 API의 다른 섹션 상태 변경 | 동일 섹션 seed 갱신, 진입 시 섹션 소유권과 응답 epoch/token 검사, 후속 세대 변경 안내 |
| soft refresh 뒤 상단에 다시 등장한 글을 복원 대상으로 잘못 선택 | 레이아웃·상세·직접 페이지·늦은 높이 보정의 lookup을 현재 피드 root로 한정 |
| JSON 생성기가 실제 SSR·상단 글을 추측해 후보를 미리 제외 | 전체 최신 후보를 생성하고 실제 표시 ID로 클라이언트 중복 제거; 중복만 있는 페이지도 계속 탐색 |
| manifest·page 계약 불일치 및 IDB의 전역 post ID 덮어쓰기 | 실제 lastPage와 세대 태그 검증, 페이지별 원본 payload 저장, 손상·구형 캐시는 miss |
| 정상 종료·파일 누락·실패·세대 변경을 같은 상태로 처리 | 마지막 페이지·오류/재시도·갱신 안내를 구분하고 기존 글 유지 |
| 후처리의 늦은 입력 receipt 재사용, rotation 중복, 과거·미래 입력 혼합 | v3 입력 fingerprint, window별 rotation fence, 입력 상한과 과거 상태 역행 방지 |
| 독립 analytics 단계의 순서 및 MV의 시간창 불일치 | 새 복합 순서 `trends → MV → cluster_trends → rotation`; 명시적 007 migration으로 고정 window 계약 준비 |

홈 SSR seed는 live 조회이고 후속 JSON은 별도 snapshot이다. 둘이 같은 DB snapshot이라고
표시하지 않는다. 후속 세대를 선택하면 그 세대만 추가하며 새 세대는 기존 목록에 자동 혼합하지 않는다.
자세한 파일·캐시 계약은 [HOME_FEED_JSON_CONTRACT.md](./HOME_FEED_JSON_CONTRACT.md)에 있다.

## 검증 결과

| 검증 | 최종 결과 | 범위 |
|---|---|---|
| 웹 단위·DB 소비·실제 JSON 생성기 | **37 passed, failed/skip 0** | 전용 `iss_web_fixture`, UUID schema 및 임시 출력; 실제 소비 쿼리·65→3→0 후보 생성 |
| 기본 `pnpm test` | **30 passed, 2 skipped** | fixture 환경을 지정하지 않으면 DB 통합 2개는 명시적 skip |
| 좌표 회귀 | 통과 | 7,560 조합 + 동일 virtualizer의 연속 동적 360 사례; 기존 잘못된 좌표 조합은 실패 대조군 |
| Temporal | **139 passed, failed/error/skip 0** | 전용 `pipeline_fixture`, UUID queue/PAUSED schedule, 실제 SDK 2개 프로세스·claim·replay |
| TypeScript·diff 검사 | 통과 | `pnpm exec tsc --noEmit`, `git diff --check` |
| lint·production build | 통과 | Next 15.5.4; 기존 경고 14개, 오류 0; 읽기 전용 빈 fixture DB로 22개 정적 페이지 생성 |
| production fixture 차단 | 통과 | 최종 build의 `/test-feed/`, `/api/test-feed/normal/manifest.json/` 모두 HTTP 404 |
| 실제 Chromium 전체 회귀 | **33 passed, failed/skip/runner error 0** | Chrome 151.0.7922.34 / Playwright 1.62.1; retries 0; 75.2초 |

실제 웹 소비 시험에서 미래 cluster window가 포함되는 실패를 먼저 재현하고 시간 상한을 추가한 뒤
전체 6개 소비 시험을 통과했다. 랭킹은 활동 시각을 사용하므로 오래된 원본 글도 현재 유효한 활동이
있으면 정상 후보다. fresh 원본은 랭킹 집계가 없어도 조회되며 정상 빈 결과도 검증했다.

Temporal의 유효한 수정 전 표적 시험은 5 failed / 1 passed였다. 추가 scope 및 standalone rotation
실패도 재현 후 수정했다. legacy MV를 복제한 fixture의 미래 입력 혼합 값 495/915가 명시적
migration 후 기대값 15/15가 됐다. 호환성·원본 백업·transaction rollback·정확한 실행 명령은
[Temporal 검증 보고서](/Users/craigchoi/tem/docs/is-feed-recovery-validation-2026-10-05.md)에 있다.

## 브라우저 환경과 증거

실제 `InfinitePostList`, `PostGrid`, `PostCard`, 앱 provider를 사용한 개발 전용 fixture를
별도 source/output 디렉터리의 서버 5007에서 실행했다. 기대 ID는 가상 DOM과 독립적인 기준으로
계산한다. 해당 좌표 검사에는 행 배치 1px, 읽던 글·복원 목표 위치 2px 기준을 사용했다.
계획의 유한 fixture 안정화 2초 목표는 모든 동선의 시간을 계측한 SLA로 인증하지 않았다.
브라우저 일반 poll 대기는 10초이며, 개발 서버 응답 지연이 확인된 base 전환의 네트워크 대기만
20초로 분리했다. 네트워크 대기시간과 입력 반영 후 레이아웃 안정화 시간을 혼동하지 않는다.
Chromium의 모바일 폭 시험은 실제 모바일 기기 시험과 구분한다.

이전 전체 31개에는 초기 폭·상단 상태, 높이 교체, 혼합/실제 카드, append·중복·파일 누락·재시도,
직접 page 3·재사용 sentinel, 상세 복원 marker, 모달, 읽음 필터·list/grid, seed·generation,
지연된 다른 base 응답, IDB 격리·거부, wheel/middle mouse 취소, 취소와 append의 경쟁,
같은 task의 상단 복귀·높이 변경을 포함한다. margin 0의 알려진 실패를 요구하는 대조군도
포함하며, 이것을 수정된 경로의 누락 결과와 합치지 않는다.

**1px 기준의 검증 범위:** 초기·상단 변화·일반 append·측정된 reference 사례의 배치 기준과
미측정 prefix가 있는 직접 복원의 전체 문서 좌표를 구분한다. 최종 수정 경로 32개 동선의
retained 좌표 표본 47개는 가시 ID 누락 0, root와 margin 차이 0이었다. 할당된 508개 행의
실제 DOM 위치와 `root top + (vi.start - scrollMargin)` 기준 차이는 최대 0px였으며,
독립적인 완전 측정 reference 15개 표본의 절대 좌표 차이도 0px였다.

상세 복원 2개 표본은 완전 측정 기준 문서 좌표와 최대 **66px** 차이가 남았다.
앞쪽 미측정 행의 누적 높이 추정 영향으로 보이지만 원인 추론과 계측 결과를 구분한다.
목표 글 063은 화면 내 126px 정렬과 2px 복원 assertion을 통과했다. 중복 ID 사례는
상단 복사본이 -4127px, 실제 피드 글이 126px였고 실제 정렬 오차는 0px였다.
계획의 행 배치 1px를 **모든 미측정 prefix의 전역 좌표까지 충족했다고 인증하지 않는다**.
가변 높이 가상화의 미측정 구간은 추정값이며, 모든 앞쪽 글을 미리 렌더하거나 fixture 높이를
앱에 주입하는 방법으로 이 차이를 숨기지 않았다. 표본은 모든 중간 frame의 계측이 아니며,
전체 동선의 숫자형 anchor 오차를 저장한 것은 아니다. 읽던 위치의 2px 기준은 시험 assertion으로 확인했다.
최종 계측은 [브라우저 검증 JSON](./validation/feed-browser-2026-10-05.json)에 있고,
이전 소스의 45개 표본은 [full31 JSON](./validation/feed-browser-2026-10-05-full31.json)에 별도로 보존했다.

원래 개발 서버에서 첫 20개 시험은 7 passed / 13 failed였다. 이 중 Next 서버의
`.next/build-manifest.json` 읽기 오류와 빈 layout chunk가 확인돼 환경 오류와 제품 실패를 분리했다.
실패 HTML 13개 inline script 문법 오류는 0개였고, 다른 Invalid token의 실패 JS 원문은 확보되지
않아 원인을 확정하지 않았다. 별도 서버 표적 시험에서는 실제 직접 진입·폭 변경 실패를 재현했고
수정했다. 누락 페이지를 정상 EOF로 기대한 경우와 가상 DOM 밖의 글을 직접 찾아 스크롤하려던
시험 설정 오류도 증거를 남긴 후 정정했다. 재시도로 실패를 숨기지 않았다.

이후 첫 전체 30개 시험은 28 passed / 2 failed, uncaught parse 오류 0이었다.
읽음 필터 시험의 잘못된 `readPosts:v2` payload와 취소 시험 종료 뒤 남은 지연 route를 바로잡았다.
취소 시험은 지연 응답 해제 후 실제 append commit까지 기다리도록 강화했다.
상단 복귀와 레이아웃 변화가 같은 task에서 발생할 때 오래된 RAF capture를 소비할 가능성도
독립 검토로 확인해 자동 보정의 소비·소유권·진행 루프에 현재 top guard를 추가했다.

- 원래 개발 서버 실패: `/private/tmp/feed-e2e-20-run-20261005-failures`
- 별도 서버 수정 전: `/private/tmp/feed-e2e-7-isolated-20261005-failures`
- 직접 진입·폭 변경 중간 결과: `/private/tmp/feed-e2e-2-isolated-20261005-failures`
- 개발 서버 읽기 전용 진단: `/private/tmp/is-hydration-audit-20261005/diagnosis.md`
- 초기 동결 소스 fingerprint: `/private/tmp/feed-browser-frozen-source-20261005.json`
- 첫 전체 30개 결과: `/private/tmp/feed-e2e-30-first-frozen-20261005`

최종 영구 증거는 [브라우저 검증 JSON](./validation/feed-browser-2026-10-05.json)에 저장했다.
최종 runtime 12개 파일 aggregate SHA-256은
`04fa18f2f277687efd583d58dbc9a4f521e940f33cf16b826b3b86fd5f712796`이다.
전체 실행 전후 불변이며 workspace·격리 브라우저 서버·최종 build의 12개 파일이 일치했다.
root lookup 변경 전 전체 31개 실행의 runtime 12개 파일 aggregate SHA-256은
`00df88261c73fa7b38be3310088f765016840509b6b9e5799b1b6e24507ed8f7`이다.
실행 시작·종료 및 workspace와 별도 서버의 파일 해시가 일치했다.
이전 증거는 `validation/feed-browser-2026-10-05-full31.json`에도 보존했다.

root lookup 변경 전 소스의 후속 표적 시험 7개는 모두 통과했다. 지연 응답 후 실제 append 완료를 확인한 사용자
취소, 유효한 읽음 필터, 같은 task의 상단 복귀·높이 변경을 포함한다.

후속 독립 검토에서 mobile pull-to-refresh의 `router.refresh()`가 상단 샘플을 바꾸면,
유지된 latest의 글 P가 새 상단에도 표시되어 전역 `getElementById`가 앞선 복사본을 고를 수 있음을
확인했다. 목록 유지 정책을 보존하며 현재 피드 안에서만 ID를 찾도록 수정했다. 단위 회귀는
수정 전 6 passed / 1 failed, 수정 후 7 passed였다. 한 피드의 중복 제거와 별도 섹션의 live 갱신은
다른 범위이며, 페이지 전체가 하나의 snapshot이 된다고 주장하지 않는다.
최종 33개 실행에 중복 ID 사례를 포함했고 전체 시험이 통과했다.

후속 전체 32개 실행에서는 각각 개발 서버 응답 지연과 상세 복귀 경합으로
31 passed / 1 failed를 기록했다. 응답 지연 사례는 올바른 120개가 poll 종료 직후
반영된 것을 확인해 해당 네트워크 대기만 20초로 조정했다. 상세 복귀 사례는
raw ID가 갱신돼도 React의 visible 목록 commit 전에 앵커를 조회하면 이동을 건너뛰는
경합이었다. visible 목록을 layout effect에서 반영하고 해당 ID와 virtual row 수를
최대 60 frame 동안 취소 검사하며 기다리도록 수정했다. 제외·삭제된 앵커는 유한 대기 뒤
이동을 종료한다.

보관된 이전 섹션 API를 새 섹션에서 호출하는 추가 시험은 수정 전 **0 passed / 1 failed**였다.
새 섹션은 hasMore=true, 글 40개에서 20초 동안 멈췄다. 섹션 확인 전에 공유 로딩 잠금을
설정하는 것이 원인이므로 loadMore 진입 즉시 소유권을 확인해 다른 섹션의 ref를 변경하지 않는다.
추가 실패 증거는 `validation/feed-browser-2026-10-05-full32-first-failure.json`,
`validation/feed-browser-2026-10-05-full32-detail-race.json`,
`validation/feed-browser-2026-10-05-stale-api-red.json`에 보존했다.

최종 소스에서 일반 상세·중복 ID 상세를 각각 5회 반복하고, 이전 응답·보관된 API·사용자 취소를
추가 확인해 [표적 13회 모두 통과](./validation/feed-browser-2026-10-05-targeted-green.json)했다.
별도 표적 반복을 최종 고유 33개에 합산하지 않았다. 최종 전체 실행은 retries 0이며 각 시험의
pageerror 목록이 비어 있음을 확인한다. production build도 같은 runtime 소스로 성공했고
개발 전용 두 경로의 HTTP 404를 [빌드 증거](./validation/feed-build-2026-10-05.json)에 기록했다.

## 재현

빈 전용 fixture DB를 준비한 뒤 웹 전체 명령을 실행한다. 아래 host/DB를 업무 DB로 바꾸지 않는다.

```sh
HOME_FEED_CONSUMER_FIXTURE=1 HOME_FEED_FIXTURE_DATABASE=iss_web_fixture \
HOME_FEED_FIXTURE_HOST=127.0.0.1 HOME_FEED_FIXTURE_PORT=55442 HOME_FEED_FIXTURE_USER=fixture \
POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55442 POSTGRES_USER=fixture POSTGRES_DB=iss_web_fixture \
NODE_ENV=production pnpm test

pnpm exec tsc --noEmit
pnpm lint
git diff --check
FEED_TEST_BASE_URL=http://127.0.0.1:5007 pnpm test:browser
```

fixture DB 준비는 export된 웹 schema와 Temporal 007 migration을 **전용 DB에서만** 사용했다.
실제 build-main 생성기는 읽기 전용 UUID schema와 임시 cwd를 사용하고 시험 종료 시 정리한다.
빌드는 별도 source 복사본에 node_modules를 연결하고 fixture 연결·읽기 전용 PGOPTIONS를 지정했다.
prerender에 필요한 기존 public Clerk key만 선택했으며 업무 .env를 복사하지 않았다.

## 남은 운영 인수 범위

실제 수집·모델 호출·업무 public 쓰기·007 적용·기존 워커 재시작·운영 schedule update/resume/trigger는
수행하지 않았다. 기존 11개 예약의 PAUSED 상태와 T0/model/48h T2 정책을 유지했다.
새 schedule 정의는 저장된 운영 payload를 자동 변경하지 않으며, current/global MV publication은
명시적 007 migration 적용 뒤에 가능하다. 공개 홈 JSON도 이번에 재생성하지 않았다.

따라서 **코드·격리 검증 완료**와 **실제 최신 데이터 피드 복구**를 별도로 판단한다.
실제 게시판의 현재 관측, 후처리·웹 표시 연결, 3개 연속 window, 24h/48h 연속성 및 global SLA는
별도 운영 전환 이후 검증한다. Safari·실제 모바일·네이티브 스크롤바 및 외부 미디어의 장시간
동선도 이번 Chromium fixture 통과로 인증하지 않는다.

운영 전환 순서와 rollback 검토는 Temporal 보고서에 준비했다. 앱 라이브러리 버전은 유지했고
반복 브라우저 검증을 위한 개발 의존성 Playwright 1.62.1과 시험 실행 스크립트만 추가했다.

## 격리 환경 정리

이번 작업 소유의 5007 개발 서버, 5010 production 시험 서버, 55442 fixture PostgreSQL을
검증 완료 후 종료했다. 종료 전 pipeline fixture의 UUID schema와 public table/view는 0개,
웹 fixture posts는 0개였다. [정리 증거](./validation/feed-isolation-cleanup-2026-10-05.json)를 저장했다.
원래 개발 서버 5005와 Temporal 서버·워커는 종료하거나 교체하지 않았다. 임시 출력과 실패 trace는
검증 증거로 보존했다. 변경은 로컬 작업본에 있으며 commit·push·배포는 하지 않았다.
