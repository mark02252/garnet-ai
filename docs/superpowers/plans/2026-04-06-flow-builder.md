# Flow Builder Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/flow` page where users drag-and-drop agent nodes onto a ReactFlow canvas, wire them into a pipeline, save it as a `FlowTemplate`, and execute it with real-time SSE status updates per node.

**Architecture:** Pure-function execution engine (`lib/flow/runner.ts`) separated from DB/SSE concerns so it can be unit-tested; Zustand store holds live run state on the client; ReactFlow canvas in a `'use client'` component tree under `app/(domains)/flow/[id]`. Existing `/seminar` pipeline is untouched.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma (PostgreSQL), Zustand, Tailwind CSS, Zod, Vitest, `@xyflow/react`

---

## Chunk 1: Data Layer

### Task 1: Install @xyflow/react + Prisma FlowTemplate model

**Files:**
- Modify: `prisma/schema.prisma` (end of file)
- Run: `npm install @xyflow/react`

- [ ] **Step 1: Install the ReactFlow library**

```bash
npm install @xyflow/react
```

Expected: `@xyflow/react` appears in `package.json` dependencies.

- [ ] **Step 2: Add FlowTemplate model to prisma/schema.prisma**

Append after the last model (before any closing braces if present):

```prisma
model FlowTemplate {
  id          String    @id @default(cuid())
  name        String
  description String?
  nodes       String    // JSON: FlowNode[]
  edges       String    // JSON: FlowEdge[]
  lastRunAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

- [ ] **Step 3: Push schema to database**

```bash
npx prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client`.

- [ ] **Step 5: Commit**

```bash
# Stage schema + whichever lockfile your package manager uses
git add prisma/schema.prisma package.json
git add package-lock.json 2>/dev/null || git add pnpm-lock.yaml 2>/dev/null || git add yarn.lock 2>/dev/null || true
git commit -m "feat(flow): add FlowTemplate schema + install @xyflow/react"
```

---

### Task 2: Flow types + pure validation helpers

**Files:**
- Create: `lib/flow/types.ts`
- Create: `lib/flow/graph.ts` (pure graph functions — testable)
- Create: `lib/flow/__tests__/graph.test.ts`

- [ ] **Step 1: Write the failing tests for graph utilities**

Create `lib/flow/__tests__/graph.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { kahnSort, getStartNode, buildUserPrompt } from '../graph'
import type { FlowNode, FlowEdge } from '../types'

const start: FlowNode = { type: 'start', id: 's1', position: { x: 0, y: 0 }, data: { topic: 'test topic' } }
const agent1: FlowNode = { type: 'agent', id: 'a1', position: { x: 0, y: 0 }, data: { role: '전략가', model: 'claude', systemPrompt: 'you are a strategist' } }
const agent2: FlowNode = { type: 'agent', id: 'a2', position: { x: 0, y: 0 }, data: { role: '분석가', model: 'gemini', systemPrompt: 'you are an analyst' } }
const end: FlowNode = { type: 'end', id: 'e1', position: { x: 0, y: 0 }, data: {} }

describe('kahnSort', () => {
  it('sorts a simple chain', () => {
    const nodes = [start, agent1, end]
    const edges: FlowEdge[] = [
      { id: 'e1', source: 's1', target: 'a1' },
      { id: 'e2', source: 'a1', target: 'e1' },
    ]
    const layers = kahnSort(nodes, edges)
    expect(layers).toHaveLength(3)
    expect(layers[0].map(n => n.id)).toEqual(['s1'])
    expect(layers[1].map(n => n.id)).toEqual(['a1'])
    expect(layers[2].map(n => n.id)).toEqual(['e1'])
  })

  it('handles parallel nodes at same depth', () => {
    const nodes = [start, agent1, agent2, end]
    const edges: FlowEdge[] = [
      { id: 'e1', source: 's1', target: 'a1' },
      { id: 'e2', source: 's1', target: 'a2' },
      { id: 'e3', source: 'a1', target: 'e1' },
      { id: 'e4', source: 'a2', target: 'e1' },
    ]
    const layers = kahnSort(nodes, edges)
    expect(layers).toHaveLength(3)
    expect(layers[0].map(n => n.id)).toEqual(['s1'])
    expect(layers[1].map(n => n.id).sort()).toEqual(['a1', 'a2'])
    expect(layers[2].map(n => n.id)).toEqual(['e1'])
  })

  it('throws on cycle', () => {
    const nodes = [start, agent1, end]
    const edges: FlowEdge[] = [
      { id: 'e1', source: 's1', target: 'a1' },
      { id: 'e2', source: 'a1', target: 'a1' }, // self-cycle
      { id: 'e3', source: 'a1', target: 'e1' },
    ]
    expect(() => kahnSort(nodes, edges)).toThrow('cycle')
  })
})

describe('buildUserPrompt', () => {
  it('always includes topic header from runInput.topic, not context', () => {
    const context = new Map([['s1', 'context topic']])
    // topic param overrides whatever is in context
    const result = buildUserPrompt(agent1, [start], context, 'override topic')
    expect(result).toContain('주제: override topic')
    expect(result).toContain('당신의 역할(전략가)')
  })

  it('labels AgentNode upstream with role name', () => {
    const context = new Map([['s1', 'topic'], ['a1', 'agent output']])
    const result = buildUserPrompt(agent2, [start, agent1], context, 'topic')
    expect(result).toContain('[전략가]')
    expect(result).toContain('agent output')
  })

  it('labels ToolNode upstream as 웹 검색 결과', () => {
    const tool: FlowNode = { type: 'tool', id: 't1', position: { x: 0, y: 0 }, data: { toolType: 'web-search' } }
    const context = new Map([['s1', 'topic'], ['t1', 'search results here']])
    const result = buildUserPrompt(agent1, [start, tool], context, 'topic')
    expect(result).toContain('[웹 검색 결과]')
    expect(result).toContain('search results here')
  })

  it('includes topic even when StartNode is not a direct upstream', () => {
    // agent2 only has agent1 as direct upstream; StartNode is not in upstreamNodes
    const context = new Map([['s1', 'original topic'], ['a1', 'agent1 output']])
    const result = buildUserPrompt(agent2, [agent1], context, 'override topic')
    expect(result).toContain('주제: override topic')
    expect(result).toContain('[전략가]')
    expect(result).not.toContain('주제: \n') // blank topic must not appear
  })
})

