# Garnet (macOS Desktop)

Electron + Next.js 기반의 올인원 AI 마케팅 운영 앱입니다.
브리핑, 전략 실행, 승인, 학습 자산화, 데이터 분석을 하나의 워크스페이스에서 이어갈 수 있습니다.

현재 제품 상태와 최근 구조 개편 요약은 [/Users/rnr/Documents/New project/docs/PROJECT_CONTEXT.md](/Users/rnr/Documents/New%20project/docs/PROJECT_CONTEXT.md) 에 정리되어 있습니다.

## 핵심 기능
- AI 아바타 회의 실행: 웹 리서치 → 5역할 회의 → PM 결정 → 최종 산출물 → 메모리 로그
- 도메인 라우팅: 자동 추천 또는 수동 고정(마케팅/단가조달/운영확장/재무/범용)
- 멀티모달 첨부: CSV/XLSX/JSON/TXT/PDF/DOCX/이미지(OCR) 텍스트 추출 후 회의 컨텍스트 반영
- 이미지 OCR 큐: OCR 작업을 비동기 큐 + 재시도로 처리하여 대기/실패 상태를 안정적으로 관리
- 도메인 에이전트 풀 편집: 설정 화면에서 도메인별 specialist 프로필을 직접 커스터마이징
- 히스토리 검색: 키워드/태그/날짜 필터
- 실행 보고서 PDF 저장: 실행 상세에서 `PDF 보고서` 버튼으로 인쇄/저장
- 데이터 실험실: CSV/XLSX/JSON/TEXT 데이터셋 입력 및 저장
- AI 데이터 분석: 저장된 데이터셋에 대해 구조화된 마케팅 분석 생성
- 학습 아카이브: 과거 대화를 \"이럴 때 이렇게 답변\" 카드로 축적/검색/편집
- 학습 대시보드: 학습 카드 상태, 태그, 최근 업데이트 패턴 확인
- 올나잇 세미나 워룸: 24시간(설정 시간) 라운드 기반 자동 회의, 라운드 로그 누적, 아침 브리핑 자동 생성
- 인스타그램 도달 자동 에이전트: Meta API로 일별 도달 수집, 추세/이상치 분석, 실행 이력 저장
- SNS 인사이트 보드: 현재는 개발 예정 카테고리로 보류 중인 소셜 연동 실험 화면
- 현재 운영 저장: SQLite + Prisma, Supabase 협업 백엔드 스캐폴드 추가

## 기술 스택
- Electron + Next.js (App Router, TypeScript)
- TailwindCSS
- Prisma + SQLite
- Supabase local scaffold (Auth / Postgres / Storage / Realtime 준비)
- OpenAI / Gemini / Groq / Local(OpenAI 호환) / OpenClaw
- MCP SDK (`@modelcontextprotocol/sdk`) for local tool/resource/prompt exposure
- Serper.dev 검색 API
- electron-builder (.dmg)

## 환경 변수
`.env` 파일 예시:

```env
DATABASE_URL="file:./dev.db"
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_PROJECT_REF=
SUPABASE_ACCESS_TOKEN=

LLM_PROVIDER=openai
LLM_RUN_PROFILE=manual
LLM_FALLBACK_ORDER=gemini,groq,openai,local,openclaw
FREE_MODE_PROVIDER_ORDER=openclaw,groq,gemini,local
FREE_MODE_ALLOW_PAID_FALLBACK=false
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_ADMIN_KEY=
OPENAI_MONTHLY_BUDGET_USD=

LOCAL_LLM_BASE_URL=http://127.0.0.1:1234/v1
LOCAL_LLM_MODEL=
LOCAL_LLM_API_KEY=

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_DAILY_LIMIT=20

GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile

OPENCLAW_AGENT_ID=main
OPENCLAW_BIN=openclaw
OPENCLAW_TIMEOUT_SEC=120
OPENCLAW_FALLBACK_ON_GEMINI_QUOTA=true

SEARCH_API_KEY=
SEARCH_PROVIDER=serper
SEARCH_INCLUDE_DOMAINS=
SEARCH_EXCLUDE_DOMAINS=
APP_UPDATE_URL=
SEMINAR_TICK_MS=45000

# Meta Instagram Reach Agent
META_ACCESS_TOKEN=
INSTAGRAM_BUSINESS_ACCOUNT_ID=
META_GRAPH_API_VERSION=v22.0
INSTAGRAM_AGENT_LOOKBACK_DAYS=30
INSTAGRAM_AGENT_SECRET=
```

