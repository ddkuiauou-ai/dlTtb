# Next.js 16 업그레이드 계획 초안

> 승인한 계획에 따른 업그레이드와 로컬 검증을 실행했다. 최종 선택 버전, 단계별 결과, 잔존 경고와 사용자 수동 배포 항목은 [실행 결과](/Users/craigchoi/silla/is/doc/NEXT16_UPGRADE_RESULT_2026-10-05.md)에 기록했다. 아래 내용은 실행 전의 기준과 완료 조건이다.

기준일: 2026-10-05, Asia/Seoul. [갱신한 현황 조사](/Users/craigchoi/silla/is/doc/NEXT16_UPGRADE_ASSESSMENT_2026-10-05.md)에 근거한다. 후속 제안을 반영해 **Workers + OpenNext로 이전하고 로컬에서 구현·검증을 완료한 뒤, 실제 Cloudflare 배포와 운영 확인은 사용자가 수작업으로 진행**하는 계획으로 갱신했다. 이 문서는 앱 코드·패키지 업그레이드·배포를 실행한 결과가 아니다.

## 1. 목표와 확정 조건

Next.js와 관련 라이브러리를 **보안 패치가 적용된 최신 호환 조합**으로 이전하고 현재 사용자 동작을 보존한다.

- Cloudflare를 계속 사용하고 **Workers + OpenNext**를 이전 목표로 정한다. static Pages와의 선택 비교를 선행 조건으로 두지 않는다.
- 공식 문서의 지원 범위를 근거로 구현을 진행한다. **실제 Cloudflare 배포 성공은 후속 확인 항목**이며, 로컬 완료나 문서상 호환을 운영 배포 검증으로 기록하지 않는다.
- **use cache와 Cache Components를 도입하지 않는다.** PPR, 새 cacheLife/cacheTag/태그 무효화 계층도 추가하지 않는다.
- 현재 사전 생성 HTML·JSON, manifest 세대, IndexedDB, 메모리 목록, 읽음·스크롤 복원 계약을 유지한다.
- TanStack은 현재 사용하는 **Virtual**을 업그레이드한다. Query/Router/Start/Table, lanes, directDomUpdates, React Compiler 도입은 기본 범위에 포함하지 않는다.
- `is` 웹 저장소만 변경한다. 공통 업무 DB schema·인접 파이프라인 변경은 별도 요구가 생기지 않으면 포함하지 않는다.

## 2. 목표 버전 후보와 제약

| 묶음 | 후보 | 판단 기준 |
| --- | --- | --- |
| Next / eslint-config-next | 16.3.8 | 같은 버전; 보안 패치·Cloudflare 어댑터 지원 확인 |
| React / React DOM | 19.3.0 | 같은 버전; React 타입 및 Clerk/Radix peer 확인 |
| Node / pnpm | 지원 중인 LTS와 동일 pnpm 고정; Node24 LTS 후보 | 로컬/CI/어댑터 engines 충족; @types/node 정렬 |
| ESLint | 최신 호환 9.x 후보 | 조회한 10.12.0은 react/import/jsx-a11y plugin peer 밖 |
| TypeScript | 6.0.3 후보 또는 지원 중인 이전 라인 패치 | 조회한 7.0.2는 typescript-eslint >=4.8.4 <6.1.0 범위 밖; Next/tsx/ORM/설정 검증 후 채택 |
| TanStack React Virtual | 3.14.13 | 정확한 간접 core 3.17.11 포함; 별도 변경·회귀 검증 |
| Cloudflare 어댑터 | OpenNext 1.20.8 후보 + 호환 Wrangler | next-on-pages 제거; Workers 설정·어댑터 build·로컬 preview 검증 |
| 그 외 직접 의존성 | 전체 71개 현황 JSON의 latest 후보 | 연관 패키지 묶음별 이전·peer 확인; deprecated 패키지는 후속 패키지 검토 |

위 값은 조사 시점 후보다. 실제 실행 직전에 registry·보안·peer·릴리스를 다시 확인하고 최종 선택과 이유를 기록한다. TypeScript7/ESLint10을 강제 설치하거나 peer 경고를 숨기는 방식으로 “최신 완료”를 판단하지 않는다. [전체 버전·peer](/Users/craigchoi/silla/is/doc/validation/next16-dependencies-2026-10-05.json), [TanStack 근거](/Users/craigchoi/silla/is/doc/validation/tanstack-assessment-2026-10-05.json).

## 3. 단계별 변경·검증·완료 기준

