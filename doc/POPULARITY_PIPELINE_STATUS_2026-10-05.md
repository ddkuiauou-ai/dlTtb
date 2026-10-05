# 인기글 빈 화면 원인과 운영 현황

> 이 문서는 수동 실행 **전** 현황이다. 이후 15:17~15:18 KST에 사용자 요청으로
> Temporal 수동 집계를 완료했고, 24시간 랭킹 후보 33개와 로컬 카드 4개 표시를 확인했다.
> DB 계약 migration 적용과 전체 실행 결과는 [수동 집계 결과](MANUAL_AGGREGATION_RESULT_2026-10-05.md)에 기록했다.

확인 시각: **2026-10-05 14:50~14:52 KST**. 웹 소스, 설정된 업무 PostgreSQL,
로컬 Temporal의 현재 상태를 조사했다. 업무 DB 조회는 `REPEATABLE READ READ ONLY`
트랜잭션으로 수행했다. 앱 코드·업무 데이터·스케줄·워커를 변경하지 않았다.

## 판단

현재 인기글은 **집계가 실행되어 기준 미달로 탈락한 상태가 아니라, 최근 인기 집계가 생산되지 않은 상태**다.
최근 크롤·적재 데이터는 존재하지만 IS live 스케줄 11개가 모두 일시정지되어 있고 실행 횟수도 0이다.
Temporal live 집계 workflow와 DB analytics 완료 기록도 없다. 워커는 작업 큐를 폴링하고 있다.

로컬 개발 화면을 생성할 때 현재 시간 조건에 맞는 집계만 선택하므로 지금 빈 화면은 코드의 조회 조건과 일치한다.
그러나 이것을 수집·집계 파이프라인이 정상 동작한 결과라고 해석해서는 안 된다.
운영용 정적 빌드는 빌드 시점에 이 조회를 수행하고 결과를 고정한다. 운영 방문마다 DB를 조회한다는 의미는 아니다.

## 실제 데이터

| 단계 | 확인 결과 | 의미 |
|---|---|---|
| `posts` | 전체 15,571개, 미삭제 최근 게시 24시간 29개, 3시간 0개 | 최신 24시간은 표시 가능 |
| `post_snapshots` | 전체 64,212개, 최근 24시간 35개, 3시간·30분 0개 | 지금 집계할 현재 관측 없음 |
| 마지막 게시 시각 | 2026-10-05 04:28:45 KST | 게시 시각과 수집 시각은 다름 |
| 마지막 수집·관측 시각 | 2026-10-05 06:37:48.825 KST | 점검 시 약 8시간 동안 새 관측 없음 |
| `post_trends` | 전체 148,615행, 최근 24시간·3시간 0행 | 원본 인기 집계가 오래됨 |
| 마지막 `post_trends.window_end` | **2025-10-06 12:40 KST** | 2026년이 아님 |
| `mv_post_trends_agg` | 3h 623행 / 6h 848행 / 24h 3,946행 / 1w 6,363행, 각 범위에 맞는 최근 행은 모두 0 | MV 자체가 없는 것이 아니라 캐시된 집계가 오래됨 |
| `cluster_trends` | 전체 0행 | 오늘의 이슈·이번주 조회 입력 없음 |
| `clusters` / `cluster_posts` | 114묶음 / 556멤버, 최근 72시간 게시 멤버 0 | 기존 묶음도 과거 데이터 |
| 활성 노출 억제 | post·cluster 모두 0 | 이번 빈 화면의 원인은 쿨다운이 아님 |
| Temporal analytics 완료 DB 기록 | 0개 | 새 집계 완료를 뒷받침하는 기록 없음 |
| `is_trend_coverage` | 0행 | 새 coverage 계산 기록 없음 |
| `is_consumer_view_contracts` | 테이블 없음 | 준비된 현재 집계 코드의 MV 계약 migration 미적용 |

업무 DB의 웹 설정과 Temporal 설정은 host·port·database가 일치하고 schema는 `public`이다.
접속 주소와 자격증명은 이 문서에 기록하지 않았다.

최근 게시 29개는 11개 사이트에 걸쳐 존재한다. 이 29개에는 signature가 있으나 cluster membership은 없다.
최근 24시간 **관측**은 게시 시각 기준 29개와 다른 집합인 33개 글의 35개 snapshot이다.
33개 중 31개는 한 시각만 관측됐고 2개는 재관측됐지만 서로 30분보다 멀리 떨어져 있다.

