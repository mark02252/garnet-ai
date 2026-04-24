# Agentic MCP Harness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sub-Reasoner가 MCP 도구를 능동적으로 호출하고, 서로 교차 질의하며, MD 파일 하나로 새 도메인에 이식 가능한 Garnet Phase 7 구현

**Architecture:** Tool Harness(캐시+화이트리스트+rate limit) → runLLMWithTools(native function calling) → Sub-Reasoner 2-pass 프로토콜 → A2A ask_expert → Domain Bootstrap

**Tech Stack:** TypeScript, Next.js, Gemini 2.5 Flash (function calling), Groq, Gemma4 (Ollama), YAML (js-yaml)

**Spec:** `docs/superpowers/specs/2026-04-20-agentic-mcp-harness-design.md`

---

## File Structure

```
신규 파일:
  lib/agent-loop/tool-harness.ts        — Tool Harness 코어 (캐시, 화이트리스트, rate limit)
  lib/agent-loop/tool-registry.ts       — 6개 도구 구현체 등록
  lib/agent-loop/tool-types.ts          — 도구 관련 타입 정의
  lib/agent-loop/a2a-protocol.ts        — ask_expert 내부 통신 + 외부 포트
  lib/agent-loop/domain-bootstrap.ts    — company.md → config 자동 생성
  lib/agent-loop/harness-metrics.ts     — 하네스 관측성 메트릭
  config/domain.yaml                    — MONOPLEX 도메인 설정
  config/tools.yaml                     — Sub-Reasoner별 허용 도구
  config/company.md                     — MONOPLEX 비즈니스 컨텍스트

변경 파일:
  lib/llm.ts                            — runLLMWithTools() 추가
  lib/agent-loop/sub-reasoners/index.ts — 2-pass 도구 호출 프로토콜 통합
  lib/agent-loop/sub-reasoners/cro.ts   — tool_calls 지원 프롬프트
  lib/agent-loop/sub-reasoners/analysis.ts
  lib/agent-loop/sub-reasoners/content.ts
  lib/agent-loop/sub-reasoners/strategy.ts
  lib/agent-loop/sub-reasoners/psychology.ts
```

---

## Chunk 1: Tool Harness 코어 + 타입

### Task 1: 도구 타입 정의

**Files:**
- Create: `lib/agent-loop/tool-types.ts`

- [ ] **Step 1: 타입 파일 생성**

```typescript
// lib/agent-loop/tool-types.ts

export type ToolCall = {
  tool: string
  params: Record<string, unknown>
}

export type ToolResult = {
  tool: string
  status: 'ok' | 'error'
  data?: unknown
  error?: string
  message?: string
  latencyMs: number
  cached: boolean
}

export type ToolDeclaration = {
  name: string
  description: string
  parameters: Record<string, {
    type: string
    description: string
    required?: boolean
    enum?: string[]
  }>
}

export type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>

export type HarnessConfig = {
  allowedTools: Record<string, string[]>  // sub-reasoner name → allowed tool names
  maxCallsPerReasoner: number
  maxCallsPerCycle: number
  toolTimeout: number  // ms per tool call
}

export type HarnessMetrics = {
  cycleId: string
  toolCalls: Array<{
    tool: string
    reasoner: string
    latencyMs: number
    cached: boolean
    success: boolean
  }>
  cacheHitRate: number
  rateLimitRejections: number
  askExpertCalls: number
  toolCallParseFailures: number
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-loop/tool-types.ts
git commit -m "feat(phase7): add tool harness type definitions"
```

---

### Task 2: Tool Harness 코어 구현

**Files:**
- Create: `lib/agent-loop/tool-harness.ts`

- [ ] **Step 1: Harness 구현**

