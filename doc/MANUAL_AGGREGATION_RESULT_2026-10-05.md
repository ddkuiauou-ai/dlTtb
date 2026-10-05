# Temporal 수동 집계 실행 결과

실행 시각: **2026-10-05 15:17:31~15:18:18 KST**. 로컬 화면 확인: 15:23 KST.
사용자의 수동 집계 요청에 따라 실제 Temporal에서 실행했고, 로컬 웹에 결과가 표시되는 것까지 확인했다.

## 확인된 결과

- Temporal workflow **14개 모두 COMPLETED**, 작업 보고서도 모두 `passed`다.
- 기존 관측 35개 / 33개 글을 사용해 누락된 `post_trends` **105행**을 저장했다.
- `mv_post_trends_agg`의 최근 **24시간 후보가 0개에서 33개**로 늘었다.
- [로컬 웹](http://127.0.0.1:5005/)의 **지금 주목 (24시간 랭킹)에 카드 4개**가 실제 표시됐다.
- 현재 브라우저 오류 로그는 0개다. 웹 개발 서버는 확인용으로 실행해 두었다.

![수동 집계 후 로컬 24시간 랭킹](validation/popularity-manual-2026-10-05.jpg)

따라서 이번 입력 데이터에서는 **누락된 집계를 실행하면 24시간 섹션을 채울 수 있다**는 가설이 실제 실행으로 확인됐다.
로컬 개발 서버는 페이지 생성 시 DB를 조회하므로 이 결과를 바로 표시한다.
운영 Cloudflare의 정적 첫 화면에 반영하려면 별도 재빌드·배포가 필요하다.

## 실제로 실행한 작업

현재 소스의 워커를 별도 큐 `is-live-manual-agg-20261005`에서 기동했다.
namespace는 `cd-dev`, 업무 schema는 `public`이다.
원래 입력 시각과 관측값을 그대로 사용했다.

1. 집계 코드에 필요한 기존 migration `007_fixed_consumer_windows.sql`을 사전 백업 후 한 트랜잭션으로 적용했다.
   두 MV의 고정 시간 창 계약을 설치했으며 원본 테이블의 행 수는 보존됐다.
2. 선택된 33개 글에 `clusters_build`를 1회 실행했다.
3. snapshot이 존재했던 **04:40~07:00 KST의 12개 10분 창**에 `trends`를 실행했다.
   지난 시각의 rotation은 실행하지 않았다.
4. 현재 15:10 KST 창에서 `trends`, `mv`, `rotation`을 1회 실행해 소비용 MV를 갱신했다.
   현재 창에는 관측 입력이 없어 새 trend는 0행이고, MV 2개 갱신은 성공했다.

이 작업은 SQL로 결과를 직접 넣는 우회가 아니라 Temporal workflow와 analytics activity를 통해 수행했다.

## 여전히 빈 섹션과 측정의 한계

| 섹션 / 검사 | 실행 후 결과 | 이유 |
|---|---|---|
| 최근 3시간 급상승 | 후보·표시 0개 | 최근 3시간 관측과 trend 입력이 없음 |
| 24시간 랭킹 | 후보 33개, 현재 화면 표시 4개 | 과거 24시간 입력의 누락 집계 복구 후 웹 선정·표시 성공 |
| 오늘의 이슈 / 이번주 | 표시 0개 | cluster build의 유사글 후보 쌍 0개, 새 묶음 0개 |
| 충분한 반복 관측 | 105개 trend 중 0개 | 같은 30분 창 안의 알려진 반응 수치 관측이 2회 이상인 경우가 없음 |

이번에 생성된 증가량은 모두 0이다. 이는 실제로 반응이 증가하지 않았다는 증거가 아니라,
**증가량을 확인할 반복 관측이 부족했다**는 뜻이다. 집계 저장과 화면 연결은 확인됐지만,
실제 활성도 변화에 따른 순위를 검증하려면 이후 수집·재관측 입력이 필요하다.
선정 기준이나 모멘텀 계산 정책은 변경하지 않았다.

## 보존 및 종료 확인

- `posts` **15,571개**, `post_snapshots` **64,212개** 유지.
- 사용한 snapshot 35개의 원본 레코드와 관측 시각 보존 확인.
- 신규 크롤·모델 호출·자동 스케줄 변경은 각각 0회.
- 15:23:32 KST 재검증에서 IS live 자동 스케줄 **11개 모두 PAUSED** 유지.
- 수동 워커 PID 64425 종료, 해당 큐의 poller 없음 확인.
- 15:26:09 KST 읽기 전용 검증에서 MV 2개의 기존 owner·실제 권한·index·comment·열 정의 보존,
  고정 시간 창 계약 hash와 이전 정의 일치를 확인했다.
- 확인용 Next 개발 서버는 `http://127.0.0.1:5005/`에서 실행 중이다.
  `next dev`가 루트 `AGENTS.md`, `CLAUDE.md`를 자동 생성했다.

## 실행 기록

- [원본 Temporal 실행 보고서](/Users/craigchoi/tem/reports/is-manual-aggregation-20261005/execution.json)
- [백업 디렉터리](/Users/craigchoi/tem/reports/is-manual-aggregation-20261005/backups)
- [적용한 migration](/Users/craigchoi/tem/migrations/is/007_fixed_consumer_windows.sql)
- [migration 보존 검증](/Users/craigchoi/tem/reports/is-manual-aggregation-20261005/final-migration-verification.json)
- [브라우저 확인 데이터](validation/popularity-manual-browser-2026-10-05.json)
- [수동 실행 요약](validation/popularity-manual-aggregation-2026-10-05.json)
- [수동 실행 전 조사](POPULARITY_PIPELINE_STATUS_2026-10-05.md)

대표 workflow ID:

- 묶음 생성: `is-manual-agg-clusters-20261005T061732580135`
- 누락 trend 복구: `is-manual-agg-history-01-20261005T061736008320` ~ `is-manual-agg-history-12-20261005T061811422228`
- 현재 MV 갱신: `is-manual-agg-publish-1-20261005T061814711456`