읽기 전용 SQL로 과거 24시간의 10분 창들을 계산하면 snapshot 입력이 있었던
04:40~07:00 KST 구간에 33개 글의 trend 행 105개를 계산할 수 있었을 것으로 나타난다.
하지만 같은 30분 창 안의 알려진 조회수 관측 2회가 있는 행은 0개다.
이는 **실제로 실행하거나 저장한 집계가 아니라 입력 존재를 검증한 계산**이다.
오래된 관측 시각을 현재로 바꾸거나 이 숫자를 현재 인기 회복의 증거로 사용하지 않는다.

## 웹과 JSON의 책임

```text
크롤 JSON → posts / post_snapshots
  ├─ posts → 최신 첫 화면 데이터 생성
  │           └─ 24h/fresh JSON → 다음 페이지
  └─ post_snapshots → post_trends → mv_post_trends_agg → 급상승 / 지금 주목 첫 화면 데이터 생성
                     └─ cluster_posts와 결합 → cluster_trends → 오늘의 이슈 / 이번주
```

홈 [`app/(feed)/page.tsx`](../app/(feed)/page.tsx)는 `getMainPagePosts`와
`getClusterTopPosts`를 Node 환경에서 직접 호출한다. 로컬 `next dev`에서는 화면을 생성할 때,
운영용 빌드에서는 사전 생성할 때 실행한다. 인기 네 섹션은 `enablePaging=false`이고
[`components/post-grid.tsx`](../components/post-grid.tsx)는 이때 JSON 페이지를 사용하지 않는다.

[`scripts/build-main-json.ts`](../scripts/build-main-json.ts)는 현재 `24h/fresh` 외의
범위·모드를 생성하지 않도록 명시적으로 제한한다. 인기 JSON이 없는 것은 이 코드의 설계대로다.
현재 로컬 fresh JSON은 14:28:15 KST 생성, `page-2.json` 20개와 `page-3.json` 9개다.
이 파일이 있다는 사실은 인기 집계 성공을 뜻하지 않는다.

최신 조회는 `posts`에서 읽고 `mv_post_trends_30m`을 `LEFT JOIN`하므로 인기 집계가 없어도 표시된다.
현재 30분 MV에는 과거 캐시된 152행이 있으나 지금 30분 관측을 뜻하지 않는다.

### DB 기록과 정적 서비스의 경계 — 후속 질문에 따른 명확화

현재 Cloudflare 구성은 빌드한 HTML/RSC·JSON을 제공한다.
[`open-next.config.ts`](../open-next.config.ts)의 읽기 전용 정적 캐시와
[기존 Worker 미리보기 증거](validation/next16-final-worker-smoke-2026-10-05.json)는
홈의 사전 생성과 런타임 PostgreSQL 설정 없이 응답한 사실을 확인한다.
실제 운영 배포가 최신 구성인지까지 이 조사에서 확인한 것은 아니다.
따라서 인기 집계가 복구된 뒤 운영 첫 화면에는 사이트 재빌드·배포도 필요하다.

| 기록 | 구현 | 언제 기록하는가 |
|---|---|---|
| 사용자의 읽음 표시·최근 읽은 글 | `lib/read-marker.ts`의 `localStorage['readPosts:v2']` | 브라우저의 글 클릭·읽음 처리 |
| 랭킹 선정 기록 | `lib/queries.ts`의 `post_rotation`·`cluster_rotation` SQL | Node에서 인기 조회 함수가 후보를 선정할 때 |
| PostgREST를 통한 읽음·노출 카운트 | 현재 앱 호출 경로 없음 | 해당 없음 |

DB 접속은 `lib/db.ts`의 `pg.Pool`·Drizzle 직접 연결이다. `NEXT_PUBLIC_POSTGREST_URL`
설정 흔적과 `POSTGREST_SETUP.md` 가이드는 존재하지만 현재 앱이 이를 사용하는 요청 코드는 없다.
랭킹 선정 기록은 사용자가 실제로 읽었거나 배포 사이트에서 실제 노출됐다는 통계가 아니다.
홈의 표시용 샘플링 전 선정 후보를 기록하며, 정적 운영에서는 빌드 당시의 기록이다.
앞선 설명의 “서버에서 DB 조회·노출 기록”을 운영 방문마다 수행하는 동작으로 해석하면 부정확하다.

