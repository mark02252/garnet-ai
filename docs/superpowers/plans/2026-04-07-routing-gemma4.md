# 라우팅 개선 + Gemma 4 통합 구현 플랜

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/` 접속 시 `/operations`로 리다이렉트하고, Gemma 4를 최상위 LLM 프로바이더로 추가하여 대부분의 기능이 무료로 동작하도록 한다.

**Architecture:** middleware.ts로 루트 리다이렉트 처리. Agent Shell은 `/shell` 경로로 이동. `lib/llm.ts`에 gemma4 프로바이더를 추가하되, Gemini와 동일한 REST API를 사용하므로 공유 헬퍼 함수를 추출하여 코드 중복을 방지한다.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma (PostgreSQL)

---

## Chunk 1: 라우팅 개선

### Task 1: middleware.ts 생성 + Agent Shell 경로 이동

**Files:**
- Create: `middleware.ts`
- Move: `app/(shell)/page.tsx` → `app/(shell)/shell/page.tsx`
- Modify: `components/app-nav.tsx`

- [ ] **Step 1: Create `middleware.ts`**

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/operations', request.url), { status: 302 })
  }
}

export const config = {
  matcher: '/',
}
```

- [ ] **Step 2: Move Agent Shell page to /shell**

```bash
mkdir -p "app/(shell)/shell"
mv "app/(shell)/page.tsx" "app/(shell)/shell/page.tsx"
```

- [ ] **Step 3: Update app-nav.tsx — change href and label**

In `components/app-nav.tsx`, find line ~250:

```typescript
// 변경 전
{ href: '/', label: '캠페인 스튜디오', icon: <StudioIcon /> },

// 변경 후
{ href: '/shell', label: '에이전트 셸', icon: <StudioIcon /> },
```

- [ ] **Step 4: Verify routing works**

```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add middleware.ts "app/(shell)/" components/app-nav.tsx
git commit -m "feat: redirect / to /operations, move Agent Shell to /shell"
```

---

## Chunk 2: Gemma 4 프로바이더 — Data Layer

### Task 2: lib/types.ts — llmProvider 타입 확장

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add 'gemma4' to llmProvider union and gemma4Model field**

In `lib/types.ts`, find the `llmProvider` field in `RuntimeConfig`:

```typescript
// 변경 전
llmProvider?: 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw' | 'claude';

// 변경 후
llmProvider?: 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw' | 'claude' | 'gemma4';
```

Also add `gemma4Model` field after the existing `geminiModel` field:

```typescript
gemma4Model?: string;
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add gemma4 to llmProvider union type"
```

---

### Task 3: lib/llm.ts — Gemma4 프로바이더 전체 구현

**Files:**
- Modify: `lib/llm.ts`

이 태스크는 `lib/llm.ts` 내 여러 함수를 수정하는 대형 태스크이다. 순서대로 모든 등록 지점을 업데이트한다.

- [ ] **Step 1: Add GEMMA4_DEFAULT_MODEL constant and update LlmProvider type (line 10)**

```typescript
// line 10: 변경 전
type LlmProvider = 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw' | 'claude';

// line 10: 변경 후
type LlmProvider = 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw' | 'claude' | 'gemma4';
```

After line 42 (`CLAUDE_DEFAULT_MODEL`), add:

```typescript
const GEMMA4_DEFAULT_MODEL = 'gemma-4-31b-it';
```

- [ ] **Step 2: Update normalizeProvider() (line 56-59)**

```typescript
// 변경 전
if (value === 'gemini' || value === 'groq' || value === 'local' || value === 'openclaw' || value === 'claude') return value;

// 변경 후
if (value === 'gemini' || value === 'groq' || value === 'local' || value === 'openclaw' || value === 'claude' || value === 'gemma4') return value;
```

- [ ] **Step 3: Update providerLabel() (line 71-78)**

Add before the `return 'OpenClaw';` line:

```typescript
if (provider === 'gemma4') return 'Gemma 4';
```

- [ ] **Step 4: Update hasConfig() (line 284-307)**

Add before the final `return true;` (line 306):

