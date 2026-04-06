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
