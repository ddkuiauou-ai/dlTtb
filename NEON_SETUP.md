# Neon PostgreSQL 설정 가이드 (권장)

Neon은 서버리스 PostgreSQL로, Edge Runtime을 완벽 지원하며 **기존 Drizzle ORM 코드를 거의 그대로 사용 가능**합니다.

## 왜 Neon인가?

### PostgREST vs Neon 비교

| 항목 | PostgREST + Tunnel | Neon |
|------|-------------------|------|
| **기존 코드 재사용** | ❌ 전체 재작성 필요 | ✅ `db.ts` 3줄만 변경 |
| **Drizzle ORM** | ❌ 사용 불가 | ✅ 그대로 사용 |
| **쿼리 코드 변경** | ❌ REST API로 재작성 | ✅ 변경 없음 |
| **Edge Runtime** | ✅ 지원 | ✅ 지원 |
| **설정 복잡도** | 🔴 복잡 (PostgREST + Tunnel 설정) | 🟢 간단 (환경변수 1개) |
| **인프라 관리** | 🔴 로컬 서버 + Tunnel 유지 필요 | 🟢 완전 관리형 |
| **비용** | 무료 (로컬 DB) | 무료 티어 (512MB, 충분) |
| **성능** | ⚠️ 로컬 네트워크 속도 의존 | 🟢 글로벌 CDN |
| **보안** | ⚠️ DB를 인터넷 노출 | 🟢 안전 (TLS + 자동 암호화) |

## 1. Neon 가입 및 프로젝트 생성

### 1.1 Neon 계정 생성
1. https://neon.tech 접속
2. GitHub 계정으로 로그인
3. 무료 티어 선택

### 1.2 프로젝트 생성
1. "Create a project" 클릭
2. **Region**: Singapore (한국과 가까움)
3. **PostgreSQL Version**: 15 이상
4. 프로젝트 생성 후 **Connection String** 복사

```
postgresql://username:password@ep-xxx-xxx.ap-southeast-1.aws.neon.tech/neondb
```

## 2. 로컬 DB 데이터 마이그레이션

### 2.1 로컬 DB 백업
```bash
pg_dump -h 192.168.50.124 -U silla -d pis > backup.sql
```

### 2.2 Neon으로 복원
```bash
# Neon DB URL을 환경변수로 설정
export NEON_URL="postgresql://username:password@ep-xxx.neon.tech/neondb"

# 데이터 복원
psql $NEON_URL < backup.sql
```

### 2.3 스키마만 복사 (데이터 제외)
```bash
# 스키마만 백업
pg_dump -h 192.168.50.124 -U silla -d pis --schema-only > schema.sql

# Neon에 스키마 적용
psql $NEON_URL < schema.sql
```

## 3. 프로젝트 설정

### 3.1 패키지 설치
```bash
pnpm add @neondatabase/serverless
```

### 3.2 `lib/db.ts` 수정

**변경 전:**
```typescript
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

export const db = process.env.NODE_ENV !== "production"
  ? drizzle(pool, { logger: true })
  : drizzle(pool);
```

**변경 후:**
```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

// Neon DB URL (Edge Runtime 지원)
const sql = neon(process.env.DATABASE_URL!);

export const db = process.env.NODE_ENV !== "production"
  ? drizzle(sql, { logger: true })
  : drizzle(sql);
```

**그게 끝입니다!** 🎉

### 3.3 환경 변수 설정

**로컬 개발 (`.env`):**
```bash
# Neon DB URL
DATABASE_URL=postgresql://username:password@ep-xxx.neon.tech/neondb

# 기존 변수들은 필요 없음 (제거 가능)
# POSTGRES_HOST=...
# POSTGRES_PORT=...
# POSTGRES_USER=...
# POSTGRES_PASSWORD=...
# POSTGRES_DB=...
```

**Cloudflare Pages (환경 변수):**
- Dashboard → Settings → Environment variables
- `DATABASE_URL` 추가

## 4. 기존 쿼리 코드 확인

### ✅ 변경 불필요 - 모두 그대로 동작!

```typescript
// lib/queries.ts - 전혀 수정 안 해도 됨!
export async function getPostDetail(id: string) {
  const [row] = await db
    .select({
      id: posts.id,
      postId: posts.postId,
      site: posts.site,
      // ... 모든 필드
    })
    .from(posts)
    .leftJoin(sites, and(eq(posts.site, sites.id), eq(posts.board, sites.board)))
    .leftJoin(postEnrichment, eq(postEnrichment.postId, posts.id))
    .where(eq(posts.id, id))
    .limit(1);
  
  // ... 모든 로직 그대로
}

export async function getPostsByCategory(category: string, options: any) {
  // 전혀 수정 불필요
}

export async function getTopKeywords(limit: number) {
  // 전혀 수정 불필요
}
```

