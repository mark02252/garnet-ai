# Flow Converse + Debate 노드 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shell에서 멀티턴 대화로 플로우를 설계하고, Debate 노드로 에이전트 간 토론/합의 기반 실행을 지원한다.

**Architecture:** Converser LLM이 사용자와 대화하여 상세 브리프를 생성하고, Architect가 이를 기반으로 플로우를 설계한다. 새 Debate 노드 타입이 runner에서 찬성/반대/모더레이터 합의 루프를 실행한다.

**Tech Stack:** Next.js 15, TypeScript, Zustand, ReactFlow, Gemma4/Gemini LLM

**Spec:** `docs/superpowers/specs/2026-04-07-flow-converse-design.md`

---

## Chunk 1: Debate 노드 (types + runner + Architect)

### Task 1: DebateNode 타입 + FlowRunEvent 확장

**Files:**
- Modify: `lib/flow/types.ts`
- Test: `lib/flow/__tests__/types.test.ts`

- [ ] **Step 1: types.ts에 DebateNode 타입 추가**

`lib/flow/types.ts`에서 `EndNode` 타입 뒤, `FlowNode` 유니온 앞에 추가:

```typescript
export type DebateNode = {
  type: 'debate'
  id: string
  position: { x: number; y: number }
  data: {
    topic: string
    rounds: number
    model: AgentNode['data']['model']
    proSystemPrompt: string
    conSystemPrompt: string
  }
}
```

- [ ] **Step 2: FlowNode 유니온에 DebateNode 추가**

```typescript
export type FlowNode = StartNode | AgentNode | ToolNode | EndNode | DebateNode
```

- [ ] **Step 3: FlowRunEvent에 debate-turn 추가**

`FlowRunEvent` 유니온 마지막에:

```typescript
  | { type: 'debate-turn'; nodeId: string; speaker: 'pro' | 'con' | 'moderator'; round: number; content: string }
```

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add lib/flow/types.ts
git commit -m "feat(flow): add DebateNode type and debate-turn event"
```

---

### Task 2: Debate 노드 실행 로직 (runner 확장)

**Files:**
- Create: `lib/flow/debate-runner.ts`
- Modify: `lib/flow/runner.ts:50-105`
- Test: `lib/flow/__tests__/debate-runner.test.ts`

- [ ] **Step 1: debate-runner.ts 테스트 작성**

`lib/flow/__tests__/debate-runner.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

// Mock runLLM
vi.mock('@/lib/llm', () => ({
  runLLM: vi.fn()
}))

import { runLLM } from '@/lib/llm'
import { executeDebateNode } from '../debate-runner'
import type { DebateNode, FlowRunEvent } from '../types'

const mockNode: DebateNode = {
  type: 'debate',
  id: 'debate-1',
  position: { x: 0, y: 0 },
  data: {
    topic: '인스타 vs 틱톡',
    rounds: 2,
    model: 'gemma4',
    proSystemPrompt: '인스타 전문가',
    conSystemPrompt: '틱톡 전문가',
  },
}

