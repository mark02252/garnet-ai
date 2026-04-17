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
    // ```json 코드블록 전처리
    const cleaned = raw.replace(/```(?:json)?/g, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as ArchitectResponse
    if (!Array.isArray(parsed.agents) || parsed.agents.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

function buildGraph(response: ArchitectResponse, projectDescription: string): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []

  // Start node
  const startNode: StartNode = {
    type: 'start', id: 'start-1',
    position: { x: 0, y: 0 },
    data: { topic: projectDescription }
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
  const runtime: RuntimeConfig = { llmProvider: 'gemini' }

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

    const { nodes, edges } = buildGraph(parsed, projectDescription)
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
