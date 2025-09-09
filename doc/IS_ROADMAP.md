# IS Project — Roadmap & Design Doc
_Last updated: 2025-08-12 13:52 UTC_

## 0) TL;DR
- **헤더 탭은 '시간(range)'만** 제어: `3h / 6h / 24h / 1w`  
- **섹션은 목적 고정**:  
  - 급상승(3h, ranked), 지금 주목(range, ranked), 오늘의 이슈(24h, ranked), 이번주(1w, ranked), 최신(range, fresh), 인기 키워드(24h, top10)  
- **랭킹 핵심**: 사이트별 정규화 + 시간 감쇠 + 댓글 깊이 페널티 + 사이트 캡(인터리빙)  
- **중복/재업로드 처리**: 텍스트/이미지/임베드 기반 시그니처 → 클러스터 빌드 → (선택) 병합 → 회전  
- **파이프라인 주기**: 대부분 10분, 클러스터 빌드는 30–60분, 병합은 1–6시간

---

## 1) 목적 & 목표
### 목적
- 국내 다양한 커뮤니티 글을 모아 **공정하고 즉시성 있는 이슈 큐레이션** 제공.
- **큰/작은 커뮤니티 편향**을 줄이고, **지금 뜨는 글**을 정확히 포착.

### 목표
- **SSG 친화** 아키텍처: 첫 페이지는 DB에서 바로 SSR/SSG, 2페이지부터 JSON 무한 스크롤.
- **정규화 랭킹**과 **증분 데이터 파이프라인**으로 비용/성능/품질 균형.
- **중복 컨텐츠 자동 클러스터링** 및 **회전 로직**으로 과노출 방지.

---

## 2) UX 설계 (홈)
- 헤더: 시간 탭만(`range=3h|6h|24h|1w`) — URL 쿼리 싱크.
- 섹션별 목적 / 쿼리 고정:
  - **급상승**: _3h, ranked_ (정규화 랭킹)
  - **지금 주목**: _{selectedRange}_, ranked
  - **오늘의 이슈**: _24h, ranked_ (탭 무시)
  - **이번주**: _1w, ranked_ (탭 무시)
  - **최신**: _{selectedRange}_, fresh
  - **인기 키워드**: _24h, TOP 10_
- 카드: 클러스터 뱃지, 임베드(YouTube/X) 아이콘 인디케이터(선택).  
- 사이트 캡: **최대 3개/사이트** + **비례 라운드로빈** 인터리빙.

---

## 3) 랭킹 로직
### ranked (정규화)
1) 소스: `post_trends` 델타(views/comments/likes) — **30분 슬라이딩 윈도우**  
2) 분당 rate 환산 → `ln(1+rate)`  
3) **사이트별 z-score**: 중앙값/표준편차로 정규화  
4) 가중합: `1*z_view + 2*z_comment + 1.5*z_like`  
5) **시간 감쇠**: `exp(- age_hours / 6)`  
6) **댓글 깊이 페널티**: 창 내 `max(depth) ≥ 3` → `×0.9`  
7) **사이트 캡 + 비례 라운드로빈** 인터리빙  

### fresh (최신)
- 소스: 기간 내 최신 글 + 간단 가중치(`3*likes + 2*comments + views`)  
- 정규화 없음(대신 사이트 캡/섞기만 적용).

---

## 4) 스키마 핵심 추가
- `post_signatures` (텍스트 SimHash/MinHash, 갤러리/임베드 MinHash)
- `clusters`, `cluster_posts`, `cluster_trends`, `cluster_rotation`
- `keyword_trends` (홈 인기 키워드 24h Top10 집계)  
  - PK: `(keyword, range_label, window_start, window_end)`
- 기존 `post_trends.hot_score`는 **원시 가중 델타** 저장(정규화는 조회 시점).

---

## 5) 파이프라인 자산(Assets) & 의존성
```
posts_asset
 ├─ post_versions_asset
 ├─ post_images_asset
 ├─ post_embeds_asset
 ├─ post_comments_asset
 ├─ post_signatures_asset
 ├─ post_keywords_asset (증분, TF‑IDF top8/글)
 └─ post_categorize_asset (증분, 룰 기반)

post_snapshots_asset → post_trends_asset (30m window)
                      └─ refresh_mv_post_trends_30m (옵션)

post_signatures_asset → clusters_build_asset (룩백 72h, 30–60m 주기)
clusters_merge_asset (14d 룩백, 1–6h 주기, 독립 스케줄)

post_trends_asset + clusters_build_asset → cluster_rotation_asset (10m 주기)
keyword_trends_asset (24h Top10, 10m 주기)
```
- **rotation**은 `build + trends` 최신 상태에 의존.  
- **merge**는 독립 스케줄(실시간성 낮음).

