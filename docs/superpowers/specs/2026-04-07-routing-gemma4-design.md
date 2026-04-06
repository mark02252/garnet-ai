# 라우팅 개선 + Gemma 4 통합 설계

> **목표:** (1) `/` 접속 시 사용자를 `/operations` 대시보드로 안내하여 사이드바/네비가 있는 환경에서 시작하도록 개선. (2) Gemma 4를 최상위 LLM 프로바이더로 추가하여 대부분의 기능이 무료로 동작하도록 비용 최적화.

---

## Part 1: 라우팅 개선

### 현재 문제

| 문제 | 설명 |
|------|------|
| **신규 유저 이탈** | `/` 접속 → Agent Shell STANDBY 화면 → 사이드바 없음 → 어디로 가야 할지 모름 |
| **네비 링크 단절** | `app-nav.tsx`에서 "캠페인 스튜디오" `href: '/'` → Shell로 이동 → 사이드바 사라짐 |
| **모바일 차단** | `/` 접속 → "데스크탑에서 사용하세요" 메시지 → URL 직접 입력 필요 |

### 변경 사항

#### 1-1. `middleware.ts` 생성 (루트 리다이렉트)

프로젝트 루트에 `middleware.ts` 신규 생성:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/operations', request.url))
  }
}

export const config = {
  matcher: '/',
}
```

- Next.js 15에서 `NextResponse.redirect()`는 기본 307을 반환하므로, 302를 원하면 `{ status: 302 }`를 명시적으로 전달
- `matcher: '/'`로 루트 경로만 처리, 다른 경로에 성능 영향 없음

#### 1-2. Agent Shell을 `/shell` 경로로 이동

현재 구조:
```
app/(shell)/
  layout.tsx    → / 레이아웃
  page.tsx      → / 페이지
```

변경 후:
```
app/(shell)/
  layout.tsx    → 그대로 유지 (Shell 전용 레이아웃)
  shell/
    page.tsx    → /shell 페이지 (기존 page.tsx 이동)
```

- `app/(shell)/page.tsx`를 `app/(shell)/shell/page.tsx`로 이동
- `(shell)` 라우트 그룹과 레이아웃은 그대로 유지 — 풀스크린 UX 보존
- `/shell` 경로에서 기존과 동일한 Agent Shell 경험 제공
- **주의:** `/shell`은 `(shell)` 레이아웃을 사용하므로 사이드바가 없는 풀스크린 화면으로 전환됨 — 이것이 의도된 UX임

#### 1-3. `app-nav.tsx` 네비 링크 수정

`components/app-nav.tsx`에서:

```typescript
// 변경 전
{ href: '/', label: '캠페인 스튜디오', icon: <CampaignIcon /> },

// 변경 후
{ href: '/shell', label: '에이전트 셸', icon: <ShellIcon /> },
```

- 레이블도 "캠페인 스튜디오" → "에이전트 셸"로 변경 (실제 기능과 일치)
- 아이콘은 기존 것을 유지하거나 Shell 느낌의 아이콘으로 교체

---

## Part 2: Gemma 4 프로바이더 통합

### 배경

- Gemma 4: 2026년 4월 2일 출시, Apache 2.0 라이선스 (완전 무료, 상업적 사용 가능)
- 모델: `gemma-4-31b-it` (31B Dense, Arena AI 오픈모델 #3), `gemma-4-26b-a4b-it` (26B MoE, #6)
- **기본 모델:** `gemma-4-31b-it` (최고 품질, 구현 시 Google AI Studio에서 사용 가능한 정확한 모델 ID를 확인할 것)
- **Google AI Studio와 동일한 REST API** (`generativelanguage.googleapis.com`) 사용
- 기존 `GEMINI_API_KEY`로 즉시 동작
- 무료 제한: ~15 RPM, ~1,500 RPD
- 256K 컨텍스트, 140+ 언어 (한국어 포함)

### 변경 사항

#### 2-1. `lib/types.ts` — llmProvider 타입 확장

```typescript
// 변경 전
llmProvider?: 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw' | 'claude';