```typescript
if (provider === 'gemma4') {
  return (
    hasValue(pickValue(runtime?.geminiApiKey, process.env.GEMINI_API_KEY)) &&
    hasValue(pickValue(runtime?.gemma4Model, process.env.GEMMA4_MODEL, GEMMA4_DEFAULT_MODEL))
  );
}
```

- [ ] **Step 5: Update getPrimaryFallbackOrder() (line 309-316)**

Add at the top of the function (before the first `if`):

```typescript
if (primary === 'gemma4') return ['groq', 'gemini', 'openclaw', 'claude', 'openai', 'local'] as LlmProvider[];
```

Also add `'gemma4'` to each existing provider's fallback array at an appropriate position. For example, for `openclaw` line 310:

```typescript
// 변경 전
if (primary === 'openclaw') return ['gemini', 'groq', 'claude', 'openai', 'local'] as LlmProvider[];
// 변경 후
if (primary === 'openclaw') return ['gemma4', 'gemini', 'groq', 'claude', 'openai', 'local'] as LlmProvider[];
```

Update all other providers (주의: gemini와 gemma4는 Rate Limit 공유하므로 gemini 폴백에서 gemma4는 groq 뒤에 배치):

```typescript
if (primary === 'gemma4') return ['groq', 'gemini', 'openclaw', 'claude', 'openai', 'local'] as LlmProvider[];
if (primary === 'openclaw') return ['gemma4', 'gemini', 'groq', 'claude', 'openai', 'local'] as LlmProvider[];
if (primary === 'gemini') return ['groq', 'gemma4', 'claude', 'openclaw', 'openai', 'local'] as LlmProvider[];  // gemma4는 groq 뒤 (Rate Limit 공유)
if (primary === 'groq') return ['gemma4', 'gemini', 'claude', 'openai', 'openclaw', 'local'] as LlmProvider[];
if (primary === 'openai') return ['gemma4', 'claude', 'groq', 'gemini', 'openclaw', 'local'] as LlmProvider[];
if (primary === 'claude') return ['gemma4', 'openai', 'gemini', 'groq', 'openclaw', 'local'] as LlmProvider[];
return ['gemma4', 'openclaw', 'groq', 'gemini', 'claude', 'openai'] as LlmProvider[];
```

- [ ] **Step 6: Update parseFreeFallbackOrderFromEnv() default (line 333)**

```typescript
// 변경 전
return ['openclaw', 'groq', 'gemini', 'local', 'openai']

// 변경 후
return ['gemma4', 'openclaw', 'groq', 'gemini', 'local', 'openai']
```

- [ ] **Step 7: Extract shared callGeminiCompatibleApi() and create runGemma4()**

Refactor `runGemini()` (lines 398-454) into a shared helper + wrapper. Insert the helper before `runGemini()`:

```typescript
async function callGeminiCompatibleApi(
  provider: 'gemini' | 'gemma4',
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens }
    })
  });

  if (!response.ok) {
    const rawText = await response.text();
    throw mapGeminiCompatibleHttpError(provider, response.status, rawText);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || '')
    .join('\n')
    .trim();
  if (!text) {
    throw new ProviderError(provider, 'UNKNOWN', `${providerLabel(provider)} 응답이 비어 있습니다.`);
  }
  return text;
}
```

Also add the shared error mapper (rename `mapGeminiHttpError` to call it):

```typescript
function mapGeminiCompatibleHttpError(provider: 'gemini' | 'gemma4', status: number, rawText: string): ProviderError {
  const lower = rawText.toLowerCase();
  const label = providerLabel(provider);
  if (status === 401 || status === 403) {
    return new ProviderError(provider, 'AUTH', `${label} API 키 인증에 실패했습니다.`, rawText);
  }
  if (status === 429 || isGeminiQuota(rawText)) {
    return new ProviderError(provider, 'QUOTA', `${label} 할당량이 초과되었습니다.`, rawText);
  }
  if (status === 404 || lower.includes('not found')) {
    return new ProviderError(provider, 'MODEL', `${label} 모델명을 찾지 못했습니다.`, rawText);
  }
  if (status >= 500) {
    return new ProviderError(provider, 'UNAVAILABLE', `${label} 서버 응답이 불안정합니다.`, rawText);
  }
  return new ProviderError(provider, 'UNKNOWN', `${label} 오류(${status}): ${compact(rawText || '실행 실패')}`, rawText);
}
```

