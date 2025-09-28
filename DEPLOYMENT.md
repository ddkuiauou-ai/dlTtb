# 배포 설정 가이드

이 프로젝트는 Cloudflare Pages와 R2를 사용하여 배포됩니다:

## 1. 메인 사이트 (HTML 페이지들)

- **Cloudflare Pages 프로젝트**: 메인 웹사이트
- **내용**: Next.js로 빌드된 HTML 페이지들 + 검색 인덱스
- **환경변수**: `CLOUDFLARE_PAGES_PROJECT_MAIN`

## 2. 모든 JSON 데이터

- **Cloudflare R2 버킷**: 모든 JSON 데이터 저장소
- **내용**: 포스트 미리보기 + 무한스크롤 JSON 데이터 모두
- **환경변수**: `CLOUDFLARE_R2_BUCKET`

## GitHub Secrets 설정

GitHub 리포지토리의 **Settings > Secrets and variables > Actions**에서 다음 시크릿들을 추가하세요:

### 필수 시크릿들:

- `CLOUDFLARE_API_TOKEN` - Cloudflare API 토큰
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare 계정 ID
- `TOKEN_GITHUB_COM` - GitHub 토큰

### 프로젝트별 시크릿들 (신규):

- `CLOUDFLARE_R2_BUCKET` - JSON 데이터 저장용 R2 버킷 이름

### 데이터베이스 시크릿들:

- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

## Cloudflare 설정

### Pages 프로젝트 생성

메인 사이트를 위한 Cloudflare Pages 프로젝트를 생성하세요:

1. **메인 사이트 프로젝트**: 일반적인 웹사이트 설정

### R2 버킷 생성

JSON 데이터를 저장할 Cloudflare R2 버킷을 생성하세요:

1. Cloudflare Dashboard → R2 → Create bucket
2. 버킷 이름을 설정하고 생성
3. 버킷 이름은 `CLOUDFLARE_R2_BUCKET` 시크릿에 저장될 값입니다.

## 배포 구조

```
메인 사이트 (CLOUDFLARE_PAGES_PROJECT_MAIN):
├── index.html, about.html, ... (Next.js 빌드 결과)
└── data/
    └── search-index.json

R2 버킷 (CLOUDFLARE_R2_BUCKET):
└── data/
    ├── posts/
    │   └── v1/
    │       ├── abc123.json
    │       ├── def456.json
    │       └── ...
    ├── home/
    │   └── v1/
    │       ├── 3h/
    │       ├── 6h/
    │       ├── 24h/
    │       └── 1w/
    ├── category/
    │   └── [category]/
    │       └── v1/
    │           ├── 3h/
    │           ├── 6h/
    │           ├── 24h/
    │           └── 1w/
    ├── all/
    │   └── v1/
    │       ├── 3h/
    │       ├── 6h/
    │       ├── 24h/
    │       └── 1w/
    └── keywords/
        └── [keyword]/
            └── ...
```

## 페이지 수 제한 해결

기존에는 모든 데이터가 하나의 Pages 프로젝트에 포함되어 2만 페이지 제한에 걸렸습니다. 이제 메인 사이트는 Pages에 배포하고, 모든 JSON 데이터는 R2 버킷에 저장하여 제한을 해결했습니다:

- **메인 사이트**: 수백 페이지 (HTML + 검색 인덱스)
- **JSON 데이터**: 무제한 (R2 버킷에 저장)
