import { runLLM } from '@/lib/llm'
import { runWebSearchWithRuntime } from '@/lib/search'
import type { RuntimeConfig } from '@/lib/types'
import { kahnSort, getStartNode, buildUserPrompt } from './graph'
import type { FlowNode, FlowEdge, RunInput, FlowRunEvent, AgentNode, DebateNode, JudgeNode } from './types'

const MODEL_RUNTIME: Record<AgentNode['data']['model'], Partial<RuntimeConfig>> = {
  claude:  { llmProvider: 'claude' },
  gemini:  { llmProvider: 'gemini' },
  gpt:     { llmProvider: 'openai' },
  groq:    { llmProvider: 'groq' },
  gemma4:  { llmProvider: 'gemma4' },
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
  const debateEvents: FlowRunEvent[] = []
  const judgeEvents: FlowRunEvent[] = []

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
              runInput.brand ?? start.data.brand,
              runInput.region ?? start.data.region,
              runInput.goal ?? start.data.goal,
            )
            output = hits.map(h => `${h.title}\n${h.snippet}`).join('\n\n')
          } else if (node.type === 'agent') {
            const prompt = buildUserPrompt(node, upstreamNodes, context, runInput.topic)
            const runtime = MODEL_RUNTIME[node.data.model]
            const systemPrompt = node.data.systemPrompt.includes('한국어')
              ? node.data.systemPrompt
              : `${node.data.systemPrompt}\n\n반드시 한국어로 응답하세요.`
            output = await runLLM(systemPrompt, prompt, 0.7, 2400, runtime as RuntimeConfig)
          } else if (node.type === 'debate') {
            // Debate: pro/con/moderator 라운드 실행
            output = await executeDebateNode(node, upstreamNodes, context, runInput, debateEvents)
          } else if (node.type === 'judge') {
            // Judge: 상위 노드 output 평가 + 재시도
            output = await executeJudgeNode(node, upstreamIds, context, nodeMap, upstreamMap, runInput, judgeEvents)
          } else {
            return
          }
          nodeOutputs.set(node.id, output)
        } catch (err) {
          nodeOutputs.set(node.id, err instanceof Error ? err : new Error(String(err)))
        }
      })
    )

    // Emit debate/judge sub-events first
    for (const evt of debateEvents) yield evt
    debateEvents.length = 0
    for (const evt of judgeEvents) yield evt
    judgeEvents.length = 0

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

// ── Debate Node Execution ──────────────────────────────────────────────────

