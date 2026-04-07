# Shell ↔ Flow 자동 생성/실행 시스템 구현 플랜

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent Shell 커맨드 바에서 자연어로 플로우를 자동 생성, 실행, 조회할 수 있게 한다. "카페 창업 마케팅 플로우 만들어줘"라고 입력하면 Gemma4가 에이전트 팀을 자동 설계하고 Canvas에 미리보기를 표시한다.

**Architecture:** Flow Architect(`lib/flow/architect.ts`)가 LLM으로 프로젝트 분석 → nodes/edges 생성. 기존 `parseIntent`에 flow 인텐트 추가. `/api/agent/command`에서 flow 이벤트를 SSE로 전송. Canvas에 경량 SVG 기반 `FlowPreviewPanel`을 렌더링.

**Tech Stack:** Next.js 15, TypeScript, Zustand, Gemma4 (Google AI Studio API), SVG

---

## Chunk 1: Data Layer — Architect + Matcher

### Task 1: Flow Architect 프롬프트 (`lib/flow/architect-prompt.ts`)

**Files:**
- Create: `lib/flow/architect-prompt.ts`

- [ ] **Step 1: Create the prompt module**

```typescript
import { DEFAULT_DOMAIN_AGENT_POOL } from '@/lib/agent-config'
import type { DomainAgentProfile } from '@/lib/types'

function buildPresetList(): string {
  const profiles: DomainAgentProfile[] = Object.entries(DEFAULT_DOMAIN_AGENT_POOL)
    .filter(([key]) => key !== '_GLOBAL_AGENT_POLICY')
    .flatMap(([, v]) => v as DomainAgentProfile[])

  return profiles
    .map(p => `- id: "${p.id}" | name: "${p.name}" | specialty: ${(p.specialty ?? []).join(', ')}`)
    .join('\n')
}

export const ARCHITECT_JSON_SCHEMA = `{
  "agents": [
    {
      "id": "string (unique, e.g. agent-1)",
      "role": "string (한국어 역할명)",
      "agentKey": "string | null (프리셋 id 또는 null)",
      "model": "gemma4",
      "systemPrompt": "string (역할 설명 + 지침. 반드시 '한국어로 응답하세요' 포함)",
      "dependsOn": ["string[] (이 에이전트가 의존하는 다른 에이전트 id 목록, 빈 배열이면 시작 직후 병렬 실행)"],
      "needsWebSearch": "boolean (이 에이전트 실행 전 웹검색이 필요한지)"
    }
  ],
  "summary": "string (에이전트 N개, 웹검색 N개, 병렬 N개 등 요약)",
  "reasoning": "string (왜 이 구성을 선택했는지)"
}`

export function buildArchitectSystemPrompt(): string {
  return `당신은 Garnet의 Flow Architect입니다. 사용자의 프로젝트 설명을 분석하여 최적의 에이전트 파이프라인을 설계합니다.

사용 가능한 프리셋 에이전트:
${buildPresetList()}

규칙:
- 프리셋에 적합한 에이전트가 있으면 반드시 사용 (agentKey에 프리셋 id 입력)
- 프리셋에 없는 역할이 필요하면 커스텀 에이전트 생성 (agentKey: null, role과 systemPrompt 직접 작성)
- 병렬 실행이 가능한 독립적 역할은 dependsOn을 빈 배열로 설정하여 병렬 배치
- 리서치/데이터 수집이 필요한 에이전트는 needsWebSearch: true로 설정
- 최종 종합/의사결정 역할은 모든 분석 에이전트의 id를 dependsOn에 포함
- 에이전트는 3~8개 범위로 구성
- 모든 systemPrompt에 "한국어로 응답하세요" 포함
- 각 에이전트 id는 고유해야 하며 agent-1, agent-2, ... 형식 사용

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트를 포함하지 마세요:
${ARCHITECT_JSON_SCHEMA}`
}

export function buildArchitectUserPrompt(
  projectDescription: string,
  conversationContext?: string[]
): string {
  const parts = [`프로젝트: ${projectDescription}`]
  if (conversationContext?.length) {
    parts.push(`\n이전 대화:\n${conversationContext.join('\n')}`)
  }
  parts.push('\n위 프로젝트에 최적화된 에이전트 파이프라인을 JSON으로 설계하세요.')
  return parts.join('\n')
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/flow/architect-prompt.ts
git commit -m "feat(flow): add Architect prompt builder with preset agent list"
```

---