```typescript
// lib/agent-loop/tool-harness.ts

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import type { ToolCall, ToolResult, ToolHandler, ToolDeclaration, HarnessConfig, HarnessMetrics } from './tool-types'

const CONFIG_PATH = path.join(process.cwd(), 'config', 'tools.yaml')
const METRICS_PATH = path.join(process.cwd(), '.garnet-config', 'harness-metrics.json')

// ── Canonical JSON for cache keys ──
function canonicalKey(tool: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params).sort().reduce((acc, k) => {
    acc[k] = params[k]
    return acc
  }, {} as Record<string, unknown>)
  return `${tool}:${JSON.stringify(sorted)}`
}

// ── Sliding window rate limiter for external APIs ──
type TokenBucket = { tokens: number; lastRefill: number; maxTokens: number; refillPerMinute: number }

const externalBuckets: Record<string, TokenBucket> = {
  ga4: { tokens: 10, lastRefill: Date.now(), maxTokens: 10, refillPerMinute: 10 },
  web_search: { tokens: 5, lastRefill: Date.now(), maxTokens: 5, refillPerMinute: 5 },
}

function checkExternalRateLimit(tool: string): boolean {
  const bucketKey = tool.startsWith('ga4') ? 'ga4' : tool === 'web_search' ? 'web_search' : null
  if (!bucketKey) return true  // local tools — no limit

  const bucket = externalBuckets[bucketKey]
  const now = Date.now()
  const elapsed = (now - bucket.lastRefill) / 60000  // minutes
  bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + elapsed * bucket.refillPerMinute)
  bucket.lastRefill = now

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1
    return true
  }
  return false
}

// ── Tool Harness Class ──
export class ToolHarness {
  private cache = new Map<string, unknown>()
  private handlers = new Map<string, ToolHandler>()
  private declarations = new Map<string, ToolDeclaration>()
  private config: HarnessConfig
  private cycleCallCount = 0
  private reasonerCallCounts = new Map<string, number>()
  private metrics: HarnessMetrics

  constructor(cycleId: string) {
    this.config = this.loadConfig()
    this.metrics = {
      cycleId,
      toolCalls: [],
      cacheHitRate: 0,
      rateLimitRejections: 0,
      askExpertCalls: 0,
      toolCallParseFailures: 0,
    }
  }

  private loadConfig(): HarnessConfig {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
      const parsed = yaml.load(raw) as Record<string, unknown>
      const subs = (parsed.sub_reasoners || {}) as Record<string, { tools?: string[] }>
      const allowedTools: Record<string, string[]> = {}
      for (const [name, cfg] of Object.entries(subs)) {
        allowedTools[name] = cfg.tools || []
      }
      return {
        allowedTools,
        maxCallsPerReasoner: (parsed.max_calls_per_reasoner as number) || 3,
        maxCallsPerCycle: (parsed.max_calls_per_cycle as number) || 15,
        toolTimeout: (parsed.tool_timeout as number) || 5000,
      }
    } catch {
      // Fallback defaults
      return {
        allowedTools: {},
        maxCallsPerReasoner: 3,
        maxCallsPerCycle: 15,
        toolTimeout: 5000,
      }
    }
  }

  registerTool(declaration: ToolDeclaration, handler: ToolHandler): void {
    this.declarations.set(declaration.name, declaration)
    this.handlers.set(declaration.name, handler)
  }

  getToolDeclarations(reasonerName: string): ToolDeclaration[] {
    const allowed = this.config.allowedTools[reasonerName] || []
    return allowed
      .map(name => this.declarations.get(name))
      .filter((d): d is ToolDeclaration => d !== undefined)
  }

  async execute(reasonerName: string, call: ToolCall): Promise<ToolResult> {
    const start = Date.now()

    // 1. Whitelist check
    const allowed = this.config.allowedTools[reasonerName] || []
    if (!allowed.includes(call.tool)) {
      return { tool: call.tool, status: 'error', error: 'not_allowed', message: `${call.tool}은 ${reasonerName}에 허용되지 않음`, latencyMs: 0, cached: false }
    }

    // 2. Per-reasoner rate limit
    const reasonerCount = this.reasonerCallCounts.get(reasonerName) || 0
    if (reasonerCount >= this.config.maxCallsPerReasoner) {
      this.metrics.rateLimitRejections++
      return { tool: call.tool, status: 'error', error: 'reasoner_limit', message: `${reasonerName} 호출 한도 초과 (${this.config.maxCallsPerReasoner})`, latencyMs: 0, cached: false }
    }

    // 3. Per-cycle rate limit
    if (this.cycleCallCount >= this.config.maxCallsPerCycle) {
      this.metrics.rateLimitRejections++
      return { tool: call.tool, status: 'error', error: 'cycle_limit', message: `사이클 호출 한도 초과 (${this.config.maxCallsPerCycle})`, latencyMs: 0, cached: false }
    }

    // 4. Cache check
    const cacheKey = canonicalKey(call.tool, call.params)
    if (this.cache.has(cacheKey)) {
      const latency = Date.now() - start
      this.metrics.toolCalls.push({ tool: call.tool, reasoner: reasonerName, latencyMs: latency, cached: true, success: true })
      return { tool: call.tool, status: 'ok', data: this.cache.get(cacheKey), latencyMs: latency, cached: true }
    }

    // 5. External API rate limit (sliding window)
    if (!checkExternalRateLimit(call.tool)) {
      this.metrics.rateLimitRejections++
      return { tool: call.tool, status: 'error', error: 'external_rate_limit', message: `외부 API 분당 호출 한도 초과`, latencyMs: 0, cached: false }
    }

    // 6. Execute
    const handler = this.handlers.get(call.tool)
    if (!handler) {
      return { tool: call.tool, status: 'error', error: 'no_handler', message: `${call.tool} 핸들러 없음`, latencyMs: 0, cached: false }
    }

    try {
      const result = await Promise.race([
        handler(call.params),
        new Promise((_, reject) => setTimeout(() => reject(new Error('tool_timeout')), this.config.toolTimeout)),
      ])

      const latency = Date.now() - start
      this.cache.set(cacheKey, result)
      this.cycleCallCount++
      this.reasonerCallCounts.set(reasonerName, reasonerCount + 1)
      this.metrics.toolCalls.push({ tool: call.tool, reasoner: reasonerName, latencyMs: latency, cached: false, success: true })

      return { tool: call.tool, status: 'ok', data: result, latencyMs: latency, cached: false }
    } catch (err) {
      const latency = Date.now() - start
      this.metrics.toolCalls.push({ tool: call.tool, reasoner: reasonerName, latencyMs: latency, cached: false, success: false })
      return { tool: call.tool, status: 'error', error: 'execution_failed', message: err instanceof Error ? err.message : String(err), latencyMs: latency, cached: false }
    }
  }

  /** ask_expert 호출 시 reasoner의 남은 도구 호출 1회 차감 */
  consumeAskExpertSlot(reasonerName: string): void {
    this.metrics.askExpertCalls++
    const count = this.reasonerCallCounts.get(reasonerName) || 0
    this.reasonerCallCounts.set(reasonerName, count + 1)
    this.cycleCallCount++
  }

  recordParseFailure(): void {
    this.metrics.toolCallParseFailures++
  }

  /** 사이클 종료 시 메트릭 저장 */
  saveMetrics(): void {
    const total = this.metrics.toolCalls.length
    const cached = this.metrics.toolCalls.filter(t => t.cached).length
    this.metrics.cacheHitRate = total > 0 ? cached / total : 0

    try {
      const dir = path.dirname(METRICS_PATH)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(METRICS_PATH, JSON.stringify(this.metrics, null, 2), 'utf-8')
    } catch { /* non-critical */ }
  }

  getMetrics(): HarnessMetrics {
    return this.metrics
  }
}
```

- [ ] **Step 2: js-yaml 의존성 확인**

```bash
cd "/Users/rnr/Documents/New project" && cat package.json | grep js-yaml
```

js-yaml이 없으면: `npm install js-yaml && npm install -D @types/js-yaml`

- [ ] **Step 3: Commit**

```bash
git add lib/agent-loop/tool-harness.ts
git commit -m "feat(phase7): implement Tool Harness with cache, whitelist, rate limit"
```

