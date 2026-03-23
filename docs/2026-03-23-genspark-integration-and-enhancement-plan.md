# Garnet × Genspark — 연동 방안 및 고도화 계획

> 작성일: 2026-03-23
> 기준: Garnet v0.2.0 코드베이스 전체 검토 + Genspark 플랫폼 조사 결과
> 담당자 참고 우선순위: 🔴 즉시 실행 → 🟠 단기 → 🟡 중기 → 🟢 장기

---

## 1. 프로젝트 현황 요약

### Garnet 핵심 아키텍처

```
Electron + Next.js 15 (App Router, TypeScript)
  ├── LLM 추상화 레이어 (lib/llm.ts)
  │     └── OpenAI / Gemini / Groq / Local / OpenClaw 5개 provider
  │           + fallback 체인 자동 전환
  ├── AI 파이프라인 (lib/pipeline.ts)
  │     └── 웹서치 → 5역할 회의 → PM 결정 → 산출물 → 메모리 로그
  ├── MCP 서버/클라이언트 (scripts/mcp-server.mjs, lib/mcp-client.ts)
  ├── Prisma + SQLite 로컬 DB
  └── Supabase 협업 백엔드 (스캐폴드 완료, Auth 이메일 제한 해제 대기)
```

### 현재 연동 중인 서비스
| 서비스 | 용도 | 상태 |
|--------|------|------|
| OpenAI API | 메인 LLM | 연동 완료 |
| Google Gemini API | 무료 대체 LLM | 연동 완료 |
| Groq API | 고속 무료 LLM | 연동 완료 |
| Serper.dev | 웹서치 | 연동 완료 |
| Meta Graph API | 인스타그램 인사이트 | 연동 완료 |
| Supabase | 협업 백엔드 | 스캐폴드 완료 |
| MCP (내부) | 데이터 노출 | 동작 중 |

---

## 2. Genspark 플랫폼 현황 분석

### 2-A. Genspark가 제공하는 것

Genspark는 현재 (2026년 3월 기준) **사용자 대면 AI 올인원 워크스페이스**로 포지셔닝되어 있습니다.

**주요 기능:**
- AI Chat (GPT, Claude, Gemini 등 멀티모델 통합)
- AI Slides (프레젠테이션 자동 생성)
- AI Docs (문서 생성/편집 에이전트)
- AI Image / Video 생성
- Super Agent (웹 자동화 + 실시간 리서치)
- AI Developer (노코드 앱 빌더)
- Workflows (워크플로우 자동화)

**2026년 특이 사항:**
- 2026년 한 해 동안 Plus/Pro 구독자에게 AI Chat + AI Image 무제한 사용 제공
- GPT-4.1, Claude Sonnet 4, Gemini 2.5 Flash 등 주요 모델 통합 접근
- "Nano Banana" 자체 모델 개발 및 이미지 생성 API 제공 시작

### 2-B. Genspark 공개 API 현황 (2026년 3월 기준)

> ⚠️ **중요**: Genspark는 현재 공개 API를 제공하지 않습니다.

Reddit 공식 답변 (2025년 8월, Genspark 팀):
> *"We are a no-code platform and don't provide APIs."*

**현재 Genspark와 통합 가능한 방식:**

| 방식 | 가능 여부 | 설명 |
|------|-----------|------|
| 공개 REST API | ❌ 미제공 | 공식 Developer API 없음 |
| OpenAI 호환 엔드포인트 | ❌ 미제공 | OpenAI 방식의 API 없음 |
| Webhook | ❌ 미제공 | 외부 트리거 수신 불가 |
| Zapier/Make 커넥터 | ⚠️ 미확인 | 공식 확인 어려움 |
| MCP 서버 (클라이언트로) | ⚠️ 미확인 | Genspark Super Agent가 MCP client로 동작 가능 여부 조사 필요 |
| CData Connect AI MCP | ✅ 가능 | 제3자 MCP 브릿지(유료)로 연결 가능 |
| 브라우저 자동화 | ✅ 가능 | Playwright 등으로 UI 자동화 |