### Task 2: Flow Architect 핵심 로직 (`lib/flow/architect.ts`)

**Files:**
- Create: `lib/flow/architect.ts`
- Create: `lib/flow/__tests__/architect.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/flow/__tests__/architect.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/llm', () => ({
  runLLM: vi.fn(),
}))

import { generateFlowBlueprint } from '../architect'
import { runLLM } from '@/lib/llm'

const MOCK_ARCHITECT_RESPONSE = JSON.stringify({
  agents: [
    { id: 'agent-1', role: '시장 분석가', agentKey: null, model: 'gemma4', systemPrompt: '시장 분석 전문가. 한국어로 응답하세요.', dependsOn: [], needsWebSearch: true },
    { id: 'agent-2', role: '마케팅 전략가', agentKey: 'GROWTH_STRATEGIST', model: 'gemma4', systemPrompt: '그로스 전략. 한국어로 응답하세요.', dependsOn: ['agent-1'], needsWebSearch: false },
    { id: 'agent-3', role: '런칭 PM', agentKey: null, model: 'gemma4', systemPrompt: 'PM. 한국어로 응답하세요.', dependsOn: ['agent-2'], needsWebSearch: false },
  ],
  summary: '에이전트 3개, 웹검색 1개',
  reasoning: '카페 프로젝트이므로...'
})

describe('generateFlowBlueprint', () => {
  beforeEach(() => vi.clearAllMocks())

  it('generates valid nodes and edges from LLM response', async () => {
    vi.mocked(runLLM).mockResolvedValue(MOCK_ARCHITECT_RESPONSE)

    const result = await generateFlowBlueprint('카페 창업 마케팅')

    // Should have: start + web-search + 3 agents + end = 6 nodes
    expect(result.nodes).toHaveLength(6)
    expect(result.nodes[0].type).toBe('start')
    expect(result.nodes[result.nodes.length - 1].type).toBe('end')

    // Should have web-search node before agent-1
    const toolNode = result.nodes.find(n => n.type === 'tool')
    expect(toolNode).toBeDefined()

    // Edges should connect properly
    expect(result.edges.length).toBeGreaterThanOrEqual(5)

    // Summary and reasoning should pass through
    expect(result.summary).toContain('에이전트 3개')
    expect(result.reasoning).toContain('카페')
  })

  it('auto-positions nodes by layer', async () => {
    vi.mocked(runLLM).mockResolvedValue(MOCK_ARCHITECT_RESPONSE)

    const result = await generateFlowBlueprint('테스트 프로젝트')

    // All nodes should have positions
    for (const node of result.nodes) {
      expect(node.position.x).toBeGreaterThanOrEqual(0)
      expect(node.position.y).toBeGreaterThanOrEqual(0)
    }

    // Start node should be leftmost
    const start = result.nodes.find(n => n.type === 'start')!
    const others = result.nodes.filter(n => n.type !== 'start')
    for (const n of others) {
      expect(n.position.x).toBeGreaterThan(start.position.x)
    }
  })

  it('retries on invalid JSON', async () => {
    vi.mocked(runLLM)
      .mockResolvedValueOnce('invalid json garbage')
      .mockResolvedValueOnce(MOCK_ARCHITECT_RESPONSE)

    const result = await generateFlowBlueprint('테스트')

    expect(runLLM).toHaveBeenCalledTimes(2)
    expect(result.nodes.length).toBeGreaterThan(0)
  })

  it('throws after max retries', async () => {
    vi.mocked(runLLM)
      .mockResolvedValueOnce('bad')
      .mockResolvedValueOnce('still bad')

    await expect(generateFlowBlueprint('테스트')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run lib/flow/__tests__/architect.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement architect**

Create `lib/flow/architect.ts`:

```typescript
import { runLLM } from '@/lib/llm'
import { kahnSort, validateFlow } from './graph'
import { buildArchitectSystemPrompt, buildArchitectUserPrompt } from './architect-prompt'
import type { FlowNode, FlowEdge, AgentNode, ToolNode, StartNode, EndNode } from './types'
import type { RuntimeConfig } from '@/lib/types'

export type FlowBlueprint = {
  nodes: FlowNode[]
  edges: FlowEdge[]
  summary: string
  reasoning: string
}

type ArchitectAgent = {
  id: string
  role: string
  agentKey: string | null
  model: string
  systemPrompt: string
  dependsOn: string[]
  needsWebSearch: boolean
}