| 단계 | 변경·조사 범위 | 완료 기준 |
| --- | --- | --- |
| 0. 로컬 기준점 | 안전한 fixture DB/복사본, 현재 Next production route 분류, URL/404/JSON/Clerk/R2 경로, 로컬 실행 환경 기록 | 정적/동적 경로표·검증 fixture·기준 결과 확보; 외부 계정 설정 확인을 기다리지 않음 |
| 1. 프레임워크와 검사 도구 | Next/React/타입, next lint→ESLint CLI/flat config, nextConfig.eslint 제거, Node/pnpm 및 CI 검사 고정 | 타입/단위/lint/Next fixture build 통과; Virtual/core는 먼저 기존3.13.12 유지해 피드 검증 |
| 2. Workers + OpenNext | next-on-pages 제거, Wrangler/OpenNext 설정·스크립트·ignore/환경 템플릿·배포 문서 준비; 어댑터 build와 로컬 Workers preview | 로컬 어댑터 build·preview 성공, fixture 노출 정책·404·생성 URL·JSON 경로 보존; 필요한 서버 DB 경로는 fixture 검증 |
| 3. TanStack Virtual | adapter3.14.13과 간접 core3.17.11, 기존 옵션·마크업·데이터 캐시 구조 유지 | 기존 좌표/브라우저 회귀 통과; 측정·스크롤·사용자 취소·첫 표시 비교 |
| 4. 나머지 라이브러리 | 아래 묶음별 버전·API 대응 | 각 묶음 타입/lint/build 및 관련 사용자 동선 통과; peer 불일치 검토 완료 |
| 5. 로컬 통합 검증과 인계 | 보안 재검사, 깨끗한 설치·CI 검사 설정, 최종 OpenNext build/preview·브라우저·성능 비교, 버전표·수동 배포/복구 방법 | 로컬 검사 통과 및 미검증 항목 기록; Critical/High 적용 전제·처리 이유 기록; 사용자 배포에 필요한 설정·명령·확인 항목 인계 |

한 작업 흐름에서 각 묶음의 로컬 검증을 통과한 뒤 다음 묶음으로 계속 진행한다. 실제 Cloudflare 배포 확인을 중간 통과 조건으로 두지 않는다. Next/React 변화와 Virtual/core 측정 변화를 구분하고 패키지 매니저가 Virtual을 먼저 갱신하지 않도록 단계1의 잠금 버전을 확인한다. **Virtual 3.13.12 유지는 단계1 검증 동안만이며 최종 목표는 3.14.13/core3.17.11이다.** API 변경 때문에 기존 동작을 유지할 최소 수정이 필요하면 해당 묶음에 포함하고 회귀 증거를 남긴다.

## 4. Workers + OpenNext 전환과 로컬 검증 범위

**Workers + OpenNext로 전환할 설정과 산출물을 준비하고, 실제 배포는 사용자에게 인계한다.** 현재 Next 빌드와 사용자 동작을 보존한다. static export 전환이나 vinext 이전을 추가 작업으로 넣지 않는다.

- 설정: `wrangler.jsonc`, `open-next.config.ts`, `nodejs_compat`, 지원 compatibility date, `.open-next/worker.js`/`.open-next/assets`, 로컬 환경 템플릿과 build/preview/수동 deploy 명령을 준비한다. 필요한 바인딩만 선언하고 원격 계정 값은 문서에 인계한다.
- 캐시: `cacheComponents` 비활성 상태와 기존 JSON·IndexedDB 캐시를 유지한다. 완전 SSG 경로는 static assets 캐시를 검토한다. 새 재검증 Queue/Tag/R2/DO 캐시 전체를 기본 요구로 넣지 않는다.
- DB: Workers 런타임 DB 경로가 있을 때만 요청별 연결 수명·접근 방법을 검토하고 로컬 fixture에서 검증한다. 빌드 전용 PG 연결까지 Next16 때문에 전면 리팩터링하지 않는다.
- JSON: 목록/manifest와 상세 JSON의 URL을 보존한다. 로컬은 같은 URL의 fixture 응답으로 검증하고, 실제 R2 연결·도메인·CDN 갱신은 사용자 배포 확인에 남긴다. R2 데이터 저장과 Next 서버 캐시는 구분한다.
- 로컬 Workers 검증: `opennextjs-cloudflare build`로 배포용 산출물을 만들고 `opennextjs-cloudflare preview`로 로컬 Workers 런타임에서 경로·리소스·콘솔 오류·피드 동작을 확인한다. Node의 `next dev`/`next start` 검사도 사용하지만 어댑터 preview 검증을 대체하지 않는다.
- 시험 환경: 기존 브라우저 회귀 33개는 개발 전용 fixture에서 실행한다. production의 `/test-feed/`·`/api/test-feed/...`는 의도적으로 404이므로, production Workers preview에는 주요 페이지·자산·404의 별도 smoke 검증을 적용한다. 두 환경의 성공을 구분해 기록한다.
- 반복 빌드: OpenNext build가 Next build를 호출하므로 최종 통합 검증에서는 같은 변경에 두 빌드를 불필요하게 반복하지 않는다. 새 변경이나 실패가 생긴 범위는 다시 검증한다.
- 외부 작업: 로컬 바인딩/fixture만 사용한다. 실제 deploy/upload, 원격 캐시 초기화, 버킷 생성, 도메인 변경은 사용자가 진행한다. 공식 migrate 명령은 원격 R2 생성도 포함할 수 있으므로 이번 로컬 작업에서는 필요한 설정을 직접 준비한다.
- CI: 품질 검사·빌드 설정은 Workers 기준으로 준비한다. 현재 콘텐츠 생성/R2 업로드 역할을 보존하고 사이트 배포 단계는 수동 기동 방식으로 준비해 첫 수작업 확인 전 main push가 의도하지 않은 Workers 배포를 실행하지 않게 한다. 원격 CI 실행 성공은 이번 완료 조건에 포함하지 않는다.