---

### Task 3: 도구 레지스트리 (6개 도구 구현)

**Files:**
- Create: `lib/agent-loop/tool-registry.ts`

- [ ] **Step 1: 도구 구현체 작성**

```typescript
// lib/agent-loop/tool-registry.ts

import type { ToolDeclaration, ToolHandler } from './tool-types'
import type { ToolHarness } from './tool-harness'

// ── Tool Declarations ──

const ga4QueryDecl: ToolDeclaration = {
  name: 'ga4_query',
  description: 'GA4 지표 조회. 세션, 전환율, 이탈률, 매출 등 특정 지표를 기간/필터 조건으로 조회합니다.',
  parameters: {
    metric: { type: 'string', description: '조회할 지표 (sessions, bounceRate, conversionRate, revenue, activeUsers)', required: true },
    dimension: { type: 'string', description: '분류 기준 (date, source, medium, pagePath)' },
    days: { type: 'number', description: '조회 기간 (일수, 기본 7)' },
  },
}

const ga4FunnelDecl: ToolDeclaration = {
  name: 'ga4_funnel',
  description: '구매 퍼널 이탈 분석. 6단계(목록조회→예매진입→시간선택→좌석확정→결제선택→결제완료) 이탈률을 조회합니다.',
  parameters: {
    days: { type: 'number', description: '조회 기간 (일수, 기본 7)' },
    filter: { type: 'string', description: '필터 조건 (예: theater_code=m016)' },
  },
}

const theaterDetailDecl: ToolDeclaration = {
  name: 'theater_detail',
  description: '특정 지점의 매출/구매 상세 데이터를 조회합니다.',
  parameters: {
    theaterCode: { type: 'string', description: '지점 코드 (m016, m017 등) 또는 한글 이름', required: true },
    days: { type: 'number', description: '조회 기간 (일수, 기본 7)' },
  },
}

const knowledgeSearchDecl: ToolDeclaration = {
  name: 'knowledge_search',
  description: 'Knowledge Store에서 의미 기반 검색. 과거 학습된 패턴, 원칙, 안티패턴을 맥락에 맞게 검색합니다.',
  parameters: {
    query: { type: 'string', description: '검색 쿼리 (한국어)', required: true },
    domain: { type: 'string', description: '특정 도메인으로 제한 (marketing, competitive, consumer 등)' },
  },
}

const episodeSearchDecl: ToolDeclaration = {
  name: 'episode_search',
  description: '과거 유사 상황 검색. 이전에 비슷한 상황에서 어떤 액션을 취했고 결과가 어땠는지 찾습니다.',
  parameters: {
    query: { type: 'string', description: '검색 쿼리 (한국어)', required: true },
    limit: { type: 'number', description: '최대 결과 수 (기본 5)' },
  },
}

const webSearchDecl: ToolDeclaration = {
  name: 'web_search',
  description: '실시간 웹 검색. 경쟁사 동향, 업계 트렌드, 최신 마케팅 사례를 검색합니다.',
  parameters: {
    query: { type: 'string', description: '검색 쿼리', required: true },
    region: { type: 'string', description: '지역 (기본 kr)' },
  },
}

// ── Tool Handlers ──

async function handleGa4Query(params: Record<string, unknown>): Promise<unknown> {
  const { fetchGA4Report } = await import('@/lib/ga4-client')
  const metric = params.metric as string
  const days = (params.days as number) || 7
  const dimension = params.dimension as string | undefined
  // Use existing GA4 client
  const data = await fetchGA4Report(days, metric, dimension)
  return data
}

async function handleGa4Funnel(params: Record<string, unknown>): Promise<unknown> {
  const { fetchEcommerceFunnel } = await import('@/lib/ga4-client')
  const days = (params.days as number) || 7
  return await fetchEcommerceFunnel(days)
}

async function handleTheaterDetail(params: Record<string, unknown>): Promise<unknown> {
  const { fetchTheaterRevenueTop } = await import('@/lib/ga4-client')
  const { mapTheaterCode } = await import('@/lib/theater-mapping')
  const code = params.theaterCode as string
  const days = (params.days as number) || 7
  const all = await fetchTheaterRevenueTop(days, 30)
  const name = mapTheaterCode(code)
  return all.filter(t => t.theaterCode === code || t.theaterName === name)
}

async function handleKnowledgeSearch(params: Record<string, unknown>): Promise<unknown> {
  const { searchKnowledgeSemantic } = await import('./knowledge-store')
  const query = params.query as string
  const domain = params.domain as string | undefined
  const results = await searchKnowledgeSemantic(query, { domain, limit: 5, minSimilarity: 0.4 })
  return results.map(r => ({
    domain: r.domain,
    level: r.level,
    pattern: r.pattern,
    observation: r.observation.split('\n')[0].slice(0, 200),
    confidence: r.confidence,
    similarity: r.similarity,
  }))
}

async function handleEpisodeSearch(params: Record<string, unknown>): Promise<unknown> {
  const { retrieveByMeaning } = await import('@/lib/memory/episodic-store')
  const query = params.query as string
  const limit = (params.limit as number) || 5
  const episodes = await retrieveByMeaning(query, limit)
  return episodes.map(e => ({
    situation: e.situation?.slice(0, 150),
    action: e.action?.slice(0, 150),
    outcome: e.outcome?.slice(0, 150),
    similarity: e.similarity,
  }))
}

async function handleWebSearch(params: Record<string, unknown>): Promise<unknown> {
  const { runWebSearchWithRuntime } = await import('@/lib/search')
  const query = params.query as string
  const region = (params.region as string) || 'kr'
  const hits = await runWebSearchWithRuntime(query, '', region, '')
  return hits.slice(0, 5).map(h => ({
    title: h.title,
    snippet: h.snippet,
    url: h.url,
  }))
}

// ── Register All Tools ──

export function registerAllTools(harness: ToolHarness): void {
  harness.registerTool(ga4QueryDecl, handleGa4Query)
  harness.registerTool(ga4FunnelDecl, handleGa4Funnel)
  harness.registerTool(theaterDetailDecl, handleTheaterDetail)
  harness.registerTool(knowledgeSearchDecl, handleKnowledgeSearch)
  harness.registerTool(episodeSearchDecl, handleEpisodeSearch)
  harness.registerTool(webSearchDecl, handleWebSearch)
}

export const ALL_DECLARATIONS: ToolDeclaration[] = [
  ga4QueryDecl, ga4FunnelDecl, theaterDetailDecl,
  knowledgeSearchDecl, episodeSearchDecl, webSearchDecl,
]
```

