# Isshoo 데이터 파이프라인 기준 문서

기준일: **2026-10-04 KST**. 이 문서는 새 대화에서 현재 수집·분석 구조를 이해하고 후속 개발을 이어가기 위한 코드 조사 기록이다.

전체 방향은 [README](../README.md), 웹 소비 경로는 [웹 구현 현황](WEB_IMPLEMENTATION.md), 다음 업데이트 작업은 [업그레이드 인수인계](UPGRADE_HANDOFF.md)를 참고한다.

사용자 설명에 따라, 소비자용 커뮤니티 큐레이션 서비스는 사람을 모으는 제품이며 수집·정규화·분석·분류·그룹화 기술은 향후 기업 및 중소상인용 모니터링 서비스의 기반이다.
기업용 서비스는 별도 제품 방향으로 구분하며, 현재 구현된 것으로 간주하지 않는다.

## 1. 조사 범위와 확인 수준

- `is` 저장소의 문서·데이터 조회 구조와 인접 `dag` 저장소의 `is_*` 소스 및 커뮤니티 크롤러를 읽었다.
- 파이프라인·크롤러·모델을 실행하지 않았으며, 운영 DB·네트워크·Dagster 상태를 조회하지 않았다.
- 아래의 “현재”는 조사 당시 소스 코드의 정의를 뜻한다. 운영에서 활성화된 스케줄·환경변수·DB 정책·처리량은 확인하지 않았다.
- 모델명·배치 크기·일부 정책은 환경변수로 변경될 수 있다. 문서의 기본값을 운영 설정이나 처리 보장으로 해석하지 않는다.
- “우선 확인” 항목은 정적 분석에서 발견한 불일치 또는 위험이다. 실제 운영 장애와 데이터 손실을 확정한 내용은 아니다.
- 자격증명·비밀 값·내부 접속 주소는 기록하지 않는다.

## 2. 저장소 경계

| 위치 | 역할 | 후속 조사 시작점 |
| --- | --- | --- |
| `is` | 소비자용 Isshoo 웹 서비스와 데이터 조회 | [`lib/schema.ts`](../lib/schema.ts), [`lib/queries.ts`](../lib/queries.ts) |
| 인접 `dag` | 여러 제품의 Dagster 파이프라인 중 Isshoo 수집·분석 | [`definitions.py`](../../dag/dag/definitions.py), [`jobs.py`](../../dag/dag/jobs.py) |
| `dag/dag/is_crawlee` | 사이트별 독립 TypeScript 크롤러 | [`is_node.py`](../../dag/dag/is_node.py), 각 `src/main.ts`·`src/routes.ts` |
| `dag/output_data` | 크롤러 JSON을 센서에 전달하는 공용 폴더 | [`is_sensor_output_data.py`](../../dag/dag/is_sensor_output_data.py) |

이 문서의 `../../dag/...` 링크는 `is`와 `dag`가 같은 상위 폴더 아래에 있는 배치를 전제로 한다.
`dag` 수정 시에는 해당 저장소의 [`AGENTS.md`](../../dag/AGENTS.md)와 [`docs/coding.md`](../../dag/docs/coding.md)를 별도로 적용한다.
파일이 이동하거나 대규모 리팩터링되면 고정 줄 번호보다 아래에 적힌 함수·자산 이름으로 구현을 다시 찾는다.

## 3. 구현된 소스와 게시판 범위

소스 코드에는 **16개 커뮤니티 크롤러 디렉토리**가 있다. 사이트 전체가 아니라 아래에 설정된 게시판·인기 목록이 수집 대상이다.

