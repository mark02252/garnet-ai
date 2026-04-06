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
              runInput.brand ?? start.data.brand,
              runInput.region ?? start.data.region,
              runInput.goal ?? start.data.goal,
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
