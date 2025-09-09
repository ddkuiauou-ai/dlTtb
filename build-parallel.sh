#!/bin/bash

# 병렬 실행의 최대 개수를 CPU 코어 수로 제한하여 시스템 과부하를 방지합니다.
# macOS에서는 sysctl -n hw.ncpu, Linux에서는 nproc 명령어로 코어 수를 얻을 수 있습니다.
MAX_JOBS=$(sysctl -n hw.ncpu)
echo "Running builds in parallel with a max of $MAX_JOBS concurrent jobs..."

# 백그라운드에서 실행되는 프로세스의 카운트를 관리합니다.
job_count() {
  jobs -p | wc -l
}

# Job의 개수가 최대치에 도달하면, 하나가 끝날 때까지 기다립니다.
wait_for_job() {
  while [[ $(job_count) -ge $MAX_JOBS ]]; do
    sleep 1
  done
}

# --- 단일 실행 스크립트 ---
echo "Starting singular builds..."
pnpm tsx scripts/build-search-index.ts &
wait_for_job
pnpm tsx scripts/build-post-json.ts &
wait_for_job
pnpm tsx scripts/build-keyword-json.ts &
wait_for_job

# --- Matrix 실행: main 페이지 ---
echo "Starting matrix builds for main pages..."
for range in 3h 6h 24h 1w; do
  for section in fresh trending top ranked; do
    # 환경변수를 설정하고 백그라운드에서 실행합니다.
    RANGE=$range SECTION=$section pnpm tsx scripts/build-main-json.ts &
    wait_for_job
  done
done

# --- Matrix 실행: category 페이지 ---
echo "Starting matrix builds for category pages..."
# 참고: 이 카테고리 목록을 실제 사용하는 목록으로 수정하세요.
for category in all video youtube; do
  for range in 3h 6h 24h 1w; do
    pnpm tsx scripts/build-category-json.ts "$category" "$range" &
    wait_for_job
  done
done

# --- Matrix 실행: all-posts 페이지 ---
echo "Starting matrix builds for all-posts pages..."
for range in 3h 6h 24h 1w; do
  pnpm tsx scripts/build-allposts-json.ts "$range" &
  wait_for_job
done

# --- 모든 백그라운드 작업이 끝날 때까지 기다립니다 ---
echo "Waiting for all build jobs to complete..."
wait

echo "✅ All parallel builds finished."