- `OPENAI_ADMIN_KEY`: OpenAI 조직 관리자 키(옵션). 있으면 메인 화면에서 월 사용량을 조회합니다.
- `OPENAI_MONTHLY_BUDGET_USD`: 내부 월 예산(옵션). 잔여 예산 계산에 사용됩니다.
- `LLM_PROVIDER`: `openai`, `local`, `gemini`, `groq`, `openclaw`
- `LLM_RUN_PROFILE`: `manual`(수동 provider 선택) 또는 `free`(무료 provider 자동선택)
- `LLM_FALLBACK_ORDER`: 주 provider 실패 시 자동 대체 순서(쉼표 구분, 예: `gemini,groq,openai,local`)
- `FREE_MODE_PROVIDER_ORDER`: 무료모드 자동 선택 순서(기본 `openclaw,groq,gemini,local`)
- `FREE_MODE_ALLOW_PAID_FALLBACK`: 무료모드에서 무료 provider 전부 실패 시 OpenAI로 대체 허용 여부
- `LOCAL_LLM_BASE_URL`: OpenAI 호환 로컬 LLM 엔드포인트(`/v1` 포함)
- `LOCAL_LLM_MODEL`: 로컬 서버에 등록된 모델명
- `GEMINI_API_KEY`: Gemini API 키
- `GEMINI_MODEL`: Gemini 모델명 (예: `gemini-2.5-flash`)
- `GROQ_API_KEY`: Groq API 키
- `GROQ_MODEL`: Groq 모델명 (예: `llama-3.3-70b-versatile`)
- `OPENCLAW_AGENT_ID`: OpenClaw 에이전트 ID (기본 `main`)
- `OPENCLAW_BIN`: OpenClaw CLI 실행 파일명/경로 (기본 `openclaw`)
- `OPENCLAW_TIMEOUT_SEC`: OpenClaw 호출 타임아웃(초, 기본 `120`)
- `OPENCLAW_FALLBACK_ON_GEMINI_QUOTA`: Gemini 429(한도 초과) 시 OpenClaw 자동 대체 실행 여부(기본 `true`)
- `GEMINI_DAILY_LIMIT`: 메인 화면의 `오늘 남은 Gemini 요청 예측치` 계산 기준값(기본 20)
- `SEARCH_INCLUDE_DOMAINS`: 웹서치 허용 도메인 목록(쉼표 구분, 옵션)
- `SEARCH_EXCLUDE_DOMAINS`: 웹서치 제외 도메인 목록(쉼표 구분, 옵션)
- `APP_UPDATE_URL`: 데스크톱 자동 업데이트 피드 URL(옵션). 미설정 시 앱의 `설정 및 복구 > 앱 업데이트`에서 URL 저장 가능
- `SEMINAR_TICK_MS`: 올나잇 세미나 스케줄러 폴링 주기(ms, 기본 45000)
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase API URL. 로컬 기본값은 `http://127.0.0.1:54321`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: 앱에서 사용하는 Supabase publishable key
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: 이전 명칭 anon key를 병행 사용할 때의 fallback 변수
- `SUPABASE_PROJECT_REF`: CLI 원격 연결용 프로젝트 ref(옵션)
- `SUPABASE_ACCESS_TOKEN`: `supabase link`나 배포용 CLI 토큰(옵션, 앱 런타임에는 사용하지 않음)
- `META_ACCESS_TOKEN`: 인스타 인사이트 조회 권한이 포함된 Meta 장기 토큰
- `INSTAGRAM_BUSINESS_ACCOUNT_ID`: 대상 인스타 비즈니스 계정 ID(ig-user-id)
- `META_GRAPH_API_VERSION`: Graph API 버전(기본 `v22.0`)
- `INSTAGRAM_AGENT_LOOKBACK_DAYS`: 실행 시 분석 기본 기간(일, 기본 `30`)
- `INSTAGRAM_AGENT_SECRET`: 자동 실행 보호용 시크릿(옵션)

## 권장 운영 모드
- 무료 운영(권장): `설정 및 복구 > 권장 무료 운영 세팅 적용`
  - 실행 모드: `free`
  - 자동 순서: `OpenClaw -> Groq -> Gemini -> Local`
  - fallback 체인 최대 4개로 제한
- 고품질 보고서: `설정 및 복구 > 고품질 보고서 세팅 적용`
  - 실행 모드: `manual`
  - 사용 가능한 유료/고성능 provider(OpenAI 우선)를 자동 추천