**모든 Drizzle 쿼리가 그대로 동작합니다!**

## 5. 동작 확인

### 5.1 로컬 테스트
```bash
pnpm dev
```

### 5.2 빌드 테스트
```bash
pnpm build
```

### 5.3 Edge Runtime 테스트
`/posts/[id]` 페이지 접속 확인

## 6. Neon 무료 티어 제한

| 항목 | 무료 티어 |
|------|----------|
| **스토리지** | 512 MB |
| **동시 연결** | 무제한 (Edge) |
| **쿼리 시간** | 무제한 |
| **프로젝트** | 1개 |
| **브랜치** | 10개 |

### 스토리지 확인
```sql
SELECT pg_size_pretty(pg_database_size('neondb'));
```

## 7. 개발/프로덕션 환경 분리 (선택)

### Neon Branch 활용
```bash
# Neon CLI 설치
npm install -g neonctl

# 로그인
neonctl auth

# Development 브랜치 생성
neonctl branches create --project-id your-project-id --name dev

# 각 브랜치마다 별도 CONNECTION_STRING 생성
```

**환경별 설정:**
```bash
# .env.local (로컬 개발)
DATABASE_URL=postgresql://...@ep-dev-xxx.neon.tech/neondb

# Cloudflare Pages (프로덕션)
DATABASE_URL=postgresql://...@ep-main-xxx.neon.tech/neondb
```

## 8. 성능 최적화

### 8.1 Connection Pooling (기본 활성화)
Neon은 자동으로 connection pooling 처리 - 추가 설정 불필요

### 8.2 Query Caching
```typescript
// Edge에서 캐싱 활용
export const revalidate = 60; // 60초마다 재검증
```

### 8.3 Read Replicas (유료 플랜)
글로벌 성능 향상 위해 여러 리전에 replica 배포 가능

## 9. 모니터링

### Neon Dashboard
- https://console.neon.tech
- **Usage** 탭에서 스토리지/쿼리 모니터링
- **Monitoring** 탭에서 실시간 쿼리 확인

### Query 로그
```typescript
// lib/db.ts에서 logger 활성화
export const db = drizzle(sql, { logger: true });
```

## 10. 트러블슈팅

### 연결 오류
```bash
# DATABASE_URL 확인
echo $DATABASE_URL

# psql로 직접 연결 테스트
psql $DATABASE_URL
```

### Edge Runtime 오류
```typescript
// neon-http 사용 확인 (node-postgres 아님!)
import { drizzle } from 'drizzle-orm/neon-http'; // ✅
import { drizzle } from 'drizzle-orm/node-postgres'; // ❌
```

### 스토리지 부족
```sql
-- 테이블별 크기 확인
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 오래된 데이터 정리
DELETE FROM posts WHERE timestamp < NOW() - INTERVAL '1 year';
```

## 11. 마이그레이션 체크리스트

- [ ] Neon 프로젝트 생성
- [ ] 로컬 DB 백업
- [ ] Neon으로 데이터 마이그레이션
- [ ] `@neondatabase/serverless` 설치
- [ ] `lib/db.ts` 수정 (3줄)
- [ ] `.env` 파일 `DATABASE_URL` 설정
- [ ] 로컬 테스트 (`pnpm dev`)
- [ ] 빌드 테스트 (`pnpm build`)
- [ ] Cloudflare Pages 환경 변수 설정
- [ ] 배포 및 동작 확인
- [ ] 기존 PostgREST 코드 제거 (필요 시)

## 12. 비용 (참고)

| 플랜 | 가격 | 스토리지 | 컴퓨트 |
|------|------|----------|--------|
| **Free** | $0/월 | 512 MB | 무제한 |
| **Launch** | $19/월 | 10 GB | Always-on |
| **Scale** | $69/월 | 50 GB | Autoscaling |

**대부분의 경우 Free 티어로 충분합니다.**

## 요약

**PostgREST 방식:**
- ❌ 모든 쿼리를 REST API로 재작성
- ❌ Drizzle ORM 사용 불가
- ❌ 복잡한 인프라 설정

**Neon 방식:**
- ✅ `lib/db.ts` 3줄만 수정
- ✅ 모든 쿼리 코드 그대로 사용
- ✅ 환경 변수 1개만 설정

**Neon을 강력히 권장합니다!**
