# 라이브러리 업데이트와 문서 현행화 인수인계

기준일: **2026-10-04, Asia/Seoul**. 프로젝트 방향은 [README](../README.md), 세부 구현은 [웹 현황](WEB_IMPLEMENTATION.md)과 [데이터 파이프라인](DATA_PIPELINE.md), 기존 문서 차이는 [문서 싱크 차이](DOCUMENTATION_DRIFT.md)를 참고한다.

## 1. 이번 문서와 다음 작업의 경계

사용자는 이 문서를 바탕으로 **별도 채팅에서 최신 라이브러리로 업데이트하고, 그 뒤 문서 싱크를 현행화**할 예정이다. 이번 작업은 조사 결과와 인수인계 문서 작성이며, 의존성·잠금 파일·앱 코드·DB·배포는 변경하지 않았다.

아래 버전은 현재 파일에서 확인한 기준점이다. 최신 버전, 보안 패치 여부, 지원 종료 여부, 업그레이드 호환성은 조회하지 않았다. 후속 작업 시 공식 문서·릴리스 노트·패키지 메타데이터를 확인해 목표 버전을 새로 정한다.

## 2. 현재 환경·의존성 기준

[package.json](../package.json)의 선언 범위와 [pnpm-lock.yaml](../pnpm-lock.yaml)의 루트 importer 해석 버전을 구분했다. 잠금 파일 버전은 로컬 설치 상태나 운영 배포 버전을 확인한 값이 아니다. 피어 의존성 접미사는 표에서 생략했다.

| 패키지 | 선언 범위 | 잠금 파일 버전 |
|---|---|---|
| `next` | `15.5.4` | `15.5.4` |
| `react`, `react-dom` | `^19.1.1` | `19.1.1` |
| `typescript` | `^5.9.2` | `5.9.2` |
| `eslint` | `^9` | `9.35.0` |
| `eslint-config-next` | `15.5.4` | `15.5.4` |
| `@cloudflare/next-on-pages` | `^1.13.16` | `1.13.16` |
| `tailwindcss` | `^3.4.17` | `3.4.17` |
| `postcss` | `^8.5` | `8.5.6` |
| `autoprefixer` | `^10.4.20` | `10.4.21` |
| `@clerk/clerk-react` | `^5.47.0` | `5.47.0` |
| `drizzle-orm` | `^0.44.4` | `0.44.4` |
| `drizzle-kit` | `^0.31.4` | `0.31.4` |
| `pg` | `^8.16.1` | `8.16.1` |
| `minisearch` | `^7.1.2` | `7.1.2` |
| `motion` | `^12.23.12` | `12.23.12` |
| `@tanstack/react-virtual` | `^3.13.12` | `3.13.12` |
| `zod` | `^3.24.1` | `3.25.67` |
| `react-hook-form` | `^7.54.1` | `7.58.1` |
| `@hookform/resolvers` | `^3.9.1` | `3.10.0` |
| `react-day-picker` | `8.10.1` | `8.10.1` |
| `date-fns` | `4.1.0` | `4.1.0` |
| `recharts` | `2.15.0` | `2.15.0` |
| `radix-ui` | `^1.4.3` | `1.4.3` |
| `next-themes` | `^0.4.4` | `0.4.6` |
| `tsx` | `^4.20.3` | `4.20.3` |
| `@types/node` | `^24.5.2` | `24.5.2` |
| `@types/react` | `^19.1.15` | `19.1.15` |
| `@types/react-dom` | `^19` | `19.1.6` |

개별 `@radix-ui/react-*` 패키지에도 고정 버전이 있으므로 표의 `radix-ui` 하나만 업데이트하고 전체 UI 의존성을 갱신했다고 판단하지 않는다. 전체 의존성 목록은 manifest와 잠금 파일을 참고한다.

| 환경·설정 | 코드에서 확인한 상태 | 후속 확인 |
|---|---|---|
| CI | Node.js `20`, pnpm `9`, `--frozen-lockfile` | 목표 버전에 맞는 Node/pnpm과 실제 로컬 환경 확인 |
| pnpm 잠금 파일 | 형식 `9.0` | 패키지 매니저 변경과 잠금 파일 재생성을 함께 기록 |
| Node/pnpm 고정 | `package.json`에 `engines`·`packageManager` 없음 | 로컬·CI 버전과 고정 방침 확인 |
| ESLint | `.eslintrc.json`, `lint: next lint` | 목표 Next/ESLint의 설정·CLI 이전 필요 여부 확인 |
| Next.js | App Router, `output: "export"` 주석 처리 | Cloudflare 어댑터와 동적·사전 생성 경로의 동작 확인 |
| 스타일 | Tailwind 3, PostCSS, 자체 CSS, shadcn/Radix 로컬 컴포넌트 | 스타일 설정과 UI 컴포넌트를 함께 검증 |
| 인접 `dag` | Python `>=3.9,<3.13` 선언, 다수 Python 의존성의 manifest 버전 미고정 | 업데이트 범위에 포함할 경우 `requirements.lock.txt`와 실제 환경 별도 조사 |

