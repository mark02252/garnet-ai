import { runLLM } from '@/lib/llm'
import type { WorldModel, GoalProgress } from '../types'

export type StrategyResult = {
  strategicDirections: Array<{
    direction: string
    timeframe: 'immediate' | 'short_term' | 'medium_term'
    reasoning: string
  }>
}

const SYSTEM = `10년차 마케팅 전략가. 경쟁 구도와 거시 환경에서 기회를 포착하는 전문가.
JSON만 출력. 한국어.
단기 전술이 아닌 전략 방향에 집중.`

export async function suggestStrategy(
  worldModel: WorldModel,
  goals: GoalProgress[],
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

  try {
    const raw = await runLLM(SYSTEM, prompt, 0.4, 800)
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')
    return {
      strategicDirections: Array.isArray(parsed.strategicDirections) ? parsed.strategicDirections.slice(0, 2) : [],
    }
  } catch {
    return { strategicDirections: [] }
  }
}