describe('validateFlow', () => {
  it('passes a valid linear flow', () => {
    const nodes = [start, agent1, end]
    const edges: FlowEdge[] = [
      { id: 'e1', source: 's1', target: 'a1' },
      { id: 'e2', source: 'a1', target: 'e1' },
    ]
    expect(validateFlow(nodes, edges)).toBeNull()
  })

  it('rejects when no StartNode', () => {
    const nodes = [agent1, end]
    const edges: FlowEdge[] = [{ id: 'e1', source: 'a1', target: 'e1' }]
    expect(validateFlow(nodes, edges)).toContain('StartNode')
  })

  it('rejects when no EndNode', () => {
    const nodes = [start, agent1]
    const edges: FlowEdge[] = [{ id: 'e1', source: 's1', target: 'a1' }]
    expect(validateFlow(nodes, edges)).toContain('EndNode')
  })

  it('rejects cycle', () => {
    const nodes = [start, agent1, end]
    const edges: FlowEdge[] = [
      { id: 'e1', source: 's1', target: 'a1' },
      { id: 'e2', source: 'a1', target: 'a1' },
      { id: 'e3', source: 'a1', target: 'e1' },
    ]
    expect(validateFlow(nodes, edges)).toContain('사이클')
  })

  it('rejects disconnected node', () => {
    const orphan: FlowNode = { type: 'agent', id: 'orphan', position: { x: 0, y: 0 }, data: { role: 'X', model: 'claude', systemPrompt: '' } }
    const nodes = [start, agent1, orphan, end]
    const edges: FlowEdge[] = [
      { id: 'e1', source: 's1', target: 'a1' },
      { id: 'e2', source: 'a1', target: 'e1' },
      // orphan has no edges
    ]
    expect(validateFlow(nodes, edges)).toContain('도달 불가')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run lib/flow/__tests__/graph.test.ts
```

Expected: FAIL — `lib/flow/graph` module not found.

- [ ] **Step 3: Create lib/flow/types.ts**

```typescript
export type StartNode = {
  type: 'start'
  id: string
  position: { x: number; y: number }
  data: {
    topic: string
    brand?: string
    region?: string
    goal?: string
  }
}

export type AgentNode = {
  type: 'agent'
  id: string
  position: { x: number; y: number }
  data: {
    role: string
    agentKey?: string
    model: 'claude' | 'gemini' | 'gpt' | 'groq'
    systemPrompt: string
  }
}

export type ToolNode = {
  type: 'tool'
  id: string
  position: { x: number; y: number }
  data: { toolType: 'web-search' }
}

export type EndNode = {
  type: 'end'
  id: string
  position: { x: number; y: number }
  data: Record<string, never>
}

export type FlowNode = StartNode | AgentNode | ToolNode | EndNode

export type FlowEdge = {
  id: string
  source: string
  target: string
}

export type NodeStatus = 'idle' | 'running' | 'done' | 'error'

export type FlowRunEvent =
  | { type: 'run-start';     runId: string }
  | { type: 'node-start';    nodeId: string }
  | { type: 'node-done';     nodeId: string; output: string }
  | { type: 'node-error';    nodeId: string; error: string }
  | { type: 'flow-complete'; runId: string }
  | { type: 'flow-error';    error: string }

export type RunInput = {
  topic: string
  brand?: string
  region?: string
  goal?: string
}
```

- [ ] **Step 4: Create lib/flow/graph.ts**

```typescript
import type { FlowNode, FlowEdge, AgentNode, StartNode } from './types'

/**
 * Kahn's algorithm — returns nodes grouped by depth (each group is a parallel layer).
 * Throws if a cycle is detected.
 */
export function kahnSort(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[][] {
  const inDegree = new Map<string, number>(nodes.map(n => [n.id, 0]))
  const adj = new Map<string, string[]>(nodes.map(n => [n.id, []]))

  for (const e of edges) {
    adj.get(e.source)!.push(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
  }

  const nodeMap = new Map<string, FlowNode>(nodes.map(n => [n.id, n]))
  const layers: FlowNode[][] = []
  let queue = nodes.filter(n => inDegree.get(n.id) === 0)
  let visited = 0

  while (queue.length > 0) {
    layers.push(queue)
    visited += queue.length
    const next: string[] = []
    for (const node of queue) {
      for (const neighborId of (adj.get(node.id) ?? [])) {
        const deg = (inDegree.get(neighborId) ?? 0) - 1
        inDegree.set(neighborId, deg)
        if (deg === 0) next.push(neighborId)
      }
    }
    queue = next.map(id => nodeMap.get(id)!).filter(Boolean)
  }

  if (visited !== nodes.length) {
    throw new Error('cycle detected in flow graph')
  }

  return layers
}

export function getStartNode(nodes: FlowNode[]): StartNode {
  const start = nodes.find(n => n.type === 'start') as StartNode | undefined
  if (!start) throw new Error('StartNode not found')
  return start
}

/**
 * Assemble the userPrompt for an AgentNode from its upstream nodes' outputs.
 * topic: always pass runInput.topic — this is the effective discussion topic.
 * upstreamNodes: only the DIRECT upstream nodes of this node (may or may not include StartNode).
 */
export function buildUserPrompt(
  node: AgentNode,
  upstreamNodes: FlowNode[],
  context: Map<string, string>,
  topic: string
): string {
  const sections = upstreamNodes
    .filter(n => n.type !== 'start')   // StartNode contribution is the topic header, not a section
    .map(upstream => {
      const output = context.get(upstream.id) ?? ''
      if (upstream.type === 'tool') return `[웹 검색 결과]\n${output}`
      if (upstream.type === 'agent') return `[${(upstream as AgentNode).data.role}]\n${output}`
      return ''
    })
    .filter(Boolean)

  return [
    `주제: ${topic}`,
    '',
    ...sections,
    '',
    `위 맥락을 바탕으로 당신의 역할(${node.data.role})에 맞게 분석하고 의견을 제시하세요.`,
  ].join('\n')
}

/**
 * Validate flow for save: exactly 1 start, 1 end, no cycles, all nodes reachable from start.
 * Returns null on success, error message on failure.
 */
export function validateFlow(nodes: FlowNode[], edges: FlowEdge[]): string | null {
  const starts = nodes.filter(n => n.type === 'start')
  const ends = nodes.filter(n => n.type === 'end')

  if (starts.length !== 1) return `StartNode는 정확히 1개여야 합니다 (현재: ${starts.length}개)`
  if (ends.length !== 1) return `EndNode는 정확히 1개여야 합니다 (현재: ${ends.length}개)`

  try {
    kahnSort(nodes, edges)
  } catch {
    return '사이클이 감지되었습니다.'
  }

  // Check all nodes are reachable from start
  const adj = new Map<string, string[]>(nodes.map(n => [n.id, []]))
  for (const e of edges) adj.get(e.source)!.push(e.target)

  const visited = new Set<string>()
  const queue = [starts[0].id]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    for (const next of (adj.get(id) ?? [])) queue.push(next)
  }

  const unreachable = nodes.filter(n => !visited.has(n.id))
  if (unreachable.length > 0) {
    return `도달 불가 노드가 있습니다: ${unreachable.map(n => n.id).join(', ')}`
  }

  return null
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run lib/flow/__tests__/graph.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/flow/
git commit -m "feat(flow): add flow types + graph utilities (kahnSort, buildUserPrompt, validateFlow)"
```

---

### Task 3: Flow execution runner

**Files:**
- Create: `lib/flow/runner.ts`
- Create: `lib/flow/__tests__/runner.test.ts`

- [ ] **Step 1: Write failing tests for runner**

Create `lib/flow/__tests__/runner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock external I/O before importing runner
vi.mock('@/lib/llm', () => ({
  runLLM: vi.fn().mockResolvedValue('mocked llm output'),
}))
vi.mock('@/lib/search', () => ({
  runWebSearchWithRuntime: vi.fn().mockResolvedValue([
    { title: 'Result 1', snippet: 'snippet 1', url: 'https://a.com', provider: 'serper', fetchedAt: new Date() },
  ]),
}))

import { executeFlow } from '../runner'
import type { FlowNode, FlowEdge, RunInput, FlowRunEvent } from '../types'

const makeFlow = (): { nodes: FlowNode[]; edges: FlowEdge[] } => ({
  nodes: [
    { type: 'start', id: 's1', position: { x: 0, y: 0 }, data: { topic: 'test topic' } },
    { type: 'agent', id: 'a1', position: { x: 0, y: 0 }, data: { role: '전략가', model: 'claude', systemPrompt: 'you are a strategist' } },
    { type: 'end', id: 'e1', position: { x: 0, y: 0 }, data: {} },
  ],
  edges: [
    { id: 'ed1', source: 's1', target: 'a1' },
    { id: 'ed2', source: 'a1', target: 'e1' },
  ],
})

describe('executeFlow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('emits node-start BEFORE node-done for each agent node', async () => {
    const events: FlowRunEvent[] = []
    const runInput: RunInput = { topic: 'override topic' }

    for await (const event of executeFlow(makeFlow().nodes, makeFlow().edges, runInput)) {
      events.push(event)
    }

    const types = events.map(e => e.type)
    expect(types).toContain('node-start')
    expect(types).toContain('node-done')
    // run-start and flow-complete are emitted by the API route, NOT by executeFlow
    expect(types).not.toContain('run-start')
    expect(types).not.toContain('flow-complete')

    const doneEvent = events.find(e => e.type === 'node-done') as { nodeId: string; output: string } | undefined
    expect(doneEvent?.output).toBe('mocked llm output')

    // node-start must precede node-done for the same nodeId
    const startIdx = events.findIndex(e => e.type === 'node-start' && (e as { nodeId: string }).nodeId === 'a1')
    const doneIdx  = events.findIndex(e => e.type === 'node-done'  && (e as { nodeId: string }).nodeId === 'a1')
    expect(startIdx).toBeGreaterThanOrEqual(0)
    expect(startIdx).toBeLessThan(doneIdx)
  })

  it('skips downstream node when upstream fails', async () => {
    const { runLLM } = await import('@/lib/llm')
    vi.mocked(runLLM).mockRejectedValueOnce(new Error('LLM failure'))

    const nodes: FlowNode[] = [
      { type: 'start', id: 's1', position: { x: 0, y: 0 }, data: { topic: 'topic' } },
      { type: 'agent', id: 'a1', position: { x: 0, y: 0 }, data: { role: 'A', model: 'claude', systemPrompt: 'p' } },
      { type: 'agent', id: 'a2', position: { x: 0, y: 0 }, data: { role: 'B', model: 'claude', systemPrompt: 'p' } },
      { type: 'end', id: 'e1', position: { x: 0, y: 0 }, data: {} },
    ]
    const edges: FlowEdge[] = [
      { id: 'ed1', source: 's1', target: 'a1' },
      { id: 'ed2', source: 'a1', target: 'a2' },  // a2 depends on a1
      { id: 'ed3', source: 'a2', target: 'e1' },
    ]

    const events: FlowRunEvent[] = []
    for await (const event of executeFlow(nodes, edges, { topic: 'topic' })) {
      events.push(event)
    }

    const errorEvents = events.filter(e => e.type === 'node-error')
    expect(errorEvents).toHaveLength(1)
    // a2 should not emit node-start since a1 failed
    const startedNodeIds = events.filter(e => e.type === 'node-start').map(e => (e as { nodeId: string }).nodeId)
    expect(startedNodeIds).not.toContain('a2')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run lib/flow/__tests__/runner.test.ts
```

Expected: FAIL — `lib/flow/runner` not found.

- [ ] **Step 3: Create lib/flow/runner.ts**

Note: `executeFlow` is a pure execution generator — it does NOT emit `run-start` or `flow-complete`.
Those events require a DB-generated `runId` and are emitted by the API route that wraps this generator.

```typescript
import { runLLM } from '@/lib/llm'
import { runWebSearchWithRuntime } from '@/lib/search'
import type { RuntimeConfig } from '@/lib/types'
import { kahnSort, getStartNode, buildUserPrompt } from './graph'
import type { FlowNode, FlowEdge, RunInput, FlowRunEvent, AgentNode } from './types'

const MODEL_RUNTIME: Record<AgentNode['data']['model'], Partial<RuntimeConfig>> = {
  claude:  { llmProvider: 'claude' },
  gemini:  { llmProvider: 'gemini' },
  gpt:     { llmProvider: 'openai' },
  groq:    { llmProvider: 'groq' },
}

/**
 * Async generator that executes a flow and yields node-level FlowRunEvents.
 * Does NOT emit run-start / flow-complete — those are emitted by the API route.
 * No DB access — DB writes happen in the API route that calls this.
 */
export async function* executeFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  runInput: RunInput,
  signal?: AbortSignal
): AsyncGenerator<FlowRunEvent> {
  const context = new Map<string, string>()
  const upstreamMap = new Map<string, string[]>(nodes.map(n => [n.id, []]))

  for (const e of edges) {
    upstreamMap.get(e.target)!.push(e.source)
  }

  const layers = kahnSort(nodes, edges)
  const nodeMap = new Map<string, FlowNode>(nodes.map(n => [n.id, n]))

  for (const layer of layers) {
    if (signal?.aborted) {
      yield { type: 'flow-error', error: 'timeout' }
      return
    }

    // StartNode: write topic to context synchronously, no LLM call, no events
    for (const node of layer) {
      if (node.type === 'start') {
        context.set(node.id, runInput.topic)
      }
    }

    // Determine which non-boundary nodes are runnable (all upstreams must be in context)
    const runnableNodes = layer.filter(node => {
      if (node.type === 'start' || node.type === 'end') return false
      const upstreamIds = upstreamMap.get(node.id) ?? []
      return upstreamIds.every(id => context.has(id))
    })

    if (runnableNodes.length === 0) continue

    // Emit node-start for ALL runnable nodes before any async work begins
    for (const node of runnableNodes) {
      yield { type: 'node-start', nodeId: node.id }
    }

    // Execute all runnable nodes in parallel, collect results
    const nodeOutputs = new Map<string, string | Error>()

    await Promise.all(
      runnableNodes.map(async (node) => {
        const upstreamIds = upstreamMap.get(node.id) ?? []
        const upstreamNodes = upstreamIds.map(id => nodeMap.get(id)!).filter(Boolean)

        try {
          let output: string
          if (node.type === 'tool') {
            const start = getStartNode(nodes)
            const hits = await runWebSearchWithRuntime(
              context.get(start.id)!,
              start.data.brand,
              start.data.region,
              start.data.goal,
            )
            output = hits.map(h => `${h.title}\n${h.snippet}`).join('\n\n')
          } else if (node.type === 'agent') {
            const prompt = buildUserPrompt(node, upstreamNodes, context, runInput.topic)
            const runtime = MODEL_RUNTIME[node.data.model]  // Partial<RuntimeConfig> — all fields optional, safe to pass
            output = await runLLM(node.data.systemPrompt, prompt, 0.7, 2400, runtime as RuntimeConfig)
          } else {
            return
          }
          nodeOutputs.set(node.id, output)
        } catch (err) {
          nodeOutputs.set(node.id, err instanceof Error ? err : new Error(String(err)))
        }
      })
    )

    // Emit node-done / node-error in deterministic order after all parallel work completes
    for (const node of runnableNodes) {
      const result = nodeOutputs.get(node.id)
      if (result instanceof Error) {
        yield { type: 'node-error', nodeId: node.id, error: result.message }
      } else if (result !== undefined) {
        context.set(node.id, result)
        yield { type: 'node-done', nodeId: node.id, output: result }
      }
    }
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run lib/flow/__tests__/runner.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/flow/runner.ts lib/flow/__tests__/runner.test.ts
git commit -m "feat(flow): add flow execution runner with parallel layer execution"
```

---

### Task 4: Zustand run store

**Files:**
- Create: `lib/flow/run-store.ts`

- [ ] **Step 1: Create lib/flow/run-store.ts**

```typescript
import { create } from 'zustand'
import type { NodeStatus } from './types'

type FlowRunStore = {
  runId: string | null
  nodeStatuses: Record<string, NodeStatus>
  nodeOutputs: Record<string, string>
  isRunning: boolean
  error: string | null

  startRun: (runId: string) => void
  setNodeStatus: (nodeId: string, status: NodeStatus) => void
  setNodeOutput: (nodeId: string, output: string) => void
  finishRun: () => void
  resetRun: () => void
}

export const useFlowRunStore = create<FlowRunStore>()((set) => ({
  runId: null,
  nodeStatuses: {},
  nodeOutputs: {},
  isRunning: false,
  error: null,

  startRun: (runId) => set({ runId, isRunning: true, error: null, nodeStatuses: {}, nodeOutputs: {} }),

  setNodeStatus: (nodeId, status) =>
    set((s) => ({ nodeStatuses: { ...s.nodeStatuses, [nodeId]: status } })),

  setNodeOutput: (nodeId, output) =>
    set((s) => ({ nodeOutputs: { ...s.nodeOutputs, [nodeId]: output } })),

  finishRun: () => set({ isRunning: false }),

  resetRun: () => set({ runId: null, nodeStatuses: {}, nodeOutputs: {}, isRunning: false, error: null }),
}))
```

- [ ] **Step 2: Run all flow tests to confirm nothing broken**

```bash
npx vitest run lib/flow/
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/flow/run-store.ts
git commit -m "feat(flow): add Zustand FlowRunStore"
```

---

## Chunk 2: API Layer

### Task 5: Flow template CRUD API routes

**Files:**
- Create: `app/api/flow-templates/route.ts`
- Create: `app/api/flow-templates/[id]/route.ts`

- [ ] **Step 1: Create app/api/flow-templates/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { validateFlow } from '@/lib/flow/graph'
import type { FlowNode, FlowEdge } from '@/lib/flow/types'

const createSchema = z.object({
  name: z.string().min(1).max(200).default('새 플로우'),
})

export async function GET() {
  const templates = await prisma.flowTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json({ templates })
}

export async function POST(req: Request) {
  try {
    const body = createSchema.parse(await req.json())
    const defaultNodes: FlowNode[] = [
      { type: 'start', id: 'start-1', position: { x: 100, y: 200 }, data: { topic: '토론 주제를 입력하세요' } },
      { type: 'end', id: 'end-1', position: { x: 700, y: 200 }, data: {} },
    ]
    const template = await prisma.flowTemplate.create({
      data: {
        name: body.name,
        nodes: JSON.stringify(defaultNodes),
        edges: JSON.stringify([]),
      },
    })
    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '생성에 실패했습니다.' },
      { status: 400 }
    )
  }
}
```

- [ ] **Step 2: Create app/api/flow-templates/[id]/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { validateFlow } from '@/lib/flow/graph'
import type { FlowNode, FlowEdge } from '@/lib/flow/types'

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nodes: z.string().optional(),
  edges: z.string().optional(),
})
.refine(v => Object.keys(v).length > 0, { message: '수정할 필드가 없습니다.' })
.refine(
  v => (v.nodes === undefined) === (v.edges === undefined),
  { message: 'nodes와 edges는 함께 저장해야 합니다.' }
)

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const template = await prisma.flowTemplate.findUnique({ where: { id } })
  if (!template) return NextResponse.json({ error: '템플릿을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json(template)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = patchSchema.parse(await req.json())

    // If saving nodes+edges, validate graph
    if (body.nodes && body.edges) {
      const nodes = JSON.parse(body.nodes) as FlowNode[]
      const edges = JSON.parse(body.edges) as FlowEdge[]
      const error = validateFlow(nodes, edges)
      if (error) return NextResponse.json({ error }, { status: 400 })
    }

    const template = await prisma.flowTemplate.update({ where: { id }, data: body })
    return NextResponse.json(template)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '수정에 실패했습니다.' },
      { status: 400 }
    )
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.flowTemplate.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '삭제에 실패했습니다.' },
      { status: 400 }
    )
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors (or only pre-existing unrelated errors).

- [ ] **Step 4: Commit**

```bash
git add app/api/flow-templates/
git commit -m "feat(flow): add CRUD API routes for FlowTemplate"
```

---

### Task 6: Flow run SSE route

**Files:**
- Create: `app/api/flow-templates/[id]/run/route.ts`

- [ ] **Step 1: Create app/api/flow-templates/[id]/run/route.ts**

```typescript
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { executeFlow } from '@/lib/flow/runner'
import { validateFlow } from '@/lib/flow/graph'
import type { FlowNode, FlowEdge, RunInput, FlowRunEvent } from '@/lib/flow/types'

export const dynamic = 'force-dynamic'

const runSchema = z.object({
  topic: z.string().min(1).max(500),
  brand: z.string().max(200).optional(),
  region: z.string().max(200).optional(),
  goal: z.string().max(500).optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const encoder = new TextEncoder()

  function makeStream(templateId: string, runInput: RunInput) {
    return new ReadableStream({
      async start(controller) {
        function send(event: FlowRunEvent) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }

        try {
          const template = await prisma.flowTemplate.findUnique({ where: { id: templateId } })
          if (!template) {
            send({ type: 'flow-error', error: '템플릿을 찾을 수 없습니다.' })
            controller.close()
            return
          }

          const nodes = JSON.parse(template.nodes) as FlowNode[]
          const edges = JSON.parse(template.edges) as FlowEdge[]

          const validationError = validateFlow(nodes, edges)
          if (validationError) {
            send({ type: 'flow-error', error: validationError })
            controller.close()
            return
          }

          // Create Run record before starting execution
          const run = await prisma.run.create({
            data: {
              topic: runInput.topic,
              brand: runInput.brand ?? null,
              region: runInput.region ?? null,
              goal: runInput.goal ?? null,
            },
          })

          send({ type: 'run-start', runId: run.id })

          const nodeOutputs: Record<string, string> = {}
          const signal = AbortSignal.timeout(600_000)

          try {
            for await (const event of executeFlow(nodes, edges, runInput, signal)) {
              send(event)
              if (event.type === 'node-done') {
                nodeOutputs[event.nodeId] = event.output
              }
              if (event.type === 'flow-error') {
                // Run model has no status field — just close the stream
                controller.close()
                return
              }
            }

            // Save Deliverable
            await prisma.deliverable.create({
              data: {
                runId: run.id,
                type: 'CAMPAIGN_PLAN',
                content: JSON.stringify({
                  documentType: 'CAMPAIGN_PLAN',
                  title: `Flow 실행 결과: ${runInput.topic}`,
                  rawOutputs: nodeOutputs,
                }),
              },
            })

            // Update FlowTemplate.lastRunAt (fire-and-forget — don't delay flow-complete)
            void prisma.flowTemplate.update({
              where: { id: templateId },
              data: { lastRunAt: new Date() },
            }).catch(() => {})

            send({ type: 'flow-complete', runId: run.id })
          } catch (err) {
            send({ type: 'flow-error', error: err instanceof Error ? err.message : '실행 중 오류가 발생했습니다.' })
          }
        } catch (err) {
          send({ type: 'flow-error', error: err instanceof Error ? err.message : '서버 오류가 발생했습니다.' })
        } finally {
          controller.close()
        }
      },
    })
  }

  try {
    const body = runSchema.parse(await req.json())
    const stream = makeStream(id, body)
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : '잘못된 요청입니다.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/flow-templates/[id]/run/
git commit -m "feat(flow): add SSE run endpoint for FlowTemplate execution"
```

---

## Chunk 3: UI Layer

### Task 7: Template list page (/flow)

**Files:**
- Create: `app/(domains)/flow/page.tsx`

- [ ] **Step 1: Create app/(domains)/flow/page.tsx**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type FlowTemplateListItem = {
  id: string
  name: string
  nodes: string
  lastRunAt: string | null
  updatedAt: string
}

export default function FlowListPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<FlowTemplateListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/flow-templates')
      .then(r => r.json())
      .then(d => setTemplates(d.templates ?? []))
      .finally(() => setLoading(false))
  }, [])

  async function createFlow() {
    setCreating(true)
    try {
      const res = await fetch('/api/flow-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '새 플로우' }),
      })
      const data = await res.json()
      router.push(`/flow/${data.id}`)
    } finally {
      setCreating(false)
    }
  }

  function getNodeCount(nodesJson: string): number {
    try { return JSON.parse(nodesJson).length } catch { return 0 }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '실행 기록 없음'
    return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">플로우 빌더</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">에이전트 파이프라인을 직접 구성하고 실행하세요</p>
        </div>
        <button
          onClick={createFlow}
          disabled={creating}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {creating ? '생성 중…' : '+ 새 플로우'}
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-[var(--text-muted)]">불러오는 중…</div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-[var(--surface-border)] py-16 text-center">
          <p className="text-[var(--text-muted)]">저장된 플로우가 없습니다</p>
          <button
            onClick={createFlow}
            disabled={creating}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            + 새 플로우 만들기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => router.push(`/flow/${t.id}`)}
              className="flex flex-col gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] p-4 text-left hover:border-[var(--accent)] transition-colors"
            >
              <div className="font-medium text-[var(--text-primary)]">{t.name}</div>
              <div className="text-xs text-[var(--text-muted)]">
                노드 {getNodeCount(t.nodes)}개
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                {formatDate(t.lastRunAt)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the page renders (dev server)**

```bash
# Start dev server if not running, visit http://localhost:3000/flow
# Expected: page loads, shows empty state or template cards
```

- [ ] **Step 3: Commit**

```bash
git add "app/(domains)/flow/page.tsx"
git commit -m "feat(flow): add template list page at /flow"
```

---

### Task 8: Editor page + FlowCanvas

**Files:**
- Create: `app/(domains)/flow/[id]/page.tsx`
- Create: `app/(domains)/flow/[id]/components/FlowCanvas.tsx`

- [ ] **Step 1: Create app/(domains)/flow/[id]/page.tsx**

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { FlowNode, FlowEdge } from '@/lib/flow/types'
import { useFlowRunStore } from '@/lib/flow/run-store'

// ReactFlow must be client-only (no SSR)
const FlowCanvas = dynamic(() => import('./components/FlowCanvas'), { ssr: false })
const NodePalette = dynamic(() => import('./components/NodePalette'), { ssr: false })
const NodeConfigPanel = dynamic(() => import('./components/NodeConfigPanel'), { ssr: false })
const RunModal = dynamic(() => import('./components/RunModal'), { ssr: false })

type Template = {
  id: string
  name: string
  nodes: string
  edges: string
}

export default function FlowEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [template, setTemplate] = useState<Template | null>(null)
  const [nodes, setNodes] = useState<FlowNode[]>([])
  const [edges, setEdges] = useState<FlowEdge[]>([])
  const [name, setName] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [runModalOpen, setRunModalOpen] = useState(false)
  const { runId: completedRunId, isRunning } = useFlowRunStore(s => ({ runId: s.runId, isRunning: s.isRunning }))

  useEffect(() => {
    fetch(`/api/flow-templates/${id}`)
      .then(r => r.json())
      .then((t: Template) => {
        setTemplate(t)
        setName(t.name)
        setNodes(JSON.parse(t.nodes))
        setEdges(JSON.parse(t.edges))
      })
  }, [id])

  const save = useCallback(async (overrideNodes?: FlowNode[], overrideEdges?: FlowEdge[]) => {
    setSaving(true)
    try {
      await fetch(`/api/flow-templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          nodes: JSON.stringify(overrideNodes ?? nodes),
          edges: JSON.stringify(overrideEdges ?? edges),
        }),
      })
    } finally {
      setSaving(false)
    }
  }, [id, name, nodes, edges])

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) ?? null : null

  const updateNode = useCallback((nodeId: string, data: Partial<FlowNode['data']>) => {
    setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n))
  }, [])

  if (!template) {
    return <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">불러오는 중…</div>
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--surface-border)] bg-[var(--surface-base)] px-4 py-3">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="flex-1 rounded bg-transparent px-2 py-1 text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <button
          onClick={() => save()}
          disabled={saving}
          className="rounded-lg border border-[var(--surface-border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        <button
          onClick={() => setRunModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          ▶ 실행
        </button>
      </div>

      {/* Body: palette | canvas | config */}
      <div className="flex flex-1 overflow-hidden">
        <NodePalette
          onAddNode={(node) => {
            setNodes(ns => [...ns, node])
          }}
        />
        <div className="flex-1">
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={setNodes}
            onEdgesChange={setEdges}
            onNodeSelect={setSelectedNodeId}
            onSave={save}
          />
        </div>
        <NodeConfigPanel
          node={selectedNode}
          onUpdate={updateNode}
        />
      </div>

      {/* Bottom completion bar — shown after flow-complete */}
      {completedRunId && !isRunning && (
        <div className="flex items-center justify-between border-t border-[var(--surface-border)] bg-[var(--surface-base)] px-4 py-2">
          <span className="text-xs text-green-400">✓ 실행 완료</span>
          <a
            href={`/seminar/${completedRunId}`}
            className="text-xs text-[var(--accent)] underline hover:opacity-80"
          >
            결과 보기 →
          </a>
        </div>
      )}

      {runModalOpen && (
        <RunModal
          templateId={id}
          defaultTopic={nodes.find(n => n.type === 'start')?.data?.topic ?? ''}
          onClose={() => setRunModalOpen(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create app/(domains)/flow/[id]/components/FlowCanvas.tsx**

```tsx
'use client'

import { useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { FlowNode, FlowEdge } from '@/lib/flow/types'
import { AgentNodeComponent } from './nodes/AgentNode'
import { StartNodeComponent } from './nodes/StartNode'
import { EndNodeComponent } from './nodes/EndNode'
import { ToolNodeComponent } from './nodes/ToolNode'
import { useFlowRunStore } from '@/lib/flow/run-store'

// Register custom node types with ReactFlow
const nodeTypes = {
  start: StartNodeComponent,
  end: EndNodeComponent,
  agent: AgentNodeComponent,
  tool: ToolNodeComponent,
}

type Props = {
  nodes: FlowNode[]
  edges: FlowEdge[]
  onNodesChange: (nodes: FlowNode[]) => void
  onEdgesChange: (edges: FlowEdge[]) => void
  onNodeSelect: (nodeId: string | null) => void
  onSave: (nodes?: FlowNode[], edges?: FlowEdge[]) => void
}

export default function FlowCanvas({ nodes, edges, onNodesChange, onEdgesChange, onNodeSelect, onSave }: Props) {
  const nodeStatuses = useFlowRunStore(s => s.nodeStatuses)

  // Inject run status into node data for visual feedback
  const nodesWithStatus = nodes.map(n => ({
    ...n,
    data: { ...n.data, _status: nodeStatuses[n.id] ?? 'idle' },
  }))

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const next = applyNodeChanges(changes, nodesWithStatus as never) as unknown as FlowNode[]
    onNodesChange(next.map(n => {
      const { _status: _, ...data } = n.data as FlowNode['data'] & { _status?: string }
      return { ...n, data } as FlowNode
    }))
  }, [nodesWithStatus, onNodesChange])

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    const next = applyEdgeChanges(changes, edges as never) as unknown as FlowEdge[]
    onEdgesChange(next)
  }, [edges, onEdgesChange])

  const handleConnect = useCallback((connection: Connection) => {
    const newEdge: FlowEdge = {
      id: `e-${connection.source}-${connection.target}`,
      source: connection.source!,
      target: connection.target!,
    }
    const next = addEdge(newEdge as never, edges as never) as unknown as FlowEdge[]
    onEdgesChange(next)
  }, [edges, onEdgesChange])

  return (
    <ReactFlow
      nodes={nodesWithStatus as never}
      edges={edges as never}
      nodeTypes={nodeTypes}
      onNodesChange={handleNodesChange}
      onEdgesChange={handleEdgesChange}
      onConnect={handleConnect}
      onNodeClick={(_e, node) => onNodeSelect(node.id)}
      onPaneClick={() => onNodeSelect(null)}
      fitView
    >
      <Background gap={16} color="var(--surface-border)" />
      <Controls />
    </ReactFlow>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/(domains)/flow/[id]/"
git commit -m "feat(flow): add editor page layout + FlowCanvas (ReactFlow)"
```

---

### Task 9: Node components

**Files:**
- Create: `app/(domains)/flow/[id]/components/nodes/AgentNode.tsx`
- Create: `app/(domains)/flow/[id]/components/nodes/StartNode.tsx`
- Create: `app/(domains)/flow/[id]/components/nodes/EndNode.tsx`
- Create: `app/(domains)/flow/[id]/components/nodes/ToolNode.tsx`

- [ ] **Step 1: Create AgentNode component**

Create `app/(domains)/flow/[id]/components/nodes/AgentNode.tsx`:

```tsx
'use client'

import { Handle, Position } from '@xyflow/react'
import type { AgentNode } from '@/lib/flow/types'
import type { NodeStatus } from '@/lib/flow/types'

const MODEL_COLOR: Record<AgentNode['data']['model'], string> = {
  claude: 'bg-purple-500',
  gemini: 'bg-blue-500',
  gpt: 'bg-green-500',
  groq: 'bg-orange-500',
}

const STATUS_BORDER: Record<NodeStatus, string> = {
  idle: 'border-[var(--surface-border)]',
  running: 'border-cyan-400 animate-pulse',
  done: 'border-green-400',
  error: 'border-red-400',
}

type NodeData = AgentNode['data'] & { _status?: NodeStatus }

export function AgentNodeComponent({ data }: { data: NodeData }) {
  const status = data._status ?? 'idle'
  return (
    <div className={`min-w-[160px] rounded-xl border-2 bg-[var(--surface-raised)] p-3 ${STATUS_BORDER[status]}`}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--text-primary)]">{data.role}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${MODEL_COLOR[data.model]}`}>
          {data.model}
        </span>
      </div>
      <div className="mt-1 text-xs text-[var(--text-muted)]">
        {status === 'running' && <span className="animate-spin inline-block mr-1">⟳</span>}
        {status === 'done' && <span className="text-green-400 mr-1">✓</span>}
        {status === 'error' && <span className="text-red-400 mr-1">✗</span>}
        {status === 'idle' ? '대기 중' : status === 'running' ? '실행 중' : status === 'done' ? '완료' : '오류'}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
```

- [ ] **Step 2: Create StartNode, EndNode, ToolNode**

Create `app/(domains)/flow/[id]/components/nodes/StartNode.tsx`:

```tsx
'use client'

import { Handle, Position } from '@xyflow/react'
import type { StartNode } from '@/lib/flow/types'

export function StartNodeComponent({ data }: { data: StartNode['data'] }) {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-cyan-400 bg-[var(--surface-raised)] text-xs text-[var(--text-muted)] text-center">
      <span className="px-1 truncate max-w-[60px]">{data.topic || '시작'}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
```

Create `app/(domains)/flow/[id]/components/nodes/EndNode.tsx`:

```tsx
'use client'

import { Handle, Position } from '@xyflow/react'

export function EndNodeComponent() {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[var(--text-muted)] bg-[var(--surface-raised)] text-xs text-[var(--text-muted)]">
      산출물
      <Handle type="target" position={Position.Left} />
    </div>
  )
}
```

Create `app/(domains)/flow/[id]/components/nodes/ToolNode.tsx`:

```tsx
'use client'

import { Handle, Position } from '@xyflow/react'
import type { ToolNode } from '@/lib/flow/types'
import type { NodeStatus } from '@/lib/flow/types'

const STATUS_BORDER: Record<NodeStatus, string> = {
  idle: 'border-[var(--surface-border)]',
  running: 'border-cyan-400 animate-pulse',
  done: 'border-green-400',
  error: 'border-red-400',
}

type NodeData = ToolNode['data'] & { _status?: NodeStatus }

export function ToolNodeComponent({ data }: { data: NodeData }) {
  const status = data._status ?? 'idle'
  return (
    <div className={`min-w-[130px] rounded-xl border-2 bg-[var(--surface-raised)] p-3 ${STATUS_BORDER[status]}`}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
        <span>🔍</span>
        <span className="font-medium">웹 검색</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add "app/(domains)/flow/[id]/components/nodes/"
git commit -m "feat(flow): add custom ReactFlow node components (Agent, Start, End, Tool)"
```

---

### Task 10: NodePalette + NodeConfigPanel + RunModal + nav

**Files:**
- Create: `app/(domains)/flow/[id]/components/NodePalette.tsx`
- Create: `app/(domains)/flow/[id]/components/NodeConfigPanel.tsx`
- Create: `app/(domains)/flow/[id]/components/RunModal.tsx`
- Modify: `components/app-nav.tsx`

- [ ] **Step 1: Create NodePalette.tsx**

```tsx
'use client'

import { DEFAULT_DOMAIN_AGENT_POOL } from '@/lib/agent-config'
import type { FlowNode, AgentNode, ToolNode } from '@/lib/flow/types'

const PRESET_AGENTS = Object.values(DEFAULT_DOMAIN_AGENT_POOL)
  .flat()
  .slice(0, 8) // Show top 8 presets in palette

type Props = {
  onAddNode: (node: FlowNode) => void
}

function makeSystemPrompt(profile: (typeof PRESET_AGENTS)[number]): string {
  return [
    profile.roleSummary ?? '',
    '',
    '지침:',
    ...(profile.instructions ?? []),
    '',
    '금지:',
    ...(profile.antiPatterns ?? []),
  ].join('\n')
}

export default function NodePalette({ onAddNode }: Props) {
  function addAgent(role: string, systemPrompt: string, agentKey?: string) {
    const node: AgentNode = {
      type: 'agent',
      id: `agent-${Date.now()}`,
      position: { x: 300, y: 150 + Math.random() * 100 },
      data: { role, agentKey, model: 'claude', systemPrompt },
    }
    onAddNode(node)
  }

  function addCustomAgent() {
    addAgent('커스텀 에이전트', '당신의 역할을 여기에 입력하세요.')
  }

  function addWebSearch() {
    const node: ToolNode = {
      type: 'tool',
      id: `tool-${Date.now()}`,
      position: { x: 300, y: 150 + Math.random() * 100 },
      data: { toolType: 'web-search' },
    }
    onAddNode(node)
  }

  return (
    <div className="flex w-40 flex-col gap-1 overflow-y-auto border-r border-[var(--surface-border)] bg-[var(--surface-base)] p-3">
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">에이전트</p>
      {PRESET_AGENTS.map(profile => (
        <button
          key={profile.id}
          onClick={() => addAgent(profile.name, makeSystemPrompt(profile), profile.id)}
          className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2 py-1.5 text-left text-xs text-[var(--text-primary)] hover:border-[var(--accent)] truncate"
          title={profile.name}
        >
          {profile.name}
        </button>
      ))}
      <button
        onClick={addCustomAgent}
        className="rounded-lg border border-dashed border-[var(--surface-border)] px-2 py-1.5 text-left text-xs text-[var(--text-muted)] hover:border-[var(--accent)]"
      >
        커스텀 +
      </button>
      <p className="mb-1 mt-3 text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">도구</p>
      <button
        onClick={addWebSearch}
        className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2 py-1.5 text-left text-xs text-[var(--text-primary)] hover:border-[var(--accent)]"
      >
        🔍 웹 검색
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create NodeConfigPanel.tsx**

```tsx
'use client'

import type { FlowNode, AgentNode } from '@/lib/flow/types'

type Props = {
  node: FlowNode | null
  onUpdate: (nodeId: string, data: Partial<FlowNode['data']>) => void
}

const MODEL_OPTIONS: AgentNode['data']['model'][] = ['claude', 'gemini', 'gpt', 'groq']

export default function NodeConfigPanel({ node, onUpdate }: Props) {
  if (!node) {
    return (
      <div className="flex w-56 items-center justify-center border-l border-[var(--surface-border)] bg-[var(--surface-base)] text-xs text-[var(--text-muted)]">
        노드를 선택하세요
      </div>
    )
  }

  if (node.type !== 'agent') {
    return (
      <div className="flex w-56 flex-col gap-2 border-l border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
        <p className="text-xs font-medium text-[var(--text-primary)]">
          {node.type === 'start' ? '시작 노드' : node.type === 'end' ? '종료 노드' : '도구 노드'}
        </p>
        {node.type === 'start' && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--text-muted)]">기본 토픽</label>
            <input
              value={node.data.topic}
              onChange={e => onUpdate(node.id, { topic: e.target.value })}
              className="rounded border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
        )}
      </div>
    )
  }

  const agentData = node.data as AgentNode['data']

  return (
    <div className="flex w-56 flex-col gap-3 overflow-y-auto border-l border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
      <p className="text-xs font-semibold text-[var(--text-primary)]">에이전트 설정</p>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-[var(--text-muted)]">역할명</label>
        <input
          value={agentData.role}
          onChange={e => onUpdate(node.id, { role: e.target.value })}
          className="rounded border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-[var(--text-muted)]">모델</label>
        <select
          value={agentData.model}
          onChange={e => onUpdate(node.id, { model: e.target.value as AgentNode['data']['model'] })}
          className="rounded border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        >
          {MODEL_OPTIONS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-[var(--text-muted)]">시스템 프롬프트</label>
        <textarea
          value={agentData.systemPrompt}
          onChange={e => onUpdate(node.id, { systemPrompt: e.target.value })}
          rows={8}
          className="rounded border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create RunModal.tsx**

```tsx
'use client'

import { useState } from 'react'
import { useFlowRunStore } from '@/lib/flow/run-store'
import type { FlowRunEvent } from '@/lib/flow/types'

type Props = {
  templateId: string
  defaultTopic: string
  onClose: () => void
}

export default function RunModal({ templateId, defaultTopic, onClose }: Props) {
  const [topic, setTopic] = useState(defaultTopic)
  const [brand, setBrand] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { startRun, setNodeStatus, setNodeOutput, finishRun, resetRun } = useFlowRunStore()

  async function handleRun() {
    if (!topic.trim()) return
    setRunning(true)
    setError(null)
    resetRun()  // clear any previous run state before starting

    try {
      const res = await fetch(`/api/flow-templates/${templateId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), brand: brand || undefined }),
      })

      if (!res.ok || !res.body) {
        setError('실행 요청에 실패했습니다.')
        setRunning(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      onClose() // Close modal, let canvas show status

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event: FlowRunEvent = JSON.parse(line.slice(6))

            if (event.type === 'run-start') {
              startRun(event.runId)
            } else if (event.type === 'node-start') {
              setNodeStatus(event.nodeId, 'running')
            } else if (event.type === 'node-done') {
              setNodeStatus(event.nodeId, 'done')
              setNodeOutput(event.nodeId, event.output)
            } else if (event.type === 'node-error') {
              setNodeStatus(event.nodeId, 'error')
            } else if (event.type === 'flow-complete') {
              finishRun()  // sets isRunning=false, runId stored in Zustand — editor page shows "결과 보기" link
            } else if (event.type === 'flow-error') {
              resetRun()  // clear runId so editor doesn't show "결과 보기" for a failed run
            }
          } catch { /* ignore malformed line */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-raised)] p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">플로우 실행</h2>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)]">토론 주제 *</label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="주제를 입력하세요"
              className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)]">브랜드 (선택)</label>
            <input
              value={brand}
              onChange={e => setBrand(e.target.value)}
              placeholder="예: 쿠팡, 당근마켓"
              className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            취소
          </button>
          <button
            onClick={handleRun}
            disabled={running || !topic.trim()}
            className="rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {running ? '실행 중…' : '실행'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add /flow to nav**

In `components/app-nav.tsx`, find the `FlowBuilderIcon` or add it. Add after the existing icons section:

```tsx
function FlowBuilderIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="19" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="19" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 12h4M13.5 7.2l-2 3.3M13.5 16.8l-2-3.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
```

Then in the `navGroups` array, find the `'제작'` group and add the `/flow` item:

```typescript
{ href: '/flow', label: '플로우 빌더', icon: <FlowBuilderIcon /> },
```

Add it after the `{ href: '/seminar', ... }` line.

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: All tests PASS (check lib/flow/ tests especially).

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 7: Commit**

```bash
git add "app/(domains)/flow/[id]/components/" components/app-nav.tsx
git commit -m "feat(flow): add NodePalette, NodeConfigPanel, RunModal + nav entry"
```

---

## Final Verification

- [ ] Start dev server and visit `http://localhost:3000/flow`
- [ ] Create a new flow template — confirm redirect to `/flow/[id]`
- [ ] Add agent node from palette — confirm it appears on canvas
- [ ] Connect StartNode → AgentNode → EndNode
- [ ] Click Save — confirm no 400 error
- [ ] Click Run — enter topic — confirm SSE events update node border colors on canvas
- [ ] After `flow-complete` — confirm bottom bar appears with "결과 보기 →" link to `/seminar/[runId]` (no auto-redirect)

```bash
git log --oneline -10
```

Expected output shows all commits from this plan in order.
