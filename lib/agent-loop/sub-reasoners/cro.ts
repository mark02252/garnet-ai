import { runLLM } from '@/lib/llm'
import { runLLMWithTools } from '@/lib/llm'
import type { ToolHarness } from '../tool-harness'
import type { ToolCall } from '../tool-types'
import type { WorldModel } from '../types'
import { formatSnapshotForPrompt } from '../snapshot-formatter'

export type CROResult = {
  bottlenecks: Array<{
    stage: string         // 어느 단계에서 이탈
    severity: 'high' | 'medium' | 'low'
    rootCause: string     // 추정 원인
    quickWin: string      // 즉시 적용 가능한 개선안
  }>
  toolsUsed?: string[]
}

const SYSTEM = `10년차 CRO(전환율 최적화) 전문가.
Chain-of-Draft 방식: 짧고 밀도 높게.
JSON만 출력. 한국어.
일반론 금지. 데이터 기반 구체 개선안만.
도구 에러가 반환되면 해당 데이터 없이 기존 WorldModel 데이터로 분석을 진행하세요.`

export async function suggestCROImprovements(worldModel: WorldModel, harness?: ToolHarness): Promise<CROResult> {
  const metricsText = formatSnapshotForPrompt(worldModel)
  const prompt = `## 현재 지표
${metricsText}

위 데이터에서 **전환 병목 2개**를 도출하세요.
- 이탈률이 높거나 전환율이 낮은 단계
- 각각의 추정 원인 한 문장
- 즉시 적용 가능한 quick win 한 문장

JSON:
{"bottlenecks":[{"stage":"단계명","severity":"high|medium|low","rootCause":"원인","quickWin":"즉시 적용안"}]}`

  // 2-pass: harness가 있으면 tool calling 사용
  if (harness) {
    const tools = harness.getToolDeclarations('cro')
    try {
      // Pass 1: LLM with tools
      const pass1 = await runLLMWithTools(SYSTEM, prompt, tools, { temperature: 0.3, maxTokens: 1200 })

      if (pass1.toolCalls.length === 0) {
        // No tool calls — parse directly from pass1
        return parseResult(pass1.text)
      }

      // Execute tool calls
      const toolResults = await Promise.all(
        pass1.toolCalls.map((call: ToolCall) => harness.execute('cro', call))
      )
      const toolsUsed = toolResults.map(r => r.tool)

      // Build tool context string
      const toolContext = toolResults
        .map(r => {
          if (r.status === 'ok') {
            return `### ${r.tool} 결과\n${JSON.stringify(r.data, null, 2)}`
          }
          return `### ${r.tool} 에러\n${r.error}: ${r.message || ''}`
        })
        .join('\n\n')

      // Pass 2: LLM with tool results appended
      const augmentedPrompt = `${prompt}

## 도구 조회 결과
${toolContext}

위 도구 결과를 참고하여 분석하세요. 에러가 있으면 무시하고 WorldModel 데이터로 진행하세요.`

      const raw = await runLLM(SYSTEM, augmentedPrompt, 0.3, 1200)
      const result = parseResult(raw)
      return { ...result, toolsUsed }
    } catch {
      // Fallback to 1-pass on error
    }
  }

  // 1-pass fallback (no harness or error)
  try {
    const raw = await runLLM(SYSTEM, prompt, 0.3, 1200)
    return parseResult(raw)
  } catch {
    return { bottlenecks: [] }
  }
}

function parseResult(raw: string): CROResult {
  try {
    const cleaned = raw.replace(/```(?:json)?/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned
    const parsed = JSON.parse(match)
    return {
      bottlenecks: Array.isArray(parsed.bottlenecks) ? parsed.bottlenecks.slice(0, 2) : [],
    }
  } catch {
    return { bottlenecks: [] }
  }
}
