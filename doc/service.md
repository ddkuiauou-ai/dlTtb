# Service: Deployment & CI/CD

## 서비스 철학

- 빠르고 직관적인 콘텐츠 제공
- 중립적이고 투명한 큐레이션
- 최소한의 오버헤드로 우수한 UX
- 확장성과 유지보수성 고려

정적 사이트와 클라이언트 사이드 로딩 기능을 효율적으로 빌드·배포하기 위한 가이드입니다.

## 1. 빌드 파이프라인 (GitHub Actions)

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 20
      - name: Install Dependencies
        run: pnpm install
      - name: Build JSON data
        run: pnpm run build-posts
      - name: Build Next.js
        run: pnpm build
      - name: Publish to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CF_PAGES_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          projectName: ${{ secrets.CF_PROJECT_NAME }}
          directory: .next
```

## 2. Cloudflare Pages 설정

- 빌드 커맨드: `pnpm run build`
- 빌드 디렉토리: `.next`
- 환경 변수: `CF_PAGES_TOKEN`, `CF_ACCOUNT_ID`, `CF_PROJECT_NAME`
- 캐싱: `node_modules`, `.next/cache` 활용

## 3. 모니터링 & 롤백

- 빌드 실패 시 GitHub Actions 알림
- 이전 릴리스로 롤백: Cloudflare Pages UI 또는 `git revert`

## 4. CI 최적화

- `actions/cache`로 빌드 캐시 저장
- 변경된 `public/data/posts/*.json`만 재생성하는 스크립트 (position diff 활용)

## 5. 알림 (Slack)

- 빌드 완료/실패 알림을 Slack으로 전송
- `8398a7/action-slack` 사용
