import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

// 환경 변수 로드 (.env.local에 정의)
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

// Drizzle ORM 인스턴스 (dev 환경에서만 logger 활성화)
export const db = process.env.NODE_ENV !== "production"
  ? drizzle(pool, { logger: true })
  : drizzle(pool);