### 2-C. Genspark 활용의 현실적 접근법

Genspark의 직접 API가 없는 상황에서 Garnet이 취할 수 있는 현실적 전략은:

**전략 1: Garnet이 MCP 서버를 노출해 Genspark Super Agent가 읽어가도록 유도**
- 현재 `scripts/mcp-server.mjs`가 이미 tools/resources/prompts를 노출 중
- Genspark의 Super Agent가 외부 MCP를 클라이언트로 연결하는 기능이 추가될 경우 바로 연동 가능

**전략 2: Genspark와 동일한 기능을 Garnet 자체에 구현**
- Genspark의 핵심 강점(멀티 LLM 오케스트레이션, 자동 리서치+생성)이 이미 Garnet에 구현되어 있음
- 오히려 Garnet이 마케팅 특화 기능(KPI, 캠페인, 플레이북)에서 차별화

**전략 3: Genspark 기능을 Garnet에 흡수**
- AI Slides → 실행 보고서 PDF/슬라이드 내보내기 강화
- AI Docs → 콘텐츠 생성 스튜디오(`/content`) 강화
- Super Agent → 세미나 스튜디오(`/seminar`) 강화

---

## 3. Garnet 고도화 우선순위 로드맵 (종합)

> 기존 `docs/2026-03-16-roadmap.md`를 기반으로 Genspark 분석을 추가 반영한 업데이트 버전

---

### 🔴 Phase 1 — 즉시 실행 (이번 주)

#### 1-A. Supabase 이메일 SMTP 차단 해제
- **이유**: Auth 전체 블로킹, Supabase 연동의 선결 조건
- **방법**: Resend SMTP 연결 (무료 3,000건/월, 5분 설정)
- **참조**: `docs/2026-03-16-supabase-adoption-plan.md`

#### 1-B. MCP 레지스트리 4개 신규 등록
- **이유**: 30분 작업, 이후 모든 MCP 확장의 기반
- **대상**: Supabase MCP, Slack MCP, Google Drive MCP, Brave Search MCP
- **파일**: `lib/mcp-connections.ts`
- **참조**: `docs/2026-03-16-mcp-connection-plan.md`

#### 1-C. 검색 Provider 확장 — Brave Search API 연동
- **현황**: Serper.dev 단일 의존, 실패 시 대체 없음
- **방법**: `lib/search.ts`에 Brave Search 폴백 추가
- **환경변수**: `BRAVE_SEARCH_API_KEY` 추가
- **효과**: 웹서치 안정성 향상, 마케팅 인텔리전스 품질 개선

```typescript
// lib/search.ts 확장 예시
async function runBraveSearch(query: string): Promise<SearchHit[]> {
  const response = await fetch('https://api.search.brave.com/res/v1/web/search', {
    headers: { 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY! }
  });
  // ...
}
```

#### 1-D. 디자인 시스템 status badge 토큰화
- **현황**: 6개 페이지에 동일 색상 하드코딩 반복
- **파일**: `app/globals.css`, `lib/design-tokens.ts`
- **참조**: `docs/2026-03-16-design-system-audit.md`

---

### 🟠 Phase 2 — 단기 실행 (다음 주)

#### 2-A. LLM Provider 확장 — Anthropic Claude 직접 연동
- **현황**: Claude는 OpenClaw 경유로만 간접 사용
- **방법**: `lib/llm.ts`에 `runClaude()` 함수 추가
- **패키지**: `npm install @anthropic-ai/sdk`
- **환경변수**: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL=claude-sonnet-4-5`
- **효과**: Genspark가 Claude를 활용하는 방식과 동등한 품질 확보

```typescript
// lib/llm.ts 확장 포인트
import Anthropic from '@anthropic-ai/sdk';

