# Garnet Phase 1 고도화 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garnet의 검색·LLM·MCP 기반을 확장하여 한국 마케팅 특화 품질을 높이고 장애 내성을 확보한다.

**Architecture:** `lib/search.ts`에 Brave Search + 네이버 검색 provider를 fallback 체인으로 추가하고, `lib/llm.ts`에 Anthropic Claude provider를 추가한다. `lib/types.ts`의 `RuntimeConfig`와 `lib/env.ts`의 검증 로직도 함께 확장한다. 설정 UI와 API route의 provider enum도 업데이트한다.

**Tech Stack:** Next.js 15, TypeScript, @anthropic-ai/sdk, Naver Open API, Brave Search API

---

## Chunk 1: 검색 Provider 확장 (Brave + 네이버)

### Task 1: lib/search.ts — Brave Search provider 추가

**Files:**
- Modify: `lib/search.ts:5-11` (타입 추가)
- Modify: `lib/search.ts:516-535` (provider 분기 + fetchRows)
- Modify: `lib/types.ts:105` (searchProvider 타입 확장)
- Modify: `lib/env.ts:27-29` (getSearchProvider 확장)

- [ ] **Step 1: `lib/types.ts` — searchProvider 타입 확장**

```typescript
// 변경 전
searchProvider?: 'serper';
// 변경 후
searchProvider?: 'serper' | 'brave' | 'naver';
```

- [ ] **Step 2: `lib/env.ts` — getSearchProvider 확장**

```typescript
export function getSearchProvider() {
  return (process.env.SEARCH_PROVIDER || 'serper').toLowerCase();
}
```
변경 불필요 — 이미 문자열을 반환하므로 타입만 맞추면 됨.

- [ ] **Step 3: `lib/search.ts` — Brave Search fetchRows 함수 추가**

`fetchRows` 함수 아래에 추가:

```typescript
async function fetchBraveRows(query: string, braveApiKey: string) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=16&search_lang=ko&country=kr`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': braveApiKey
    }
  });
  if (!response.ok) {
    throw new Error(`Brave Search failed (${response.status})`);
  }
  const json = await response.json() as {
    web?: { results?: Array<{ title?: string; description?: string; url?: string }> };
  };
  return (json.web?.results || []).map((r) => ({
    title: r.title,
    snippet: r.description,
    link: r.url
  }));
}
```

- [ ] **Step 4: `lib/search.ts` — 네이버 검색 fetchRows 함수 추가**

```typescript
async function fetchNaverRows(query: string, clientId: string, clientSecret: string) {
  const blogUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=8&sort=sim`;
  const newsUrl = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=8&sort=sim`;
  const headers = {
    'X-Naver-Client-Id': clientId,
    'X-Naver-Client-Secret': clientSecret
  };

  const [blogRes, newsRes] = await Promise.allSettled([
    fetch(blogUrl, { headers }),
    fetch(newsUrl, { headers })
  ]);

  const rows: Array<{ title?: string; snippet?: string; link?: string }> = [];

  for (const res of [blogRes, newsRes]) {
    if (res.status === 'fulfilled' && res.value.ok) {
      const json = await res.value.json() as {
        items?: Array<{ title?: string; description?: string; link?: string }>;
      };
      for (const item of json.items || []) {
        rows.push({
          title: (item.title || '').replace(/<[^>]*>/g, ''),
          snippet: (item.description || '').replace(/<[^>]*>/g, ''),
          link: item.link
        });
      }
    }
  }
  return rows;
}
```

- [ ] **Step 5: `lib/search.ts` — runWebSearchWithRuntime에 fallback 체인 적용**

`runWebSearchWithRuntime` 함수 내부, 기존 `if (provider !== 'serper')` 블록을 제거하고 fallback 로직으로 교체:

```typescript
// 기존 코드 제거:
// if (provider !== 'serper') {
//   throw new Error(`Unsupported provider: ${provider}. Set SEARCH_PROVIDER=serper`);
// }

const braveApiKey = process.env.BRAVE_SEARCH_API_KEY || '';
const naverClientId = process.env.NAVER_CLIENT_ID || '';
const naverClientSecret = process.env.NAVER_CLIENT_SECRET || '';