환경 정보의 근거는 [CI](../.github/workflows/build-contents.yml), [Next 설정](../next.config.mjs), [ESLint 설정](../.eslintrc.json), [Python manifest](../../dag/pyproject.toml)다. 이 표는 최신 환경을 추천한 결과가 아니다.

## 3. 업데이트 전에 확인할 사항

### 3.1 범위와 기존 상태

1. 현재 Git status, 브랜치, HEAD, manifest·잠금 파일, 런타임을 다시 확인한다.
2. 기존 사용자 변경을 보존하고 새 변경과 섞어서 되돌리지 않는다. 조사 시작 시 `components/server-time.client.tsx`, `components/sidebar.tsx`, `lib/schema.ts`에 기존 변경이 있었다.
3. 우선 업데이트 대상은 `is`로 두고, `dag`의 Python/Crawlee·공통 DB·호스팅 방식 변경을 포함하는지는 작업 범위로 명시한다.
4. 업데이트 전 검사 결과를 남겨 기존 실패와 업데이트로 발생한 실패를 구분한다. 이번 조사에서는 테스트·타입 검사·빌드를 실행하지 않았다.

### 3.2 데이터와 외부 서비스 연결

- 웹과 데이터 생성 스크립트는 [lib/db.ts](../lib/db.ts)의 `POSTGRES_*` 설정을 사용한다. `.env` 내용이나 설정 가이드의 인증정보를 출력·복사하지 않는다.
- 홈 조회의 `getMainPagePosts` / `getClusterTopPosts`는 [lib/queries.ts](../lib/queries.ts)의 `recordClusterRotation` / `recordPostRotation`을 통해 DB의 노출 상태를 갱신한다. **페이지 조회·빌드 검증에도 DB 쓰기가 발생할 수 있다.** [build-main-json.ts](../scripts/build-main-json.ts)의 `computePage1Ids`도 이 함수를 호출한다.
- 빌드 검증에는 쓰기 영향을 파악한 검증용 DB 또는 적절한 fixture를 사용한다. 읽기 전용 DB로 바꾸는 것만으로 현재 빌드가 성공한다고 가정하지 않는다.
- Drizzle 의존성 업데이트만으로 공통 DB를 자동 변경하지 않는다. [lib/schema.ts](../lib/schema.ts), `dag`의 SQL, MV 수동 인덱스와 실제 DB를 비교한 뒤 필요한 migration을 설계한다.
- R2 상세 JSON과 같은 도메인의 `/data/posts/v1/` 경로를 연결하는 설정은 저장소만으로 확정되지 않는다. 실제 공개 URL·프록시·캐시 설정을 확인한다.

## 4. 업데이트 진행 순서 — 제안

최신 버전으로의 업데이트를 목표로 하되, 서로 영향을 주는 패키지를 묶어 변경·검증한다.

| 순서 | 변경 단위 | 판단·검증할 내용 |
|---|---|---|
| 1 | Node/pnpm, Next/React/타입 정의, Cloudflare 어댑터 | 지원 조합, 변경 사항, CI·생성물·동적 경로. 어댑터 이전이 필요하면 그 차이를 별도로 설명 |
| 2 | ESLint·설정·lint 명령, TypeScript | 새 설정 방식, 변경·삭제 CLI, 타입 오류. 기존 lint 명령을 그대로 성공 조건으로 두지 않음 |
| 3 | Tailwind/PostCSS, Radix/shadcn 주변, motion, 가상 스크롤 | CSS, 포털·모달, 크기 계산, 터치·키보드, 테마 |
| 4 | Clerk, 폼·검증, 날짜·차트 등 | 로그인 동선, API·prop·타입 변경, 환경변수 |
| 5 | Drizzle/pg, MiniSearch, tsx와 나머지 의존성 | 쿼리 반환값, MV/bytea/JSON 타입, 생성 JSON·검색 인덱스 호환성 |
| 6 | 전체 의존성과 잠금 파일·CI 재현성 | 누락된 업데이트, 피어 의존성 불일치, 깨끗한 환경에서 재현 |
| 7 | 구현 확정 후 기존 문서 현행화 | [싱크 차이 목록](DOCUMENTATION_DRIFT.md)을 코드·검증 결과로 갱신 |

이번 조사에서 발견한 기능 부족이나 정적 의심 사항을 라이브러리 업데이트로 해결됐다고 간주하지 않는다. 업데이트 필수 대응과 기존 기능 수정은 구분해서 기록한다.

## 5. 검증 명령과 검증 범위