type ArchitectResponse = {
  agents: ArchitectAgent[]
  summary: string
  reasoning: string
}

const MAX_RETRIES = 2

function parseArchitectResponse(raw: string): ArchitectResponse | null {
  try {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    const parsed = JSON.parse(raw.slice(start, end + 1)) as ArchitectResponse
    if (!Array.isArray(parsed.agents) || parsed.agents.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

function buildGraph(response: ArchitectResponse): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []

  // Start node
  const startNode: StartNode = {
    type: 'start', id: 'start-1',
    position: { x: 0, y: 0 },
    data: { topic: '' }
  }
  nodes.push(startNode)

  // Track agent ID → actual node ID (may differ if web-search is inserted)
  const agentNodeMap = new Map<string, string>()

  for (const agent of response.agents) {
    // Insert web-search node before this agent if needed
    if (agent.needsWebSearch) {
      const toolId = `tool-${agent.id}`
      const toolNode: ToolNode = {
        type: 'tool', id: toolId,
        position: { x: 0, y: 0 },
        data: { toolType: 'web-search' }
      }
      nodes.push(toolNode)

      // Web-search depends on same deps as agent, or start if no deps
      if (agent.dependsOn.length === 0) {
        edges.push({ id: `e-start-${toolId}`, source: 'start-1', target: toolId })
      } else {
        for (const depId of agent.dependsOn) {
          const sourceId = agentNodeMap.get(depId) ?? depId
          edges.push({ id: `e-${sourceId}-${toolId}`, source: sourceId, target: toolId })
        }
      }

      // Agent depends on its web-search node
      edges.push({ id: `e-${toolId}-${agent.id}`, source: toolId, target: agent.id })
    } else {
      // Normal dependency edges
      if (agent.dependsOn.length === 0) {
        edges.push({ id: `e-start-${agent.id}`, source: 'start-1', target: agent.id })
      } else {
        for (const depId of agent.dependsOn) {
          const sourceId = agentNodeMap.get(depId) ?? depId
          edges.push({ id: `e-${sourceId}-${agent.id}`, source: sourceId, target: agent.id })
        }
      }
    }

    const agentNode: AgentNode = {
      type: 'agent', id: agent.id,
      position: { x: 0, y: 0 },
      data: {
        role: agent.role,
        agentKey: agent.agentKey ?? undefined,
        model: (agent.model as AgentNode['data']['model']) || 'gemma4',
        systemPrompt: agent.systemPrompt,
      }
    }
    nodes.push(agentNode)
    agentNodeMap.set(agent.id, agent.id)
  }

  // End node
  const endNode: EndNode = {
    type: 'end', id: 'end-1',
    position: { x: 0, y: 0 },
    data: {} as Record<string, never>
  }
  nodes.push(endNode)

  // Find terminal nodes (no outgoing edges to other agents) and connect to end
  const sourcesSet = new Set(edges.map(e => e.source))
  const agentIds = new Set(response.agents.map(a => a.id))
  const terminalIds = response.agents
    .filter(a => !sourcesSet.has(a.id) || ![...edges.filter(e => e.source === a.id)].some(e => agentIds.has(e.target)))
    .map(a => a.id)
  // If no terminal found, use last agent
  const terminators = terminalIds.length > 0 ? terminalIds : [response.agents[response.agents.length - 1].id]
  for (const tid of terminators) {
    edges.push({ id: `e-${tid}-end`, source: tid, target: 'end-1' })
  }

  return { nodes, edges }
}

function autoPosition(nodes: FlowNode[], edges: FlowEdge[]): void {
  try {
    const layers = kahnSort(nodes, edges)
    const LAYER_X_GAP = 200
    const NODE_Y_GAP = 100
    const START_X = 100
    const START_Y = 200

    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li]
      const layerHeight = layer.length * NODE_Y_GAP
      const startY = START_Y - layerHeight / 2 + NODE_Y_GAP / 2

      for (let ni = 0; ni < layer.length; ni++) {
        layer[ni].position = {
          x: START_X + li * LAYER_X_GAP,
          y: startY + ni * NODE_Y_GAP,
        }
      }
    }
  } catch {
    // If kahnSort fails (cycle), just space linearly
    nodes.forEach((n, i) => {
      n.position = { x: 100 + i * 180, y: 200 }
    })
  }
}

function repairGraph(nodes: FlowNode[], edges: FlowEdge[]): FlowEdge[] {
  const nodeIds = new Set(nodes.map(n => n.id))
  return edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
}