공식 문서는 어댑터 build와 로컬 Workers preview를 별도로 지원한다. 이 범위를 로컬에서 검증한 뒤 계정별 운영 확인을 인계하는 방식은 구현을 진행할 근거가 된다. 실제 도메인·플랜 제한·네트워크·리소스 바인딩까지 성공했다고 판단하는 근거는 아니다. [OpenNext 시작 가이드](https://opennext.js.org/cloudflare/get-started), [build/preview/deploy의 차이](https://opennext.js.org/cloudflare/cli), [OpenNext SSG 캐시](https://opennext.js.org/cloudflare/caching).

## 5. TanStack 검증에서 보존할 동작

현재 홈 최신·카테고리는 가상행이고 홈 상단·키워드는 일반 grid다. 그리드 카드 보기를 TanStack lanes로 바꾸거나 키워드 화면을 새로 가상화하는 기능 변경은 하지 않는다.

- 행 좌표: 관측한 scrollMargin과 `start - scrollMargin` transform, count/열/ID 키, 활성 미리보기·앵커 행 유지.
- 측정: 처음 표시와 이미지·폰트·카드 높이 변경, 위/아래 빠른 스크롤, 폭/열 변경, 상단 콘텐츠 변화, append 시 기존 측정값 유지.
- 복원: 상세 복귀·직접 page URL·필터·모달 이동, wheel/touch/pointer/key 입력으로 복원 취소, 이동 중 unmount.
- **scrollToOffset 검증:** 새 core는 재정렬 loop를 갖는다. 기존 앱 helper를 유지하는 것만으로 단일 이동·사용자 취소를 보장하지 않으므로, 취소 후 지연 보정이 스크롤을 다시 강제하지 않는지 확인한다.
- 캐시: 중복·빈 페이지·누락/재시도·세대 교체·오래된 응답·IDB 격리/거부가 기존 계약대로 작동하는지 확인한다.
- React: 수화 오류·첫 렌더·Strict Mode cleanup·console/pageerror 확인. `useFlushSync:false`, directDomUpdates는 임의 적용하지 않는다.

기존 7,560 좌표 조합·360 연속 변화와 Chromium 33개 시험을 사용한다. internal `_willUpdate`/측정 배열에 의존하는 harness는 새 core의 모델 차이와 실제 제품 실패를 구분한다. 실제 DOM 회귀를 기대값 완화로 숨기지 않는다. 기존 행 배치/reference 1px, 복원 화면 위치 2px와 미측정 prefix 문서 좌표 제한을 그대로 기록한다. 가능한 WebKit 검증과 실제 iOS 결과는 별개로 보고한다. [기존 브라우저 기준](/Users/craigchoi/silla/is/tests/browser/README.md:11).

성능 비교는 동일 fixture·viewport·카드 수로 첫 표시, 빠른 스크롤의 빈 화면/장시간 작업, 화면 DOM 수와 전체 데이터 메모리, append/복원 지연을 측정한다. 최신 Virtual이 DOM·데이터 캐시 메모리를 모두 줄인다는 가정은 하지 않는다.

## 6. 나머지 라이브러리 묶음

1. 보안 영향이 확인된 Drizzle/pg, PostCSS·배포/빌드 하위 의존성: DB schema를 자동 변경하지 않고 쿼리·생성 JSON을 fixture에서 검증한다.
2. Clerk: deprecated clerk-react에서 @clerk/react 후속 패키지로 이전을 검토한다. 현재 client provider·로그인 동선을 유지하고 서버 인증 도입은 별도 범위로 둔다.
3. Tailwind/PostCSS/tailwind-merge/animate/container queries/Radix: CSS 진입점·plugin/API 대응, 목록·카드·테마·포털·모달·반응형 시각 검증.
4. 폼/Zod/resolvers·day-picker·resizable·Recharts·sonner/vaul: 현 사용과 미사용 wrapper를 구분한다. 미사용 wrapper도 타입 검사 대상이므로 API 대응 또는 명확한 정리 판단을 한다.
5. Motion/Lucide, MiniSearch, tsx/Playwright/타입 정의와 나머지 직접 의존성: 모션·아이콘·검색 인덱스·생성기·테스트 실행 호환 확인.

## 7. 실행 증거와 완료 판정

현재 기준은 앞선 조사에서 test 30 passed/2 skipped, 타입 통과, lint 오류0/기존 경고14다. 이번 계획 작성에서 검사를 새로 실행한 결과는 아니다. DB opt-in 통합 검사와 production build는 기존 fixture 방법을 사용하고 업무 `.env`를 그대로 복사하지 않는다. [fixture 검증 방법](/Users/craigchoi/silla/is/doc/FEED_RECOVERY_VERIFICATION_2026-10-05.md:147).

로컬 실행에서는 기본 시험뿐 아니라 fixture DB opt-in 통합 시험도 실행한다. 기존 skip 2개를 DB 검증 통과로 계산하지 않는다. 깨끗한 설치 재현, 타입·lint·단위·fixture DB·개발 fixture 브라우저 회귀·production Workers smoke 결과를 각각 기록한다.

실행 후 최종 manifest/lock/runtime 버전, peer 판단, 보안 경고별 적용/해결, route 분류·생성 URL, 로컬 OpenNext build/Workers preview, 브라우저·성능 결과와 미검증 환경을 남긴다. 단계별 변경을 되돌릴 수 있도록 기록하고 외부 DB schema·데이터를 바꾸는 작업을 끼워 넣지 않는다.

**이번 구현의 완료 판정은 로컬 업그레이드·검증·배포 준비 완료다. 실제 Cloudflare 배포와 운영 검증은 별도 후속 작업이며, 이를 기다리지 않고 라이브러리 업그레이드를 끝까지 진행한다.** 로컬 preview를 실행하지 못했다면 그 원인과 남은 검증을 명시하며 문서 호환 확인만으로 통과 처리하지 않는다.

## 8. 사용자가 수작업 배포에서 확인할 항목

실행 작업이 끝날 때 실제 선택한 버전과 설정에 맞는 배포 명령·환경 변수 목록·바인딩·확인 URL·복구 순서를 인계한다. 현재 문서 작성은 해당 명령을 실행한 결과가 아니다.

1. Workers 계정/플랜·Worker 이름·호환 설정, 환경 변수와 secret, 필요한 리소스 바인딩을 채운다. 로컬 모의 바인딩을 운영 값으로 바꾸고 필요 리소스를 구성한다.
2. 기존 생성 JSON을 포함한 OpenNext 산출물을 수작업으로 배포하고 Worker URL에서 홈·카테고리·키워드·상세·404·정적 리소스를 확인한다. 서버 DB 경로가 존재하면 실제 연결도 확인한다.
3. **`/data/posts/v1/{id}.json` 경로를 실제 R2 상세 JSON에 연결한다.** 현재 상세 JSON은 앱 public 자산과 별도 R2 업로드다. Workers URL과 운영 도메인에서 같은 origin의 상세 fetch·직접 URL·상세 모달이 모두 성공하는지 확인한다.
4. 기존 도메인·trailing slash·Clerk 허용 origin/리디렉션·목록/manifest/R2 응답 헤더·콘텐츠 생성 후 갱신을 확인한다. 로컬 fixture 결과와 별도로 기록한다.
5. 로그의 runtime 오류, 계정별 크기/CPU 제한, 필요한 서버 기능을 확인한 후 도메인을 전환한다. 이전 Pages 배포와 데이터 경로를 유지해 복구할 수 있는 절차를 남긴다.
