import { runLLM } from '@/lib/llm'
import { prisma } from '@/lib/prisma'
import type { WorldModel } from '../types'

export type CROResult = {
  bottlenecks: Array<{
    stage: string         // 어느 단계에서 이탈
    severity: 'high' | 'medium' | 'low'
    rootCause: string     // 추정 원인
    quickWin: string      // 즉시 적용 가능한 개선안
  }>
}

const SYSTEM = `10년차 CRO(전환율 최적화) 전문가.
Chain-of-Draft 방식: 짧고 밀도 높게.
JSON만 출력. 한국어.
일반론 금지. 데이터 기반 구체 개선안만.`

export async function suggestCROImprovements(worldModel: WorldModel): Promise<CROResult> {
  // CRO 도메인 지식 조회
  let croKnowledge = ''
  try {
    const entries = await prisma.knowledgeEntry.findMany({
      where: { domain: 'conversion_optimization', isAntiPattern: false, level: 3 },
      orderBy: { confidence: 'desc' },
      take: 5,
    })
    croKnowledge = entries.map(e => `- ${e.pattern.replace(/^\[.+?\]\s*/, '')}: ${e.observation.split('\n')[0].slice(0, 100)}`).join('\n')
  } catch { /* */ }

  const ga4 = worldModel.snapshot.ga4
  const prompt = `## 현재 GA4 지표
세션: ${ga4.sessions}
이탈률: ${ga4.bounceRate}%
전환율: ${ga4.conversionRate}%

## 적용 가능한 CRO 원칙
${croKnowledge || '(없음)'}

위 데이터에서 **전환 병목 2개**를 도출하세요.
- 이탈률이 높거나 전환율이 낮은 단계
- 각각의 추정 원인 한 문장
- 즉시 적용 가능한 quick win 한 문장

JSON:
{"bottlenecks":[{"stage":"단계명","severity":"high|medium|low","rootCause":"원인","quickWin":"즉시 적용안"}]}`

  try {
    const raw = await runLLM(SYSTEM, prompt, 0.3, 1200)
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