export async function generateFlowBlueprint(
  projectDescription: string,
  options?: { conversationContext?: string[] }
): Promise<FlowBlueprint> {
  const systemPrompt = buildArchitectSystemPrompt()
  const userPrompt = buildArchitectUserPrompt(projectDescription, options?.conversationContext)
  const runtime: RuntimeConfig = { llmProvider: 'gemma4' }

  let lastError = ''

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const prompt = attempt === 0
      ? userPrompt
      : `${userPrompt}\n\n이전 시도에서 오류가 발생했습니다: ${lastError}\n올바른 JSON으로 다시 생성해주세요.`

    const raw = await runLLM(systemPrompt, prompt, 0.4, 4000, runtime)
    const parsed = parseArchitectResponse(raw)

    if (!parsed) {
      lastError = 'JSON 파싱 실패'
      continue
    }

    const { nodes, edges } = buildGraph(parsed)
    const repairedEdges = repairGraph(nodes, edges)
    const validationError = validateFlow(nodes, repairedEdges)

    if (validationError) {
      lastError = validationError
      continue
    }

    autoPosition(nodes, repairedEdges)

    return {
      nodes,
      edges: repairedEdges,
      summary: parsed.summary,
      reasoning: parsed.reasoning,
    }
  }

  throw new Error(`플로우 설계에 실패했습니다. 프로젝트를 더 구체적으로 설명해주세요. (${lastError})`)
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run lib/flow/__tests__/architect.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/flow/architect.ts lib/flow/__tests__/architect.test.ts
git commit -m "feat(flow): add Flow Architect — LLM-based flow auto-generation with retry"
```

---

### Task 3: Template Matcher (`lib/flow/template-matcher.ts`)

**Files:**
- Create: `lib/flow/template-matcher.ts`

- [ ] **Step 1: Create template matcher**

```typescript
import { runLLM } from '@/lib/llm'
import type { RuntimeConfig } from '@/lib/types'

export type MatchResult = {
  templateId: string
  templateName: string
  confidence: number
  reason: string
} | null

type TemplateInfo = { id: string; name: string; nodes: string }