async function runClaude(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
  runtime?: RuntimeConfig
) {
  const apiKey = pickValue(runtime?.anthropicApiKey, process.env.ANTHROPIC_API_KEY);
  if (!apiKey) throw new ProviderError('claude', 'MISSING_CONFIG', 'ANTHROPIC_API_KEY가 없습니다.');
  const client = new Anthropic({ apiKey });
  // ...
}
```

**LLM 타입 변경:**
```typescript
// 현재
type LlmProvider = 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw';
// 변경 후
type LlmProvider = 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw' | 'claude';
```

#### 2-B. 콘텐츠 생성 스튜디오 강화 (`/app/content/`)
- **현황**: 기본 텍스트 생성만 지원
- **추가 기능**:
  - 멀티턴 편집 (Genspark AI Docs 방식)
  - Save Point(버전 관리) 시스템
  - 생성 콘텐츠 캠페인 룸 연결 버튼
  - HTML/PDF 내보내기

#### 2-C. Notion MCP 실제 연결
- **효과**: 실행 결과물이 팀과 공유되는 첫 외부 채널
- **구현**: 설정 화면 → Notion API Key 입력 → 화면별 발행 버튼 추가
- **대상 화면**: 세미나 보고서, 플레이북 카드, 오늘의 브리핑

#### 2-D. Supabase 데이터 이전 Phase 1-2
- **선결 조건**: 1-A (SMTP 해제) 완료 후
- **이전 순서**: Run/MeetingTurn/Deliverable → LearningArchive → SeminarSession

---

### 🟡 Phase 3 — 중기 (2-3주)

#### 3-A. AI 이미지 생성 연동 — 콘텐츠 스튜디오 확장
- **배경**: Genspark의 주요 기능 중 하나가 AI 이미지/비디오 생성
- **Garnet 접근법**: 기존 콘텐츠 생성 스튜디오에 이미지 생성 탭 추가
- **선택지**:
  - OpenAI DALL-E 3 API (`openai` 패키지 내 포함)
  - Stability AI API (`STABILITY_API_KEY`)
  - Replicate API (다양한 오픈소스 모델)
- **환경변수 추가**: `IMAGE_PROVIDER=openai`, `STABILITY_API_KEY`

```typescript
// app/api/content/image/route.ts (신규)
export async function POST(request: Request) {
  const { prompt, style, size } = await request.json();
  // OpenAI DALL-E 또는 Stability AI 호출
}
```

#### 3-B. 실행 보고서 슬라이드 내보내기 (Genspark AI Slides 수준)
- **현황**: PDF 보고서만 지원
- **추가**: `lib/report-visuals.ts` 기반으로 HTML 슬라이드 생성
- **패키지 후보**: `reveal.js`, `impress.js`, `pptxgenjs`
- **흐름**: Deliverable JSON → 슬라이드 레이아웃 자동 생성 → PPTX/HTML 내보내기

#### 3-C. Slack MCP + 승인 알림 워크플로우
- **효과**: 승인 대기가 팀 채널로 자동 알림 → 병목 해소
- **구현**: Slack App Bot Token → MCP 연결 → 승인 대기 이벤트 훅

#### 3-D. 추천 액션 엔진 기반 구현
- **배경**: Genspark Super Agent의 핵심 가치는 "맥락 기반 다음 행동 추천"
- **Garnet 접근법**: 캠페인 상태 + KPI 달성률 + 승인 대기를 종합 분석
- **구현**: `lib/notifications.ts` → `lib/recommendations.ts`로 확장

```typescript
// lib/recommendations.ts (신규)
export type ActionRecommendation = {
  priority: 'urgent' | 'high' | 'medium';
  type: 'campaign' | 'kpi' | 'approval' | 'content';
  title: string;
  reason: string;
  actionUrl: string;
  estimatedImpact: string;
};