| 커뮤니티 | `BOARDS`에 정의된 대상 | 설정 근거 |
| --- | --- | --- |
| 82cook | 자유게시판 `free` | [`82cook/routes.ts`](../../dag/dag/is_crawlee/82cook/src/routes.ts) |
| 아카라이브 | 핫딜 `hotdeal` | [`arca/routes.ts`](../../dag/dag/is_crawlee/arca/src/routes.ts) |
| 보배드림 | 베스트 `best` | [`bobae/routes.ts`](../../dag/dag/is_crawlee/bobae/src/routes.ts) |
| 클리앙 | 모두의공원 `park` | [`clien/routes.ts`](../../dag/dag/is_crawlee/clien/src/routes.ts) |
| 다모앙 | 자유 `free`, 새소식 `new` | [`damoang/routes.ts`](../../dag/dag/is_crawlee/damoang/src/routes.ts) |
| 개드립 | 개드립 `dogdrip` | [`dogdrip/routes.ts`](../../dag/dag/is_crawlee/dogdrip/src/routes.ts) |
| 이토랜드 | HIT `hit` | [`etoland/routes.ts`](../../dag/dag/is_crawlee/etoland/src/routes.ts) |
| FM코리아 | 베스트 `best` | [`fmkorea/routes.ts`](../../dag/dag/is_crawlee/fmkorea/src/routes.ts) |
| 가생이 | `general` 설정의 게시판 | [`gasengi/routes.ts`](../../dag/dag/is_crawlee/gasengi/src/routes.ts) |
| 웃긴대학 | 일간 웃긴자료 `pds-day` | [`humor/routes.ts`](../../dag/dag/is_crawlee/humor/src/routes.ts) |
| 인스티즈 | 이슈 HOT `hot` | [`instiz/routes.ts`](../../dag/dag/is_crawlee/instiz/src/routes.ts) |
| 인벤 | 오픈이슈갤러리 `open_issue_gallery` | [`inven/routes.ts`](../../dag/dag/is_crawlee/inven/src/routes.ts) |
| 뽐뿌 | HOT `hot` | [`ppomppu/routes.ts`](../../dag/dag/is_crawlee/ppomppu/src/routes.ts) |
| 루리웹 | 베스트 전체 `best_all` | [`ruliweb/routes.ts`](../../dag/dag/is_crawlee/ruliweb/src/routes.ts) |
| SLR클럽 | 인기글 `hot_article` | [`slrclub/routes.ts`](../../dag/dag/is_crawlee/slrclub/src/routes.ts) |
| 더쿠 | HOT `hot` | [`theqoo/routes.ts`](../../dag/dag/is_crawlee/theqoo/src/routes.ts) |

각 크롤러는 기본적으로 `BOARDS`의 첫 항목만 선택하며 `--board yall`로 전체 설정 게시판을 선택한다.
따라서 다모앙 새소식은 코드에 존재하지만 기본 discovery 인자만으로 수집된다고 단정할 수 없다.
정의된 크롤러의 존재와 현재 사이트 DOM에서 정상 동작한다는 사실은 별도로 검증해야 한다.

## 4. 수집 모드와 실행 주기

[`is_node.py`](../../dag/dag/is_node.py)의 `is_crawler_fanout_job`은 전체 크롤러 빌드 후 디렉토리를 선택하고 병렬 실행한다.
discovery 스케줄 인자는 `--mode incremental --max-pages 2 --max-requests 60`이며, 실행 설정의 병렬도는 4이다.
이미 discovery 잡이 실행·대기 중이면 다음 discovery 실행을 건너뛰는 가드가 있다.

| 모드 | 역할 | 제한 또는 중단 기준 |
| --- | --- | --- |
| `incremental` | 목록에서 새 글 발견 | 마지막 게시물 ID, 목록 페이지 수, 요청 수 |
| `full` | 과거 범위 수집 | 지정 시간 이전에서 중단; 기본 범위 48시간 |
| `hot` | 지정 URL 재수집 | 전달된 상세 URL만 요청 |

| 티어 | discovery 정의 | 현재 디렉토리 기본 매핑 | 기본 snapshot 간격 |
| --- | --- | --- | --- |
| T0 | 매 3분, 분 `1-59/3` | `T0_DIRS={""}`로 실제 대상 없음 | 10·60·180·360·720·1440·2880분 |
| T1 | 매 10분, 분 `4,14,24,34,44,54` | FM코리아 | 30·180·720·2880분 |
| T2 | 매 30분, 분 `12,42` | 나머지 디렉토리 | 180·1440·2880분 |