export async function matchFlowTemplate(
  userInput: string,
  templates: TemplateInfo[]
): Promise<MatchResult> {
  if (templates.length === 0) return null

  const templateList = templates.map(t => {
    let roles: string[] = []
    try {
      const nodes = JSON.parse(t.nodes) as Array<{ type: string; data?: { role?: string } }>
      roles = nodes.filter(n => n.type === 'agent').map(n => n.data?.role ?? '').filter(Boolean)
    } catch { /* ignore */ }
    return `- id: "${t.id}" | name: "${t.name}" | agents: ${roles.join(', ') || '(없음)'}`
  }).join('\n')

  const systemPrompt = `저장된 플로우 템플릿 목록에서 사용자 요청에 가장 적합한 템플릿을 선택하세요.
매칭되는 것이 없으면 confidence를 0으로 설정하세요.

템플릿 목록:
${templateList}

JSON 형식으로만 응답:
{ "templateId": "string", "templateName": "string", "confidence": 0.0-1.0, "reason": "string" }`

  const runtime: RuntimeConfig = { llmProvider: 'gemma4' }

  try {
    const raw = await runLLM(systemPrompt, userInput, 0.2, 300, runtime)
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      templateId?: string; templateName?: string; confidence?: number; reason?: string
    }
    if (!parsed.templateId || (parsed.confidence ?? 0) < 0.6) return null
    return {
      templateId: parsed.templateId,
      templateName: parsed.templateName ?? '',
      confidence: parsed.confidence ?? 0,
      reason: parsed.reason ?? '',
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/flow/template-matcher.ts
git commit -m "feat(flow): add LLM-based template matcher"
```

---

## Chunk 2: Intent + API Layer

### Task 4: Intent 라우터 확장 (`lib/agent-intent.ts`)

**Files:**
- Modify: `lib/agent-intent.ts`

- [ ] **Step 1: Extend IntentAction type (line 3-6)**

```typescript
// 변경 전
export type IntentAction =
  | { type: 'panel';    panelType: 'ga4' | 'seminar' | 'intel' | 'video' | 'approval' | 'generic'; title: string }
  | { type: 'navigate'; url: string }
  | { type: 'text';     content: string };

// 변경 후
export type IntentAction =
  | { type: 'panel';    panelType: 'ga4' | 'seminar' | 'intel' | 'video' | 'approval' | 'generic'; title: string }
  | { type: 'navigate'; url: string }
  | { type: 'text';     content: string }
  | { type: 'flow-create';   projectDescription: string }
  | { type: 'flow-run';      userInput: string }
  | { type: 'flow-list' }
  | { type: 'flow-converse';  question: string };
```

- [ ] **Step 2: Update INTENT_SYSTEM_PROMPT (line 13-37)**

Add after the `3. text` section (before the closing backtick):

```
4. flow-create — 플로우를 새로 만들거나 에이전트 팀을 구성해야 할 때
   projectDescription: 프로젝트 설명 텍스트

5. flow-run — 기존 플로우를 실행해야 할 때
   userInput: 사용자 입력 원문

6. flow-list — 저장된 플로우 목록을 보여줘야 할 때

7. flow-converse — 플로우 생성을 위해 추가 정보가 필요할 때
   question: 사용자에게 물어볼 질문
```

Also add to the "응답 형식" examples:

```
또는:
{ "action": { "type": "flow-create", "projectDescription": "카페 창업 마케팅" }, "reasoning": "플로우 생성 요청" }
```

- [ ] **Step 3: Update safeParseIntent() (line 73-98)**

After the `if (t === 'text')` block (line 93-95), add:

```typescript
if (t === 'flow-create') {
  return { action: { type: 'flow-create', projectDescription: (obj.action as Record<string, string>).projectDescription ?? '' }, reasoning: obj.reasoning ?? '' }
}
if (t === 'flow-run') {
  return { action: { type: 'flow-run', userInput: (obj.action as Record<string, string>).userInput ?? '' }, reasoning: obj.reasoning ?? '' }
}
if (t === 'flow-list') {
  return { action: { type: 'flow-list' }, reasoning: obj.reasoning ?? '' }
}
if (t === 'flow-converse') {
  return { action: { type: 'flow-converse', question: (obj.action as Record<string, string>).question ?? '' }, reasoning: obj.reasoning ?? '' }
}
```

- [ ] **Step 4: Update keywordFallback() (line 100-112)**

Add before the final `return` (line 111):

```typescript
if (/플로우.*(만들|생성|구성|설계)|에이전트.*팀/.test(lower)) return { action: { type: 'flow-create', projectDescription: command }, reasoning: '플로우 생성 키워드' };
if (/플로우.*(실행|돌려|돌리|시작|run)/.test(lower)) return { action: { type: 'flow-run', userInput: command }, reasoning: '플로우 실행 키워드' };
if (/플로우.*(목록|리스트|저장|보여|list)/.test(lower)) return { action: { type: 'flow-list' }, reasoning: '플로우 목록 키워드' };
```

- [ ] **Step 5: Commit**

```bash
git add lib/agent-intent.ts
git commit -m "feat: add flow-create/run/list/converse intents to agent-intent"
```

---

### Task 5: Canvas 스토어 + API 확장

**Files:**
- Modify: `lib/canvas-store.ts`
- Modify: `app/api/flow-templates/route.ts`

- [ ] **Step 1: Add FlowPreviewData to canvas-store.ts**

After the existing `ApprovalData` type (line 8), add:

```typescript
import type { FlowNode, FlowEdge } from '@/lib/flow/types'

export type FlowPreviewData = {
  nodes: FlowNode[]
  edges: FlowEdge[]
  summary: string
  reasoning?: string
  status: 'preview' | 'running' | 'complete' | 'error'
  runId?: string
}
```

In the `PanelData` union (line 11-17), add after `generic`:

```typescript
| { type: 'flow-preview'; data: FlowPreviewData }
```

- [ ] **Step 2: Extend POST /api/flow-templates/route.ts**

Update `createSchema` to accept optional nodes/edges:

```typescript
const createSchema = z.object({
  name: z.string().min(1).max(200).default('새 플로우'),
  nodes: z.string().optional(),
  edges: z.string().optional(),
})
```

In the POST handler, use provided nodes/edges or defaults:

```typescript
const defaultNodes: FlowNode[] = [
  { type: 'start', id: 'start-1', position: { x: 100, y: 200 }, data: { topic: '토론 주제를 입력하세요' } },
  { type: 'end', id: 'end-1', position: { x: 700, y: 200 }, data: {} },
]
const template = await prisma.flowTemplate.create({
  data: {
    name: body.name,
    nodes: body.nodes ?? JSON.stringify(defaultNodes),
    edges: body.edges ?? JSON.stringify([]),
  },
})
```

- [ ] **Step 3: Commit**

```bash
git add lib/canvas-store.ts app/api/flow-templates/route.ts
git commit -m "feat: add FlowPreviewData to canvas store + extend POST to accept nodes/edges"
```

---

### Task 6: Agent Command API — flow intent 처리

**Files:**
- Modify: `app/api/agent/command/route.ts`

- [ ] **Step 1: Add flow imports and handlers**

Add imports at the top:

```typescript
import { generateFlowBlueprint } from '@/lib/flow/architect'
import { matchFlowTemplate } from '@/lib/flow/template-matcher'
import { prisma } from '@/lib/prisma'
```

In `processCommand()`, after the existing `if (action.type === 'text')` block (line 71), add:

```typescript
// Flow: create
if (action.type === 'flow-create') {
  send(controller, 'step', { entryId: serverEntryId, step: { text: '에이전트 파이프라인을 설계하는 중...', status: 'running' } });
  try {
    const blueprint = await generateFlowBlueprint(action.projectDescription);
    const agentCount = blueprint.nodes.filter(n => n.type === 'agent').length;
    send(controller, 'step', { entryId: serverEntryId, step: { text: `에이전트 ${agentCount}개로 구성된 플로우를 설계했습니다.`, status: 'done' } });
    send(controller, 'flow-preview', {
      nodes: blueprint.nodes,
      edges: blueprint.edges,
      summary: blueprint.summary,
      reasoning: blueprint.reasoning,
    });
  } catch (err) {
    send(controller, 'step', { entryId: serverEntryId, step: { text: err instanceof Error ? err.message : '플로우 설계 실패', status: 'error' } });
  }
  send(controller, 'done', {});
  return;
}

// Flow: run
if (action.type === 'flow-run') {
  send(controller, 'step', { entryId: serverEntryId, step: { text: '플로우를 찾는 중...', status: 'running' } });
  const templates = await prisma.flowTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: { id: true, name: true, nodes: true },
  });
  const match = await matchFlowTemplate(action.userInput, templates);
  if (!match) {
    send(controller, 'step', { entryId: serverEntryId, step: { text: '매칭되는 플로우가 없습니다. 새로 만들까요?', status: 'done' } });
    send(controller, 'panel', {
      type: 'generic', title: '플로우 없음', status: 'active',
      position: { x: 80, y: 80 }, size: { width: 400, height: 200 },
      data: { markdown: `매칭되는 플로우가 없습니다.\n\n"플로우 만들어줘"로 새로 생성할 수 있습니다.` }
    });
    send(controller, 'done', {});
    return;
  }
  send(controller, 'step', { entryId: serverEntryId, step: { text: `'${match.templateName}' 플로우를 찾았습니다.`, status: 'done' } });
  send(controller, 'navigate', { url: `/flow/${match.templateId}` });
  send(controller, 'done', {});
  return;
}