export async function computeRecommendations(): Promise<ActionRecommendation[]> {
  // KPI 달성률, 승인 대기, 세미나 결과, 캠페인 상태 종합 분석
}
```

#### 3-E. Supabase Realtime 적용
- **대상**: RunProgress, ApprovalDecision, SeminarSession
- **효과**: 새로고침 없이 실시간 상태 반영

---

### 🟢 Phase 4 — 장기 (1개월+)

#### 4-A. Garnet 내장 Multi-Agent 오케스트레이터 강화
- **배경**: Genspark의 핵심 차별화는 "여러 AI 에이전트가 협업"
- **현황**: Garnet도 5역할 회의 구조(PM/마케터/분석가/크리에이터/운영)가 있음
- **강화 방향**:
  - 역할별 전문 모델 라우팅 (분석 → Gemini, 창의 → Claude, 요약 → Groq)
  - 에이전트 간 컨텍스트 공유 개선
  - 실시간 스트리밍 응답 지원 (SSE 기반)

```typescript
// lib/pipeline.ts 강화 포인트
type RoleModelMapping = {
  GROWTH_STRATEGIST: 'openai';      // 분석 품질 우선
  CREATIVE_DIRECTOR: 'claude';      // 창의성 우선
  DATA_ANALYST: 'gemini';           // 멀티모달 분석
  PROJECT_MANAGER: 'openai';        // 의사결정 정확도
  OPERATIONS: 'groq';               // 속도 우선
};
```

#### 4-B. Genspark 스타일 자동 리서치 파이프라인
- **현황**: `lib/search.ts`가 웹서치 → 마케팅 필터 → 인텔리전스 리포트 생성
- **강화**:
  - 경쟁사 자동 트래킹 (주간 배치)
  - 업종별 트렌드 모니터링 (세미나 컨텍스트 자동 주입)
  - 구글 트렌드 / 네이버 트렌드 연동

#### 4-C. Instagram Login 전환 + 소셜 대시보드 정식화
- **현황**: `/social` 개발 예정 상태
- **방향**: Meta Business 연결 → Instagram Login API 우선으로 단순화

#### 4-D. Google Analytics / Search Console 연동
- **효과**: 실제 성과 데이터(트래픽, CTR, 전환)가 KPI 대시보드에 통합
- **방법**: Google OAuth + GA4 Data API + Search Console API

#### 4-E. 자동화 스케줄러 확장 (Genspark Workflows 수준)
- **현황**: 올나잇 세미나 스케줄러(`lib/seminar-scheduler.ts`) 존재
- **확장**:
  - 주간 KPI 리뷰 자동 실행
  - 경쟁사 모니터링 일간 배치
  - 성과 브리핑 자동 생성 및 Slack 발송

---

## 4. Genspark API 연동 — 가능성 시나리오별 계획

### 시나리오 A: Genspark이 공개 API를 출시할 경우 (미래 대비)

Genspark이 API를 공개하면 아래 방식으로 즉시 연동 가능합니다.

**연동 포인트:**
```typescript
// lib/llm.ts에 추가할 genspark provider
async function runGenspark(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
  runtime?: RuntimeConfig
) {
  const apiKey = pickValue(runtime?.gensparkApiKey, process.env.GENSPARK_API_KEY);
  const endpoint = process.env.GENSPARK_API_URL || 'https://api.genspark.ai/v1';
  // OpenAI 호환 방식으로 통합 예정
}
```

**환경변수 준비 (미리 `.env.example`에 추가 권장):**
```env
# Genspark API (출시 대기 중)
GENSPARK_API_KEY=
GENSPARK_API_URL=https://api.genspark.ai/v1
GENSPARK_MODEL=genspark-super-agent
```

### 시나리오 B: Genspark Workflow를 통한 간접 통합

Genspark의 Workflows 기능을 통해 Garnet의 API 엔드포인트를 Webhook으로 호출 가능합니다.

**흐름:**
```
Genspark Workflow 트리거
  → POST /api/run (Garnet AI 회의 실행)
  → POST /api/seminar (세미나 자동 실행)
  → GET /api/notifications (알림 상태 조회)
