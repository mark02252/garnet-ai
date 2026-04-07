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