snapshot controller는 매 3분, 분 `2-59/3`에 DB의 활성 `crawl_policies.snapshot_offsets_minutes`를 읽는다.
기준 시각은 최초 snapshot, 없으면 게시물의 수집·갱신 시각이며, 최근 7일에 발견된 글에서 도래한 재수집을 선택한다.
사이트당 최대 50개, 배치당 URL 25개를 `hot` 모드로 전달하고 snapshot 잡의 중첩 실행도 건너뛴다.
위 snapshot 간격은 `seed_crawl_metadata_asset`이 만드는 기본값이며 운영 DB의 현재 값은 미확인이다.
discovery는 `_dir_tier`의 코드 매핑으로 대상을 선택하므로 DB 정책을 바꾸는 것만으로 discovery 주기가 바뀌는 구조는 아니다.
`full` 실행 기능과 정책의 `backfill_hours` 값이 있어도 실제 backfill 자동 실행 여부는 스케줄·등록 상태를 다시 확인해야 한다.

## 5. JSON 수집 계약

대표 구현은 [`damoang/main.ts`](../../dag/dag/is_crawlee/damoang/src/main.ts)의 `validateAndNormalize`와 결과 저장부, [`damoang/routes.ts`](../../dag/dag/is_crawlee/damoang/src/routes.ts)의 `DETAIL` 핸들러이다.

| 묶음 | 주요 필드 | 의미 |
| --- | --- | --- |
| 배치 메타 | `site`, `board`, `crawled_at`, `crawler_version`, `crawl_config` | 어떤 설정으로 언제 수집했는지 기록 |
| 출처 | `id`, `post_id`, `url`, `site`, `board` | 내부 ID와 원문 위치 |
| 게시물 | `title`, `author`, `timestamp`, `content`, `contentHtml`, `content_hash` | 게시 시각, 본문과 변경 감지용 해시 |
| 반응 | `view_count`, `like_count`, `dislike_count`, `comment_count` | 수집 당시 카운트 |
| 미디어 | `images`, `embeddedContent`, `image_count`, `embed_count` | 이미지 URL과 YouTube/X/기타 임베드 정보 |
| 수집 시각 | `crawledAt` | 게시 시각과 별도로 저장한 상세 수집 시각 |
| 댓글 | `comments` 및 중첩 `replies` | 댓글 ID·작성자·본문·시각·반응·부모 관계·깊이·HTML/raw |

본문 HTML을 보존하지만 전체 응답 원본이나 전체 페이지 HTML의 보존을 의미하지 않는다.
댓글 수는 기본 정규화에서 실제 수집한 댓글 트리를 평탄하게 센 값이다. 원본 사이트에 표시된 총수와 항상 같다고 볼 수 없다.
FM코리아와 뽐뿌에는 AJAX 댓글 페이지네이션이 구현돼 있다. 다른 소스의 더보기·페이지네이션·삭제 댓글 대응은 개별 검증이 필요하다.
JSON은 크롤러 내부 `output`에 저장하고 공용 `output_data`로 복사한다.

## 6. 처리 흐름과 자산 책임

```text
사이트별 목록/상세 크롤링 → 표준 JSON → output_data 센서 → is_ingest_job
  → posts + versions/comments/images/embeds/snapshots/signatures
  → snapshots → trends/MV → 소비자용 랭킹
  → signatures → clusters build/merge → rotation → 소비자용 그룹 노출
  → images/일부 embeds → media_enrichment_jobs → VLM → 이미지별 결과/rollup
  → text_rev + image_rev → fusion_jobs → LLM → fused_categories/fused_keywords
  → fused_keywords → keyword_trends → 소비자용 키워드 조회
```

[`is_output_data_sensor`](../../dag/dag/is_sensor_output_data.py)는 최소 30초 간격으로 JSON 파일명·수정 시각을 감시하고 `posts_asset`에 파일 경로를 넘긴다.
[`is_ingest_job`](../../dag/dag/jobs.py)은 자산 선택으로 적재를 묶는다. 아래 흐름은 여러 자산·잡·자동화가 연결된 구조이며 모든 단계가 하나의 실행에서 완료된다는 뜻은 아니다.