아래는 현재 `package.json` 기준의 후보이며 이번에 실행한 결과가 아니다. 목표 버전에서 CLI가 달라졌다면 새 명령으로 교체한다.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

`pnpm test` 설정은 `tsx --test`다. [현재 확인한 웹 테스트](../lib/__tests__/ranked-query.test.ts)는 랭킹 SQL의 소스 문자열을 검사하며, 실제 DB 결과나 화면·배포·성능을 보장하지 않는다. 타입 검사는 `tsconfig.tsbuildinfo`를 생성할 수 있다.

접속 대상과 쓰기 영향을 확인한 다음, 필요한 데이터 생성·웹 빌드·Cloudflare 어댑터 검증을 수행한다.

```bash
pnpm build:data
pnpm build
pnpm exec next-on-pages
```

위 세 명령을 실행하는 것만으로 CI와 같아지는 것은 아니다. `build:data`는 CI의 카테고리·기간·all-posts 생성 범위와 일치하지 않으며, CI의 최종 빌드는 `next-on-pages`를 사용한다. [build-parallel.sh](../build-parallel.sh)도 홈에서 사용하지 않는 조합을 실행하고 macOS `sysctl`에 의존한다. 필요한 생성 범위와 실행 환경을 먼저 정리한다.

`dag`도 업데이트한다면 별도 저장소의 [AGENTS.md](../../dag/AGENTS.md)와 기존 테스트를 읽는다. `dag_tests`의 클러스터 테스트는 일부 회귀 확인이며 실제 크롤링·AI 분석·운영 전체를 보장하지 않는다.

## 6. 대표적인 사용자 시나리오 검증

| 영역 | 검증할 동선·데이터 |
|---|---|
| 홈 | 각 섹션 조회, 사이트별 제한, 클러스터 중복 제어, 최신 피드 후속 페이지 |
| 로그인 | Clerk 초기화, SignedOut 원문 이동, SignedIn 내부 리더, 로그아웃 후 동작 |
| 리더 | 본문 HTML, 이미지/YouTube/X/MP4, 좌우 이동, 닫기, 키보드·모바일 조작 |
| 피드 | 카테고리·기간·커뮤니티 필터, 리스트/그리드, 무한 스크롤, 캐시 갱신 |
| 검색·키워드 | 인덱스 로딩, 검색 결과→상세, 상위/대상 외 키워드, 기간별 JSON |
| 읽은 글 | 읽음 기록, 최근 읽은 글, 새로고침·만료, 여러 피드 간 일관성 |
| 공유·직접 접근 | `/posts/:id` 생성 대상/대상 외, 새로고침, 모달 경유와 차이 |
| 배포 | HTML·JSON 생성 범위, manifest, Pages/R2, 공개 URL, 캐시와 갱신 시각 |

댓글 작성·추천·북마크는 현재 서버 영속화를 확인하지 못했으므로, 업데이트만으로 저장 기능이 생긴다는 검증 조건을 두지 않는다. 상세는 [웹 구현 현황](WEB_IMPLEMENTATION.md)을 참고한다.

## 7. 완료 시 남길 기록

- 채택한 버전, 공식 호환성·이전 근거, manifest/잠금 파일/Node/pnpm/CI 최종 상태.
- 실행한 검사와 결과, 검증 DB·fixture 구분, 실행하지 못한 검사와 이유.
- 기존 문제, 업데이트 과정에서 해결한 호환 문제, 남은 기능 개선의 구분.
- 최종 배포 방식, JSON 갱신 경로·생성 범위, 외부 설정 의존 부분.
- 새·기존 문서의 갱신·폐기·설계 이력 전환 여부와 기준일.

## 8. 별도 채팅에 전달할 요청문

```text
이 Isshoo 프로젝트의 README.md와 doc/UPGRADE_HANDOFF.md를 먼저 읽고,
doc/WEB_IMPLEMENTATION.md, doc/DATA_PIPELINE.md, doc/DOCUMENTATION_DRIFT.md도 참고해 주세요.
2026-10-04 문서는 조사 당시 기준점이므로 현재 작업 트리·의존성·운영을 다시 확인해 주세요.
우선 이 웹 저장소의 라이브러리를 최신 버전으로 업데이트하고 필요한 호환 대응과 검증을 진행한 뒤,
기존 문서의 싱크를 현행화해 주세요.
기존 사용자 변경을 보존하고, 웹과 인접 dag 저장소가 같은 DB 데이터에 의존하는 점과
홈 조회·빌드에 DB 노출 상태 갱신이 있는 점을 고려해 주세요.
dag·공통 DB·호스팅 변경이 필요하다면 필요성과 작업 범위를 명확히 해 주세요.
미구현 기업용 기능은 구현된 것으로 취급하지 말고 이번 업데이트와 구분해서 기록해 주세요.
```
