import { runLLM } from '@/lib/llm'
import { runLLMWithTools } from '@/lib/llm'
import type { ToolHarness } from '../tool-harness'
import type { ToolCall } from '../tool-types'
import type { WorldModel, GoalProgress } from '../types'

export type StrategyResult = {
  strategicDirections: Array<{
    direction: string
    timeframe: 'immediate' | 'short_term' | 'medium_term'
    reasoning: string
  }>
  toolsUsed?: string[]
}

const SYSTEM = `10년차 마케팅 전략가. 경쟁 구도와 거시 환경에서 기회를 포착하는 전문가.
Chain-of-Draft 방식: 각 전략 방향은 한 문장 + 핵심 근거 한 문장.
JSON만 출력. 한국어.
단기 전술이 아닌 전략 방향에 집중.
도구 에러가 반환되면 해당 데이터 없이 기존 WorldModel 데이터로 분석을 진행하세요.`

export async function suggestStrategy(
  worldModel: WorldModel,
  goals: GoalProgress[],
  harness?: ToolHarness,
): Promise<StrategyResult> {
  const competitors = worldModel.snapshot.competitors
  const competitorText = `위협 수준 ${competitors.threatLevel}, 최근 ${competitors.recentMoves.length}건 변화${competitors.recentMoves.length > 0 ? ': ' + competitors.recentMoves.slice(0, 3).map(m => `${m.competitor}: ${m.action}`).join(' | ') : ''}`

  // 거시 환경
  let macroSummary = ''
  try {
    const { getMacroSummary } = await import('../macro-tracker')
    macroSummary = await getMacroSummary()
  } catch { /* */ }

  const laggingGoals = goals.filter(g => !g.onTrack).map(g => `${g.goal.goal} (${g.progressPercent}%)`).join(', ') || '없음'

  const prompt = `## 경쟁 환경
${competitorText}

## 거시 환경 (시즌/이벤트)
${macroSummary || '특별한 시즌 없음'}

## 뒤처진 목표
${laggingGoals}

현재 상황에서 주목할 만한 전략 방향 **2개**를 도출하세요.
- 단기 전술(콘텐츠 발행 등) 제외
- "왜 지금" 이 방향이 중요한지 명확히
- 경쟁/환경에서 보이는 기회 또는 위협 기반

JSON으로 출력:
{"strategicDirections":[{"direction":"전략 방향","timeframe":"immediate|short_term|medium_term","reasoning":"근거"}]}`

  // 2-pass: harness가 있으면 tool calling 사용
  if (harness) {
    const tools = harness.getToolDeclarations('strategy')
    try {
      // Pass 1: LLM with tools
      const pass1 = await runLLMWithTools(SYSTEM, prompt, tools, { temperature: 0.4, maxTokens: 1200 })

      if (pass1.toolCalls.length === 0) {
        return parseResult(pass1.text)
      }

      // Execute tool calls
      const toolResults = await Promise.all(
        pass1.toolCalls.map((call: ToolCall) => harness.execute('strategy', call))
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
    return { strategicDirections: [] }
  }
}

function parseResult(raw: string): StrategyResult {
  try {
    const cleaned = raw.replace(/```(?:json)?/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned
    const parsed = JSON.parse(match)
    return {
      strategicDirections: Array.isArray(parsed.strategicDirections) ? parsed.strategicDirections.slice(0, 2) : [],
    }
  } catch {
    return { strategicDirections: [] }
  }
}