## 선정 조건과 정상적으로 빌 수 있는 경우

[`lib/queries.ts`](../lib/queries.ts)의 ranked 조건은 해당 range와 최근 `window_end`,
미삭제 글, post·cluster 억제 제외, 앞 섹션과의 중복 제외다.
조회수·좋아요 최소값이나 `score > 0` 조건은 없다. 사이트 cap은 최대 3개이고
홈은 3시간에서 최대 3개, 24시간에서 최대 6개를 샘플한다.
현재는 MV 최근 후보가 이미 0개여서 점수·중복·cap을 적용하기 전부터 비어 있다.

이슈 섹션은 최근 `cluster_trends`, 존재하는 cluster 대표글, 미삭제·미억제 조건을 요구한다.
웹 쿼리의 별도 최소 cluster size 조건은 없다. 다만 생산 단계는 최근 72시간의 signature가 있는
**유사글 2개 이상**만 cluster로 만들므로 정상 가동하더라도 유사글이 없으면 이슈 묶음은 빌 수 있다.

준비된 Temporal [`analytics.py`](/Users/craigchoi/tem/src/is_temporal/analytics.py)는
고정 10분 창 끝 `W`에서 `(W-30분,W]`의 최신·최초 반응 차이를 계산한다.
관측 1회도 trend 행을 만들고 증가량은 0으로 기록한다. 관측 2회는 유효한 증가량을
확인하기 위한 coverage 조건이며 행 생성을 막는 조건은 아니다.
T2 기본 재관측 간격은 180·1440·2880분이므로 이 기본 간격만으로 30분 내 2회 관측은 보장되지 않는다.

## Temporal 실행 상태

- 14:51:58 KST에 IS live 스케줄 11개 모두 `paused=true`, 총 action 0,
  schedule의 최근 action·실행 중 workflow 0개다.
- `is-trends-live`의 서버 저장 stages는 `['trends','mv']`다.
  현재 준비된 소스는 `['trends','mv','rotation']`이며 파일 변경이 서버 입력을 자동 갱신하지 않는다.
- namespace에서 읽은 IS live root job 8개는 bootstrap 2, discovery 2, ingest 1, snapshot 3이다.
  `is_analytics_job`은 0개이며 집계 실행 실패 이력도 발견되지 않았다.
- 워커는 control·analytics 큐를 폴링하고 있고 backlog 0이다.
  이는 현재 소스 버전이 로드됐다는 보장은 아니다.
- 최근 실제 작업 종료는 06:37:57 KST의 Arca snapshot이다.
  17개 게시판 discovery는 Temporal 상태 `COMPLETED`여도 업무 결과는 `partial_failure`였다.
  글 적재 일부 성공과 전체 수집·후처리 성공은 구분해야 한다.
- 기존 [`IS 복구 검증 문서`](/Users/craigchoi/tem/docs/is-feed-recovery-validation-2026-10-05.md)는
  코드·격리 검증만 수행했고 실제 업무 DB migration, 워커 교체, 스케줄 운영 전환은 수행하지 않았다고 기록한다.
  이번 현재 조회 결과도 그 상태와 일치한다.

## 수집된 글이 있는데 후보를 하나도 만들지 않는 이유 — 추가 추적

“100개를 수집했고 그 100개에 점수를 매겼지만 전부 기준 미달이었다”는 설명은 현 구현과 맞지 않는다.
현재 ranked는 수집 원본 100개를 상대 비교하는 것이 아니라 `mv_post_trends_agg`에 들어온 글만 후보로 삼는다.
집계가 비었을 때 원본 `posts`의 반응 수치로 순위를 만드는 대체 경로가 없다.
`lib/queries.ts`의 빈 후보 분기는 진단 로그만 남기며,
기존 `scripts/utils/__tests__/feed-consumer.integration.test.ts`도 집계 제거 후 ranked/top의 빈 결과를 기대한다.
이번에는 해당 테스트의 기대를 읽었으며 새 테스트 실행이나 구현 변경은 하지 않았다.

수집에서 집계로 이어지는 연결도 확인했다.

1. `tem/src/is_temporal/runtime.py`의 `_crawl_ingest`는 크롤 결과를 `is_ingest_job`으로 적재한다.
2. ingest 처리에서는 `db.ingest`, signature 작성, enrichment 큐 생산까지 수행하고 종료한다.
   `advance`도 다음 집계 단계를 만들지 않고 `units=[]`로 종료한다.