```

**필요 사항:**
- Garnet API 엔드포인트에 Bearer 토큰 인증 추가
- 외부 접근을 위한 ngrok 또는 Cloudflare Tunnel 설정

### 시나리오 C: Garnet MCP 서버를 Genspark Super Agent에 연결

Genspark Super Agent가 MCP 클라이언트 기능을 추가하면 즉시 연동 가능합니다.

**현재 Garnet MCP 서버가 노출하는 것:**
```javascript
// scripts/mcp-server.mjs 기반
Tools:
  - list_runs           // 실행 기록 목록
  - get_run_detail      // 실행 상세
  - list_datasets       // 데이터셋 목록
  - get_dataset_detail  // 데이터셋 상세
  - list_learning_cards // 플레이북 카드
  - get_instagram_reach_summary  // 인스타 성과

Resources:
  - aimd://overview     // 전체 현황 요약
  - aimd://runs/recent  // 최근 실행
  - aimd://learning/recent  // 최근 학습 카드

Prompts:
  - run-retrospective       // 실행 회고
  - dataset-insight-brief   // 데이터셋 인사이트
  - learning-card-pack      // 학습 카드 묶음
```

**MCP 서버 확장 예정 (Phase 3-E):**
```javascript
// 추가 예정 Tools
- get_seminar_session_detail   // 세미나 상세
- list_approval_queue          // 승인 대기
- get_campaign_room_detail     // 캠페인 룸 상세
- get_kpi_goals_summary        // KPI 현황
- search_learning_by_signal    // 신호 기반 플레이북 검색

// 추가 예정 Prompts
- campaign-room-briefing       // 캠페인 브리핑
- approval-action-summary      // 승인 처리 권고
- kpi-progress-review          // KPI 주간 리뷰
```

---

## 5. 코드 수준 고도화 항목

### 5-A. LLM 스트리밍 응답 지원

현재 모든 LLM 호출이 동기식 완성 응답입니다. 스트리밍으로 전환하면 UX가 대폭 개선됩니다.

```typescript
// lib/llm.ts 스트리밍 버전 추가
export async function* streamLLM(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.35,
  maxTokens = 2400,
  runtime?: RuntimeConfig
): AsyncGenerator<string> {
  const primary = resolveProvider(runtime);
  // OpenAI streaming: client.responses.stream()
  // Gemini streaming: generateContentStream()
  // Groq streaming: stream: true
}
```

**적용 대상:**
- `app/api/run/route.ts` → SSE(Server-Sent Events) 응답
- `app/api/seminar/[id]/round/route.ts` → 라운드별 스트리밍
- `app/api/content/route.ts` → 콘텐츠 생성 실시간 표시

### 5-B. 웹서치 Provider 다변화

```typescript
// lib/search.ts 개선
type SearchProvider = 'serper' | 'brave' | 'tavily' | 'bing';

const SEARCH_FALLBACK_ORDER: SearchProvider[] = ['serper', 'brave', 'tavily'];

async function runSearchWithFallback(query: string): Promise<SearchHit[]> {
  for (const provider of SEARCH_FALLBACK_ORDER) {
    try {
      return await runSearchByProvider(provider, query);
    } catch (e) {
      continue;
    }
  }
  return [];
}
```

**환경변수 추가:**
```env
BRAVE_SEARCH_API_KEY=
TAVILY_API_KEY=
SEARCH_FALLBACK_ORDER=serper,brave,tavily
```

### 5-C. 파이프라인 실행 품질 개선

```typescript
// lib/pipeline.ts 개선 포인트

// 1. 역할별 모델 분리
const ROLE_MODEL_HINTS: Record<string, LlmProvider> = {
  PM: 'openai',        // 의사결정
  ANALYST: 'gemini',   // 분석
  CREATIVE: 'claude',  // 창의
  GROWTH: 'openai',    // 전략
  OPS: 'groq',         // 실행
};