| 자산 또는 묶음 | 책임 | 소스 |
| --- | --- | --- |
| `posts_asset` | JSON을 `posts`에 upsert하고 변경분 전달, `text_rev` 기록 | [`is_data_sync.py`](../../dag/dag/is_data_sync.py) |
| `post_versions_asset` | 게시물 버전 기록 | 동일 소스 |
| `post_comments_asset` | 댓글 트리 평탄화와 댓글 upsert | 동일 소스 |
| `post_images_asset`, `post_embeds_asset` | 미디어 정규화, 새 미디어의 분석 작업 enqueue | 동일 소스 |
| `post_mp4_metadata_asset` | MP4 용량·재생시간 등 메타데이터 | 동일 소스 |
| `post_snapshots_asset`, `sites_asset` | 반응 카운트 시계열 및 사이트 수집 시각 | 동일 소스 |
| `post_signatures_asset` | 텍스트·이미지 URL·임베드·MP4 메타데이터 시그니처 | 동일 소스 |
| `post_trends_asset`, `refresh_mv_post_trends_*` | 반응 증가량과 조회용 MV 갱신 | [`is_data_unsync.py`](../../dag/dag/is_data_unsync.py) |
| `clusters_build_asset`, `clusters_merge_asset`, `cluster_rotation_asset` | 유사 글 그룹 생성·병합·노출 회전 | [`is_data_cluster.py`](../../dag/dag/is_data_cluster.py) |
| `vlm_worker_asset` | 미디어 큐 소비와 이미지 분석 결과 저장 | [`is_data_vlm.py`](../../dag/dag/is_data_vlm.py) |
| `text_only_enqueue_asset`, `image_rollup_asset`, `upgrade_to_image_llm_asset` | 텍스트 선처리 및 이미지 결과 후 재분석 연결 | [`is_data_unsync.py`](../../dag/dag/is_data_unsync.py) |
| `fusion_worker_asset`, `keyword_trends_asset` | 최종 분류·키워드 생성과 키워드 집계 | [`is_data_llm.py`](../../dag/dag/is_data_llm.py), [`is_data_unsync.py`](../../dag/dag/is_data_unsync.py) |

적재 자산은 주로 `EAGER`, 트렌드·키워드·회전은 10분 조건, 클러스터 빌드는 30분 조건, 병합은 1시간 조건을 사용한다.
실제 실행은 [`schedules.py`](../../dag/dag/schedules.py)의 조건, [`definitions.py`](../../dag/dag/definitions.py)의 등록과 운영 daemon·스케줄 상태에 달려 있다.
`post_trends_asset`은 최근 30분의 반응 증가량으로 `views + 3*comments + 2*likes` 원시 hot score를 계산한다.
소비자용 조회 단계에는 추가 정규화·시간 감쇠·사이트별 섞기 로직이 있으므로 raw hot score를 최종 화면 순위로 해석하지 않는다.

## 7. VLM·LLM의 현재 역할

VLM은 `media_enrichment_jobs`를 소비해 이미지별 caption·OCR·labels·objects·colors·safety를 `post_image_enrichment`에 저장한다.
`image_rollup_asset`은 변경된 게시물의 결과를 모아 `post_enrichment`에 저장하고 `image_rev`가 바뀌면 fusion 작업을 연결한다.
`vlm_worker_asset`에는 `EAGER` 조건이 있고 별도 `is_vlm_schedule`은 3분 주기이다. 주석의 2분 표기와 실제 cron을 구분한다.
`VLM_BATCH` 기본값은 5, `VLM_MODEL` 기본값은 `qwen/qwen2.5-vl-7b`이며 환경변수로 바꿀 수 있다.
큐의 선택 정책은 한 번의 선택에서 게시물별 최대 2개 이미지를 `url_hash` 정렬로 고른다. 본문의 시각적 첫/마지막 이미지나 모든 이미지의 즉시 분석을 의미하지 않는다.
`promote_p0_from_frontpage_asset`은 최근 `post_rotation` 노출을 바탕으로 미디어 작업 우선순위를 승격한다. 현재 우선순위 기준도 소비자용 노출 목적이다.