## 실행 방법
1. 의존성 설치
```bash
npm install
```

2. Prisma Client 생성
```bash
npm run prisma:generate
```

3. 개발 실행
```bash
npm run dev
```

4. 프로덕션 빌드
```bash
npm run build
```

5. macOS 패키지 생성 (DMG + ZIP)
```bash
npm run dist
```

## Supabase 로컬 개발
1. Supabase 로컬 스택 실행
```bash
npm run supabase:start
```

2. 로컬 키/URL 확인
```bash
npm run supabase:status
```

3. 필요 시 로컬 DB 초기화
```bash
npm run supabase:db:reset
```

4. 타입 생성
```bash
npm run supabase:gen:types
```

현재 프로젝트에는 아래가 스캐폴드되어 있습니다.
- [`supabase/config.toml`](/Users/rnr/Documents/New%20project/supabase/config.toml)
- [`supabase/migrations/20260316093000_auth_and_org_foundation.sql`](/Users/rnr/Documents/New%20project/supabase/migrations/20260316093000_auth_and_org_foundation.sql)
- [`supabase/migrations/20260316113000_workspace_shared_data.sql`](/Users/rnr/Documents/New%20project/supabase/migrations/20260316113000_workspace_shared_data.sql)
- [`supabase/seed.sql`](/Users/rnr/Documents/New%20project/supabase/seed.sql)
- [`lib/supabase/env.ts`](/Users/rnr/Documents/New%20project/lib/supabase/env.ts)
- [`lib/supabase/client.ts`](/Users/rnr/Documents/New%20project/lib/supabase/client.ts)
- [`components/supabase-auth-panel.tsx`](/Users/rnr/Documents/New%20project/components/supabase-auth-panel.tsx)
- [`components/supabase-auth-chip.tsx`](/Users/rnr/Documents/New%20project/components/supabase-auth-chip.tsx)
- [`components/supabase-auth-callback.tsx`](/Users/rnr/Documents/New%20project/components/supabase-auth-callback.tsx)
- [`app/auth/callback/page.tsx`](/Users/rnr/Documents/New%20project/app/auth/callback/page.tsx)
- [`lib/shared-sync/local-export.ts`](/Users/rnr/Documents/New%20project/lib/shared-sync/local-export.ts)
- [`app/api/supabase/bootstrap/route.ts`](/Users/rnr/Documents/New%20project/app/api/supabase/bootstrap/route.ts)

주의:
- Electron 배포본에는 `service_role`, `secret`, direct Postgres URL을 넣지 않습니다.
- 데스크톱 앱에서는 publishable/anon key만 쓰고, 권한이 필요한 작업은 Edge Functions로 넘기는 방향을 기준으로 합니다.

현재 상태:
- 설정 화면에 `팀 계정과 협업 백엔드` 패널이 추가되어 Supabase 이메일 로그인과 세션 상태 확인이 가능합니다.
- 상단 바에는 Supabase 세션 칩이 표시됩니다.
- 원격 프로젝트에 `auth/organizations` 와 `workspace shared data` 마이그레이션이 모두 적용되었습니다.
- `/api/supabase/bootstrap` 으로 현재 로컬 `Run`, `LearningArchive`, `ApprovalDecision`, `RunProgress`를 sync-ready payload로 내보낼 수 있습니다.

원격 프로젝트에서 다음 설정이 필요합니다.
1. Supabase Dashboard `Authentication > URL Configuration` 에 아래 Redirect URL 등록
   - `http://localhost:3000/auth/callback`
   - `http://127.0.0.1:3000/auth/callback`
   - `http://127.0.0.1:3123/auth/callback`
2. `supabase link --project-ref <project-ref>` 후 원격 마이그레이션 적용
   - `npm run supabase:db:push`

## MCP 서버 실행
앱 내부 데이터를 외부 MCP 클라이언트(Codex, Claude Desktop, Cursor 등)에서 읽고 활용하려면 로컬 stdio MCP 서버를 실행할 수 있습니다.

```bash
npm run mcp:server
```

현재 제공 항목:
- Tools: `list_runs`, `get_run_detail`, `list_datasets`, `get_dataset_detail`, `list_learning_cards`, `get_instagram_reach_summary`
- Resources: `aimd://overview`, `aimd://runs/recent`, `aimd://learning/recent`
- Prompts: `run-retrospective`, `dataset-insight-brief`, `learning-card-pack`