Then update `mapGeminiHttpError` to delegate:

```typescript
function mapGeminiHttpError(status: number, rawText: string): ProviderError {
  return mapGeminiCompatibleHttpError('gemini', status, rawText);
}
```

Refactor `runGemini()` to use the shared helper:

```typescript
async function runGemini(
  systemPrompt: string, userPrompt: string, temperature: number, maxTokens: number, runtime?: RuntimeConfig
) {
  const apiKey = pickValue(runtime?.geminiApiKey, process.env.GEMINI_API_KEY);
  const model = pickValue(runtime?.geminiModel, process.env.GEMINI_MODEL, GEMINI_DEFAULT_MODEL);
  if (!apiKey) throw new ProviderError('gemini', 'MISSING_CONFIG', 'Gemini API 키가 없습니다.');
  if (!model) throw new ProviderError('gemini', 'MISSING_CONFIG', 'Gemini 모델명이 없습니다.');
  return callGeminiCompatibleApi('gemini', apiKey, model, systemPrompt, userPrompt, temperature, maxTokens);
}
```

Add `runGemma4()` right after:

```typescript
async function runGemma4(
  systemPrompt: string, userPrompt: string, temperature: number, maxTokens: number, runtime?: RuntimeConfig
) {
  const apiKey = pickValue(runtime?.geminiApiKey, process.env.GEMINI_API_KEY);
  const model = pickValue(runtime?.gemma4Model, process.env.GEMMA4_MODEL, GEMMA4_DEFAULT_MODEL);
  if (!apiKey) throw new ProviderError('gemma4', 'MISSING_CONFIG', 'Gemma 4 API 키(GEMINI_API_KEY)가 없습니다.');
  return callGeminiCompatibleApi('gemma4', apiKey, model, systemPrompt, userPrompt, temperature, maxTokens);
}
```

- [ ] **Step 8: Extract shared streamGeminiCompatibleApi() and create streamGemma4()**

Same pattern as Step 7 but for streaming. Extract from `streamGemini()` (lines 848-910):

```typescript
async function* streamGeminiCompatibleApi(
  provider: 'gemini' | 'gemma4',
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number
): AsyncGenerator<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens }
    })
  });

  if (!response.ok) {
    const rawText = await response.text();
    throw mapGeminiCompatibleHttpError(provider, response.status, rawText);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError(provider, 'UNKNOWN', `${providerLabel(provider)} 스트림을 열 수 없습니다.`);

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(jsonStr) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        // 기존 streamGemini() 동작 유지: 첫 번째 candidate의 첫 번째 part만 추출
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch { /* skip */ }
    }
  }
}
```

Refactor `streamGemini()` and add `streamGemma4()`:

```typescript
async function* streamGemini(
  systemPrompt: string, userPrompt: string, temperature: number, maxTokens: number, runtime?: RuntimeConfig
): AsyncGenerator<string> {
  const apiKey = pickValue(runtime?.geminiApiKey, process.env.GEMINI_API_KEY);
  const model = pickValue(runtime?.geminiModel, process.env.GEMINI_MODEL, GEMINI_DEFAULT_MODEL);
  if (!apiKey) throw new ProviderError('gemini', 'MISSING_CONFIG', 'Gemini API 키가 없습니다.');
  yield* streamGeminiCompatibleApi('gemini', apiKey, model, systemPrompt, userPrompt, temperature, maxTokens);
}

async function* streamGemma4(
  systemPrompt: string, userPrompt: string, temperature: number, maxTokens: number, runtime?: RuntimeConfig
): AsyncGenerator<string> {
  const apiKey = pickValue(runtime?.geminiApiKey, process.env.GEMINI_API_KEY);
  const model = pickValue(runtime?.gemma4Model, process.env.GEMMA4_MODEL, GEMMA4_DEFAULT_MODEL);
  if (!apiKey) throw new ProviderError('gemma4', 'MISSING_CONFIG', 'Gemma 4 API 키(GEMINI_API_KEY)가 없습니다.');
  yield* streamGeminiCompatibleApi('gemma4', apiKey, model, systemPrompt, userPrompt, temperature, maxTokens);
}
```

