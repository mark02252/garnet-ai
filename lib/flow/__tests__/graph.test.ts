import { describe, it, expect } from 'vitest'
import { kahnSort, getStartNode, buildUserPrompt, validateFlow } from '../graph'
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
