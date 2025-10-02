# PostgREST + Cloudflare Tunnel 설정 가이드

이 가이드는 로컬 PostgreSQL을 PostgREST로 HTTP API화하고, Cloudflare Tunnel로 인터넷에 노출하여 Cloudflare Pages에서 접근하는 방법을 설명합니다.

## 1. PostgREST 설치

### macOS (Homebrew)
```bash
brew install postgrest
```

### Linux
```bash
# Ubuntu/Debian
sudo apt-get install postgrest

# 또는 바이너리 다운로드
wget https://github.com/PostgREST/postgrest/releases/latest/download/postgrest-<version>-linux-x64-static.tar.xz
tar xf postgrest-<version>-linux-x64-static.tar.xz
```

### Docker (권장)
```bash
docker pull postgrest/postgrest
```

## 2. PostgREST 설정

프로젝트 루트에 `postgrest.conf` 파일 생성:

```conf
# PostgreSQL 연결 정보
db-uri = "postgres://silla:!kD5j/6:Fhxp6!@192.168.50.124:5432/pis"

# 노출할 스키마
db-schema = "public"

# 익명 역할 (인증 없이 접근 가능한 사용자)
db-anon-role = "silla"

# PostgREST 서버 포트
server-port = 3000

# CORS 설정 (Cloudflare Pages에서 접근 허용)
# server-cors-allowed-origins = "*"
```

## 3. PostgREST 실행

### 직접 실행
```bash
postgrest postgrest.conf
```

### Docker로 실행 (권장)
```bash
docker run --rm -p 3000:3000 \
  -e PGRST_DB_URI="postgres://silla:!kD5j/6:Fhxp6!@192.168.50.124:5432/pis" \
  -e PGRST_DB_SCHEMA="public" \
  -e PGRST_DB_ANON_ROLE="silla" \
  postgrest/postgrest
```

### 테스트
```bash
# 포스트 목록 조회
curl http://localhost:3000/posts?limit=5

# 특정 포스트 조회
curl http://localhost:3000/posts?id=eq.YOUR_POST_ID

# JOIN 쿼리 (관련 테이블 포함)
curl "http://localhost:3000/posts?id=eq.YOUR_POST_ID&select=*,post_images(url),post_comments(*)"
```

## 4. Cloudflare Tunnel 설정

### Cloudflare Tunnel 설치
```bash
# macOS
brew install cloudflare/cloudflare/cloudflared

# Linux
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared
```

### Quick Tunnel (테스트용)
```bash
cloudflared tunnel --url http://localhost:3000
```

출력 예시:
```
Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):
https://random-name-xyz.trycloudflare.com
```

이 URL을 복사하여 환경 변수로 설정합니다.

### Named Tunnel (프로덕션용 - 권장)

1. **Cloudflare 로그인**
```bash
cloudflared tunnel login
```

2. **Tunnel 생성**
```bash
cloudflared tunnel create postgrest-tunnel
```

3. **설정 파일 생성** (`~/.cloudflared/config.yml`):
```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /Users/YOUR_USER/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: postgrest.your-domain.com
    service: http://localhost:3000
  - service: http_status:404
```

4. **DNS 레코드 생성**
```bash
cloudflared tunnel route dns postgrest-tunnel postgrest.your-domain.com
```

5. **Tunnel 실행**
```bash
cloudflared tunnel run postgrest-tunnel
```

## 5. 환경 변수 설정

### 로컬 개발 (`.env.local`)
```bash
NEXT_PUBLIC_POSTGREST_URL=http://localhost:3000
```

### Cloudflare Pages (환경 변수)
Cloudflare Pages 대시보드에서 설정:

```
NEXT_PUBLIC_POSTGREST_URL=https://random-name-xyz.trycloudflare.com
# 또는 Named Tunnel 사용 시
NEXT_PUBLIC_POSTGREST_URL=https://postgrest.your-domain.com
```

## 6. 보안 고려사항

### ⚠️ 주의사항
- PostgREST는 기본적으로 **인증 없이** 모든 데이터 접근 가능
- 민감한 데이터가 있다면 반드시 인증 설정 필요

### JWT 인증 추가 (선택)

1. **PostgreSQL 역할 생성**
```sql
CREATE ROLE web_anon NOLOGIN;
CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'your-secret';
GRANT web_anon TO authenticator;
```

2. **PostgREST 설정 업데이트**
```conf
db-uri = "postgres://authenticator:your-secret@192.168.50.124:5432/pis"
db-anon-role = "web_anon"
jwt-secret = "your-jwt-secret-key"
```

3. **Row Level Security (RLS) 설정**
```sql
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_posts ON posts FOR SELECT USING (true);
```

### IP 화이트리스트
Cloudflare Access를 사용하여 특정 IP에서만 접근 허용

## 7. 프로덕션 배포

### systemd 서비스 (Linux)

`/etc/systemd/system/postgrest.service`:
```ini
[Unit]
Description=PostgREST REST API
After=postgresql.service

[Service]
ExecStart=/usr/local/bin/postgrest /path/to/postgrest.conf
User=postgres
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable postgrest
sudo systemctl start postgrest
```

### Cloudflare Tunnel systemd 서비스

`/etc/systemd/system/cloudflared.service`:
```ini
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
ExecStart=/usr/local/bin/cloudflared tunnel run postgrest-tunnel
Restart=always
User=your-user

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

## 8. 모니터링

### PostgREST 상태 확인
```bash
curl http://localhost:3000/
```

### Cloudflare Tunnel 상태 확인
```bash
cloudflared tunnel info postgrest-tunnel
```

## 9. 트러블슈팅

### PostgREST 연결 실패
```bash
# PostgreSQL 연결 테스트
psql -h 192.168.50.124 -U silla -d pis -c "SELECT 1"

# PostgREST 로그 확인
postgrest postgrest.conf --verbose
```

### CORS 오류
`postgrest.conf`에 추가:
```conf
server-cors-allowed-origins = "*"
```

### Cloudflare Tunnel 연결 끊김
Named Tunnel 사용 + systemd로 자동 재시작 설정

## 10. 대안 (더 간단한 방법)

### Neon PostgreSQL (권장)
- 무료 티어 제공
- Edge Runtime 네이티브 지원
- PostgREST/Tunnel 불필요

```bash
npm install @neondatabase/serverless
```

### Supabase
- PostgreSQL + REST API + Auth 통합
- 무료 티어 제공