- [ ] **Step 2: GA4 fetchGA4Report 함수 존재 여부 확인**

`lib/ga4-client.ts`에 `fetchGA4Report` 없으면 기존 함수(`fetchNewVsReturning`, `fetchChannelTrend` 등)를 범용 래퍼로 감싸는 간단한 함수 추가 필요. 구현 시 확인.

- [ ] **Step 3: Commit**

```bash
git add lib/agent-loop/tool-registry.ts
git commit -m "feat(phase7): implement 6 tool handlers for Tool Harness"
```

---

### Task 4: Config 파일 생성

**Files:**
- Create: `config/tools.yaml`
- Create: `config/domain.yaml`
- Create: `config/company.md`

- [ ] **Step 1: tools.yaml 작성**

```yaml
# config/tools.yaml
# Sub-Reasoner별 허용 도구 매핑

max_calls_per_reasoner: 3
max_calls_per_cycle: 15
tool_timeout: 5000  # ms

sub_reasoners:
  analysis:
    tools: [ga4_query, knowledge_search, episode_search]
  content:
    tools: [knowledge_search, web_search, episode_search]
  strategy:
    tools: [ga4_query, knowledge_search, web_search]
  cro:
    tools: [ga4_funnel, theater_detail, knowledge_search]
  psychology:
    tools: [knowledge_search, episode_search, web_search]
```

- [ ] **Step 2: domain.yaml 작성**

```yaml
# config/domain.yaml
# MONOPLEX 도메인 설정

name: "MONOPLEX"
industry: "entertainment/private-cinema"
kpis:
  - 매출
  - 전환율
  - 재방문율
  - 좌석 점유율
  - ARPU
data_sources:
  - ga4
  - instagram
sub_reasoners:
  - analysis
  - content
  - strategy
  - cro
  - psychology
custom_dimensions:
  theater_code: "지점 코드"
  movie_id: "영화 ID"
```

- [ ] **Step 3: company.md 작성**

```markdown
---
name: "MONOPLEX"
industry: "entertainment/private-cinema"
kpis: [매출, 전환율, 재방문율, 좌석점유율, ARPU]
data_sources: [ga4, instagram]
sub_reasoners: [analysis, content, strategy, cro, psychology]
---

## 비즈니스 컨텍스트

MONOPLEX는 프라이빗 시네마 브랜드로, 전국 24개 지점을 운영합니다.
주요 서비스: 프라이빗 영화 상영, 기업 행사, VIP 시네마 라운지.
타겟: 20-40대 커플, 가족, 기업 고객.
핵심 전환 퍼널: 영화 목록 조회 → 예매 페이지 → 시간 선택 → 좌석 확정 → 결제.
주요 이탈 지점: 좌석 확정 단계 (82% 이탈률).
```

- [ ] **Step 4: Commit**

```bash
git add config/
git commit -m "feat(phase7): add domain config files (tools.yaml, domain.yaml, company.md)"
```

---

## Chunk 2: runLLMWithTools + Sub-Reasoner 2-pass 프로토콜

### Task 5: runLLMWithTools 구현

**Files:**
- Modify: `lib/llm.ts`

- [ ] **Step 1: Gemini function calling 지원 추가**

`lib/llm.ts` 파일 끝에 `runLLMWithTools()` 함수 추가. 기존 `runLLM()`은 변경하지 않음.

```typescript
// lib/llm.ts 끝에 추가

import type { ToolDeclaration, ToolCall } from '@/lib/agent-loop/tool-types'

export type LLMWithToolsResult = {
  text: string
  toolCalls: ToolCall[]
}

/**
 * 도구 호출을 지원하는 LLM 실행
 * Gemini: native function calling
 * Groq: native tool_use
 * 기타: JSON 프롬프트 방식 폴백
 */
export async function runLLMWithTools(
  systemPrompt: string,
  userPrompt: string,
  tools: ToolDeclaration[],
  options?: {
    temperature?: number
    maxTokens?: number
    runtime?: RuntimeConfig
  },
): Promise<LLMWithToolsResult> {
  const temp = options?.temperature ?? 0.3
  const maxTokens = options?.maxTokens ?? 1200
  const provider = resolveProvider(options?.runtime)

  // Gemini: native function calling
  if (provider === 'gemini') {
    return runGeminiWithTools(systemPrompt, userPrompt, tools, temp, maxTokens)
  }

  // Groq: native tool_use (OpenAI-compatible)
  if (provider === 'groq') {
    return runGroqWithTools(systemPrompt, userPrompt, tools, temp, maxTokens)
  }

  // Fallback: JSON prompt 방식
  return runJsonPromptWithTools(systemPrompt, userPrompt, tools, temp, maxTokens, options?.runtime)
}

async function runGeminiWithTools(
  system: string, prompt: string, tools: ToolDeclaration[],
  temperature: number, maxTokens: number,
): Promise<LLMWithToolsResult> {
  const apiKey = pickValue(process.env.GEMINI_API_KEY)
  const model = pickValue(process.env.GEMINI_MODEL, GEMINI_DEFAULT_MODEL)
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const functionDeclarations = tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: 'object' as const,
      properties: Object.fromEntries(
        Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type, description: v.description, ...(v.enum ? { enum: v.enum } : {}) }])
      ),
      required: Object.entries(t.parameters).filter(([, v]) => v.required).map(([k]) => k),
    },
  }))

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ function_declarations: functionDeclarations }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    },
  )

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini tool call failed: ${errText.slice(0, 200)}`)
  }

  const data = await res.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string
          functionCall?: { name: string; args: Record<string, unknown> }
        }>
      }
    }>
  }

  const parts = data.candidates?.[0]?.content?.parts || []
  let text = ''
  const toolCalls: ToolCall[] = []

  for (const part of parts) {
    if (part.text) text += part.text
    if (part.functionCall) {
      toolCalls.push({ tool: part.functionCall.name, params: part.functionCall.args || {} })
    }
  }

  return { text, toolCalls }
}