3. analytics는 별도 `is_analytics_job` 실행 또는 독립 `is-trends` 스케줄로만 수행된다.
   수집 성공 자체는 인기 집계를 자동 실행하지 않는다.
4. `tem/src/pipeline_temporal/schedule.py`는 IS 스케줄을 `paused=True`,
   `Prepared; operator cutover required` 상태로 생성한다. 현재 서버에도 이 상태가 유지돼 실행 0회다.

따라서 확인된 단절은 **수집·적재 일부 성공 → 별도 집계 미실행 → 빈 집계만 읽는 인기 조회**다.
또 집계는 실행 시점의 최근 30분 관측을 먼저 계산하고 그 결과를 24시간 등으로 합산한다.
8시간 전 수집글이 DB에 남아 있다는 사실만으로 지금의 30분 계산에 들어가지는 않는다.

후속 사용자 설명으로 선별 원칙을 명확히 확인했다. 원 사이트의 조회·댓글 등 반응 변화와 활성도에 따라
선정하는 것이 기존 의도이며, 사용자는 누적 반응 순위로 바꾸거나 집계 없는 대체 선별을 요청한 것이 아니다.
앞선 답변에서 “사용자 요구와 현행 계산에 간극이 있다”고 해석한 것은 잘못된 추정이었다.
현재 조사 대상은 이 원칙을 수행할 Temporal 집계가 왜 실행되지 않았는지이며,
확인된 원인은 별도 집계 스케줄의 PAUSED 상태와 운영 전환 미수행이다.
이것은 집계가 실행돼 활성도 기준에 미달한 결과도, Temporal 서버·워커 고장이 확인된 상황도 아니다.
누적 조회수·댓글·좋아요를 사용하는 fresh 조회는 별도 기존 구현이며 이번 집계 복구의 대체 정책으로 채택하지 않는다.

## 복구를 진행할 때의 순서

이번 요청은 먼저 원인과 현황을 확인하는 범위였으므로 아래 운영 변경은 실행하지 않았다.

1. 업무 DB의 두 MV 정의·권한·인덱스·dependency·데이터를 보존한 뒤,
   준비된 [`007_fixed_consumer_windows.sql`](/Users/craigchoi/tem/migrations/is/007_fixed_consumer_windows.sql)을
   명시적 transaction으로 적용하고 계약 hash를 확인한다.
   현행 코드의 current/global publish는 계약 테이블이 없으면
   `CONSUMER_VIEW_MIGRATION_REQUIRED`를 발생시키고 집계 transaction 전체를 rollback한다.
2. 열린 작업과 코드 버전을 확인하여 준비된 IS worker를 반영하고,
   `is-trends-live`를 PAUSED 상태에서 현재 복합 stages로 갱신한다.
3. 제한한 실제 수집 범위에서 새 입력을 적재하고, 같은 글을 5~10분 간격으로 관측하여
   같은 30분 창의 알려진 지표 증가량을 확보한다. 현재 관측 없이 집계만 돌리면 현재 trend 입력은 0개다.
4. 현재 global `W` 집계·MV publication을 검증하여 DB 후보가 생겼는지 확인한다.
   scoped 또는 과거 `W` 실행은 MV publication을 생략하므로 이것만으로 홈 회복을 검증할 수 없다.
5. cluster가 필요한 섹션은 실제 유사글·signature·membership·cluster_trends를 따로 검증한다.
   필요한 스케줄을 단계적으로 재개하고 실제 시간 경과 후 입력·집계·표시의 갱신을 확인한다.
   운영 첫 화면은 새 집계로 HTML/RSC를 재빌드·배포하고 후속 JSON도 같은 데이터 세대로 제공한다.

웹 조회 함수는 노출 기록을 쓰기 때문에 진단 목적으로 직접 호출하지 않았다.
SQL 조회만으로 원인과 필터별 수량을 확인했으며, 이 조사로 인기글 표시를 복구했다고 주장하지 않는다.

## 증거

- [업무 DB 수량·시각·MV 정의](validation/popularity-db-status-2026-10-05.json)
- [관측 coverage·과거 계산 가능 창·필터 단계 수량](validation/popularity-input-status-2026-10-05.json)
- [현재 Temporal 스케줄·워커·실행 이력](validation/popularity-temporal-status-2026-10-05.json)