// 변경 후
llmProvider?: 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw' | 'claude' | 'gemma4';
```

RuntimeConfig에 Gemma4 전용 필드 추가:

```typescript
// Gemma4 config (API는 Gemini와 동일, 모델 ID만 분리)
gemma4Model?: string;
// API 키는 geminiApiKey를 공유 (동일한 Google AI Studio 키)
```

#### 2-2. `lib/llm.ts` — Gemma4 프로바이더 구현

**환경변수:**

```
GEMMA4_MODEL=gemma-4-31b-it    # 기본 모델
```

- `GEMMA4_API_KEY`는 별도로 두지 않음 — `GEMINI_API_KEY`를 공유
- 동일한 `generativelanguage.googleapis.com` 엔드포인트 사용

**구현 방식 — 공유 헬퍼 추출:** `runGemini()`와 `runGemma4()`가 API 키/모델만 다르고 로직이 동일하므로, 내부 공유 함수를 추출하여 코드 중복을 방지한다.

```typescript
const GEMMA4_DEFAULT_MODEL = 'gemma-4-31b-it'

// 공유 헬퍼: Gemini-compatible API 호출 (Gemini, Gemma4 모두 사용)
async function callGeminiCompatibleApi(
  provider: 'gemini' | 'gemma4',
  apiKey: string,
  model: string,
  system: string,
  user: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  // 기존 runGemini() 본문 로직을 여기로 이동
  // URL: https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}
}

// runGemini()는 callGeminiCompatibleApi('gemini', ...) 호출로 리팩터
// runGemma4()는 callGeminiCompatibleApi('gemma4', ...) 호출

async function runGemma4(
  system: string, user: string, temperature: number, maxTokens: number, runtime?: RuntimeConfig
): Promise<string> {
  const apiKey = runtime?.geminiApiKey ?? process.env.GEMINI_API_KEY
  const model = runtime?.gemma4Model ?? process.env.GEMMA4_MODEL ?? GEMMA4_DEFAULT_MODEL
  if (!apiKey) throw makeLlmError('MISSING_CONFIG', 'gemma4', 'GEMINI_API_KEY 없음')
  return callGeminiCompatibleApi('gemma4', apiKey, model, system, user, temperature, maxTokens)
}
```

**streamGemma4:** 동일한 패턴으로 `streamGeminiCompatibleApi()` 공유 함수를 사용.

**에러 매핑:** `mapGemma4HttpError()` — `mapGeminiHttpError()`와 동일한 로직 (같은 API이므로 같은 에러 코드)

**필수 등록 지점 (모두 `lib/llm.ts` 내):**

1. **`LlmProvider` 타입 (line ~10):** `'gemma4'` 추가

```typescript
type LlmProvider = 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw' | 'claude' | 'gemma4';
```

2. **`normalizeProvider()` (line ~56):** `'gemma4'` 인식 추가

```typescript
if (value === 'gemini' || value === 'groq' || value === 'local' || value === 'openclaw' || value === 'claude' || value === 'gemma4') return value;
```

3. **`providerLabel()` (line ~71):** 사용자 표시명 추가

```typescript
case 'gemma4': return 'Gemma 4';
```

4. **`hasConfig()` (line ~284):** Gemma4 설정 확인 (모델 + API 키)

```typescript
case 'gemma4':
  return !!(process.env.GEMINI_API_KEY || runtime?.geminiApiKey)
    && !!(runtime?.gemma4Model || process.env.GEMMA4_MODEL || GEMMA4_DEFAULT_MODEL)