async function runGroqWithTools(
  system: string, prompt: string, tools: ToolDeclaration[],
  temperature: number, maxTokens: number,
): Promise<LLMWithToolsResult> {
  const apiKey = pickValue(process.env.GROQ_API_KEY)
  const model = pickValue(process.env.GROQ_MODEL, GROQ_DEFAULT_MODEL)
  if (!apiKey) throw new Error('GROQ_API_KEY not set')

  const openaiTools = tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(t.parameters).map(([k, v]) => [k, { type: v.type, description: v.description }])
        ),
        required: Object.entries(t.parameters).filter(([, v]) => v.required).map(([k]) => k),
      },
    },
  }))

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      tools: openaiTools,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!res.ok) throw new Error(`Groq tool call failed: ${(await res.text()).slice(0, 200)}`)

  const data = await res.json() as {
    choices?: Array<{
      message?: {
        content?: string | null
        tool_calls?: Array<{ function: { name: string; arguments: string } }>
      }
    }>
  }

  const msg = data.choices?.[0]?.message
  const text = msg?.content || ''
  const toolCalls: ToolCall[] = (msg?.tool_calls || []).map(tc => ({
    tool: tc.function.name,
    params: JSON.parse(tc.function.arguments || '{}'),
  }))

  return { text, toolCalls }
}

