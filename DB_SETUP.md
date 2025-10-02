# 데이터베이스 설정 가이드

프로젝트는 **환경에 따라 자동으로 다른 DB를 사용**하도록 구성되어 있습니다.

## 동작 방식

`lib/db.ts`는 환경 변수를 확인하여 자동으로 적절한 DB 드라이버를 선택합니다:

- **`DATABASE_URL`이 설정되어 있으면** → Neon 사용 (Edge Runtime 지원)
- **`DATABASE_URL`이 없으면** → 로컬 PostgreSQL 사용 (node-postgres)

## 로컬 개발 (현재 방식)

### 환경 변수 (`.env`)
```bash
# 로컬 PostgreSQL 설정
POSTGRES_HOST=192.168.50.124
POSTGRES_PORT=5432
POSTGRES_USER=silla
POSTGRES_PASSWORD=!kD5j/6:Fhxp6!
POSTGRES_DB=pis

# DATABASE_URL을 설정하지 않으면 자동으로 로컬 DB 사용
# DATABASE_URL=  # 주석 처리 또는 삭제
```

### 실행
```bash
pnpm dev
# 또는
pnpm build  # 로컬 DB에서 데이터를 읽어 정적 생성
```

**모든 페이지가 로컬 PostgreSQL을 사용합니다.**

## Neon 사용 (프로덕션)

### 환경 변수 (`.env` 또는 `.env.production`)
```bash
# Neon PostgreSQL 설정
DATABASE_URL=postgresql://username:password@ep-xxx.neon.tech/dbname

# 로컬 DB 설정은 무시됨 (있어도 상관없음)
POSTGRES_HOST=192.168.50.124  # 사용 안 됨
POSTGRES_PORT=5432            # 사용 안 됨
# ...
```

### 실행
```bash
pnpm dev
# 또는
pnpm build  # Neon DB에서 데이터를 읽어 정적 생성
```

**모든 페이지가 Neon PostgreSQL을 사용합니다.**

## 하이브리드 사용 (고급)

개발은 로컬 DB, 프로덕션은 Neon DB를 사용:

### `.env.local` (로컬 개발용 - Git에 포함 안 됨)
```bash
# 로컬 DB 사용
POSTGRES_HOST=192.168.50.124
POSTGRES_PORT=5432
POSTGRES_USER=silla
POSTGRES_PASSWORD=!kD5j/6:Fhxp6!
POSTGRES_DB=pis

# DATABASE_URL 없음
```

### `.env.production` (프로덕션 빌드용)
```bash
# Neon 사용
DATABASE_URL=postgresql://username:password@ep-xxx.neon.tech/dbname
```

### Cloudflare Pages 환경 변수
```
DATABASE_URL=postgresql://username:password@ep-xxx.neon.tech/dbname
```

## /posts/[id] 동적 렌더링 (Edge Runtime)

Edge Runtime에서 `/posts/[id]`를 동적으로 렌더링하려면:

### 1. Neon 필수
Edge Runtime은 `node-postgres`를 지원하지 않으므로 **반드시 Neon 사용**

### 2. `app/(feed)/posts/[id]/page.tsx` 수정
```typescript
// 현재: 정적 생성
export const dynamic = 'force-static';
export const dynamicParams = false;
export const revalidate = false;

export async function generateStaticParams() {
  const ids = await getAllPostIds();
  const recentIds = ids.slice(0, 100);
  return recentIds.map((id) => ({ id }));
}

// 변경: Edge Runtime 동적 렌더링
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// generateStaticParams 제거
```

### 3. 환경 변수 확인
```bash
# DATABASE_URL이 설정되어 있어야 함
DATABASE_URL=postgresql://username:password@ep-xxx.neon.tech/dbname
```

## 빌드 시 사용되는 DB 확인

빌드 로그에서 확인 가능:

```bash
pnpm build

# Neon 사용 시
# [드리즐 로그] SELECT ... (HTTP 요청)

# 로컬 DB 사용 시  
# [드리즐 로그] SELECT ... (PostgreSQL connection pool)
```

## 트러블슈팅

### "Pool is not defined" 에러
- Neon을 사용하려 했지만 `DATABASE_URL`이 설정되지 않음
- `.env`에 `DATABASE_URL` 추가

### "neon is not a function" 에러
- `@neondatabase/serverless` 패키지 설치 필요
```bash
pnpm add @neondatabase/serverless
```

### Edge Runtime에서 "Cannot find module 'pg'" 에러
- Edge Runtime에서 로컬 DB 사용 시도
- `DATABASE_URL`을 설정하여 Neon 사용

### 로컬 DB를 사용하고 싶은데 Neon이 사용됨
- `.env`에서 `DATABASE_URL` 제거 또는 주석 처리

## 요약

| 상황 | 설정 | 사용되는 DB |
|------|------|------------|
| **로컬 개발** | `DATABASE_URL` 없음 | 로컬 PostgreSQL |
| **프로덕션 빌드** | `DATABASE_URL` 설정 | Neon |
| **Edge Runtime** | `DATABASE_URL` 필수 | Neon (강제) |
| **정적 빌드** | 둘 다 가능 | 설정에 따라 |

**코드 변경 없이** 환경 변수만으로 DB를 전환할 수 있습니다!
