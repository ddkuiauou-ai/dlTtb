# Cloudflare Workers 수동 배포 가이드

기준일: 2026-10-05. Next.js 16 사이트는 **Workers + OpenNext**로 빌드한다. 실제 계정 배포·도메인 전환·R2 연결은 사용자가 이 문서의 확인을 거쳐 진행한다. 로컬 build/preview 결과는 운영 배포 성공을 의미하지 않는다. 이전 Pages 배포는 첫 운영 확인과 복구 기간 동안 유지한다.

## 배포 구성

| 구성 | 산출물/역할 |
| --- | --- |
| Next.js / OpenNext | `.open-next/worker.js`, `.open-next/assets` |
| 사전 생성 HTML/RSC | Workers Static Assets 기반 읽기 전용 incremental cache |
| 검색·홈·카테고리·전체·키워드 JSON | `public/data`에서 생성해 Workers 자산에 포함 |
| 상세 JSON | 기존 R2 버킷의 `data/posts/v1/{id}.json`에 별도로 업로드 |
| 클라이언트 데이터 캐시 | 기존 manifest·IndexedDB·메모리·읽음/복원 동작 유지 |

`use cache`, Cache Components, PPR, ISR/태그 재검증과 새 R2/DO/D1/Queue 캐시는 도입하지 않는다. OpenNext의 읽기 전용 SSG 저장소는 빌드 결과를 전달하는 수단이다. 상세 JSON R2 저장소와 별개다. 이 저장소는 재검증을 지원하지 않으므로 콘텐츠 갱신에는 새로운 JSON 생성과 사이트 빌드·배포가 필요하다. 정적 해시 자산에만 `public/_headers`의 1년 immutable 캐시를 적용하며 JSON/manifest 캐시 정책은 유지한다. [OpenNext SSG 캐시](https://opennext.js.org/cloudflare/caching)

`next.config.mjs`의 `serverExternalPackages: ["pg-cloudflare"]`는 node-postgres의 Cloudflare 전용 조건부 export 파일을 OpenNext가 함께 복사하도록 한다. 이 설정이 없으면 최신 드라이버의 Node용 빈 파일만 추적되어 Worker 패키징이 실패한다. [OpenNext workerd 패키지 설정](https://opennext.js.org/cloudflare/howtos/workerd)

## 로컬 검증

Node 24.19.0과 `package.json`에 고정된 pnpm 12.9.1을 사용한다. `.nvmrc`의 Node 버전을 선택하고 실제 CLI 버전을 확인한 뒤 의존성을 설치한다.

```sh
nvm install
nvm use
node --version # v24.19.0
# 필요한 경우 이 Node 환경에 pnpm 설치: npm install --global pnpm@12.9.1
pnpm --version # 12.9.1
pnpm install --frozen-lockfile
```

기존 개발 서버는 자동 재시작하지 않았다. 업그레이드 버전을 사용하려면 이 환경에서 서버를 재시작한다.

Next 빌드는 PostgreSQL 데이터를 조회하며 홈 데이터 쿼리는 노출 기록을 쓸 수 있다. 테스트에서는 업무 `.env`를 복사하지 않고 별도의 로컬 fixture DB와 환경을 사용한다. `build:data`도 실제 데이터 생산 명령이므로 검증 환경을 확인한 후 실행한다. `POSTGRES_*`와 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`는 빌드 환경에 필요하며, `NEXT_PUBLIC_*`는 빌드 시 브라우저 코드에 들어간다.

```sh
# 안전한 fixture 환경에서 수행. Next build도 이 명령 안에서 실행된다.
pnpm build:cloudflare

# 이미 만든 산출물만 로컬 Workers 런타임으로 실행한다.
pnpm preview:cloudflare
```

`.dev.vars.example`은 비밀값이 없는 환경 선택 템플릿이다. 필요하면 `.dev.vars`로 복사하며 git에 넣지 않는다. `NEXTJS_ENV=production`은 production Next 환경 파일을 선택한다. 검증 전용 복사본에서는 업무 `.env*`를 제외하고 fixture 변수를 명시한다. `next dev`는 Node 개발 서버이므로 Workers runtime 검증을 대신하지 않는다. [OpenNext 환경 변수](https://opennext.js.org/cloudflare/howtos/env-vars), [build/preview/deploy 차이](https://opennext.js.org/cloudflare/cli)

확인할 경로는 홈, 카테고리, 검색, 빌드된 키워드/상세 페이지, 목록 JSON/manifest, `_next/static` 자산, 미생성 키워드/상세 404다. 개발 fixture인 `/test-feed/`와 `/api/test-feed/...`는 production에서 404여야 한다. 미생성 상세 URL은 현재 `dynamicParams=false` 계약을 유지하며 실시간 DB fallback으로 바꾸지 않는다.

2026-10-05 검증에서는 실제 `pnpm build:cloudflare`가 성공했고, 합성 글·댓글·키워드가 있는 전용 DB에서 생성한 23개 정적 경로의 재검증 설정은 모두 `false`였다. DB 환경 변수를 주지 않은 로컬 Worker에서 HTML/RSC, JSON 7개의 바이트·캐시 정책, 미생성 경로와 production 테스트 경로의 404 등 22개 점검을 통과했다. [Worker 응답 검증](/Users/craigchoi/silla/is/doc/validation/next16-final-worker-smoke-2026-10-05.json), [제품 설정 SHA·번들 검증](/Users/craigchoi/silla/is/doc/validation/next16-final-worker-bundle-2026-10-05.json)에 증거를 기록했다. 실제 콘텐츠 규모의 빌드와 운영 R2 경로는 아래 수동 인수 항목으로 확인한다.

## 첫 수동 배포 준비

1. `wrangler.jsonc`의 `name`을 실제 사용할 Worker 이름으로 확인한다. 기본값은 `silla-is`이며 운영 도메인 route는 아직 지정하지 않았다. 계정/플랜의 CPU·크기·정적 자산 제한도 실제 콘텐츠를 포함한 산출물로 확인한다.
2. 기존 콘텐츠 생성 환경의 `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`와 Clerk publishable key를 빌드 환경에 설정한다. SSG 소비 경로에는 빌드 시 생성된 값을 사용한다. 런타임 PostgreSQL 연결이나 새 Next 캐시용 R2 바인딩을 기본 설정으로 추가하지 않는다.
3. 기존 생성 JSON과 HTML이 같은 데이터 세대를 사용하도록 `public/data`를 준비하고 OpenNext 산출물을 빌드한다. 개발용 placeholder Clerk key로 만든 산출물을 운영에 배포하지 않는다.
4. 실제 Cloudflare 계정에 필요한 Worker 배포 권한이 있는 `CLOUDFLARE_API_TOKEN`과 `CLOUDFLARE_ACCOUNT_ID`를 사용자 환경에 설정한다. 토큰을 저장소 파일이나 출력에 넣지 않는다.
5. 기존 Cloudflare 대시보드의 runtime 변수가 있다면 유지 정책을 확인한다. 필요하면 OpenNext CLI의 `-- --keep-vars` 옵션으로 기존 값을 보존한다.

아래 명령은 **실제로 원격 사이트를 배포**하며 이번 로컬 검증에서는 실행하지 않는다. 빌드는 다시 실행하지 않으므로 준비한 산출물을 먼저 확인한다.

```sh
pnpm deploy:cloudflare
```

기존 대시보드 runtime 값을 보존해야 할 때는 다음 CLI 형태를 사용한다.

```sh
pnpm exec opennextjs-cloudflare deploy -- --keep-vars
```

`migrate`, `upload`, `populateCache remote`, 버킷 생성 명령은 로컬 검증에 필요하지 않다. 특히 공식 `migrate`는 계정에 R2가 활성화되어 있으면 버킷도 생성할 수 있으므로 실행 범위를 확인해야 한다. [OpenNext CLI](https://opennext.js.org/cloudflare/cli)

## 상세 JSON의 같은 origin 연결

현재 상세 모달은 **`/data/posts/v1/{id}.json`**을 상대 URL로 요청한다. CI는 상세 JSON을 사이트 자산에서 제외해 별도 R2에 올린다. 따라서 Worker 배포만으로 이 URL과 실제 R2가 연결되지는 않는다.

기존 운영의 R2 프록시/라우팅 구성을 확인하고 새 운영 도메인에서도 `/data/posts/v1/*`가 **기존 R2 버킷의 `data/posts/v1/*` 객체**를 반환하게 연결한다. 새 Next incremental-cache 버킷을 만들거나 모달을 다른 origin으로 바꾸는 작업으로 대체하지 않는다. R2 custom domain만 연결하면 앱의 같은 origin 경로가 자동으로 만들어지는 것은 아니다.

Worker 테스트 URL에서도 이 경로를 검증하려면 별도의 동일 경로 전달 구성이 필요하다. 운영 연결 방식을 선택하기 전까지 기본 `workers.dev` 주소에서 실제 R2 상세 조회가 성공한다고 가정하지 않는다. 로컬 fixture는 동일 URL의 응답 형태만 확인한다.

운영 연결 후 다음을 확인한다.

- 존재하는 상세 JSON의 직접 URL이 200과 JSON Content-Type을 반환한다.
- 홈·카테고리에서 상세 모달을 열어 본문/댓글/관련 글을 조회할 수 있다.
- 존재하지 않는 JSON은 올바른 404이며 사이트 HTML을 JSON 대신 반환하지 않는다.
- 목록/manifest와 상세가 같은 데이터 세대를 보며, 새 콘텐츠 업로드 후 실제 응답이 갱신된다.
- 쿠키/Clerk origin·리디렉션·trailing slash·브라우저 console·Worker 로그를 확인한다.

첫 확인이 통과한 뒤 기존 운영 도메인을 새 Worker로 전환한다. 실패하면 기존 Pages 라우팅과 데이터 경로로 복구할 수 있도록 이전 설정을 보존한다.

## GitHub Actions와 데이터 생산

`.github/workflows/build-contents.yml`은 `main` push와 수동 기동으로 콘텐츠를 생성한다. Node 24 / 고정 pnpm을 사용하며 다음 역할을 유지한다.

- `build_singular`: 검색 인덱스, 상세 JSON, 키워드 JSON을 생성한다.
- `build_main`, `build_categories`, `build_all_posts`: 목록/manifest를 생성한다.
- `build_main_site`: 상세 JSON을 제외한 자산을 합쳐 OpenNext 사이트를 빌드하고 산출물을 artifact로 보관한다.
- `upload_json_to_r2`: 기존 상세 JSON을 기존 R2에 업로드한다.
- `deploy_main_site`: **수동 workflow_dispatch에서 `deploy_site=true`를 선택한 경우에만** 앞선 사이트 산출물을 Workers로 배포한다. 기본값은 false이며 main push는 새 사이트를 자동 배포하지 않는다.

첫 운영 확인 전에는 수동 배포 입력을 켜지 않는다. `deploy_site=false`라도 콘텐츠 생산과 기존 R2 업로드는 수행되므로 검증만 원하는 경우 이 워크플로를 원격 실행하지 않는다. 첫 배포 후 자동 배포를 다시 활성화하는 변경은 후속으로 판단한다.

GitHub Secrets는 기존 `POSTGRES_*`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`을 유지한다. 수동 Worker 배포에는 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`가 필요하다. Pages project secret은 새 Worker 배포에서 사용하지 않는다. R2 업로드는 기존 S3 호환 AWS CLI 방식이며 AWS STS 인증용 액션은 사용하지 않는다.

원격 CI 성공, 실제 계정 바인딩, R2 연결과 운영 도메인 전환 결과는 로컬 업그레이드 검증과 별도로 기록한다.