// 2. 컨텍스트 압축 (긴 대화에서 핵심만 유지)
function compressContext(turns: MeetingTurn[], maxTokens: number): string {}

// 3. 출력 스키마 강화 (Zod 검증)
const deliverableSchema = z.object({
  documentType: z.enum(['CAMPAIGN_PLAN', 'CONTENT_PACKAGE', 'EXPERIMENT_DESIGN']),
  // ... 전체 스키마 검증
});
```

### 5-D. 데이터베이스 쿼리 최적화

현재 `lib/prisma.ts`에서 반복 쿼리가 많습니다.

```typescript
// lib/prisma.ts 개선
// 1. 커넥션 풀링 설정
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  log: process.env.NODE_ENV === 'development' ? ['query'] : [],
});

// 2. 자주 사용하는 쿼리 캐싱 레이어 추가
import { cache } from 'react';

export const getRecentRuns = cache(async (limit = 10) => {
  return prisma.run.findMany({ take: limit, orderBy: { createdAt: 'desc' } });
});
```

### 5-E. Electron 보안 강화

```typescript
// electron/main.ts 개선 포인트

// 1. CSP 헤더 강화
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': ["default-src 'self'; script-src 'self'"],
    },
  });
});

// 2. contextIsolation 확인
const win = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,  // 이미 있어야 함
    nodeIntegration: false,   // 이미 있어야 함
    preload: path.join(__dirname, 'preload.js'),
  },
});
```

---

## 6. 외부 서비스 연동 확장 계획

### 신규 연동 후보 (우선순위 순)

| # | 서비스 | 방식 | 효과 | 난이도 |
|---|--------|------|------|--------|
| 1 | **Anthropic Claude** | REST API | 고품질 창의 콘텐츠 | 낮음 |
| 2 | **Brave Search API** | REST API | 웹서치 다변화 | 낮음 |
| 3 | **Notion** | MCP / REST API | 결과물 팀 공유 | 중간 |
| 4 | **Slack** | MCP / Webhook | 승인 알림 워크플로우 | 중간 |
| 5 | **Google Analytics 4** | OAuth + Data API | 실제 성과 KPI 연동 | 중간 |
| 6 | **Naver Search API** | REST API | 한국 시장 웹서치 강화 | 낮음 |
| 7 | **OpenAI DALL-E 3** | openai SDK | 이미지 생성 | 낮음 |
| 8 | **Google Drive** | MCP / OAuth | 데이터셋 자동 동기화 | 중간 |
| 9 | **Kakao Pixel / Moment** | REST API | 국내 광고 성과 분석 | 높음 |
| 10 | **Genspark API** | REST API (출시 대기) | 멀티 에이전트 확장 | 추후 |

### 네이버 검색 API 연동 (한국 특화)

```typescript
// lib/search.ts에 추가
async function runNaverSearch(query: string): Promise<SearchHit[]> {
  const response = await fetch(
    `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=10`,
    {
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
      },
    }
  );
  // ...
}
```

**환경변수:**
```env
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
```

---

## 7. 기술 부채 해결 계획

### 현재 식별된 기술 부채

| 항목 | 위치 | 우선순위 |
|------|------|----------|
| `text-slate-*` 하드코딩 | `app/page.tsx` | 🟠 |
| `bg-white/92` 글래스모피즘 | 캠페인 스튜디오 히어로 | 🟠 |
| status color 하드코딩 | 6개 페이지 | 🟠 |
| `app-nav.tsx` hex 색상 4곳 | `components/app-nav.tsx` | 🟡 |
| seminar hex 색상 | `app/seminar/page.tsx` | 🟡 |
| prisma migrate dev 미적용 | `prisma/` | 🟡 |
| LLM 스트리밍 미지원 | `lib/llm.ts` | 🟡 |
| DB blob 비대화 | `Dataset.rawData` | 🟡 |

---

## 8. 모니터링 및 관찰 가능성

### 현재 미비한 부분

- 프로덕션 오류 추적 없음 (Sentry 등 미연동)
- LLM API 비용 추적 부재 (OpenAI Admin Key만 있음)
- 앱 성능 모니터링 없음

### 단기 대응

```typescript
// lib/llm.ts에 비용 추적 추가
type LlmCallLog = {
  provider: LlmProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  cost_usd_estimate: number;
};