async function runJsonPromptWithTools(
  system: string, prompt: string, tools: ToolDeclaration[],
  temperature: number, maxTokens: number, runtime?: RuntimeConfig,
): Promise<LLMWithToolsResult> {
  // Append tool descriptions + JSON format instructions to prompt
  const toolDesc = tools.map(t =>
    `- ${t.name}: ${t.description}\n  파라미터: ${JSON.stringify(t.parameters)}`
  ).join('\n')

  const augmentedPrompt = `${prompt}

## 사용 가능한 도구
${toolDesc}

## 응답 포맷
반드시 JSON으로 응답하세요:
{"tool_calls": [{"tool": "도구명", "params": {...}}], "analysis": {...}}
도구가 필요 없으면 tool_calls를 빈 배열로.`

  const raw = await runLLM(system, augmentedPrompt, temperature, maxTokens, runtime)

  // Parse tool_calls from JSON response
  try {
    const cleaned = raw.replace(/```(?:json)?/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)?.[0]
    if (match) {
      const parsed = JSON.parse(match)
      const toolCalls: ToolCall[] = Array.isArray(parsed.tool_calls) ? parsed.tool_calls : []
      return { text: raw, toolCalls }
    }
  } catch { /* parse failed, return text only */ }

  return { text: raw, toolCalls: [] }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/llm.ts
git commit -m "feat(phase7): add runLLMWithTools with Gemini/Groq native function calling"
```

---

### Task 6: Sub-Reasoner Orchestrator에 2-pass 프로토콜 통합

**Files:**
- Modify: `lib/agent-loop/sub-reasoners/index.ts`

- [ ] **Step 1: index.ts에 도구 호출 루프 추가**

`runSubReasoners()` 함수에 ToolHarness 인스턴스를 받아서 각 Sub-Reasoner에 전달하는 구조로 변경.

```typescript
// lib/agent-loop/sub-reasoners/index.ts 전체 교체

import * as fs from 'fs'
import * as path from 'path'
import { analyzeCurrentData, type AnalysisResult } from './analysis'
import { suggestContent, type ContentResult } from './content'
import { suggestStrategy, type StrategyResult } from './strategy'
import { suggestCROImprovements, type CROResult } from './cro'
import { suggestPsychologyAngles, type PsychologyResult } from './psychology'
import type { WorldModel, GoalProgress } from '../types'
import type { ToolHarness } from '../tool-harness'

const LATEST_FILE = path.join(process.cwd(), '.garnet-config', 'sub-reasoner-latest.json')

export type SubReasonerResults = {
  analysis?: AnalysisResult
  content?: ContentResult
  strategy?: StrategyResult
  cro?: CROResult
  psychology?: PsychologyResult
}

export async function runSubReasoners(
  worldModel: WorldModel,
  goals: GoalProgress[],
  harness?: ToolHarness,
): Promise<SubReasonerResults> {
  const withTimeout = <T>(promise: Promise<T>, ms = 30000): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Sub-Reasoner timeout')), ms)),
    ])

  const [analysis, content, strategy, cro, psychology] = await Promise.allSettled([
    withTimeout(analyzeCurrentData(worldModel, goals, harness)),
    withTimeout(suggestContent(worldModel, harness)),
    withTimeout(suggestStrategy(worldModel, goals, harness)),
    withTimeout(suggestCROImprovements(worldModel, harness)),
    withTimeout(suggestPsychologyAngles(worldModel, harness)),
  ])

  const results = {
    analysis: analysis.status === 'fulfilled' ? analysis.value : undefined,
    content: content.status === 'fulfilled' ? content.value : undefined,
    strategy: strategy.status === 'fulfilled' ? strategy.value : undefined,
    cro: cro.status === 'fulfilled' ? cro.value : undefined,
    psychology: psychology.status === 'fulfilled' ? psychology.value : undefined,
  }

  try {
    fs.writeFileSync(
      LATEST_FILE,
      JSON.stringify({ ...results, generatedAt: new Date().toISOString() }, null, 2),
      'utf-8',
    )
  } catch { /* non-critical */ }

  return results
}

// getLatestSubReasonerResults, buildSubReasonerContext 기존 코드 유지
export function getLatestSubReasonerResults(): (SubReasonerResults & { generatedAt?: string }) | null {
  try {
    if (!fs.existsSync(LATEST_FILE)) return null
    return JSON.parse(fs.readFileSync(LATEST_FILE, 'utf-8'))
  } catch {
    return null
  }
}

// buildSubReasonerContext는 기존 코드 그대로 유지 (변경 없음)
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-loop/sub-reasoners/index.ts
git commit -m "feat(phase7): integrate ToolHarness into Sub-Reasoner orchestrator"
```

---

### Task 7: CRO Sub-Reasoner에 2-pass 도구 호출 구현 (파일럿)

**Files:**
- Modify: `lib/agent-loop/sub-reasoners/cro.ts`

- [ ] **Step 1: cro.ts를 2-pass 패턴으로 리팩토링**

CRO를 파일럿으로 먼저 구현하고, 검증 후 나머지 4개에 동일 패턴 적용.

```typescript
// lib/agent-loop/sub-reasoners/cro.ts

import { runLLM } from '@/lib/llm'
import { runLLMWithTools } from '@/lib/llm'
import type { WorldModel } from '../types'
import type { ToolHarness } from '../tool-harness'
import type { ToolCall } from '../tool-types'

export type CROResult = {
  bottlenecks: Array<{
    stage: string
    severity: 'high' | 'medium' | 'low'
    rootCause: string
    quickWin: string
  }>
  toolsUsed?: string[]
}

const SYSTEM = `10년차 CRO(전환율 최적화) 전문가.
Chain-of-Draft 방식: 짧고 밀도 높게.
JSON만 출력. 한국어.
일반론 금지. 데이터 기반 구체 개선안만.

도구 에러가 반환되면 해당 데이터 없이 기존 WorldModel 데이터로 분석을 진행하세요.`

export async function suggestCROImprovements(
  worldModel: WorldModel,
  harness?: ToolHarness,
): Promise<CROResult> {
  const ga4 = worldModel.snapshot.ga4

  const basePrompt = `## 현재 GA4 지표
세션: ${ga4.sessions}
이탈률: ${ga4.bounceRate}%
전환율: ${ga4.conversionRate}%

위 데이터에서 **전환 병목 2개**를 도출하세요.
각각의 추정 원인과 즉시 적용 가능한 quick win을 제시하세요.

JSON: {"bottlenecks":[{"stage":"단계명","severity":"high|medium|low","rootCause":"원인","quickWin":"즉시 적용안"}]}`

  // harness 없으면 기존 방식 (1-pass)
  if (!harness) {
    return runSinglePass(basePrompt)
  }

  // 2-pass: 도구 호출 지원
  try {
    const tools = harness.getToolDeclarations('cro')
    if (tools.length === 0) return runSinglePass(basePrompt)

    // Pass 1: LLM에게 도구 선택 기회 부여
    const pass1 = await runLLMWithTools(SYSTEM, basePrompt, tools, { temperature: 0.3, maxTokens: 1200 })

    // 도구 호출이 없으면 Pass 1 결과로 완료
    if (pass1.toolCalls.length === 0) {
      return parseResult(pass1.text)
    }

    // 도구 실행
    const toolResults = await executeToolCalls(harness, 'cro', pass1.toolCalls)
    const toolsUsed = toolResults.map(r => r.tool)

    // Pass 2: 도구 결과 포함하여 최종 분석
    const toolContext = toolResults.map(r =>
      r.status === 'ok'
        ? `[${r.tool}] ${JSON.stringify(r.data).slice(0, 500)}`
        : `[${r.tool}] 에러: ${r.message}`
    ).join('\n')

    const pass2Prompt = `${basePrompt}

## 추가 데이터 (도구 조회 결과)
${toolContext}

위 추가 데이터를 반영하여 더 구체적인 분석을 제공하세요.`

    const pass2 = await runLLM(SYSTEM, pass2Prompt, 0.3, 1200)
    const result = parseResult(pass2)
    result.toolsUsed = toolsUsed
    return result
  } catch {
    // 도구 호출 실패 시 기존 방식 폴백
    return runSinglePass(basePrompt)
  }
}

async function executeToolCalls(
  harness: ToolHarness,
  reasonerName: string,
  calls: ToolCall[],
) {
  // 최대 3개까지만 실행
  const limited = calls.slice(0, 3)
  return Promise.all(limited.map(call => harness.execute(reasonerName, call)))
}

async function runSinglePass(prompt: string): Promise<CROResult> {
  try {
    const raw = await runLLM(SYSTEM, prompt, 0.3, 1200)
    return parseResult(raw)
  } catch {
    return { bottlenecks: [] }
  }
}

function parseResult(raw: string): CROResult {
  try {
    const cleaned = raw.replace(/```(?:json)?/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned
    const parsed = JSON.parse(match)
    return {
      bottlenecks: Array.isArray(parsed.bottlenecks) ? parsed.bottlenecks.slice(0, 3) : [],
    }
  } catch {
    return { bottlenecks: [] }
  }
}
```

- [ ] **Step 2: 로컬 테스트**

```bash
# Agent Loop가 실행 중이면 routine-cycle 트리거로 확인
curl -s -X POST http://localhost:3000/api/agent-loop/control \
  -H 'Content-Type: application/json' \
  -d '{"action":"trigger","cycleType":"routine-cycle"}'
```

`.garnet-config/sub-reasoner-latest.json`에서 cro 결과에 `toolsUsed` 필드 확인.

- [ ] **Step 3: Commit**

```bash
git add lib/agent-loop/sub-reasoners/cro.ts
git commit -m "feat(phase7): CRO Sub-Reasoner with 2-pass tool calling (pilot)"
```

---

### Task 8: 나머지 4개 Sub-Reasoner에 동일 패턴 적용

**Files:**
- Modify: `lib/agent-loop/sub-reasoners/analysis.ts`
- Modify: `lib/agent-loop/sub-reasoners/content.ts`
- Modify: `lib/agent-loop/sub-reasoners/strategy.ts`
- Modify: `lib/agent-loop/sub-reasoners/psychology.ts`

- [ ] **Step 1: 각 파일에 harness 파라미터 + 2-pass 패턴 적용**

CRO와 동일한 패턴:
1. `harness?: ToolHarness` 파라미터 추가
2. harness 없으면 기존 1-pass
3. harness 있으면 `runLLMWithTools` → 도구 실행 → 2차 LLM
4. 실패 시 1-pass 폴백

각 파일의 기존 시스템 프롬프트와 출력 포맷은 유지. `harness`와 2-pass 로직만 추가.

- [ ] **Step 2: 각 파일 테스트**

routine-cycle 트리거 후 `.garnet-config/sub-reasoner-latest.json`에서 각 Sub-Reasoner 결과 확인.

- [ ] **Step 3: Commit**

```bash
git add lib/agent-loop/sub-reasoners/
git commit -m "feat(phase7): all 5 Sub-Reasoners with 2-pass tool calling"
```

---

### Task 9: Agent Loop 오케스트레이터에서 Harness 생성 + 주입

**Files:**
- Modify: `lib/agent-loop/index.ts`

- [ ] **Step 1: runCycle에서 ToolHarness 인스턴스 생성, Sub-Reasoner에 전달**

`lib/agent-loop/index.ts`의 `runCycle()` 함수에서:

```typescript
// import 추가
import { ToolHarness } from './tool-harness'
import { registerAllTools } from './tool-registry'

// runCycle 내부, Sub-Reasoner 호출 직전에:
const harness = new ToolHarness(cycleId)
registerAllTools(harness)

// 기존: const subResults = await runSubReasoners(worldModel, goals)
// 변경:
const subResults = await runSubReasoners(worldModel, goals, harness)

// 사이클 종료 시:
harness.saveMetrics()
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-loop/index.ts
git commit -m "feat(phase7): inject ToolHarness into agent loop cycle"
```

---

## Chunk 3: A2A Protocol + Domain Bootstrap

### Task 10: A2A Protocol 구현

**Files:**
- Create: `lib/agent-loop/a2a-protocol.ts`

- [ ] **Step 1: ask_expert 구현**

```typescript
// lib/agent-loop/a2a-protocol.ts

import { runLLM } from '@/lib/llm'
import type { ToolHarness } from './tool-harness'

export type A2ARequest = {
  from: string
  expert: string
  question: string
}

export type A2AResponse = {
  expert: string
  answer: string
  confidence: number
}

// 전문가별 축약 시스템 프롬프트
const EXPERT_PROMPTS: Record<string, string> = {
  analysis: '데이터 분석 전문가. 수치 기반 패턴과 이상치를 찾는다. 한국어.',
  content: '콘텐츠 전략가. 포맷, 채널, 메시지 최적화. 한국어.',
  strategy: '마케팅 전략가. 시장 포지셔닝과 성장 전략. 한국어.',
  cro: 'CRO 전문가. 전환 병목과 최적화. 한국어.',
  psychology: '소비자 심리 전문가. 인지 편향과 행동경제학. 한국어.',
}

// 사이클 내 캐시 (harness와 수명 동일)
const expertCache = new Map<string, A2AResponse>()

export function clearExpertCache(): void {
  expertCache.clear()
}

export async function askExpert(
  request: A2ARequest,
  harness?: ToolHarness,
): Promise<A2AResponse> {
  const cacheKey = `${request.expert}:${request.question}`

  // 캐시 체크
  if (expertCache.has(cacheKey)) {
    return expertCache.get(cacheKey)!
  }

  const systemPrompt = EXPERT_PROMPTS[request.expert]
  if (!systemPrompt) {
    return { expert: request.expert, answer: `알 수 없는 전문가: ${request.expert}`, confidence: 0 }
  }

  // Harness에 ask_expert 슬롯 소비 기록
  if (harness) {
    harness.consumeAskExpertSlot(request.from)
  }

  try {
    const answer = await Promise.race([
      runLLM(systemPrompt, `질문: ${request.question}\n\n간결하게 2-3문장으로 답변하세요.`, 0.3, 500),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('ask_expert timeout')), 8000)),
    ])

    const response: A2AResponse = {
      expert: request.expert,
      answer,
      confidence: 0.7,
    }

    expertCache.set(cacheKey, response)
    return response
  } catch {
    return { expert: request.expert, answer: '응답 시간 초과', confidence: 0 }
  }
}