## 자동 업데이트 배포
1. 버전 업데이트: `package.json`의 `version` 증가
2. 새 업데이트 파일 빌드: `npm run dist`
3. 업데이트 서버에 산출물 업로드:
  - `latest-mac.yml`
  - `*.zip` (mac auto-updater 적용 파일)
  - `*.zip.blockmap`
  - `*.dmg` (수동 설치용)
4. 앱에서 `설정 및 복구 > 앱 업데이트`에 업데이트 피드 URL 저장
5. 또는 실행 환경(앱 실행 쉘/런처)에 `APP_UPDATE_URL` 설정
6. 앱에서 `설정 및 복구 > 앱 업데이트`에서:
  - `업데이트 확인`
  - `업데이트 다운로드`
  - `다운로드 후 설치`

### 참고
- 자동 업데이트 확인/설치는 Electron 데스크톱 앱에서만 동작합니다.
- `APP_UPDATE_URL`을 지정해 빌드하면(`npm run dist`/`dist:publish`) 앱 내장 설정(`app-update.yml`)으로 사용자 입력 없이 업데이트 확인이 가능합니다.
- 배포 업로드 자동화가 필요하면 아래 스크립트를 사용하세요.
```bash
# APP_UPDATE_URL을 먼저 설정한 뒤 실행
npm run dist:publish
```

## 라우트
- `/operations`: 오늘의 브리핑
- `/social`: 개발 예정인 SNS 인사이트 실험 화면
- `/campaigns`: 캠페인 룸
- `/campaigns/[id]`: 캠페인 상세
- `/settings`: 관리자/운영 설정
- `/api/supabase/bootstrap`: Supabase 이전용 로컬 운영 데이터 export
- `/dashboard`: 대화 학습 아카이브 대시보드
- `/learning`: 학습 카드 검색/편집/동기화
- `/`: AI 회의 실행
- `/datasets`: 데이터 입력/AI 분석 워크벤치
- `/seminar`: 올나잇 세미나 워룸
- `/history`: 실행 히스토리
- `/runs/[id]`: 실행 상세
- `/api/attachments/extract/status/[jobId]`: 이미지 OCR 큐 상태 조회

### 인스타그램 연결 구조
- `설정 및 복구`: 관리자용 App ID, Secret, Redirect URI, 기본 계정 관리
- `SNS 인사이트`: 현재는 개발 예정 화면으로 남아 있으며, 실험용 연결과 과거 분석 데이터만 확인
- 현재 연결 방식은 `Meta 공식 인증창 + 비즈니스 연결 흐름`
- 제품 목적상 다음 우선 방향은 `Instagram Login` 기반 단일 계정 연결이며, Meta 비즈니스 연결은 보조 흐름으로 유지할 예정

### 인스타그램 도달 자동 에이전트 API
- 사전 준비:
  - 인스타그램이 비즈니스/크리에이터 계정이어야 함
  - Meta 앱 토큰에 인사이트 조회 권한(`instagram_manage_insights` 등)이 포함되어야 함
- `POST /api/instagram/reach/agent`
  - Meta API에서 일별 도달 데이터를 수집하고 추세 분석 실행
  - Body(옵션): `{ "lookbackDays": 30 }`
  - `INSTAGRAM_AGENT_SECRET`가 설정된 경우 헤더 `x-agent-secret` 또는 `Authorization: Bearer <secret>` 필요
- `GET /api/instagram/reach/agent?days=30`
  - 최근 N일 도달 시계열과 최신 분석 결과 조회

예시:

```bash
curl -X POST http://localhost:3000/api/instagram/reach/agent \
  -H "Content-Type: application/json" \
  -H "x-agent-secret: ${INSTAGRAM_AGENT_SECRET}" \
  -d '{"lookbackDays":30}'
```

### 매일 자동 실행 (macOS cron 예시)
매일 오전 9시에 자동 실행:

```bash
0 9 * * * curl -s -X POST http://localhost:3000/api/instagram/reach/agent -H "x-agent-secret: YOUR_SECRET" > /tmp/ig-reach-agent.log 2>&1
```

## 참고
- 검색 API 실패 시에도 회의는 계속 진행됩니다.
- 일부 환경에서 `prisma migrate`가 실패할 수 있어, 현재 프로젝트는 로컬 DB를 직접 초기화한 상태입니다.
- Gemini 한도와 무관하게 웹서치만 점검하려면 `POST /api/search/test`를 사용하세요.
- 올나잇 세미나는 앱이 실행 중이고 Mac이 절전 상태가 아닐 때 자동 라운드가 진행됩니다.