- [ ] **Step 9: Update runByProvider() (line 698-712)**

Add before the final `return runOpenClaw(...)`:

```typescript
if (provider === 'gemma4') return runGemma4(systemPrompt, userPrompt, temperature, maxTokens, runtime);
```

- [ ] **Step 10: Update isGeminiQuotaError() (line 758) and quota fallback logic (line 766)**

Gemma4와 Gemini는 같은 API 키를 사용하므로 quota 에러도 공유됨:

```typescript
// line 758: 변경 전
function isGeminiQuotaError(error: ProviderError) {
  return error.provider === 'gemini' && (error.code === 'QUOTA' || error.code === 'RATE_LIMIT');
}

// line 758: 변경 후
function isGeminiQuotaError(error: ProviderError) {
  return (error.provider === 'gemini' || error.provider === 'gemma4') && (error.code === 'QUOTA' || error.code === 'RATE_LIMIT');
}
```

Also update line 766 in `buildFallbackProviders()`:

```typescript
// 변경 전
if (primary === 'gemini' && primaryError && isGeminiQuotaError(primaryError) && ...

// 변경 후
if ((primary === 'gemini' || primary === 'gemma4') && primaryError && isGeminiQuotaError(primaryError) && ...
```

- [ ] **Step 11: Update shouldTryFallback() (line 722)**

```typescript
// 변경 전
if ((primary === 'gemini' || primary === 'groq') && error.code === 'CONTEXT') return true;

// 변경 후
if ((primary === 'gemini' || primary === 'groq' || primary === 'gemma4') && error.code === 'CONTEXT') return true;
```

- [ ] **Step 12: Update resolveProvider() default (line 63)**

시스템 기본 프로바이더를 gemma4로 변경:

```typescript
// 변경 전
return normalizeProvider(runtime?.llmProvider || process.env.LLM_PROVIDER || 'openai');

// 변경 후
return normalizeProvider(runtime?.llmProvider || process.env.LLM_PROVIDER || 'gemma4');
```

- [ ] **Step 13: Update streamByProvider() (line 998-1012)**

Add before the `// local / openclaw` comment:

```typescript
if (provider === 'gemma4') return streamGemma4(systemPrompt, userPrompt, temperature, maxTokens, runtime);
```

- [ ] **Step 14: Run tests**

```bash
cd "/Users/rnr/Documents/New project" && npx vitest run 2>&1 | tail -10
```

Expected: All tests PASS

- [ ] **Step 15: Verify TypeScript compiles**

```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 16: Commit**

```bash
git add lib/llm.ts
git commit -m "feat: add gemma4 LLM provider with shared Gemini-compatible API helper"
```

---

### Task 4: lib/env.ts + lib/pipeline.ts — 환경변수 검증 + 역할 힌트 변경

**Files:**
- Modify: `lib/env.ts`
- Modify: `lib/pipeline.ts`

- [ ] **Step 1: Update lib/env.ts — add gemma4 case + update default**

In `getLLMProvider()` (line 2), update default to match `resolveProvider()`:

```typescript
// 변경 전
return (process.env.LLM_PROVIDER || 'openai').toLowerCase();