// MCP 서버에 비용 요약 tool 추가
// tools: get_llm_cost_summary
```

---

## 9. 실행 체크리스트

### 이번 주 완료 목표
- [ ] Supabase Resend SMTP 연결
- [ ] MCP 레지스트리 4개 추가 (`lib/mcp-connections.ts`)
- [ ] Brave Search API 키 발급 및 `lib/search.ts` 폴백 추가
- [ ] `ANTHROPIC_API_KEY` `.env.example` 추가 + `lib/llm.ts` Claude 연동
- [ ] status badge CSS 토큰화

### 다음 주 완료 목표
- [ ] Notion MCP 실제 연결 + 발행 버튼 추가
- [ ] 콘텐츠 스튜디오 멀티턴 편집 개선
- [ ] Supabase 데이터 이전 Phase 1 (Auth + 조직 모델 확인)
- [ ] LLM 스트리밍 응답 POC

### 2-3주 후 완료 목표
- [ ] AI 이미지 생성 탭 (`/content` 내)
- [ ] 실행 보고서 슬라이드 내보내기 (PPTX)
- [ ] 추천 액션 엔진 MVP (`lib/recommendations.ts`)
- [ ] Slack MCP + 승인 알림

---

## 10. 결론 — Genspark와 Garnet의 관계 정리

### Genspark는 경쟁자인가 파트너인가?

현재 Genspark와의 직접 연동은 공개 API 부재로 불가능합니다.
그러나 Garnet의 전략적 방향은 다음과 같이 명확합니다:

**Garnet의 차별화 포인트 (Genspark에 없는 것)**
1. **마케팅 도메인 특화**: 5역할 회의 에이전트, 캠페인 룸, KPI 관리가 마케팅 업무에 최적화
2. **로컬 데이터 주권**: Electron + SQLite 기반 로컬 데이터 보안
3. **워크플로우 연속성**: 브리핑 → 회의 → 보고서 → 승인 → 플레이북으로 이어지는 연속 흐름
4. **플레이북 자산화**: 모든 실행이 조직 학습 카드로 축적
5. **MCP 오픈 확장**: 내부 데이터를 Claude/Cursor/Codex에서 직접 접근 가능

**Genspark의 강점 (흡수해야 할 것)**
1. 멀티 LLM 오케스트레이션 → Phase 2-A Claude 연동으로 대응
2. AI 이미지/비디오 생성 → Phase 3-A 이미지 생성 탭으로 대응
3. Workflows 자동화 → Phase 4-E 스케줄러 확장으로 대응
4. AI Slides → Phase 3-B 슬라이드 내보내기로 대응

**요약**: Genspark가 API를 공개하는 시점이 오면 즉시 LLM Provider로 추가하고,
그 전까지는 Genspark의 기능을 마케팅 특화 방식으로 Garnet에 자체 구현하는 전략이 최선.

---

## 관련 문서

| 문서 | 내용 |
|------|------|
| `docs/2026-03-16-roadmap.md` | 기존 고도화 로드맵 (Phase 1-4) |
| `docs/2026-03-16-mcp-connection-plan.md` | MCP 연결 상세 계획 |
| `docs/2026-03-16-supabase-adoption-plan.md` | Supabase 이전 계획 |
| `docs/2026-03-16-design-system-audit.md` | 디자인 시스템 감사 |
| `docs/2026-03-12-mcp-expansion-roadmap.md` | MCP 원본 확장 로드맵 |
| `PROGRESS.md` | 개발 진행 기록 |
| `README.md` | 전체 환경 변수 및 실행 방법 |