describe('executeDebateNode', () => {
  it('runs pro/con/moderator for each round and yields debate-turn events', async () => {
    const mockedRunLLM = vi.mocked(runLLM)
    // Round 1: pro, con, moderator (no consensus)
    mockedRunLLM
      .mockResolvedValueOnce('인스타가 좋습니다')
      .mockResolvedValueOnce('틱톡이 좋습니다')
      .mockResolvedValueOnce(JSON.stringify({ consensus: false, summary: '쟁점 남음', keyInsights: ['점1'], remainingIssues: ['이슈1'] }))
      // Round 2: pro, con, moderator (consensus)
      .mockResolvedValueOnce('인스타 반론')
      .mockResolvedValueOnce('틱톡 반론')
      .mockResolvedValueOnce(JSON.stringify({ consensus: true, summary: '합의 도달', keyInsights: ['인사이트1', '인사이트2'] }))

    const events: FlowRunEvent[] = []
    for await (const event of executeDebateNode(mockNode, '이전 리서치 결과')) {
      events.push(event)
    }

    // 2 rounds × 3 speakers = 6 debate-turn events
    const debateTurns = events.filter(e => e.type === 'debate-turn')
    expect(debateTurns).toHaveLength(6)
    expect(debateTurns[0]).toMatchObject({ speaker: 'pro', round: 1 })
    expect(debateTurns[1]).toMatchObject({ speaker: 'con', round: 1 })
    expect(debateTurns[2]).toMatchObject({ speaker: 'moderator', round: 1 })
    expect(debateTurns[5]).toMatchObject({ speaker: 'moderator', round: 2 })
  })

  it('stops early when moderator reaches consensus in round 1', async () => {
    const mockedRunLLM = vi.mocked(runLLM)
    mockedRunLLM
      .mockResolvedValueOnce('찬성 의견')
      .mockResolvedValueOnce('반대 의견')
      .mockResolvedValueOnce(JSON.stringify({ consensus: true, summary: '즉시 합의', keyInsights: ['핵심'] }))

    const events: FlowRunEvent[] = []
    for await (const event of executeDebateNode(mockNode, '컨텍스트')) {
      events.push(event)
    }

    const debateTurns = events.filter(e => e.type === 'debate-turn')
    expect(debateTurns).toHaveLength(3) // only 1 round
  })

  it('respects abort signal between rounds', async () => {
    const controller = new AbortController()
    const mockedRunLLM = vi.mocked(runLLM)
    mockedRunLLM
      .mockResolvedValueOnce('찬성')
      .mockResolvedValueOnce('반대')
      .mockResolvedValueOnce(JSON.stringify({ consensus: false, summary: '계속', keyInsights: [] }))

    controller.abort() // abort before round 2

    const events: FlowRunEvent[] = []
    for await (const event of executeDebateNode(mockNode, '컨텍스트', controller.signal)) {
      events.push(event)
    }

    // Round 1 completes (3 events), abort checked before round 2 → loop exits
    const debateTurns = events.filter(e => e.type === 'debate-turn')
    expect(debateTurns).toHaveLength(3) // exactly round 1 only
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run lib/flow/__tests__/debate-runner.test.ts`
Expected: FAIL — `executeDebateNode` not found

- [ ] **Step 3: debate-runner.ts 구현**

`lib/flow/debate-runner.ts`:

```typescript
import { runLLM } from '@/lib/llm'
import type { RuntimeConfig } from '@/lib/types'
import type { DebateNode, FlowRunEvent } from './types'

const MODEL_RUNTIME: Record<DebateNode['data']['model'], Partial<RuntimeConfig>> = {
  claude: { llmProvider: 'claude' },
  gemini: { llmProvider: 'gemini' },
  gpt: { llmProvider: 'openai' },
  groq: { llmProvider: 'groq' },
  gemma4: { llmProvider: 'gemma4' },
}

type DebateTurn = { speaker: 'pro' | 'con' | 'moderator'; round: number; content: string }

type ModeratorResult = {
  consensus: boolean
  summary: string
  keyInsights: string[]
  remainingIssues?: string[]
}

function buildDebatePrompt(
  speaker: 'pro' | 'con',
  topic: string,
  upstreamContext: string,
  history: DebateTurn[]
): string {
  const historyText = history
    .map(t => `[라운드 ${t.round} - ${t.speaker === 'pro' ? '찬성' : t.speaker === 'con' ? '반대' : '모더레이터'}]\n${t.content}`)
    .join('\n\n')

  return `토론 주제: ${topic}

이전 분석 결과:
${upstreamContext}

${historyText ? `지금까지의 토론:\n${historyText}\n\n` : ''}당신은 ${speaker === 'pro' ? '찬성' : '반대'} 측입니다. 논리적이고 구체적으로 주장하세요. 한국어로 응답하세요.`
}

function buildModeratorPrompt(topic: string, history: DebateTurn[]): string {
  const historyText = history
    .map(t => `[라운드 ${t.round} - ${t.speaker === 'pro' ? '찬성' : t.speaker === 'con' ? '반대' : '모더레이터'}]\n${t.content}`)
    .join('\n\n')

  return `토론 주제: ${topic}

토론 내용:
${historyText}

위 토론을 분석하여 아래 JSON으로만 응답하세요:
{
  "consensus": boolean,
  "summary": "현재까지 논의 요약",
  "keyInsights": ["핵심 인사이트 1", "핵심 인사이트 2"],
  "remainingIssues": ["미해결 쟁점"] // consensus가 false일 때만
}

합의 기준: 양측이 핵심 포인트에서 수렴하거나, 명확한 최적 방향이 도출되면 consensus: true.`
}

function parseModeratorResult(raw: string, isLastRound: boolean): ModeratorResult {
  try {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end <= start) throw new Error('no JSON')
    const parsed = JSON.parse(raw.slice(start, end + 1)) as ModeratorResult
    if (typeof parsed.consensus !== 'boolean') throw new Error('no consensus field')
    return {
      consensus: parsed.consensus,
      summary: parsed.summary ?? '요약 없음',
      keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [],
      remainingIssues: parsed.remainingIssues,
    }
  } catch {
    // 파싱 실패: 마지막 라운드면 강제 종료, 아니면 계속
    return {
      consensus: isLastRound,
      summary: raw.slice(0, 500),
      keyInsights: [],
    }
  }
}

const MODERATOR_SYSTEM = `당신은 공정한 토론 모더레이터입니다. 양측의 주장을 분석하고 합의점을 도출합니다. 반드시 JSON으로만 응답하세요. 한국어로 응답하세요.`

/**
 * Executes a debate node: pro/con agents alternate for up to N rounds,
 * moderator checks consensus after each round.
 * Returns final moderator summary as the node output string.
 */
export async function* executeDebateNode(
  node: DebateNode,
  upstreamContext: string,
  signal?: AbortSignal
): AsyncGenerator<FlowRunEvent, string> {
  const runtime = MODEL_RUNTIME[node.data.model] as RuntimeConfig
  const history: DebateTurn[] = []
  let lastModResult: ModeratorResult = { consensus: false, summary: '', keyInsights: [] }
  const maxRounds = node.data.rounds || 3

  for (let round = 1; round <= maxRounds; round++) {
    // Abort check between rounds (skip round 1 check)
    if (round > 1 && signal?.aborted) break

    const isLastRound = round === maxRounds

    // Pro agent
    let proContent = '[응답 없음]'
    try {
      const proPrompt = buildDebatePrompt('pro', node.data.topic, upstreamContext, history)
      const proSystemPrompt = node.data.proSystemPrompt.includes('한국어')
        ? node.data.proSystemPrompt
        : `${node.data.proSystemPrompt}\n\n반드시 한국어로 응답하세요.`
      proContent = await runLLM(proSystemPrompt, proPrompt, 0.7, 2400, runtime)
    } catch { /* use fallback */ }
    history.push({ speaker: 'pro', round, content: proContent })
    yield { type: 'debate-turn', nodeId: node.id, speaker: 'pro', round, content: proContent }

    // Con agent
    let conContent = '[응답 없음]'
    try {
      const conPrompt = buildDebatePrompt('con', node.data.topic, upstreamContext, history)
      const conSystemPrompt = node.data.conSystemPrompt.includes('한국어')
        ? node.data.conSystemPrompt
        : `${node.data.conSystemPrompt}\n\n반드시 한국어로 응답하세요.`
      conContent = await runLLM(conSystemPrompt, conPrompt, 0.7, 2400, runtime)
    } catch { /* use fallback */ }
    history.push({ speaker: 'con', round, content: conContent })
    yield { type: 'debate-turn', nodeId: node.id, speaker: 'con', round, content: conContent }

    // Moderator
    const modPrompt = buildModeratorPrompt(node.data.topic, history)
    let modRaw = ''
    try {
      modRaw = await runLLM(MODERATOR_SYSTEM, modPrompt, 0.3, 1200, runtime)
    } catch {
      modRaw = ''
    }
    lastModResult = parseModeratorResult(modRaw, isLastRound)
    history.push({ speaker: 'moderator', round, content: lastModResult.summary })
    yield { type: 'debate-turn', nodeId: node.id, speaker: 'moderator', round, content: lastModResult.summary }

    if (lastModResult.consensus) break
  }

  // Build final output
  const output = `${lastModResult.summary}\n\n핵심 인사이트:\n${lastModResult.keyInsights.map(i => `- ${i}`).join('\n')}`
  return output
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run lib/flow/__tests__/debate-runner.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: runner.ts에 debate 노드 처리 추가**

`lib/flow/runner.ts` 수정 — import 추가 (line 1 부근):

```typescript
import { executeDebateNode } from './debate-runner'
```

import에 `DebateNode` 추가:

```typescript
import type { FlowNode, FlowEdge, RunInput, FlowRunEvent, AgentNode, DebateNode } from './types'
```

debate 노드는 Promise.all 내부에서 직접 yield할 수 없으므로, runnableNodes를 debate/regular로 분리하여 처리합니다.

`runnableNodes` 정의 직후 (line 56 근처)에 분리 로직 추가:

```typescript
    // Split debate nodes from regular nodes — debate needs sequential yield
    const debateNodes = runnableNodes.filter(n => n.type === 'debate')
    const regularNodes = runnableNodes.filter(n => n.type !== 'debate')
```

기존 `node-start` emit과 Promise.all은 `regularNodes`에 대해서만 실행하도록 변경.

그 뒤에 debate 노드를 순차 실행하며 debate-turn 이벤트를 직접 yield:

```typescript
    // Execute debate nodes sequentially (yields debate-turn events directly)
    for (const node of debateNodes) {
      yield { type: 'node-start', nodeId: node.id }
      const upstreamTexts = (upstreamMap.get(node.id) ?? []).map(id => context.get(id) ?? '').filter(Boolean)
      try {
        const gen = executeDebateNode(node as DebateNode, upstreamTexts.join('\n\n'), signal)
        let result = await gen.next()
        while (!result.done) {
          yield result.value
          result = await gen.next()
        }
        context.set(node.id, result.value)
        yield { type: 'node-done', nodeId: node.id, output: result.value }
      } catch (err) {
        yield { type: 'node-error', nodeId: node.id, error: err instanceof Error ? err.message : String(err) }
      }
    }
```

- [ ] **Step 6: 타입 체크 + 기존 테스트**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -20 && npx vitest run lib/flow/__tests__/`
Expected: 에러 없음, 기존 테스트 통과

- [ ] **Step 7: 커밋**

```bash
git add lib/flow/debate-runner.ts lib/flow/__tests__/debate-runner.test.ts lib/flow/runner.ts
git commit -m "feat(flow): add debate node execution with consensus-based loop"
```

---

### Task 3: Architect 프롬프트에 Debate 노드 지원 추가

**Files:**
- Modify: `lib/flow/architect-prompt.ts`
- Modify: `lib/flow/architect.ts:60-106`

- [ ] **Step 1: ARCHITECT_JSON_SCHEMA에 debate 타입 추가**

`lib/flow/architect-prompt.ts`의 `ARCHITECT_JSON_SCHEMA` (line 13-26) 교체:

```typescript
export const ARCHITECT_JSON_SCHEMA = `{
  "agents": [
    {
      "id": "string (unique, e.g. agent-1)",
      "type": "agent",
      "role": "string (한국어 역할명)",
      "agentKey": "string | null (프리셋 id 또는 null)",
      "model": "gemma4",
      "systemPrompt": "string (역할 설명 + 지침. 반드시 '한국어로 응답하세요' 포함)",
      "dependsOn": ["string[]"],
      "needsWebSearch": "boolean"
    },
    {
      "id": "string (unique, e.g. debate-1)",
      "type": "debate",
      "topic": "string (토론 주제)",
      "rounds": 2,
      "model": "gemma4",
      "proSystemPrompt": "string (찬성 측 역할 + 관점)",
      "conSystemPrompt": "string (반대 측 역할 + 관점)",
      "dependsOn": ["string[]"],
      "needsWebSearch": false
    }
  ],
  "summary": "string",
  "reasoning": "string"
}`
```

- [ ] **Step 2: buildArchitectSystemPrompt에 debate 규칙 추가**

`lib/flow/architect-prompt.ts`의 `buildArchitectSystemPrompt()` 규칙 목록에 추가:

```
- 비교/분석/검증이 필요한 주제에는 type: "debate" 노드를 배치
- debate 노드의 proSystemPrompt와 conSystemPrompt에는 서로 대립되는 관점을 부여
- 단순 정보 수집/작성에는 debate를 사용하지 않음. 전략적 판단이 필요할 때만 사용
- debate 노드의 needsWebSearch는 항상 false (리서치 에이전트가 별도로 담당)
```

- [ ] **Step 3: architect.ts의 buildGraph에서 debate 노드 처리**

`lib/flow/architect.ts`의 `ArchitectAgent` 타입 (line 14-22) 확장:

```typescript
type ArchitectEntry = {
  id: string
  type?: 'agent' | 'debate'
  role?: string
  agentKey?: string | null
  model: string
  systemPrompt?: string
  dependsOn: string[]
  needsWebSearch?: boolean
  // debate-specific
  topic?: string
  rounds?: number
  proSystemPrompt?: string
  conSystemPrompt?: string
}

type ArchitectResponse = {
  agents: ArchitectEntry[]
  summary: string
  reasoning: string
}
```

`buildGraph` 함수 (line 45-130)의 for 루프 내, agent 노드 생성 부분 (line 95-106) 수정:

```typescript
    const entryType = agent.type ?? 'agent'

    if (entryType === 'debate') {
      const debateNode: DebateNode = {
        type: 'debate', id: agent.id,
        position: { x: 0, y: 0 },
        data: {
          topic: agent.topic ?? agent.role ?? '',
          rounds: agent.rounds ?? 2,
          model: (agent.model as AgentNode['data']['model']) || 'gemma4',
          proSystemPrompt: agent.proSystemPrompt ?? '',
          conSystemPrompt: agent.conSystemPrompt ?? '',
        }
      }
      nodes.push(debateNode)
    } else {
      const agentNode: AgentNode = {
        type: 'agent', id: agent.id,
        position: { x: 0, y: 0 },
        data: {
          role: agent.role ?? '',
          agentKey: agent.agentKey ?? undefined,
          model: (agent.model as AgentNode['data']['model']) || 'gemma4',
          systemPrompt: agent.systemPrompt ?? '',
        }
      }
      nodes.push(agentNode)
    }
    agentNodeMap.set(agent.id, agent.id)
```

import에 `DebateNode` 추가:

```typescript
import type { FlowNode, FlowEdge, AgentNode, ToolNode, StartNode, EndNode, DebateNode } from './types'
```

- [ ] **Step 4: 타입 체크 + 기존 architect 테스트**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -20 && npx vitest run lib/flow/__tests__/architect.test.ts`
Expected: 통과

- [ ] **Step 5: 커밋**

```bash
git add lib/flow/architect-prompt.ts lib/flow/architect.ts
git commit -m "feat(flow): add debate node support to Architect prompt and graph builder"
```

---

### Task 4: DebateNode ReactFlow 컴포넌트

**Files:**
- Create: `app/(domains)/flow/[id]/components/nodes/DebateNode.tsx`
- Modify: `app/(domains)/flow/[id]/components/FlowCanvas.tsx`

- [ ] **Step 1: DebateNode.tsx 생성**

```typescript
'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

type DebateData = {
  topic: string
  rounds: number
  model: string
  status?: string
}

function DebateNodeComponent({ data }: NodeProps) {
  const d = data as unknown as DebateData
  const statusColor =
    d.status === 'running' ? 'border-yellow-400' :
    d.status === 'done' ? 'border-green-400' :
    d.status === 'error' ? 'border-red-400' :
    'border-purple-400'

  return (
    <div className={`rounded-lg border-2 ${statusColor} bg-gray-900/90 px-4 py-3 min-w-[180px]`}>
      <Handle type="target" position={Position.Left} className="!bg-purple-400" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-purple-400 text-sm">⚔</span>
        <span className="text-xs font-semibold text-purple-300">토론</span>
        <span className="ml-auto text-[10px] text-gray-500">{d.rounds}R</span>
      </div>
      <div className="text-xs text-gray-300 truncate">{d.topic}</div>
      <div className="text-[10px] text-gray-500 mt-1">{d.model}</div>
      <Handle type="source" position={Position.Right} className="!bg-purple-400" />
    </div>
  )
}

export default memo(DebateNodeComponent)
```

- [ ] **Step 2: FlowCanvas.tsx에 debate 노드 타입 등록**

FlowCanvas.tsx의 `nodeTypes` 객체에 추가:

```typescript
import DebateNode from './nodes/DebateNode'

const nodeTypes = {
  start: StartNode,
  agent: AgentNode,
  tool: ToolNode,
  end: EndNode,
  debate: DebateNode,
}
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add app/\(domains\)/flow/\[id\]/components/nodes/DebateNode.tsx app/\(domains\)/flow/\[id\]/components/FlowCanvas.tsx
git commit -m "feat(flow): add DebateNode ReactFlow component"
```

---

### Task 5: Run API Route에 debate 노드 이름 매핑 추가

**Files:**
- Modify: `app/api/flow-templates/[id]/run/route.ts`

**참고:** `flow-result-dashboard.tsx`는 변경 불필요. debate 노드 출력이 `합의문\n\n핵심 인사이트:\n- ...` 형식이므로 기존 SimpleMarkdown 렌더러가 그대로 처리합니다.

- [ ] **Step 1: run route의 nodeNames 매핑에 debate 추가**

`app/api/flow-templates/[id]/run/route.ts`에서 nodeNames 생성 부분 수정:

```typescript
const nodeNames: Record<string, string> = {}
for (const node of nodes) {
  if (node.type === 'agent') nodeNames[node.id] = node.data.role
  else if (node.type === 'debate') nodeNames[node.id] = `⚔ ${node.data.topic}`
  else if (node.type === 'tool') nodeNames[node.id] = '🔍 웹검색'
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/api/flow-templates/\[id\]/run/route.ts
git commit -m "feat(flow): add debate node name in result dashboard"
```

---

## Chunk 2: Converser (대화형 플로우 설계)

### Task 6: Converser 프롬프트 + LLM 함수

**Files:**
- Create: `lib/flow/converser-prompt.ts`
- Create: `lib/flow/converser.ts`
- Test: `lib/flow/__tests__/converser.test.ts`

- [ ] **Step 1: converser 테스트 작성**

`lib/flow/__tests__/converser.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/llm', () => ({
  runLLM: vi.fn()
}))

import { runLLM } from '@/lib/llm'
import { converseForFlow } from '../converser'

describe('converseForFlow', () => {
  it('returns question when info is insufficient', async () => {
    vi.mocked(runLLM).mockResolvedValueOnce(
      JSON.stringify({ mode: 'question', question: '어떤 프로젝트인가요?' })
    )
    const result = await converseForFlow('플로우 만들어줘', [])
    expect(result.mode).toBe('question')
    if (result.mode === 'question') {
      expect(result.question).toBeTruthy()
    }
  })

  it('returns ready when info is sufficient', async () => {
    vi.mocked(runLLM).mockResolvedValueOnce(
      JSON.stringify({ mode: 'ready', summary: '카페 마케팅 전략', brief: '강남 카페 3호점 인스타 마케팅' })
    )
    const result = await converseForFlow('강남 카페 인스타 마케팅', ['user: 이전 대화'])
    expect(result.mode).toBe('ready')
    if (result.mode === 'ready') {
      expect(result.summary).toBeTruthy()
      expect(result.brief).toBeTruthy()
    }
  })

  it('falls back to question on parse failure', async () => {
    vi.mocked(runLLM).mockResolvedValueOnce('invalid json response')
    const result = await converseForFlow('테스트', [])
    expect(result.mode).toBe('question')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run lib/flow/__tests__/converser.test.ts`
Expected: FAIL

- [ ] **Step 3: converser-prompt.ts 작성**

```typescript
export function buildConverserSystemPrompt(): string {
  return `당신은 Garnet의 Flow Converser입니다. 사용자가 에이전트 팀(플로우)을 설계하려 합니다.
사용자와 대화하며 프로젝트를 이해하고, 충분한 정보가 모이면 설계를 진행합니다.

수집해야 할 정보:
1. 프로젝트 목표 (무엇을 달성하려는가)
2. 타겟/대상 (누구를 위한 것인가)
3. 제약조건 (예산, 기간, 채널 등)
4. 기대 산출물 (보고서, 전략, 콘텐츠 등)
5. 토론 필요 여부 (비교/검증이 필요한 주제인가)

규칙:
- 한 번에 하나의 질문만 하세요
- 이미 수집된 정보는 다시 묻지 마세요
- 충분한 정보가 모이면 즉시 ready 모드로 전환하세요
- 첫 메시지가 충분히 구체적이면 바로 ready를 반환하세요

반드시 아래 JSON 형식으로만 응답하세요:

정보가 부족할 때:
{ "mode": "question", "question": "구체적인 질문 하나" }

정보가 충분할 때:
{ "mode": "ready", "summary": "프로젝트 요약 (1-2문장)", "brief": "에이전트 팀 설계를 위한 상세 브리프 (목표, 타겟, 제약, 산출물, 토론 주제 등 모든 수집 정보 포함)" }`
}

export function buildConverserUserPrompt(
  userMessage: string,
  conversationHistory: string[]
): string {
  const parts: string[] = []
  if (conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-20)
    parts.push(`이전 대화:\n${recent.join('\n')}`)
  }
  parts.push(`사용자: ${userMessage}`)
  return parts.join('\n\n')
}
```

- [ ] **Step 4: converser.ts 작성**

```typescript
import { runLLM } from '@/lib/llm'
import type { RuntimeConfig } from '@/lib/types'
import { buildConverserSystemPrompt, buildConverserUserPrompt } from './converser-prompt'

export type ConverserResult =
  | { mode: 'question'; question: string }
  | { mode: 'ready'; summary: string; brief: string }

export async function converseForFlow(
  userMessage: string,
  conversationHistory: string[]
): Promise<ConverserResult> {
  const systemPrompt = buildConverserSystemPrompt()
  const userPrompt = buildConverserUserPrompt(userMessage, conversationHistory)
  const runtime: RuntimeConfig = { llmProvider: 'gemma4' }

  try {
    const raw = await runLLM(systemPrompt, userPrompt, 0.3, 800, runtime)
    const parsed = parseConverserResponse(raw)
    if (parsed) return parsed
  } catch { /* fall through */ }

  return { mode: 'question', question: '좀 더 구체적으로 설명해주세요. 어떤 프로젝트의 플로우를 만들고 싶으신가요?' }
}

function parseConverserResponse(raw: string): ConverserResult | null {
  try {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>

    if (parsed.mode === 'question' && typeof parsed.question === 'string') {
      return { mode: 'question', question: parsed.question }
    }
    if (parsed.mode === 'ready' && typeof parsed.summary === 'string' && typeof parsed.brief === 'string') {
      return { mode: 'ready', summary: parsed.summary, brief: parsed.brief }
    }
    return null
  } catch {
    return null
  }
}
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `npx vitest run lib/flow/__tests__/converser.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: 커밋**

```bash
git add lib/flow/converser-prompt.ts lib/flow/converser.ts lib/flow/__tests__/converser.test.ts
git commit -m "feat(flow): add Converser LLM for multi-turn flow design dialogue"
```

---

### Task 7: 서버 핸들러 — flow-converse + flow-converse-confirm

**Files:**
- Modify: `app/api/agent/command/route.ts`
- Modify: `lib/agent-intent.ts:140`

- [ ] **Step 1: agent-intent.ts 타입 정의 확인 + 키워드 폴백 변경**

`lib/agent-intent.ts`의 `IntentAction` 유니온 (line 3-10)에 `flow-converse` 타입이 이미 정의되어 있음을 확인:

```typescript
| { type: 'flow-converse';  question: string };
```

이 타입의 `question` 필드를 핸들러에서 사용합니다.

line 140 키워드 폴백 변경:

```typescript
// 변경 전
if (/플로우.*(만들|생성|구성|설계)|에이전트.*팀/.test(lower)) return { action: { type: 'flow-create', projectDescription: command }, reasoning: '플로우 생성 키워드' };

// 변경 후
if (/플로우.*(만들|생성|구성|설계)|에이전트.*팀/.test(lower)) return { action: { type: 'flow-converse', question: command }, reasoning: '플로우 대화형 생성 키워드' };
```

- [ ] **Step 2: route.ts body 파싱 확장 + flow-converse 핸들러 추가**

`app/api/agent/command/route.ts`에 import 추가:

```typescript
import { converseForFlow } from '@/lib/flow/converser'
```

route.ts line 17의 body 파싱을 확장 (req.json()은 한 번만 호출):

```typescript
// 변경 전
const { text } = (await req.json()) as { text: string };

// 변경 후
const body = (await req.json()) as { text: string; conversationHistory?: string[]; brief?: string };
const { text, conversationHistory, brief } = body;
```

`processCommand` 시그니처에 `conversationHistory`와 `brief` 전달:

```typescript
await processCommand(text.trim(), controller, conversationHistory, brief);
```

```typescript
async function processCommand(
  text: string,
  controller: ReadableStreamDefaultController,
  conversationHistory?: string[],
  brief?: string
) {
```

`flow-create` 블록 앞에 `flow-converse` 핸들러 추가:

```typescript
  // Flow: converse (multi-turn design dialogue)
  if (action.type === 'flow-converse') {
    send(controller, 'step', { entryId: serverEntryId, step: { text: '플로우 설계 대화 진행 중...', status: 'running' } });
    try {
      const result = await converseForFlow(action.question, conversationHistory ?? [])
      send(controller, 'flow-converse', result);
      send(controller, 'step', { entryId: serverEntryId, step: { text: result.mode === 'ready' ? '설계 준비 완료' : '추가 정보 요청', status: 'done' } });
    } catch (err) {
      send(controller, 'step', { entryId: serverEntryId, step: { text: err instanceof Error ? err.message : '대화 오류', status: 'error' } });
    }
    send(controller, 'done', {});
    return;
  }
```

기존 `flow-create` 블록에서 `brief`를 우선 사용 (Converser ready 후 승인 시 클라이언트가 brief를 전달):

```typescript
  if (action.type === 'flow-create') {
    send(controller, 'step', { entryId: serverEntryId, step: { text: '에이전트 파이프라인을 설계하는 중...', status: 'running' } });
    try {
      const description = brief || action.projectDescription;
      const blueprint = await generateFlowBlueprint(description, {
        conversationContext: conversationHistory,
      });
```

**참고:** 스펙의 `flow-converse-confirm`은 별도 인텐트 타입 대신, 클라이언트가 brief를 포함하여 `flow-create` 인텐트로 재전송하는 방식으로 구현합니다. 이유: 추가 인텐트 타입 없이 기존 flow-create 파이프라인을 재사용하여 복잡도를 줄임.

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add app/api/agent/command/route.ts lib/agent-intent.ts
git commit -m "feat(flow): add flow-converse server handler with Converser integration"
```

---

### Task 8: 클라이언트 — flow-converse SSE 이벤트 처리

**Files:**
- Modify: `components/agent-shell/command-bar.tsx`

- [ ] **Step 1: handleSSEEvent에 flow-converse case 추가**

`command-bar.tsx`의 `handleSSEEvent` 함수, `case 'flow-preview'` 블록 뒤에:

```typescript
    case 'flow-converse': {
      const d = event.data as { mode: string; question?: string; summary?: string; brief?: string };
      if (d.mode === 'question') {
        addStep(entryId, { text: d.question ?? '', status: 'done' });
      } else if (d.mode === 'ready') {
        addStep(entryId, { text: `📋 ${d.summary}\n\n이 구성으로 플로우를 만들까요? "만들어줘"라고 입력하세요.`, status: 'done' });
        // Store brief in sessionStorage for confirmation
        if (d.brief) {
          sessionStorage.setItem('garnet-flow-brief', d.brief);
        }
      }
      break;
    }
```

- [ ] **Step 2: handleSubmit에 conversationHistory 전달**

`command-bar.tsx`의 `handleSubmit` (line 23), fetch body 수정:

```typescript
      // Build conversation history from recent stream entries
      const entries = useStreamStore.getState().entries;
      const recentHistory = entries.slice(-20).flatMap(entry => {
        const parts: string[] = [`user: ${entry.text}`];
        for (const step of entry.steps) {
          if (step.status === 'done' && step.text) {
            parts.push(`assistant: ${step.text}`);
          }
        }
        return parts;
      });

      // Check if this is a flow-converse-confirm
      const pendingBrief = sessionStorage.getItem('garnet-flow-brief');
      const isConfirm = pendingBrief && /만들|생성|응|네|좋아|진행/.test(text.trim());
      if (isConfirm) {
        sessionStorage.removeItem('garnet-flow-brief');
      }

      const res = await fetch('/api/agent/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: isConfirm ? `플로우 만들어줘: ${pendingBrief}` : text.trim(),
          conversationHistory: recentHistory,
          ...(isConfirm ? { brief: pendingBrief } : {}),
        })
      });
```

import에 `useStreamStore` 추가 (이미 있으면 스킵).

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add components/agent-shell/command-bar.tsx
git commit -m "feat(flow): handle flow-converse SSE events in command bar"
```

---

### Task 9: 통합 테스트 + 최종 검증

**Files:**
- All modified files

- [ ] **Step 1: 전체 타입 체크**

Run: `npx tsc --noEmit --pretty false`
Expected: 에러 없음

- [ ] **Step 2: 전체 테스트**

Run: `npx vitest run lib/flow/__tests__/`
Expected: 모든 테스트 통과

- [ ] **Step 3: 빌드 확인**

Run: `npm run build:next 2>&1 | tail -20`
Expected: 빌드 성공

- [ ] **Step 4: 수동 테스트 시나리오**

1. Shell에서 "카페 마케팅 플로우 만들어줘" 입력
2. → Converser가 질문 반환 확인
3. 구체적 답변 입력 (타겟, 채널 등)
4. → "만들까요?" 확인 메시지 나오면 "만들어줘" 입력
5. → FlowPreviewPanel 표시 확인
6. → 실행 시 debate 노드가 포함된 플로우 확인 (토론 주제가 있는 경우)
7. → debate-turn 이벤트가 SSE로 전달되는지 확인

- [ ] **Step 5: 최종 커밋 (필요 시)**

```bash
git add -A
git commit -m "fix(flow): integration fixes for flow-converse and debate"
```