LLM의 `fusion_worker_asset`은 `fusion_jobs`를 소비하고 제목·본문 및 준비된 이미지 분석 정보를 합쳐 **카테고리와 키워드**를 생성한다.
허용 카테고리는 유머·정보·질문·후기·뉴스·토론·후방·짤·정치·쇼핑·IT·스포츠·게임·기타 14종이며 프롬프트는 1~2개 카테고리와 3~8개 키워드를 요구한다.
`post_enrichment`에는 `fused_categories`, `fused_keywords`, 모델·버전·분석 revision 관련 정보가 저장된다.
`LLM_MODEL` 기본값은 `qwen/qwen3-4b-2507`, `FUSION_BATCH` 기본값은 30이며 워커는 `ON10` 조건을 사용한다.
이 기본 모델은 현재 코드 기록이며 품질·최신성·기업용 적합성에 대한 추천은 아니다.

`FUSION_COMMENTS_TOP_N` 기본값은 **0**이므로 댓글은 기본 LLM 입력에 포함되지 않는다.
상위 댓글 일부를 읽는 선택 기능은 있지만, 댓글 전체의 평판·불만·응답 필요성을 분석하는 기능으로 검증된 것은 아니다.
`text_rev`는 제목·본문·태그로 계산되며 댓글 변경을 포함하지 않는다. 댓글 추가만으로 필요한 재분석이 연결되는지 확인해야 한다.
텍스트 선처리는 이미지 큐 ETA에 따라 잠시 기다리거나 즉시 실행하고, 이미지 결과가 준비되면 다시 fusion 작업을 넣는 구조이다.
큐 워커는 준비된 작업을 잠그고 `queued → processing → done/error` 상태를 기록한다. fusion 결과는 대상 revision과 연결된다.
작업 실패는 큐에 error를 기록하고 배치 실패를 드러내지만 자동 재시도·복구가 항상 보장되는 것으로 해석하지 않는다.
`FUSION_PROMPT_VER` 기본값은 프로세스 시각 기반이므로 재현 가능한 분석 버전 관리가 필요한 경우 고정 설정과 revision 계약을 확인한다.

## 8. 그룹화의 의미

현재 그룹화는 SimHash·MinHash 기반 텍스트 유사도와 이미지 URL·임베드 ID·MP4 용량/시간 등을 결합하는 **중복·재업로드 탐지**에 가깝다.
클러스터 빌드는 기본 72시간을 살피며 병합은 최근 14일의 그룹 멤버 일부를 비교한다.
회전은 반응 점수·시간 감쇠·연속 노출·쿨다운으로 소비자 화면에서 같은 콘텐츠의 과노출을 줄인다.
관련 구현은 [`post_signatures_asset`](../../dag/dag/is_data_sync.py)과 [`is_data_cluster.py`](../../dag/dag/is_data_cluster.py)에 있다.
서로 다른 문장·후기·댓글이 같은 기업의 같은 사건을 이야기한다고 묶는 의미 기반 사건 그룹은 현재 구현으로 확인되지 않았다.
향후 기업용 사건 그룹은 기업/브랜드 식별·시간·주장·문제 유형을 기준으로 별도 평가해야 한다.

## 9. 우선 확인할 정적 불일치

다음 항목은 후속 코드 검토와 제한된 재현으로 확인할 대상이며 운영 영향은 아직 확정하지 않았다.

