# Next.js 16 업그레이드 실행 결과

기준일: 2026-10-05. 대상: `/Users/craigchoi/silla/is`, 시작 커밋 `35c645b52e46b3456127809b0233cf3839cc6fa1`. 사용자가 승인한 [계획](/Users/craigchoi/silla/is/doc/NEXT16_UPGRADE_PLAN_2026-10-05.md)에 따라 **업그레이드와 로컬 통합 검증을 완료**했다. 현재 체크아웃의 의존성·코드·빌드·배포 설정을 변경했으며 실제 Cloudflare 배포와 운영 확인은 사용자에게 인계한다.

## 최종 버전

| 항목 | 적용 버전 | 선택 이유 |
| --- | --- | --- |
| Next.js / eslint-config-next | **16.3.8** | 실행 직전 확인한 최신 안정 버전 |
| React / React DOM | **19.3.0** | Next 및 UI peer 범위 일치 |
| TanStack React Virtual / 간접 core | **3.14.13 / 3.17.11** | 둘 다 최종 업그레이드 완료; 3.13.12는 프레임워크 변경을 분리 검증하는 1단계에서만 유지 |
| Node / pnpm | **24.19.0 / 12.9.1** | 지원 중인 Node 24 LTS, `.nvmrc`·engines·packageManager 고정; CI는 Node 24 사용 |
| TypeScript | **6.0.3** | typescript-eslint의 `>=4.8.4 <6.1.0` 지원 범위; 최신 7.0.2는 범위 밖 |
| ESLint | **9.39.5** | React/import/jsx-a11y 플러그인의 peer 범위; 최신 10.12.0은 호환 선언 범위 밖 |
| @types/node | **24.19.1** | Node 24 런타임과 일치하도록 선택; Node 26 타입을 강제하지 않음 |
| OpenNext / Wrangler | **1.20.8 / 4.147.0** | Workers 빌드·로컬 workerd 검증 조합 |
| Tailwind / PostCSS / tailwind-merge | **4.3.3 / 8.5.28 / 3.7.0** | 새 PostCSS 진입점과 v4 클래스/API로 이전 |
| Clerk | **@clerk/react 6.17.5** | deprecated `@clerk/clerk-react`의 공식 후속 패키지 |
| DayPicker | **@daypicker/react 10.0.2** | 기존 `react-day-picker`의 후속 패키지와 wrapper API 대응 |
| Drizzle ORM / Kit / pg | **0.45.3 / 0.31.11 / 8.23.1** | 쿼리·실제 JSON 생성기를 fixture DB에서 검증 |

직접 의존성 **72개 중 69개는 조회 당시 latest**이며 예외 3개는 위 TypeScript·ESLint·Node 타입이다. Radix·Motion·Lucide·폼/Zod·Recharts·resizable·MiniSearch·tsx·Playwright 등 나머지도 갱신했다. 간접 의존성은 각 패키지가 허용한 범위 안에서 보안 패치를 갱신했다. Peer 의존성 문제는 0개다. [전체 설치·선택 버전](/Users/craigchoi/silla/is/doc/validation/next16-final-versions-2026-10-05.json), [registry 조회](/Users/craigchoi/silla/is/doc/validation/next16-registry-execution-2026-10-05.json).