```

5. **`runByProvider()` (line ~698):** dispatch에 gemma4 분기 추가

```typescript
if (provider === 'gemma4') return runGemma4(system, user, temperature, maxTokens, runtime);
```

6. **`streamByProvider()` (line ~998):** streaming dispatch에 gemma4 분기 추가

```typescript
if (provider === 'gemma4') return streamGemma4(system, user, temperature, maxTokens, runtime);
```

7. **`shouldTryFallback()` CONTEXT 에러 조건 (line ~722):** gemma4 추가

```typescript
if ((primary === 'gemini' || primary === 'groq' || primary === 'gemma4') && error.code === 'CONTEXT') return true;
```

8. **`getPrimaryFallbackOrder()` (line ~309):** gemma4 전용 폴백 순서 추가

```typescript
if (primary === 'gemma4') return ['groq', 'gemini', 'openclaw', 'claude', 'openai', 'local'];
```

또한 모든 기존 프로바이더의 폴백 배열에 `'gemma4'`를 적절한 위치에 삽입.

**Rate Limit 공유 주의:** Gemma4와 Gemini는 동일한 API 키를 사용하므로 Rate Limit을 공유한다. Gemma4가 429를 받으면 Gemini로 폴백해도 같은 제한에 걸릴 수 있다. 따라서 Gemma4의 폴백 순서에서 Gemini보다 Groq를 먼저 배치한다 (`groq` → `gemini` 순서).

#### 2-3. 프로바이더 우선순위 변경

`getPrimaryFallbackOrder()`와 `parseFreeFallbackOrderFromEnv()`의 기본값을 업데이트:

```typescript
// getPrimaryFallbackOrder() 내 gemma4 case 추가:
if (primary === 'gemma4') return ['groq', 'gemini', 'openclaw', 'claude', 'openai', 'local'];