async function fetchRowsWithFallback(query: string) {
  // 1차: 설정된 primary provider
  if (provider === 'serper' && apiKey) {
    try { return await fetchRows(query); } catch { /* fallthrough */ }
  }
  if (provider === 'brave' && braveApiKey) {
    try { return await fetchBraveRows(query, braveApiKey); } catch { /* fallthrough */ }
  }
  if (provider === 'naver' && naverClientId) {
    try { return await fetchNaverRows(query, naverClientId, naverClientSecret); } catch { /* fallthrough */ }
  }

  // 2차: fallback 순서 (serper → brave → naver)
  if (provider !== 'serper' && apiKey) {
    try { return await fetchRows(query); } catch { /* fallthrough */ }
  }
  if (provider !== 'brave' && braveApiKey) {
    try { return await fetchBraveRows(query, braveApiKey); } catch { /* fallthrough */ }
  }
  if (provider !== 'naver' && naverClientId) {
    try { return await fetchNaverRows(query, naverClientId, naverClientSecret); } catch { /* fallthrough */ }
  }

  return [];
}
```

그리고 기존 `for (const q of queries)` 루프에서 `fetchRows(q)`를 `fetchRowsWithFallback(q)`로 교체.

- [ ] **Step 6: `.env`에 새 환경변수 추가**

```env
# Brave Search
BRAVE_SEARCH_API_KEY=

# Naver Search
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
```

- [ ] **Step 7: API route의 searchProvider enum 업데이트**

수정 대상 파일 3개:
- `app/api/run/route.ts:41` — `z.enum(['serper'])` → `z.enum(['serper', 'brave', 'naver'])`
- `app/api/seminar/sessions/route.ts:30` — 동일 변경
- `app/api/search/test/route.ts:20` — 동일 변경

- [ ] **Step 8: `app/page.tsx:356` — 하드코딩된 searchProvider 제거**

```typescript
// 변경 전
searchProvider: 'serper' as const,
// 변경 후
searchProvider: (process.env.SEARCH_PROVIDER || 'serper') as RuntimeConfig['searchProvider'],
```

`app/seminar/page.tsx:158`도 동일하게 변경.

- [ ] **Step 9: Commit**

```bash
git add lib/search.ts lib/types.ts lib/env.ts app/api/run/route.ts app/api/seminar/sessions/route.ts app/api/search/test/route.ts app/page.tsx app/seminar/page.tsx .env
git commit -m "feat(search): add Brave Search + Naver fallback providers"
```

---

### Task 2: lib/llm.ts — Anthropic Claude provider 추가

**Files:**
- Modify: `lib/llm.ts:9` (LlmProvider 타입)
- Modify: `lib/llm.ts:37-41` (상수 추가)
- Modify: `lib/llm.ts:54-58` (normalizeProvider)
- Modify: `lib/llm.ts:69-75` (providerLabel)
- Modify: `lib/llm.ts:281-301` (hasConfig)
- Modify: `lib/llm.ts:303-309` (fallback order)
- Modify: `lib/llm.ts:627-639` (runByProvider)
- Modify: `lib/types.ts:93` (RuntimeConfig llmProvider)

- [ ] **Step 1: `@anthropic-ai/sdk` 설치**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: `lib/types.ts:93` — llmProvider에 claude 추가**

```typescript
// 변경 전
llmProvider?: 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw';
// 변경 후
llmProvider?: 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw' | 'claude';
```

RuntimeConfig에 claude 전용 필드 추가 (openclawAgent 아래):
```typescript
anthropicApiKey?: string;
anthropicModel?: string;
```

- [ ] **Step 3: `lib/llm.ts:1-9` — import + LlmProvider 타입 확장**

import 추가:
```typescript
import Anthropic from '@anthropic-ai/sdk';
```

LlmProvider 타입 변경:
```typescript
type LlmProvider = 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw' | 'claude';
```

- [ ] **Step 4: `lib/llm.ts` — 상수, normalizeProvider, providerLabel 업데이트**

상수 추가 (OPENCLAW_DEFAULT_AGENT 아래):
```typescript
const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-4-5-20250514';
```

normalizeProvider에 claude 분기 추가:
```typescript
function normalizeProvider(raw?: string): LlmProvider {
  const value = (raw || '').trim().toLowerCase();
  if (value === 'gemini' || value === 'groq' || value === 'local' || value === 'openclaw' || value === 'claude') return value;
  return 'openai';
}
```

providerLabel에 추가:
```typescript
if (provider === 'claude') return 'Claude';
```

- [ ] **Step 5: `lib/llm.ts` — mapClaudeError + runClaude 함수 작성**

runGroq 함수 아래, runLocal 함수 위에 추가:

```typescript
function mapClaudeError(error: unknown): ProviderError {
  const e = error as { status?: number; message?: string; error?: { type?: string } };
  const status = Number(e?.status || 0);
  const message = String(e?.message || '');
  const errorType = String(e?.error?.type || '');

  if (status === 401 || status === 403) {
    return new ProviderError('claude', 'AUTH', 'Claude API 키 인증에 실패했습니다.', message);
  }
  if (status === 429 && errorType === 'rate_limit_error') {
    return new ProviderError('claude', 'RATE_LIMIT', 'Claude 요청 한도가 일시적으로 초과되었습니다.', message);
  }
  if (status === 429) {
    return new ProviderError('claude', 'QUOTA', 'Claude 할당량이 초과되었습니다.', message);
  }
  if (status >= 500) {
    return new ProviderError('claude', 'UNAVAILABLE', 'Claude 서버 응답이 불안정합니다.', message);
  }
  if (message.toLowerCase().includes('context')) {
    return new ProviderError('claude', 'CONTEXT', 'Claude 모델 컨텍스트 한도를 초과했습니다.', message);
  }
  return new ProviderError('claude', 'UNKNOWN', `Claude 오류: ${compact(message || '실행 실패')}`, message);
}