async function executeDebateNode(
  node: DebateNode,
  upstreamNodes: FlowNode[],
  context: Map<string, string>,
  runInput: RunInput,
  events: FlowRunEvent[],
): Promise<string> {
  const upstreamContext = upstreamNodes
    .map(n => context.get(n.id) || '')
    .filter(Boolean)
    .join('\n\n')

  const topic = node.data.topic || runInput.topic
  const rounds = node.data.rounds || 2  // CoD: 3→2 기본 라운드 (조기 종료도 있음)
  const runtime = MODEL_RUNTIME[node.data.model] as RuntimeConfig

  let debate = ''
  let lastModeratorSummary = ''

  for (let round = 1; round <= rounds; round++) {
    // Pro argument
    const proPrompt = `주제: ${topic}\n\n이전 논의:\n${debate || upstreamContext}\n\n찬성 관점에서 1-2문단으로 논거를 제시하세요.`
    const proArg = await runLLM(
      node.data.proSystemPrompt || '당신은 찬성 측 토론자입니다. 한국어로 응답하세요.',
      proPrompt, 0.7, 1500, runtime
    )
    events.push({ type: 'debate-turn', nodeId: node.id, speaker: 'pro', round, content: proArg })
    debate += `\n[찬성 R${round}] ${proArg}`

    // Con argument
    const conPrompt = `주제: ${topic}\n\n이전 논의:\n${debate}\n\n반대 관점에서 1-2문단으로 반론을 제시하세요.`
    const conArg = await runLLM(
      node.data.conSystemPrompt || '당신은 반대 측 토론자입니다. 한국어로 응답하세요.',
      conPrompt, 0.7, 1500, runtime
    )
    events.push({ type: 'debate-turn', nodeId: node.id, speaker: 'con', round, content: conArg })
    debate += `\n[반대 R${round}] ${conArg}`

    // Moderator
    const modPrompt = `주제: ${topic}\n\n전체 토론:\n${debate}\n\n모더레이터로서 이번 라운드를 요약하고, 합의에 도달했는지 판단하세요. JSON으로: {"consensus": true/false, "summary": "요약"}`
    const modResult = await runLLM(
      '당신은 공정한 토론 모더레이터입니다. 한국어로 응답하세요.',
      modPrompt, 0.3, 1000, runtime
    )
    events.push({ type: 'debate-turn', nodeId: node.id, speaker: 'moderator', round, content: modResult })

    // Check consensus
    try {
      const cleanedMod = modResult.replace(/```(?:json)?/g, '').trim()
      const parsed = JSON.parse(cleanedMod.match(/\{[\s\S]*\}/)?.[0] || '{}')
      lastModeratorSummary = parsed.summary || modResult
      if (parsed.consensus && round < rounds) break
    } catch {
      lastModeratorSummary = modResult
    }
  }

  return `[토론 결과]\n${lastModeratorSummary}\n\n[전체 토론]\n${debate}`
}

// ── Judge Node Execution ───────────────────────────────────────────────────

async function executeJudgeNode(
  node: JudgeNode,
  upstreamIds: string[],
  context: Map<string, string>,
  nodeMap: Map<string, FlowNode>,
  upstreamMap: Map<string, string[]>,
  runInput: RunInput,
  events: FlowRunEvent[],
): Promise<string> {
  const runtime = MODEL_RUNTIME[node.data.model] as RuntimeConfig
  const threshold = node.data.threshold || 65  // 70→65 완화 (충분한 품질)
  const maxRetries = node.data.maxRetries || 1  // 3→1 재시도 (과잉 방지)

  // Find the creator node (first upstream agent)
  const creatorId = upstreamIds[0]
  const creatorNode = nodeMap.get(creatorId)
  let content = context.get(creatorId) || ''

  for (let retry = 0; retry <= maxRetries; retry++) {
    // Judge evaluates
    const judgePrompt = `다음 콘텐츠를 평가하세요:\n\n${content}\n\n평가 기준: ${node.data.criteria || '품질, 정확성, 완성도'}\n\nJSON으로 응답: {"score": 0-100, "feedback": "구체적 피드백"}`
    const judgeResult = await runLLM(
      '당신은 엄격한 품질 평가자입니다. 0-100점으로 평가하고 구체적 피드백을 제공하세요. 한국어로.',
      judgePrompt, 0.2, 1000, runtime
    )

    let score = 0
    let feedback = judgeResult
    try {
      const parsed = JSON.parse(judgeResult.match(/\{[\s\S]*\}/)?.[0] || '{}')
      score = parsed.score || 0
      feedback = parsed.feedback || judgeResult
    } catch { /* use raw */ }

    events.push({ type: 'judge-score', nodeId: node.id, score, feedback, retry })

    if (score >= threshold || retry >= maxRetries) {
      return `[평가 결과: ${score}/100]\n${feedback}\n\n[평가 대상]\n${content}`
    }

    // Re-generate: ask creator to improve
    if (creatorNode?.type === 'agent') {
      const improvePrompt = `이전 결과:\n${content}\n\n평가 피드백 (${score}/100):\n${feedback}\n\n위 피드백을 반영하여 개선된 버전을 작성하세요.`
      const creatorRuntime = MODEL_RUNTIME[creatorNode.data.model] as RuntimeConfig
      content = await runLLM(
        creatorNode.data.systemPrompt + '\n\n반드시 한국어로 응답하세요.',
        improvePrompt, 0.7, 2400, creatorRuntime
      )
      context.set(creatorId, content) // Update context with improved version
    }
  }

  return content
}
