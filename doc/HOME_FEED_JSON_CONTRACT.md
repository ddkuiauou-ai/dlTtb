# 홈 최신 피드의 SSR·후속 JSON 계약

`seedPolicy: "live-seed-dedupe"`인 홈 manifest는 다음 계약을 사용한다.

- 첫 목록은 요청 시 조회한 live SSR 결과다. 상단 섹션의 샘플과 순차 중복 제외를 반영하므로 JSON 생성 시 같은 seed를 추측하지 않는다.
- JSON은 추정 seed를 제외하지 않은 최신 후보를 page 2부터 `MAX_PAGES` 한도까지 담는다. 실제 첫 목록 ID와 실제 상단 섹션의 제외 ID는 클라이언트가 제거한다. 처음 몇 JSON 페이지가 전부 중복이어도 다음 페이지에 새 글이 있을 수 있다.
- SSR 첫 목록과 후속 JSON이 완전히 같은 DB snapshot이라는 보장은 없다. `generatedAt`은 준비·공개한 JSON 세대를 식별하며 각 후속 페이지와 manifest가 일치해야 한다.
- 클라이언트가 후속 세대를 선택한 뒤에는 그 세대만 이어 붙인다. 다른 세대를 발견하면 기존 목록을 유지하고 추가 로딩을 멈추며 갱신을 안내한다.
- 같은 섹션의 live seed는 후속 세대를 선택하기 전 갱신할 수 있다. 후속 세대 선택 후 다른 seed ID가 도착하면 이전 추가 페이지와 자동으로 섞지 않는다.
- 기존 legacy manifest에는 이 정책을 소급해 주장하지 않는다. 이 정책을 명시한 새 manifest의 페이지는 `generatedAt`을 생략할 수 없다.

`lastPage`는 SSR의 논리적 page 1을 포함한다. `pages`는 JSON 파일 개수로 `lastPage - 1`이다. `hasMore`는 SSR 뒤의 JSON이 있는지 나타낸다. 따라서 정상 빈 결과는 `lastPage: 1`, `pages: 0`, `hasMore: false`이고 page 1 JSON은 만들지 않는다.

생성기는 별도 준비 디렉터리에 전체 페이지와 manifest를 만들고 파일 연속성·버전·ID·필수 필드를 검증한 뒤 공개 디렉터리를 교체한다. 생성 실패는 이전 공개 세대를 유지하며 짧아진 새 결과에서는 오래된 tail 파일을 제거한다. HTTP 요청 사이의 세대 전환은 클라이언트의 페이지 버전 검증으로 방어한다.

브라우저 페이지 캐시는 각 base·page의 세대와 원본 글 배열을 함께 저장한다. 같은 글 ID를 다른 base나 세대에서 캐시해도 이전 페이지 내용을 덮어쓰지 않는다. ID만 보관하던 구형 엔트리나 부분·순서 손상이 있는 엔트리는 cache miss로 보고 다시 요청한다. 정상 빈 배열은 cache hit이며 IndexedDB를 사용할 수 없어도 manifest의 네트워크 조회는 계속한다.

파일 검증은 DB 접근 없이 실행할 수 있다.

```sh
node --import tsx scripts/validate-main-json.ts [생성 디렉터리]
```

`build-main-json.ts`는 더 이상 홈 조회함수의 rotation 기록을 호출하지 않는다. 다만 실제 DB 조회와 파일 생성이 있으므로 통합 시험은 별도 fixture DB와 임시 작업 디렉터리에서 수행한다. 검증하지 않은 운영 JSON 재생성이나 운영 DB를 테스트 입력으로 사용하는 것을 이 계약의 단위시험에 포함하지 않는다.

전용 `*_fixture` DB가 준비되면 `HOME_FEED_FIXTURE_DATABASE`와 필요한 `HOME_FEED_FIXTURE_HOST/PORT/USER/PASSWORD`를 지정하고 아래 통합 시험을 실행한다. 이 시험은 UUID schema를 생성·정리하고 실제 생성기를 임시 디렉터리에서 실행한다. 생성기의 DB 연결에는 해당 schema와 읽기 전용 transaction 설정을 전달한다. DB 지정이 없으면 skip하며 통과로 세지 않는다.

```sh
node --import tsx --test scripts/utils/__tests__/home-feed-builder.integration.test.ts
```