// parseFreeFallbackOrderFromEnv() 기본값 변경:
// 변경 전: ['openclaw', 'groq', 'gemini', 'local', 'openai']
// 변경 후: ['gemma4', 'openclaw', 'groq', 'gemini', 'local', 'openai']
```

- `LLM_PROVIDER` 환경변수 기본값을 `'gemma4'`로 설정
- Gemma4 Rate Limit 시 → Groq (다른 API) → Gemini Flash (같은 API지만 다른 모델) → (유료 폴백)

#### 2-3b. `lib/env.ts` — 환경변수 검증

`getMissingEnvKeys()` 함수에 gemma4 case 추가:

```typescript
case 'gemma4':
  if (!process.env.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
  break;
```

#### 2-4. `lib/pipeline.ts` — 역할별 모델 힌트 변경

```typescript
// 변경 전
const ROLE_MODEL_HINTS: Partial<Record<MeetingRole, RuntimeConfig['llmProvider']>> = {
  [MR.PM]: 'openai',
  [MR.STRATEGIST]: 'openai',
  [MR.CONTENT_DIRECTOR]: 'claude',
  [MR.PERFORMANCE_MARKETER]: 'gemini',
  [MR.OPERATIONS_MANAGER]: 'groq'
};

// 변경 후 — 모든 역할이 기본적으로 gemma4 사용
const ROLE_MODEL_HINTS: Partial<Record<MeetingRole, RuntimeConfig['llmProvider']>> = {
  [MR.PM]: 'gemma4',
  [MR.STRATEGIST]: 'gemma4',
  [MR.CONTENT_DIRECTOR]: 'gemma4',
  [MR.PERFORMANCE_MARKETER]: 'gemma4',
  [MR.OPERATIONS_MANAGER]: 'gemma4'
};
```

- 모든 에이전트 역할이 Gemma4를 기본으로 사용
- Rate Limit 시 자동으로 폴백 체인을 탐

#### 2-5. Flow Builder 타입 확장

**`lib/flow/types.ts`:**

```typescript
// 변경 전
model: 'claude' | 'gemini' | 'gpt' | 'groq'

// 변경 후
model: 'claude' | 'gemini' | 'gpt' | 'groq' | 'gemma4'
```

**`lib/flow/runner.ts`:**

```typescript
const MODEL_RUNTIME: Record<AgentNode['data']['model'], Partial<RuntimeConfig>> = {
  claude:  { llmProvider: 'claude' },
  gemini:  { llmProvider: 'gemini' },
  gpt:     { llmProvider: 'openai' },
  groq:    { llmProvider: 'groq' },
  gemma4:  { llmProvider: 'gemma4' },   // 추가
}
```

**`app/(domains)/flow/[id]/components/nodes/AgentNode.tsx`:**

```typescript
const MODEL_COLOR: Record<AgentNode['data']['model'], string> = {
  claude: 'bg-purple-500',
  gemini: 'bg-blue-500',
  gpt: 'bg-green-500',
  groq: 'bg-orange-500',
  gemma4: 'bg-red-500',   // 추가 — Google Red 계열
}
```

**`app/(domains)/flow/[id]/components/NodeConfigPanel.tsx`:**

```typescript
const MODEL_OPTIONS: AgentNode['data']['model'][] = ['gemma4', 'claude', 'gemini', 'gpt', 'groq']
// gemma4를 첫 번째로 배치
```

**`app/(domains)/flow/[id]/components/NodePalette.tsx`:**

```typescript
// addAgent 기본 모델을 gemma4로 변경
data: { role, agentKey, model: 'gemma4', systemPrompt },
```

---

## 영향 범위 요약

### 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `middleware.ts` (신규) | `/` → `/operations` 리다이렉트 |
| `app/(shell)/page.tsx` → `app/(shell)/shell/page.tsx` | 경로 이동 |
| `components/app-nav.tsx` | href `/` → `/shell`, 레이블 변경 |
| `lib/types.ts` | `llmProvider`에 `'gemma4'` 추가, `gemma4Model` 필드 |
| `lib/llm.ts` | `LlmProvider` 타입, `normalizeProvider()`, `providerLabel()`, `hasConfig()`, `runByProvider()`, `streamByProvider()`, `shouldTryFallback()`, `getPrimaryFallbackOrder()`, `parseFreeFallbackOrderFromEnv()`, `callGeminiCompatibleApi()` 공유 함수 추출, `runGemma4()`, `streamGemma4()`, `mapGemma4HttpError()` |
| `lib/env.ts` | `getMissingEnvKeys()`에 gemma4 case 추가 |
| `lib/pipeline.ts` | `ROLE_MODEL_HINTS` 기본값 → `'gemma4'` |
| `lib/flow/types.ts` | AgentNode model 유니온에 `'gemma4'` |
| `lib/flow/runner.ts` | `MODEL_RUNTIME`에 gemma4 매핑 |
| `app/(domains)/flow/[id]/components/nodes/AgentNode.tsx` | gemma4 뱃지 색상 |
| `app/(domains)/flow/[id]/components/NodeConfigPanel.tsx` | 모델 옵션에 gemma4 추가 |
| `app/(domains)/flow/[id]/components/NodePalette.tsx` | 기본 모델 gemma4 |
| `.env` / `.env.example` | `GEMMA4_MODEL` 환경변수 |

### 변경하지 않는 것

- Agent Shell UI (SystemBar, Canvas, CommandBar) — 그대로 유지
- 검색 프로바이더 (Serper/Brave/Naver) — 변경 없음
- 기존 API route 로직 — 변경 없음
- Supabase 인증 — 변경 없음
- 이미지 생성 (Gemini Flash Image) — 변경 없음

---

## 테스트 계획

1. **라우팅:** 브라우저에서 `/` 접속 → `/operations`로 리다이렉트 확인
2. **Shell 접근:** `/shell` 접속 → Agent Shell 화면 정상 표시 확인
3. **네비:** 사이드바 "에이전트 셸" 클릭 → `/shell`로 이동 확인
4. **Gemma4 LLM:** API 호출 시 Gemma4 모델로 요청 전송 확인
5. **폴백:** Gemma4 Rate Limit 시 Groq/Gemini로 자동 전환 확인
6. **Flow Builder:** 노드 생성 시 기본 모델이 gemma4인지 확인
7. **기존 테스트:** `npx vitest run` — 모든 기존 테스트 통과 확인