// 변경 후
return (process.env.LLM_PROVIDER || 'gemma4').toLowerCase();
```

In `getMissingEnvKeys()`, add before the `else` clause (before line 21):

```typescript
} else if (provider === 'gemma4') {
  if (!process.env.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
```

- [ ] **Step 2: Update lib/pipeline.ts — change ROLE_MODEL_HINTS**

```typescript
// 변경 전 (line 17-22)
const ROLE_MODEL_HINTS: Partial<Record<MeetingRole, RuntimeConfig['llmProvider']>> = {
  [MR.PM]: 'openai',
  [MR.STRATEGIST]: 'openai',
  [MR.CONTENT_DIRECTOR]: 'claude',
  [MR.PERFORMANCE_MARKETER]: 'gemini',
  [MR.OPERATIONS_MANAGER]: 'groq'
};

// 변경 후
const ROLE_MODEL_HINTS: Partial<Record<MeetingRole, RuntimeConfig['llmProvider']>> = {
  [MR.PM]: 'gemma4',
  [MR.STRATEGIST]: 'gemma4',
  [MR.CONTENT_DIRECTOR]: 'gemma4',
  [MR.PERFORMANCE_MARKETER]: 'gemma4',
  [MR.OPERATIONS_MANAGER]: 'gemma4'
};
```

- [ ] **Step 3: Commit**

```bash
git add lib/env.ts lib/pipeline.ts
git commit -m "feat: set gemma4 as default provider for all agent roles"
```

---

## Chunk 3: Flow Builder Gemma4 지원 + 환경변수

### Task 5: Flow Builder 타입/컴포넌트에 gemma4 추가

**Files:**
- Modify: `lib/flow/types.ts`
- Modify: `lib/flow/runner.ts`
- Modify: `app/(domains)/flow/[id]/components/nodes/AgentNode.tsx`
- Modify: `app/(domains)/flow/[id]/components/NodeConfigPanel.tsx`
- Modify: `app/(domains)/flow/[id]/components/NodePalette.tsx`

- [ ] **Step 1: Update lib/flow/types.ts — add gemma4 to model union**

```typescript
// 변경 전
model: 'claude' | 'gemini' | 'gpt' | 'groq'

// 변경 후
model: 'claude' | 'gemini' | 'gpt' | 'groq' | 'gemma4'
```

- [ ] **Step 2: Update lib/flow/runner.ts — add gemma4 to MODEL_RUNTIME**

```typescript
// 기존 매핑에 추가
gemma4: { llmProvider: 'gemma4' },
```

- [ ] **Step 3: Update AgentNode.tsx — add gemma4 badge color**

```typescript
// MODEL_COLOR에 추가
gemma4: 'bg-red-500',
```

- [ ] **Step 4: Update NodeConfigPanel.tsx — add gemma4 to MODEL_OPTIONS (first position)**

```typescript
const MODEL_OPTIONS: AgentNode['data']['model'][] = ['gemma4', 'claude', 'gemini', 'gpt', 'groq']
```

- [ ] **Step 5: Update NodePalette.tsx — change default model to gemma4**

In `addAgent()` function, change default model:

```typescript
// 변경 전
data: { role, agentKey, model: 'claude', systemPrompt },

// 변경 후
data: { role, agentKey, model: 'gemma4', systemPrompt },
```

- [ ] **Step 6: Run flow tests**

```bash
cd "/Users/rnr/Documents/New project" && npx vitest run lib/flow/ 2>&1 | tail -10
```

Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add lib/flow/types.ts lib/flow/runner.ts "app/(domains)/flow/[id]/components/"
git commit -m "feat(flow): add gemma4 as default model in Flow Builder"
```

---

### Task 6: 환경변수 설정

**Files:**
- Modify: `.env` (또는 `.env.local`)
- Modify: `.env.example` (있으면)

- [ ] **Step 1: Add GEMMA4_MODEL to .env**

```bash
echo 'GEMMA4_MODEL=gemma-4-31b-it' >> .env
```

Also set LLM_PROVIDER to gemma4 if desired:

```bash
# .env에서 LLM_PROVIDER=gemini 을 LLM_PROVIDER=gemma4 로 변경
```

- [ ] **Step 2: Update .env.example if it exists**

Add:

```
GEMMA4_MODEL=gemma-4-31b-it
```

- [ ] **Step 3: Commit (only .env.example, never .env)**

```bash
git add .env.example 2>/dev/null || true
git commit -m "docs: add GEMMA4_MODEL to env example" --allow-empty
```

---

## Final Verification

- [ ] `/` 접속 → `/operations`로 리다이렉트 확인
- [ ] `/shell` 접속 → Agent Shell 화면 정상 표시
- [ ] 사이드바 "에이전트 셸" 클릭 → `/shell` 이동
- [ ] `npx vitest run` — 모든 테스트 통과
- [ ] `npx tsc --noEmit` — TS 오류 없음

```bash
git log --oneline -8
```

Expected output shows all commits from this plan.