// Flow: list
if (action.type === 'flow-list') {
  send(controller, 'step', { entryId: serverEntryId, step: { text: '플로우 목록 로드 중...', status: 'running' } });
  send(controller, 'step', { entryId: serverEntryId, step: { text: '완료', status: 'done' } });
  send(controller, 'navigate', { url: '/flow' });
  send(controller, 'done', {});
  return;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/agent/command/route.ts
git commit -m "feat: handle flow-create/run/list intents in agent command API"
```

---

## Chunk 3: UI Layer — FlowPreviewPanel + Command Bar

### Task 7: FlowPreviewPanel 컴포넌트

**Files:**
- Create: `components/agent-shell/flow-preview-panel.tsx`

- [ ] **Step 1: Create the panel component**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { kahnSort } from '@/lib/flow/graph'
import { useFlowRunStore } from '@/lib/flow/run-store'
import type { FlowNode, FlowEdge, NodeStatus } from '@/lib/flow/types'
import type { FlowPreviewData } from '@/lib/canvas-store'

type Props = {
  data: FlowPreviewData
  onClose?: () => void
}

const STATUS_COLOR: Record<NodeStatus | 'idle', string> = {
  idle: '#4a6a7a',
  running: '#00d4ff',
  done: '#22c55e',
  error: '#ef4444',
}

function MiniFlowDiagram({ nodes, edges, nodeStatuses }: {
  nodes: FlowNode[]
  edges: FlowEdge[]
  nodeStatuses: Record<string, NodeStatus>
}) {
  // Compute layers
  let layers: FlowNode[][] = []
  try {
    layers = kahnSort(nodes, edges)
  } catch {
    layers = [nodes]
  }

  const LAYER_GAP = 110
  const NODE_GAP = 36
  const START_X = 30
  const NODE_W = 120
  const NODE_H = 28

  // Position map
  const posMap = new Map<string, { cx: number; cy: number }>()
  const totalHeight = Math.max(...layers.map(l => l.length)) * NODE_GAP + 20

  layers.forEach((layer, li) => {
    const x = START_X + li * LAYER_GAP
    const layerH = layer.length * NODE_GAP
    const offsetY = (totalHeight - layerH) / 2

    layer.forEach((node, ni) => {
      posMap.set(node.id, { cx: x + NODE_W / 2, cy: offsetY + ni * NODE_GAP + NODE_H / 2 })
    })
  })

  const svgW = START_X + layers.length * LAYER_GAP + 20
  const svgH = totalHeight + 10

  return (
    <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ minHeight: 120 }}>
      {/* Edges */}
      {edges.map(e => {
        const from = posMap.get(e.source)
        const to = posMap.get(e.target)
        if (!from || !to) return null
        return (
          <line
            key={e.id}
            x1={from.cx + NODE_W / 2 - 10}
            y1={from.cy}
            x2={to.cx - NODE_W / 2 + 10}
            y2={to.cy}
            stroke="#1a3050"
            strokeWidth={1.5}
          />
        )
      })}

      {/* Nodes */}
      {layers.flatMap(layer => layer.map(node => {
        const pos = posMap.get(node.id)
        if (!pos) return null
        const status = nodeStatuses[node.id] ?? 'idle'
        const color = STATUS_COLOR[status]
        const label = node.type === 'start' ? '시작'
          : node.type === 'end' ? '산출물'
          : node.type === 'tool' ? '🔍 웹검색'
          : (node.data as { role?: string }).role ?? node.id

        const isCircle = node.type === 'start' || node.type === 'end'

        if (isCircle) {
          return (
            <g key={node.id}>
              <circle cx={pos.cx} cy={pos.cy} r={14} fill="none" stroke={color} strokeWidth={1.5} />
              <text x={pos.cx} y={pos.cy + 3} textAnchor="middle" fontSize={7} fill={color}>{label}</text>
            </g>
          )
        }

        return (
          <g key={node.id}>
            <rect
              x={pos.cx - NODE_W / 2}
              y={pos.cy - NODE_H / 2}
              width={NODE_W}
              height={NODE_H}
              rx={6}
              fill="rgba(0,20,30,0.8)"
              stroke={color}
              strokeWidth={status === 'running' ? 2 : 1}
            />
            <text
              x={pos.cx}
              y={pos.cy + 3}
              textAnchor="middle"
              fontSize={8}
              fill={status === 'idle' ? '#8899aa' : color}
            >
              {label.length > 14 ? label.slice(0, 13) + '…' : label}
            </text>
            {status === 'running' && (
              <text x={pos.cx + NODE_W / 2 - 12} y={pos.cy + 3} fontSize={8} fill={color}>⟳</text>
            )}
            {status === 'done' && (
              <text x={pos.cx + NODE_W / 2 - 12} y={pos.cy + 3} fontSize={8} fill={color}>✓</text>
            )}
          </g>
        )
      }))}
    </svg>
  )
}

export default function FlowPreviewPanel({ data, onClose }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const nodeStatuses = useFlowRunStore(s => s.nodeStatuses)
  const isRunning = useFlowRunStore(s => s.isRunning)
  const completedRunId = useFlowRunStore(s => s.runId)

  async function handleExecute() {
    setSaving(true)
    try {
      // Save template
      const res = await fetch('/api/flow-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.summary || '자동 생성 플로우',
          nodes: JSON.stringify(data.nodes),
          edges: JSON.stringify(data.edges),
        }),
      })
      const template = await res.json()
      // Navigate to editor and trigger run
      router.push(`/flow/${template.id}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleOpenEditor() {
    setSaving(true)
    try {
      const res = await fetch('/api/flow-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.summary || '자동 생성 플로우',
          nodes: JSON.stringify(data.nodes),
          edges: JSON.stringify(data.edges),
        }),
      })
      const template = await res.json()
      router.push(`/flow/${template.id}`)
    } finally {
      setSaving(false)
    }
  }

  const agentCount = data.nodes.filter(n => n.type === 'agent').length
  const toolCount = data.nodes.filter(n => n.type === 'tool').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8, padding: '8px 0' }}>
      {/* Mini diagram */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MiniFlowDiagram nodes={data.nodes} edges={data.edges} nodeStatuses={nodeStatuses} />
      </div>

      {/* Summary */}
      <div style={{ fontSize: 10, color: '#6090a8', padding: '0 8px' }}>
        에이전트 {agentCount}개{toolCount > 0 ? ` · 웹검색 ${toolCount}개` : ''}
      </div>

      {data.reasoning && (
        <div style={{ fontSize: 9, color: '#4a6a7a', padding: '0 8px', lineHeight: 1.5 }}>
          {data.reasoning.length > 100 ? data.reasoning.slice(0, 100) + '…' : data.reasoning}
        </div>
      )}

      {/* Actions */}
      {!isRunning && !completedRunId && (
        <div style={{ display: 'flex', gap: 6, padding: '0 8px' }}>
          <button
            onClick={handleExecute}
            disabled={saving}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 6,
              background: '#00d4ff', color: '#000', border: 'none',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? '저장 중...' : '▶ 실행'}
          </button>
          <button
            onClick={handleOpenEditor}
            disabled={saving}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 6,
              background: 'transparent', color: '#6090a8', border: '1px solid #1a3050',
              fontSize: 11, cursor: 'pointer', opacity: saving ? 0.5 : 1,
            }}
          >
            ✏ 에디터
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '6px 10px', borderRadius: 6,
              background: 'transparent', color: '#4a6a7a', border: '1px solid #1a3050',
              fontSize: 11, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {completedRunId && !isRunning && (
        <div style={{ padding: '0 8px' }}>
          <a
            href={`/runs/${completedRunId}/report`}
            style={{ fontSize: 11, color: '#00d4ff', textDecoration: 'underline' }}
          >
            결과 보기 →
          </a>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/agent-shell/flow-preview-panel.tsx
git commit -m "feat: add FlowPreviewPanel with SVG mini diagram + execute/editor actions"
```

---

### Task 8: Canvas Panel 렌더링 + Command Bar 이벤트

**Files:**
- Modify: `components/agent-shell/canvas-panel.tsx`
- Modify: `components/agent-shell/command-bar.tsx`

- [ ] **Step 1: Update canvas-panel.tsx — add flow-preview case**

Add import at the top:

```typescript
import FlowPreviewPanel from './flow-preview-panel'
```

In `TypedPanelContent` (line 144-153), add before `default`:

```typescript
case 'flow-preview': return <FlowPreviewPanel data={panel.data} onClose={() => useCanvasStore.getState().removePanel(panel.id)} />;
```

Also import `useCanvasStore`:

```typescript
import { useCanvasStore } from '@/lib/canvas-store'
```

- [ ] **Step 2: Update command-bar.tsx — add flow event handlers**

In `handleSSEEvent` (line 211-242), add before the closing `}`:

```typescript
case 'flow-preview': {
  const d = event.data as { nodes: unknown[]; edges: unknown[]; summary: string; reasoning?: string };
  const pos = getNextPanelPosition(panels, 800);
  const panelId = spawnPanel({
    type: 'flow-preview' as never,
    title: '플로우 미리보기',
    status: 'active',
    position: pos,
    size: { width: 520, height: 400 },
    data: { nodes: d.nodes, edges: d.edges, summary: d.summary, reasoning: d.reasoning, status: 'preview' } as never,
  });
  setEntryStatus(entryId, 'done', panelId);
  break;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add components/agent-shell/canvas-panel.tsx components/agent-shell/command-bar.tsx
git commit -m "feat: connect FlowPreviewPanel to canvas + handle flow SSE events in command bar"
```

---

## Final Verification

- [ ] Dev 서버 시작: `npm run dev`
- [ ] `/shell` 접속 → 커맨드 바에 "카페 창업 마케팅 플로우 만들어줘" 입력
- [ ] Canvas에 FlowPreviewPanel이 표시되는지 확인 (미니 다이어그램 + 버튼)
- [ ] "▶ 실행" 클릭 → 에디터로 이동 + 템플릿 저장 확인
- [ ] "플로우 목록 보여줘" → `/flow`로 이동 확인
- [ ] "지난 플로우 돌려줘" → 매칭 or "없음" 안내 확인

```bash
git log --oneline -10
```