---

## 6) 실행 주기 & 튜닝 상수 (이유 포함)
- **post_trends**: `window=30m`, **10m 주기**  
  - 10m 스냅샷/주기에서 30m 창이면 ≥3포인트로 Δ 안정화.
- **clusters_build**: **룩백 72h**, **30–60m 주기**  
  - 재업로드/퍼나르기 리콜↑. 10m마다 전량은 비용↑ → 주기 늘림.
- **cluster_rotation**: `window=1w`, `top_k=20`, `τ=48h`, `max_consecutive=3`, `cooldown=24h`, **10m 주기**  
  - 오래 머무는 이슈 감쇠 + 과노출 방지.
  - **연속 판정 보정**: 직전 노출이 20m(=2×주기) 넘으면 연속 리셋.
- **clusters_merge**: **룩백 14d**, `topk_per_cluster=8`, `min_pairs=3`, `avg_sim≥0.80`, **1–6h 주기**
- **post_keywords**: **IDF 코퍼스 7d**, **업데이트 대상=이번 배치(증분)**, top8/글, **10m 주기**  
  - 코퍼스(DF)는 안정적 유지, 실제 태깅은 증분만.
- **keyword_trends**: **24h Top10**, **10m 주기**  
- **post_categorize**: **이번 배치(증분)**, **10m 주기**.

---

## 7) 클러스터링/병합/회전
### Build
- 후보: SimHash prefix + Text MinHash LSH(32×4)  
- 확인:  
  - `text Jaccard ≥ 0.75`, 또는  
  - `(gallery ≥ 0.80) & (text ≥ 0.55)`, 또는  
  - `(embed ≥ 0.85) & (text ≥ 0.50 or gallery ≥ 0.60)`  
- 대표글: `hot_score` 우선, 없으면 `like + 3*comment`

### Merge
- 최근 14d 클러스터에서 대표/멤버 상위 8 교차 비교 → 쌍 수 또는 평균 유사도로 병합.

### Rotation
- 윈도우 내 `hot_score`를 **백분위 정규화** 후 **시간 감쇠**.  
- top_k 선정, **연속 3회**이면 24h suppress.  
- 상태: `cluster_rotation(consecutive_hits, last_shown_at, suppressed_until, last_score)`

---

## 8) 에러/이슈 기록
- `post_trends_asset`에서 `dislike_delta` 미삽입으로 **NOT NULL 위반** 발생 →
  - **Fix**: CTE에 `dislike_count` 포함, INSERT/UPSERT에 `dislike_delta` 추가 (패치 예정).

---

## 9) 프런트 연동 메모
- `/app/page.tsx`: 섹션별 고정 로직 + URL `?range=` 연동 완료.
- `header-client.tsx`: 탭 값 `3h/6h/24h/1w` 싱크.  
- `keyword_trends` 읽어서 “인기 키워드(24h)” 섹션 추가 예정.
- 카드: 클러스터 뱃지/임베드 아이콘(선택) 적용.

---

## 10) 남은 작업 Checklist
- [ ] **post_trends_asset**: `dislike_delta` 컬럼 계산/업서트 패치
- [ ] 프런트: `keyword_trends` 섹션 쿼리/컴포넌트 추가
- [ ] `cluster_rotation` 상태 테이블(스키마 재확인) 및 관리 뷰
- [ ] `clusters_build`/`merge`/`rotation` 스케줄(30–60m / 1–6h / 10m) 설정
- [ ] 키워드/카테고리 증분 처리 모니터링 대시보드
- [ ] 사이트 캡/라운드로빈 후처리 유닛 테스트
- [ ] 댓글 깊이 페널티 쿼리 최적화 (인덱스 및 시간창 필터)
- [ ] (옵션) `post_trends` rate 컬럼 캐시 도입 검토
- [ ] (옵션) MV(`mv_post_trends_30m`)를 “급상승(30분)” 섹션에 바인딩 활용
- [ ] (옵션) LLM 분류기로 교체/보완 시 배치 비용/슬롯 관리

---

## 11) 운영 팁
- 스냅샷 빈도/윈도우 조합은 **주기×3 ≈ 윈도우**가 안정적.
- 병합은 실시간성 낮음 — **정확성/비용 균형**으로 1–6시간 권장.
- 회전 연속 카운트는 노출 밀도를 반영해 **20분 보정** 유지.