1. **재수집 매핑:** `_build_site_to_dir_map`은 소문자 `siteName:`만 읽지만 10개 크롤러는 대문자 `SITE_NAME:` 인라인 설정을 사용한다. `seed_crawl_metadata_asset`도 `make...({siteName, boardName})` 형태를 읽는다. 소스 확대 후 metadata·snapshot 대상이 모두 연결되는지 확인한다. 근거: [`is_node.py`](../../dag/dag/is_node.py), [`fmkorea/routes.ts`](../../dag/dag/is_crawlee/fmkorea/src/routes.ts).
2. **수집 실패와 빈 댓글:** 댓글 수집 오류가 빈 배열·0개로 반환되는 경로가 있다. 원래 댓글이 없는 글과 파싱 실패·부분 누락을 구분할 품질 상태를 검토한다. 근거: `collectComments`, `validateAndNormalize` in [`damoang/routes.ts`](../../dag/dag/is_crawlee/damoang/src/routes.ts), [`main.ts`](../../dag/dag/is_crawlee/damoang/src/main.ts).
3. **증분 커서:** 목록 처리에서 상세 요청을 넣은 뒤 상세 수집 완료 전에 `lastStopId`를 갱신한다. 요청 상한·상세 실패·인기 목록 재정렬 상황에서 누락 없이 복구되는지 확인한다. 근거: `LIST` 핸들러 in [`damoang/routes.ts`](../../dag/dag/is_crawlee/damoang/src/routes.ts).
4. **복수 게시판:** 기본 discovery는 `--board yall`을 전달하지 않고 snapshot 배치도 사이트 단위로 URL을 묶는다. 다모앙 새소식 등에서 게시판 선택·ID 귀속이 정확한지 확인한다. 근거: [`is_node.py`](../../dag/dag/is_node.py), [`damoang/main.ts`](../../dag/dag/is_crawlee/damoang/src/main.ts).
5. **댓글 분석 연결:** 옵션을 켰을 때 댓글 로더·입력량·재분석 트리거·비용·실패 처리까지 검증한다. 현재 댓글 저장과 기업용 댓글 분석은 구분한다. 근거: `_load_top_comments`, `FUSION_COMMENTS_TOP_N` in [`is_data_llm.py`](../../dag/dag/is_data_llm.py).

## 10. 기업용 서비스에 재사용할 기반과 추가 개발

재사용 후보는 사이트 어댑터, 표준 수집 계약, 원문 URL·시간·본문 근거, 댓글 관계, 변경 해시·버전·snapshot, 비동기 분석 큐·revision, 이미지 OCR, 유사 콘텐츠 그룹과 운영 메타데이터이다.
이 구조를 바탕으로 소비자 화면과 별도 기업용 제품을 만들 수 있지만, 현재 코드의 소스 범위·주기·분석 목적은 인기 콘텐츠 큐레이션에 맞춰져 있다.
인기 목록에 오르기 전의 작은 불만이나 특정 지역 상점 언급은 현재 범위에서 발견되지 않을 수 있다.
댓글 재수집 기본 간격과 큐 대기·처리 주기를 합치면 조기 대응 지연이 생길 수 있으므로 “실시간 대응”은 별도 지연 목표로 설계·측정해야 한다.

향후 개발 항목으로 구분할 기능은 다음과 같다.

- 기업·브랜드·상품·지점의 별칭과 동명이인 구분, 고객별 추적 대상·제외 조건.
- 본문·댓글별 대상에 대한 감정, 문제 유형, 긴급도, 응답 필요성 및 근거 구간.
- 동일 사건의 의미 기반 그룹화, 확산 규모·이상 증가·조기 감지.
- 고객별 알림·케이스 처리·담당자·확인 이력, 중복 알림 억제와 실패 복구.
- 조직·권한·테넌트 분리, 사용량·과금, 고객별 품질과 지연 측정.
- 누락·부분 수집·삭제·수정·분석 오류를 드러내는 데이터 품질 계약과 평가 데이터.

## 11. 기존 문서와의 차이 및 유지 방법

[`dag/docs/is.md`](../../dag/docs/is.md)는 크롤러 4개와 더쿠 미구현, 예전 디렉토리 이름을 기술한다. 실제 소스에는 더쿠 포함 16개가 있다.
동일 문서의 “초 단위에 가깝게 수집” 표현은 현재 discovery 기본 티어와 일치하지 않는다.
[`IS_ROADMAP.md`](IS_ROADMAP.md)의 룰 기반 분류·TF-IDF 키워드 계획은 현재 fusion LLM 구조와 구분해 읽는다.
후속 작업은 변경되는 코드의 자산·설정·스키마와 이 문서를 함께 갱신하고, 운영 검증 결과는 날짜·환경·측정 범위를 별도로 기록한다.
새 대화에서는 이 문서와 해당 자산의 최신 소스를 먼저 읽고, 구현·운영 확인·제품 제안을 구분한 상태로 작업을 이어간다.
