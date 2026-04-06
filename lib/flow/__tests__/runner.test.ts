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
