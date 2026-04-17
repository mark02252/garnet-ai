# Garnet 맥북 마이그레이션 가이드

> 맥북 → 맥북 마이그레이션 후 Garnet을 정상 가동시키기 위한 체크리스트

---

## 전제 조건

- macOS 마이그레이션 어시스턴트로 데이터 전체 이전 완료
- 프로젝트 경로: `/Users/rnr/Documents/New project/`

---

## 마이그레이션 후 순서

### Step 1: 기본 환경 확인 (5분)

```bash
# Node.js 확인
node --version  # v22+ 필요

# npm 확인
npm --version

# 프로젝트 확인
cd "/Users/rnr/Documents/New project"
ls package.json  # 있으면 OK
```

문제 시: `brew install node@22`

---

### Step 2: PM2 확인 및 Garnet 시작 (3분)

```bash
# PM2 설치 확인
pm2 --version

# 이전 상태 복원 시도
pm2 resurrect

# 안 되면 새로 등록
pm2 start npm --name garnet --cron-restart="0 */6 * * *" -- run dev:next
pm2 save
pm2 startup  # 부팅 시 자동 시작 (sudo 명령 실행 필요)
```

---

### Step 3: 서버 동작 확인 (2분)

```bash
# Garnet 응답 확인
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/

# 302 나오면 정상

# Agent Loop 상태 확인
curl -s http://localhost:3000/api/agent-loop/status | python3 -m json.tool | head -10
```

---

### Step 4: Ollama 확인 (2분)

```bash
# Ollama 서비스 확인
brew services list | grep ollama

# 안 돌고 있으면
brew services start ollama

# 모델 확인
curl -s http://localhost:11434/api/tags | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
for m in d.get('models', []):
    print(m['name'])
"
# nomic-embed-text:latest 있어야 함

# 없으면
ollama pull nomic-embed-text
```

---

### Step 5: 환경변수 확인 (1분)

```bash
cd "/Users/rnr/Documents/New project"

# .env 존재 확인
ls -la .env

# 핵심 변수 확인 (값은 안 보여줌)
grep -c "GA4_PROPERTY_ID\|GA4_CLIENT_EMAIL\|SLACK_WEBHOOK_URL\|GTM_ACCOUNT_ID\|TELEGRAM" .env
# 5 이상이면 OK
```

---

### Step 6: DB 확인 (2분)

```bash
cd "/Users/rnr/Documents/New project"

# DB 파일 존재 확인 (PostgreSQL URL이면 원격이라 파일 없을 수 있음)
grep "DATABASE_URL" .env | head -1

# DB 연결 테스트
npx prisma db push --accept-data-loss 2>&1 | tail -3
# "Your database is now in sync" 나오면 OK

# 데이터 확인
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
Promise.all([
  p.agentLoopCycle.count(),
  p.knowledgeEntry.count(),
  p.episodicMemory.count(),
]).then(([cycles, knowledge, episodes]) => {
  console.log('사이클:', cycles, '| 지식:', knowledge, '| 에피소드:', episodes);
  p.\$disconnect();
});
"
# 사이클 500+, 지식 300+, 에피소드 800+ 이면 정상
```

---

### Step 7: Agent Loop 테스트 (3분)

```bash
# 수동 사이클 트리거
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"action":"trigger","cycleType":"routine-cycle"}' \
  http://localhost:3000/api/agent-loop/control | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
if d.get('ok'):
    print('✅ Agent Loop 정상')
    print('소요:', round(d['result']['durationMs']/1000), '초')
else:
    print('❌ 실패:', d)
"
```

---

### Step 8: Slack 브리핑 테스트 (5분)

```bash
# 데일리 브리핑 수동 발송
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"action":"trigger","cycleType":"daily-briefing"}' \
  http://localhost:3000/api/agent-loop/control | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
if d.get('ok'):
    print('✅ 브리핑 발송 완료')
else:
    print('❌ 실패:', d)
"
# Slack에서 브리핑 메시지 도착 확인
```

---

### Step 9: GTM/GA4 연결 확인 (2분)

```bash
cd "/Users/rnr/Documents/New project"

# GTM 연결
npx tsx scripts/gtm-test.ts

# GA4 이벤트 확인
npx tsx scripts/ga4-realtime-events.ts
```

---

### Step 10: 대시보드 확인 (1분)

브라우저에서:
- http://localhost:3000/operations — 메인 브리핑
- http://localhost:3000/self-improve — 자기 개선 (5인 전문가)
- http://localhost:3000/analytics — GA4 분석

---

## 문제 해결

### PM2가 안 됨
```bash
npm install -g pm2
pm2 start npm --name garnet --cron-restart="0 */6 * * *" -- run dev:next
```

### node_modules 깨짐
```bash
rm -rf node_modules
npm install
```

### Prisma Client 에러
```bash
npx prisma generate
npx prisma db push
```

### Ollama 모델 없음
```bash
brew install ollama
brew services start ollama
ollama pull nomic-embed-text
```

### 포트 3000 충돌
```bash
lsof -ti:3000 | xargs kill
pm2 restart garnet
```

---

## 핵심 파일 위치

| 파일 | 용도 |
|------|------|
| `.env` | API 키, 토큰, DB URL |
| `.garnet-config/` | 에이전트 설정, 지식, 보정 데이터 |
| `prisma/dev.db` 또는 `DATABASE_URL` | DB (사이클, 지식, 에피소드) |
| `lib/agent-loop/` | Agent Loop 41개 모듈 |
| `lib/agent-loop/sub-reasoners/` | 5인 전문가 |
| `scripts/` | GTM/GA4 자동화 스크립트 23개 |
| `docs/linkedin/` | LinkedIn 콘텐츠 (git 미포함) |
| `lib/theater-mapping.ts` | 지점 코드↔이름 매핑 |

---

## 현재 Garnet 스펙 (마이그레이션 시점)

- Agent Loop: Phase 1~6 구현
- Sub-Reasoners: 5명 (분석/콘텐츠/전략/CRO/심리학)
- Knowledge Store: 338건 (25개 도메인)
- Episodic Memory: 826건 (임베딩 완료)
- 사이클: 566+회
- GTM-as-Code: Version 18
- GA4 Admin API: Custom Dim 9개, Key Event 6개
- PM2 자동 재시작: 6시간 간격
- Slack 브리핑: 매출/퍼널/지점별/목표

---

## 완료 확인 체크리스트

- [ ] Node.js v22+ 확인
- [ ] PM2 garnet online
- [ ] http://localhost:3000 응답 302
- [ ] Ollama nomic-embed-text 로드
- [ ] .env 환경변수 정상
- [ ] DB 데이터 정상 (사이클/지식/에피소드)
- [ ] Agent Loop routine-cycle 정상 실행
- [ ] Slack 브리핑 정상 수신
- [ ] GTM API 연결 정상
- [ ] GA4 실시간 이벤트 정상
- [ ] /operations, /self-improve, /analytics 정상 표시