async function runClaude(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
  runtime?: RuntimeConfig
) {
  const apiKey = pickValue(runtime?.anthropicApiKey, process.env.ANTHROPIC_API_KEY);
  const model = pickValue(runtime?.anthropicModel, process.env.ANTHROPIC_MODEL, CLAUDE_DEFAULT_MODEL);
  if (!apiKey) {
    throw new ProviderError('claude', 'MISSING_CONFIG', 'ANTHROPIC_API_KEY가 없습니다.');
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!text) {
      throw new ProviderError('claude', 'UNKNOWN', 'Claude 응답이 비어 있습니다.');
    }
    return text;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw mapClaudeError(error);
  }
}
```

- [ ] **Step 6: `lib/llm.ts` — hasConfig에 claude 분기 추가**

```typescript
if (provider === 'claude') {
  return hasValue(pickValue(runtime?.anthropicApiKey, process.env.ANTHROPIC_API_KEY));
}
```

- [ ] **Step 7: `lib/llm.ts` — fallback order에 claude 추가**

`getPrimaryFallbackOrder` 함수 업데이트:
```typescript
function getPrimaryFallbackOrder(primary: LlmProvider) {
  if (primary === 'openclaw') return ['gemini', 'groq', 'claude', 'openai', 'local'] as LlmProvider[];
  if (primary === 'gemini') return ['groq', 'claude', 'openclaw', 'openai', 'local'] as LlmProvider[];
  if (primary === 'groq') return ['gemini', 'claude', 'openai', 'openclaw', 'local'] as LlmProvider[];
  if (primary === 'openai') return ['claude', 'groq', 'gemini', 'openclaw', 'local'] as LlmProvider[];
  if (primary === 'claude') return ['openai', 'gemini', 'groq', 'openclaw', 'local'] as LlmProvider[];
  return ['openclaw', 'groq', 'gemini', 'claude', 'openai'] as LlmProvider[];
}
```

- [ ] **Step 8: `lib/llm.ts:627-639` — runByProvider에 claude 분기 추가**

```typescript
if (provider === 'claude') return runClaude(systemPrompt, userPrompt, temperature, maxTokens, runtime);
```

- [ ] **Step 9: `lib/env.ts` — getMissingEnvKeys에 claude 분기 추가**

```typescript
} else if (provider === 'claude') {
  if (!process.env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');
```

- [ ] **Step 10: `.env`에 Claude 환경변수 추가**

```env
# Anthropic Claude
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5-20250514
```

- [ ] **Step 11: 설정 UI에서 Claude provider 선택 가능하도록 확인**

`app/settings/page.tsx`에서 LLM provider 드롭다운에 claude 옵션이 표시되는지 확인. RuntimeConfig 타입 변경으로 자동 반영되지 않으면 수동 추가 필요.

- [ ] **Step 12: Commit**

```bash
git add lib/llm.ts lib/types.ts lib/env.ts .env package.json package-lock.json app/settings/page.tsx
git commit -m "feat(llm): add Anthropic Claude as 6th LLM provider with fallback support"
```

---

## Chunk 2: MCP 레지스트리 확장 + 디자인 토큰

### Task 3: MCP 레지스트리에 Brave Search MCP 프리셋 활성화 확인

**Files:**
- Review: `lib/mcp-connections.ts:294` (brave-search 이미 등록됨)

- [ ] **Step 1: 현재 상태 확인**

`lib/mcp-connections.ts`에 `brave-search` 커넥터가 이미 Phase 1, scope: research로 등록되어 있음. 추가 코드 변경 불필요.

- [ ] **Step 2: MCP Hub UI에서 Brave Search 토큰 입력 가능 확인**

`app/settings/page.tsx`의 MCP Hub에서 brave-search 커넥터를 찾아 bearer token 입력 필드가 동작하는지 확인.

---

### Task 4: 디자인 토큰 — status badge 색상 토큰화

**Files:**
- Modify: `app/globals.css` (CSS 변수 추가)
- Modify: 상태 배지 사용 페이지들 (하드코딩 → CSS 변수)

- [ ] **Step 1: `app/globals.css`에 상태 배지 CSS 변수 추가**

`:root` 블록에 추가:
```css
/* Status badge tokens */
--status-active: #22c55e;
--status-active-bg: #f0fdf4;
--status-paused: #f59e0b;
--status-paused-bg: #fffbeb;
--status-completed: #3b82f6;
--status-completed-bg: #eff6ff;
--status-draft: #6b7280;
--status-draft-bg: #f9fafb;
--status-failed: #ef4444;
--status-failed-bg: #fef2f2;
```

- [ ] **Step 2: 각 페이지에서 하드코딩된 상태 색상을 CSS 변수로 교체**

대상 파일에서 `bg-green-`, `bg-yellow-`, `bg-blue-`, `text-green-` 등 상태 관련 하드코딩을 찾아 Tailwind의 arbitrary value로 교체:

```tsx
// 변경 전
className="bg-green-100 text-green-700"
// 변경 후
className="bg-[var(--status-active-bg)] text-[var(--status-active)]"
```

주요 대상:
- `app/campaigns/page.tsx` (ACTIVE/PAUSED/COMPLETED)
- `app/learning/page.tsx` (DRAFT/CONFIRMED/ARCHIVED)
- `app/operations/page.tsx` (승인 상태)
- `app/runs/[id]/page.tsx` (실행 상태)
- `app/sns/personas/page.tsx` (페르소나 상태)
- `app/goals/page.tsx` (KPI 달성 상태)

- [ ] **Step 3: Commit**

```bash
git add app/globals.css app/campaigns/page.tsx app/learning/page.tsx app/operations/page.tsx app/goals/page.tsx
git commit -m "refactor(design): tokenize status badge colors into CSS variables"
```

---

## 실행 순서 요약

| 순서 | Task | 예상 시간 | 의존성 |
|------|------|----------|--------|
| 1 | Task 1: 검색 Provider 확장 | 15분 | 없음 |
| 2 | Task 2: Claude LLM 추가 | 15분 | 없음 |
| 3 | Task 3: MCP 확인 | 2분 | 없음 |
| 4 | Task 4: 디자인 토큰 | 10분 | 없음 |

Task 1~4는 모두 독립적이므로 병렬 실행 가능.