// ── 외부 A2A (포트만 열어둠) ──

export async function askExternal(
  _agentUrl: string,
  _question: string,
  _capabilities?: string[],
): Promise<A2AResponse> {
  throw new Error('External A2A not yet implemented')
}

export function registerExternalAgent(
  _name: string,
  _url: string,
  _capabilities: string[],
): void {
  // TODO: 에이전트 레지스트리
}
```

- [ ] **Step 2: tool-registry에 ask_expert 도구 추가**

`lib/agent-loop/tool-registry.ts`에 ask_expert 도구 선언 + 핸들러 추가:

```typescript
const askExpertDecl: ToolDeclaration = {
  name: 'ask_expert',
  description: '다른 전문가에게 질의. 분석 중 다른 관점이 필요할 때 사용합니다.',
  parameters: {
    expert: { type: 'string', description: '전문가 (analysis, content, strategy, cro, psychology)', required: true, enum: ['analysis', 'content', 'strategy', 'cro', 'psychology'] },
    question: { type: 'string', description: '질문 (한국어)', required: true },
  },
}
```

각 Sub-Reasoner의 tools.yaml에 ask_expert 추가.

- [ ] **Step 3: Commit**

```bash
git add lib/agent-loop/a2a-protocol.ts lib/agent-loop/tool-registry.ts config/tools.yaml
git commit -m "feat(phase7): implement A2A ask_expert protocol"
```

---

### Task 11: Domain Bootstrap 구현

**Files:**
- Create: `lib/agent-loop/domain-bootstrap.ts`

- [ ] **Step 1: company.md 파서 + config 생성기**

```typescript
// lib/agent-loop/domain-bootstrap.ts

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { runLLM } from '@/lib/llm'