ESLint 9는 2026-08-06에 upstream 지원이 종료됐다. 이번에는 Next lint 플러그인의 peer 호환 범위 때문에 마지막 9.x 패치를 선택했으며 이를 지원 중인 최신 major라고 판단하지 않는다. 플러그인의 ESLint 10 호환 선언과 검증이 확보되면 이 개발 도구 제약도 해소할 후속 이전 대상이다. [ESLint 지원 상태](https://eslint.org/version-support/).

## 코드와 설정 변경

- Next 16의 기본 Turbopack 빌드를 사용한다. `next lint`와 `nextConfig.eslint`를 제거하고 공식 codemod `next-lint-to-eslint-cli`를 거쳐 ESLint flat config·독립 typecheck·CI 검사를 준비했다. TypeScript 설정은 Next가 요구한 `react-jsx`와 개발 타입 include를 반영했다.
- **use cache·Cache Components·PPR·React Compiler는 도입하지 않았다.** `cacheComponents: false`이며 기존 SSG 범위, 미생성 상세/키워드 404, JSON 세대 확인, IndexedDB·메모리·읽음·스크롤 복원 계약을 유지한다. `unstable_cache` 사용도 없다.
- Virtual 최신 core에서도 기존 좌표·측정·앵커·사용자 입력 취소를 보존했다. `useFlushSync:false`, direct DOM 갱신, 새로운 Query/Router/Table/Start는 추가하지 않았다. `scrollToOffset` 내부 동작 변화에 대한 주석만 바로잡았다.
- Clerk의 `SignedIn`/`SignedOut`을 후속 `Show` API로 이전했다. Tailwind 4 진입점과 container query/outline/CSS 변수 문법을 바꾸고, 기존 색상 50개·그림자·blur·preflight 표시를 호환 CSS로 보존했다. Calendar·Resizable·Chart wrapper도 새 타입/API에 맞췄다.
- JSON 생성기에서 확장된 lint가 찾은 기존 `any` 타입을 Drizzle 추론 타입으로 정리했다. 쿼리·JSON 값의 런타임 동작과 업무 DB schema는 변경하지 않았다.
- pnpm 빌드 스크립트 허용 목록은 필요한 esbuild/sharp/unrs-resolver/workerd만 허용한다. Clerk의 안내 출력 스크립트는 실행하지 않는다. 같은 날 공개된 `lucide-react@1.52.0`에는 pnpm이 기록한 특정 버전 release-age 예외만 둔다.

## Workers + OpenNext

`open-next.config.ts`, `wrangler.jsonc`, 환경 템플릿, build/preview/수동 deploy 명령을 추가했다. 기존 Pages/next-on-pages CI 경로를 Workers 산출물로 바꿨다. 현재 SSG 페이지는 **Workers Static Assets의 읽기 전용 incremental store**에서 제공하며 새 Next 캐시용 R2·D1·DO·Queue·tag cache 바인딩은 필요하지 않다.

최신 pg의 Cloudflare 조건부 export를 Next standalone tracing이 누락하는 문제가 실제 adapter 빌드에서 재현됐다. 공식 workerd 패키지 설정에 맞춰 `serverExternalPackages: ["pg-cloudflare"]`를 추가해 해결했다. 버전 하향·새 직접 의존성·광범위한 tracing glob·임의 override는 사용하지 않았다. [OpenNext workerd 설정](https://opennext.js.org/cloudflare/howtos/workerd), [동일 upstream 문제](https://github.com/opennextjs/opennextjs-cloudflare/issues/1214).

CI는 Node 24 및 pnpm 12.9.1로 맞췄고 공식 GitHub Actions도 현재 호환 버전으로 갱신했다. **사이트 배포는 수동 workflow_dispatch의 `deploy_site=true`에서만 실행**하며 기본값은 false다. 기존 콘텐츠 생성·R2 업로드 역할은 유지하므로 이 워크플로를 원격 실행하면 데이터 업로드는 발생한다. 이번에는 원격 CI를 실행하지 않았다. YAML과 공식 action 입력 33개를 로컬에서 검사했다. [CI 검증](/Users/craigchoi/silla/is/doc/validation/next16-ci-validation-2026-10-05.json).

## 로컬 검증

업무 `.env*`를 복사하지 않은 별도 소스·의존성 복사본, Node 24, 전용 localhost PostgreSQL fixture를 사용했다. Next 15 기준점을 확인한 뒤 Next 16/React 변경과 Virtual·UI 변경을 나눠 검증했다. 테스트 기대값을 완화하거나 실패를 retry로 숨기지 않았다.

| 검사 | 최종 결과 | 증거 |
| --- | --- | --- |
| 빈 node_modules에서 frozen 설치 | exit 0, 잠금 파일 변경 없음 | [설치 재현](/Users/craigchoi/silla/is/doc/validation/next16-clean-install-2026-10-05.json) |
| 타입 | 최종 fixture 및 Next 생성 타입이 없는 깨끗한 소스 모두 exit 0 | [최종 프레임워크](/Users/craigchoi/silla/is/doc/validation/next16-final-framework-2026-10-05.json) |
| 단위·DB opt-in 통합 | **37/37**, skip 0 | 같은 증거의 `unitAndFixtureDatabase` |
| Chromium 전체 회귀 | **33/33**, 실패·skip·retry 0 | 같은 증거의 `browser` |
| WebKit 핵심 회귀 | **16/16**, 실패·skip·retry 0 | [WebKit](/Users/craigchoi/silla/is/doc/validation/next16-final-webkit-2026-10-05.json) |
| 실제 JSON 생성기·상세/키워드/카테고리 조회 | 합성 글·본문·댓글·키워드 데이터로 통과 | [대표 fixture](/Users/craigchoi/silla/is/doc/validation/next16-production-fixture-2026-10-05.json) |
| 최종 OpenNext 빌드·Workers 미리보기 | 실제 `pnpm run build:cloudflare` exit 0, workerd **22/22** 통과 | [빌드·번들](/Users/craigchoi/silla/is/doc/validation/next16-final-worker-bundle-2026-10-05.json), [미리보기](/Users/craigchoi/silla/is/doc/validation/next16-final-worker-smoke-2026-10-05.json) |
| ESLint | **오류 0, 경고 88** | [전체 lint 결과](/Users/craigchoi/silla/is/doc/validation/next16-final-lint.json) |
| UI API·컴파일 smoke | CSS 컴파일, Calendar/Resizable SSR, Chart 타입 통과 | [UI smoke 범위](/Users/craigchoi/silla/is/doc/validation/next16-ui-api-smoke-2026-10-05.json) |

Chromium 47개 좌표 표본/508행, WebKit 19개 표본/213행에서 표시되어야 할 ID 누락 0, 배치 오차 0px, scroll margin 오차 0px였다. 상세 복원에서 **미측정 prefix의 문서 좌표 66px 차이라는 기존 제한은 유지**되며 화면 앵커 복원 2px 기준과 별도로 기록했다. 이는 모든 프레임 또는 실제 iOS momentum 동작 검증을 뜻하지 않는다. 미사용 UI wrapper의 SSR·타입 검사는 브라우저 선택·키보드·드래그·tooltip 상호작용 검증을 대신하지 않는다.

새 React Compiler 계열 lint 진단 7개 규칙은 기존 imperative 피드/DOM 구조를 유지하기 위해 경고로 설정했다. 해당 진단 **64건은 해결했다고 처리하지 않았다.** 나머지 24건에는 기존 unused 변수·이미지·exhaustive-deps와 확장된 파일 검사에서 드러난 진단이 있다. 기존 hooks 규칙은 유지한다. 이전 Next lint의 경고 14건과 현재의 전체 `eslint .` 88건은 검사 범위와 규칙이 달라 직접 비교할 수 없다. React Compiler 활성화 및 해당 구조 리팩터링은 후속 작업이다.

최종 Workers 미리보기는 런타임 PostgreSQL 변수와 Cloudflare 인증 없이 실행했다. 홈/카테고리/검색, 대표 글 본문·댓글/키워드 HTML과 RSC, 미생성 URL 및 production fixture 404, trailing slash 308, 잘못된 RSC 해시 정규화, JSON 7개 원본 SHA/Content-Type/freshness, Next 해시 자산의 immutable 헤더를 확인했다. 사전 생성 23개 경로의 revalidate는 모두 false, 동적 패턴 3개의 fallback도 false다. 최종 제품 설정·manifest·lock 파일과 검증 복사본이 일치한다.

실제 스크립트 재빌드는 로컬 캐시를 포함해 13.9초였다. entry/server/middleware의 로컬 gzip 합계는 약 1.31MB다. 두 수치는 새 환경의 cold build, Wrangler 업로드 수치나 운영 플랜 통과 증거가 아니다. 실제 생성 데이터가 포함된 운영 산출물에서 계정 제한을 다시 확인한다.

## UI와 성능 비교

동일 Chromium·fixture·viewport의 fresh context에서 1440/390px, list/grid를 비교했다. 색상·실제 그림자·카드 높이·여백·글자와 container badge 표시 기준은 같았다. fully rounded 배지의 계산 반지름 표현만 달랐으며 같은 pill 형태다. [화면·측정 증거](/Users/craigchoi/silla/is/doc/validation/next16-ui-performance-2026-10-05.json).

아래는 **이미 Next 16인 1단계와 최종 UI/Virtual 배치** 사이의 로컬 개발 모드 3회 중앙값이다. Next 15 대비 운영 성능 향상률이나 특정 패키지의 효과를 입증하지 않는다.

| 지표 | 1단계 | 최종 |
| --- | ---: | ---: |
| 첫 카드 표시 | 1,106ms | 1,122ms |
| 40→120개 로딩 | 363ms | 355ms |
| 상세 복귀 복원 | 356ms | 323ms |
| 빠른 스크롤 후 화면 커버 | 35.9ms | 34.5ms |
| 로딩 데이터 / append 후 피드 DOM | 120 / 26개 | 120 / 26개 |

표본에서 누락 ID·uncaught exception·console error는 0이었다. 외부 Clerk 로딩과 개발 서버 비용이 포함되어 있다. 가상화는 DOM 수를 제한하지만 로딩 데이터 전체를 줄이지 않는다. 실제 Cloudflare 응답·사용자 LCP/INP·대규모 데이터의 메모리 개선은 별도 운영 측정 대상이다.

추가 2회씩의 CDP/longtask smoke도 기록했다. 최종 120개 로드 후 강제 GC의 JS heap은 약 17.63MiB, 8스크롤 후 약 18.10MiB였고, 1단계의 약 16.90~17.27 / 17.45~17.75MiB보다 낮아지지 않았다. 최종 longtask는 8/11회, 최대 95/79ms였다. 개발 프레임워크·Clerk·숨은 참조 카드 120개·측정 코드와 강제 GC가 포함되므로 앱만의 메모리, 장기 누수 또는 개선률은 판정하지 않는다. 이 추가 실행의 기존 favicon 404는 별도 console 관측으로 보존했으며 JavaScript 예외와 오류 overlay는 없었다. [리소스 smoke](/Users/craigchoi/silla/is/doc/validation/next16-ui-resource-smoke-2026-10-05.json).

클래스 기반 light/dark 추가 비교에서도 카드·본문·border·배지 스타일이 일치했고 기존 `dark:bg-gray-700` 유틸이 적용됐다. 이는 실제 테마 버튼이나 설정 저장 검증과 별개다. [테마 smoke](/Users/craigchoi/silla/is/doc/validation/next16-ui-theme-smoke-2026-10-05.json).

## 보안 검사와 잔존 항목

전체 의존성 경고는 **137건 → 2건**으로 감소했다. 기존 Critical 4건은 0건이 됐고, 운영 의존성 `audit --prod`는 **모든 심각도 0건**이다. 전체 검사의 남은 High 1건·Moderate 1건은 개발 도구 경로이며 전체 audit exit code는 1이다. [이전 검사](/Users/craigchoi/silla/is/doc/validation/next16-security-audit-2026-10-05.json), [최종 전체 검사](/Users/craigchoi/silla/is/doc/validation/next16-security-audit-final-2026-10-05.json), [운영 의존성 검사](/Users/craigchoi/silla/is/doc/validation/next16-security-audit-production-2026-10-05.json).

| 잔존 의존성 | 적용 조건·현재 범위 | 판단 |
| --- | --- | --- |
| High: `braces@3.0.3` | eslint-config-next → Next lint plugin → fast-glob → micromatch. 깊게 중첩된 악성 brace 패턴 처리 시 stack DoS | 공식 패치 버전이 없고 현재 경로는 저장소 lint glob 처리다. 운영 사용자 입력용 glob API로 사용하지 않는다. 임의 major 교체로 호환성을 깨뜨리지 않고 개발 도구 위험과 후속 패치 필요를 기록 |
| Moderate: `esbuild@0.18.20` | drizzle-kit → 기존 esm-loader/core-utils. 취약한 기능은 개발 HTTP serve의 응답 노출 | 현재 Drizzle CLI는 설정 변환에 사용하며 취약한 serve를 실행하지 않는다. 패치 `>=0.25.0`은 이 하위 패키지의 기존 minor 범위 밖이므로 무검증 override를 하지 않음 |

현재 경로에 대한 적용 판단이며 개발 의존성 자체의 취약점이 사라졌다는 의미는 아니다. [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [esbuild advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99).

최종 Worker handler의 esbuild metafile 입력 433개와 Next 파일 추적 9개에서도 위 개발 도구 패키지 입력/파일은 0개다. Cloudflare 드라이버의 실제 `pg-cloudflare/dist/index.js` 포함도 확인했다. 이는 해당 산출물의 포함 여부 증거이며 개발 도구 advisory를 제거했다는 판정은 아니다. [번들 근거](/Users/craigchoi/silla/is/doc/validation/next16-final-worker-bundle-2026-10-05.json).

## 사용자 배포 확인과 복구

실제 배포·원격 CI·R2 업로드·버킷 생성·Cloudflare 계정/도메인 변경·업무 DB 쓰기/schema 변경은 수행하지 않았다. 로컬 검증용 합성 데이터는 임시 복사본과 전용 DB에만 넣었다. 기존 5005 포트의 사용자 서버는 건드리지 않았다.

검증 후 합성 행·rotation·임시 schema 잔여 0을 확인하고 전용 개발 서버 5017/5018, Workers preview 5021, fixture PostgreSQL 55442를 종료했다. 증거 파일은 보존했다. [격리환경 정리](/Users/craigchoi/silla/is/doc/validation/next16-isolation-cleanup-2026-10-05.json).

기존 개발 서버는 자동 재시작하지 않았다. Node 24.19.0과 pnpm 12.9.1 환경을 선택한 뒤 개발 서버를 재시작해야 새 의존성이 적용된다. 설치·빌드 명령은 배포 가이드에 있다.

배포 시 [DEPLOYMENT.md](/Users/craigchoi/silla/is/DEPLOYMENT.md)에 따라 실제 Worker 이름/계정, 운영 Clerk key/origin, 생성 데이터 세대, `/data/posts/v1/{id}.json`의 **같은 origin R2 라우팅**, 계정별 크기·CPU 제한과 로그를 확인한다. 로컬 상세 JSON은 응답 계약만 검증하므로 실제 R2 연결 성공으로 계산하지 않는다. 기존 Pages 배포와 도메인 설정을 복구 기간 동안 보존한다.

Tailwind 4의 기본 지원 범위는 Chrome 111+, Safari 16.4+, Firefox 128+다. WebKit 테스트는 실제 iPhone/iPad와 동일하지 않으므로 실제 대상 브라우저를 운영 확인에 포함한다. [Tailwind 브라우저 지원](https://tailwindcss.com/docs/compatibility).

소스 복구 기준은 위 시작 커밋이며 사용자 수정이 섞이면 전체 reset 대신 업그레이드 diff만 되돌린다. 되돌린 소스에서는 이전 Node/pnpm과 잠금 파일을 함께 복구해 재설치·재빌드한다. 운영 도메인 복구는 이전 Pages 라우팅과 기존 데이터 경로를 복원한다. 로컬 파일 변경은 리뷰 가능한 상태로 남겼으며 commit/push는 하지 않았다.
