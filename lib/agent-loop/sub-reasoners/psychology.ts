import { runLLM } from '@/lib/llm'
import { prisma } from '@/lib/prisma'
import type { WorldModel } from '../types'

export type PsychologyResult = {
  insights: Array<{
    bias: string          // 어떤 인지편향/심리학 원리
    application: string   // 현재 상황에 어떻게 적용할지
    expectedImpact: string // 예상 효과
  }>
}

const SYSTEM = `10년차 마케팅 심리학자. 행동경제학과 인지편향을 마케팅에 적용하는 전문가.
Chain-of-Draft 방식: 짧고 밀도 높게.
JSON만 출력. 한국어.
"이런 심리가 있다"가 아니라 "이 데이터에 어떤 심리 원리가 적용된다"로.`

export async function suggestPsychologyAngles(worldModel: WorldModel): Promise<PsychologyResult> {
  // 심리학/소비자 도메인 지식
  let psyKnowledge = ''
  try {
    const entries = await prisma.knowledgeEntry.findMany({
      where: {
        OR: [{ domain: 'consumer' }, { domain: 'marketing' }],
        isAntiPattern: false,
        level: 3,
      },
      orderBy: { confidence: 'desc' },
      take: 5,
    })
    psyKnowledge = entries.map(e => `- ${e.pattern.replace(/^\[.+?\]\s*/, '')}: ${e.observation.split('\n')[0].slice(0, 100)}`).join('\n')
  } catch { /* */ }

  const sns = worldModel.snapshot.sns
  const ga4 = worldModel.snapshot.ga4

  const prompt = `## 현재 사용자 행동 지표
SNS 참여율: ${sns.engagement}%
이탈률: ${ga4.bounceRate}%
전환율: ${ga4.conversionRate}%

## 적용 가능한 심리학 원칙
${psyKnowledge || '(없음)'}

현재 데이터에 적용할 만한 **심리 원리 2개**를 도출하세요.
- 인지편향 또는 행동경제학 원리 명시 (예: 손실회피, 사회적 증명, 희소성)
- 현재 상황에 어떻게 적용할지 한 문장
- 예상 효과 한 문장

JSON:
{"insights":[{"bias":"심리원리명","application":"적용 방안","expectedImpact":"예상 효과"}]}`

  try {
    const raw = await runLLM(SYSTEM, prompt, 0.4, 1200)
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