type CompanyMeta = {
  name: string
  industry: string
  kpis: string[]
  data_sources: string[]
  sub_reasoners: string[]
}

const CONFIG_DIR = path.join(process.cwd(), 'config')

export function parseCompanyMd(filePath: string): { meta: CompanyMeta; context: string } {
  const raw = fs.readFileSync(filePath, 'utf-8')

  // Parse YAML frontmatter
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) throw new Error('company.md에 YAML frontmatter가 없습니다')

  const meta = yaml.load(fmMatch[1]) as CompanyMeta
  const context = raw.slice(fmMatch[0].length).trim()

  return { meta, context }
}

export function generateDomainYaml(meta: CompanyMeta): string {
  return yaml.dump({
    name: meta.name,
    industry: meta.industry,
    kpis: meta.kpis,
    data_sources: meta.data_sources,
    sub_reasoners: meta.sub_reasoners,
  })
}

export function generateToolsYaml(meta: CompanyMeta): string {
  // 범용 도구: 항상 포함
  const universal = ['knowledge_search', 'episode_search', 'web_search', 'ask_expert']

  // 데이터소스 기반 도메인 도구 매핑
  const domainTools: string[] = []
  if (meta.data_sources.includes('ga4')) {
    domainTools.push('ga4_query', 'ga4_funnel')
  }

  const allTools = [...universal, ...domainTools]

  const subReasonerConfig: Record<string, { tools: string[] }> = {}
  for (const sr of meta.sub_reasoners) {
    // 기본: 범용 도구 3개 + 도메인 도구
    subReasonerConfig[sr] = { tools: allTools.slice(0, 6) }
  }

  return yaml.dump({
    max_calls_per_reasoner: 3,
    max_calls_per_cycle: 15,
    tool_timeout: 5000,
    sub_reasoners: subReasonerConfig,
  })
}

export async function bootstrapDomain(companyMdPath: string): Promise<{
  domainYaml: string
  toolsYaml: string
  message: string
}> {
  const { meta, context } = parseCompanyMd(companyMdPath)

  // Config 생성
  const domainYaml = generateDomainYaml(meta)
  const toolsYaml = generateToolsYaml(meta)

  // 파일 쓰기 (사용자 검토 후 적용)
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })

  const domainPath = path.join(CONFIG_DIR, 'domain.yaml')
  const toolsPath = path.join(CONFIG_DIR, 'tools.yaml')

  fs.writeFileSync(domainPath, domainYaml, 'utf-8')
  fs.writeFileSync(toolsPath, toolsYaml, 'utf-8')

  return {
    domainYaml,
    toolsYaml,
    message: `✅ config/ 생성 완료.\n- ${domainPath}\n- ${toolsPath}\n\n⚠️ 검토 후 사용하세요. WorldModel 타입은 수동 조정 필요.`,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-loop/domain-bootstrap.ts
git commit -m "feat(phase7): implement domain bootstrap from company.md"
```

---

### Task 12: 사이클 시작 시 expert cache 초기화

**Files:**
- Modify: `lib/agent-loop/index.ts`

- [ ] **Step 1: runCycle에서 clearExpertCache 호출**

```typescript
import { clearExpertCache } from './a2a-protocol'

// runCycle 시작 시:
clearExpertCache()
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-loop/index.ts
git commit -m "feat(phase7): clear A2A cache at cycle start"
```

---

### Task 13: 통합 테스트 — routine-cycle 트리거

- [ ] **Step 1: 서버에서 routine-cycle 트리거**

```bash
curl -s -X POST http://localhost:3000/api/agent-loop/control \
  -H 'Content-Type: application/json' \
  -d '{"action":"trigger","cycleType":"routine-cycle"}'
```

- [ ] **Step 2: 결과 확인**

```bash
# Sub-Reasoner 결과 확인
cat .garnet-config/sub-reasoner-latest.json | head -50

# Harness 메트릭 확인
cat .garnet-config/harness-metrics.json
```

기대값:
- `toolCalls` 배열에 실제 도구 호출 기록
- `cacheHitRate` > 0 (같은 도구 중복 호출 시)
- CRO 결과에 `toolsUsed` 필드 존재

- [ ] **Step 3: daily-briefing으로 Slack 브리핑 확인**

```bash
curl -s -X POST http://localhost:3000/api/agent-loop/control \
  -H 'Content-Type: application/json' \
  -d '{"action":"trigger","cycleType":"daily-briefing"}'
```

Slack 브리핑에서 인사이트 품질이 이전보다 구체적인지 확인.

- [ ] **Step 4: 최종 Commit**

```bash
git add -A
git commit -m "feat(phase7): Garnet Phase 7 — Agentic Tool Harness + A2A + Domain Bootstrap"
```

---

## Summary

| Task | 내용 | 예상 시간 |
|------|------|----------|
| 1 | 도구 타입 정의 | 2분 |
| 2 | Tool Harness 코어 | 5분 |
| 3 | 6개 도구 구현 | 5분 |
| 4 | Config 파일 생성 | 3분 |
| 5 | runLLMWithTools | 5분 |
| 6 | Sub-Reasoner orchestrator 변경 | 3분 |
| 7 | CRO 2-pass 파일럿 | 5분 |
| 8 | 나머지 4개 Sub-Reasoner | 10분 |
| 9 | Agent Loop에 Harness 주입 | 3분 |
| 10 | A2A Protocol | 5분 |
| 11 | Domain Bootstrap | 5분 |
| 12 | Expert cache 초기화 | 2분 |
| 13 | 통합 테스트 | 5분 |
