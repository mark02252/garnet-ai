import { runLLM } from '@/lib/llm'
import type { WorldModel, GoalProgress } from '../types'

export type AnalysisResult = {
  insights: Array<{
    finding: string
    significance: 'high' | 'medium' | 'low'
    dataEvidence: string
  }>
}

const SYSTEM = `10년차 데이터 분석가. 숫자 뒤의 의미를 찾는 전문가.
Chain-of-Draft 방식: 짧고 밀도 높게 추론. 장황한 설명 금지.
JSON만 출력. 한국어.
각 finding은 1문장, dataEvidence는 수치만.`

export async function analyzeCurrentData(
  worldModel: WorldModel,
  goals: GoalProgress[],
): Promise<AnalysisResult> {
  const ga4 = worldModel.snapshot.ga4
  const sns = worldModel.snapshot.sns
  const trends = worldModel.trends
    .filter(t => t.direction !== 'stable')
    .map(t => `${t.metric}: ${t.direction} ${t.magnitude.toFixed(1)}% (${t.duration}회)`)
    .join(', ') || '특이 트렌드 없음'

  const goalsText = goals
    .map(g => `${g.goal.goal}: ${g.progressPercent}% (${g.onTrack ? '순조' : '뒤처짐'})`)
    .join(' | ')

  const prompt = `## 현재 데이터

GA4: 세션 ${ga4.sessions}, 이탈률 ${ga4.bounceRate}%, 전환율 ${ga4.conversionRate}%
SNS: 참여율 ${sns.engagement}%, 팔로워 변동 ${sns.followerGrowth}
트렌드: ${trends}
목표: ${goalsText}

이 데이터에서 **숫자 너머의 의미**가 있는 인사이트 2-3개를 도출하세요.
"매출이 증가했다"는 관찰이 아니라, "왜 그런지, 어떤 의미인지"의 인사이트.

JSON으로 출력:
{"insights":[{"finding":"발견한 사실 1문장","significance":"high|medium|low","dataEvidence":"구체적 수치"}]}`

  try {
    const raw = await runLLM(SYSTEM, prompt, 0.3, 1200)
    const cleaned = raw.replace(/```(?:json)?/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned
    const parsed = JSON.parse(match)
    return {
      insights: Array.isArray(parsed.insights) ? parsed.insights.slice(0, 3) : [],
    }
  } catch {
    return { insights: [] }
  }
}
