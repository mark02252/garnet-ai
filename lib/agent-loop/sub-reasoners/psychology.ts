import { runLLM } from '@/lib/llm'
import { runLLMWithTools } from '@/lib/llm'
import type { ToolHarness } from '../tool-harness'
import type { ToolCall } from '../tool-types'
import type { WorldModel } from '../types'

export type PsychologyResult = {
  insights: Array<{
    bias: string          // 어떤 인지편향/심리학 원리
    application: string   // 현재 상황에 어떻게 적용할지
    expectedImpact: string // 예상 효과
  }>
  toolsUsed?: string[]
}

const SYSTEM = `10년차 마케팅 심리학자. 행동경제학과 인지편향을 마케팅에 적용하는 전문가.
Chain-of-Draft 방식: 짧고 밀도 높게.
JSON만 출력. 한국어.
"이런 심리가 있다"가 아니라 "이 데이터에 어떤 심리 원리가 적용된다"로.
도구 에러가 반환되면 해당 데이터 없이 기존 WorldModel 데이터로 분석을 진행하세요.`

export async function suggestPsychologyAngles(worldModel: WorldModel, harness?: ToolHarness): Promise<PsychologyResult> {
  const sns = worldModel.snapshot.sns
  const ga4 = worldModel.snapshot.ga4

  const prompt = `## 현재 사용자 행동 지표
SNS 참여율: ${sns.engagement}%
이탈률: ${ga4.bounceRate}%
전환율: ${ga4.conversionRate}%

현재 데이터에 적용할 만한 **심리 원리 2개**를 도출하세요.
- 인지편향 또는 행동경제학 원리 명시 (예: 손실회피, 사회적 증명, 희소성)
- 현재 상황에 어떻게 적용할지 한 문장
- 예상 효과 한 문장

JSON:
{"insights":[{"bias":"심리원리명","application":"적용 방안","expectedImpact":"예상 효과"}]}`

  // 2-pass: harness가 있으면 tool calling 사용
  if (harness) {
    const tools = harness.getToolDeclarations('psychology')
    try {
      // Pass 1: LLM with tools
      const pass1 = await runLLMWithTools(SYSTEM, prompt, tools, { temperature: 0.4, maxTokens: 1200 })

      if (pass1.toolCalls.length === 0) {
        return parseResult(pass1.text)
      }

      // Execute tool calls
      const toolResults = await Promise.all(
        pass1.toolCalls.map((call: ToolCall) => harness.execute('psychology', call))
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

      const raw = await runLLM(SYSTEM, augmentedPrompt, 0.4, 1200)
      const result = parseResult(raw)
      return { ...result, toolsUsed }
    } catch {
      // Fallback to 1-pass on error
    }
  }

  // 1-pass fallback (no harness or error)
  try {
    const raw = await runLLM(SYSTEM, prompt, 0.4, 1200)
    return parseResult(raw)
  } catch {
    return { insights: [] }
  }
}

function parseResult(raw: string): PsychologyResult {
  try {
    const cleaned = raw.replace(/```(?:json)?/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned
    const parsed = JSON.parse(match)
    return {
      insights: Array.isArray(parsed.insights) ? parsed.insights.slice(0, 2) : [],
    }
  } catch {
    return { insights: [] }
  }
}
