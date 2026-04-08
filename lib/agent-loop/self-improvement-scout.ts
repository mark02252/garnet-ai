import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'
import { addKnowledge } from './knowledge-store'

type ImprovementOpportunity = {
  techName: string
  url: string
  garnetComponent: string
  improvement: string
  priority: 'high' | 'medium' | 'low'
}

/**
 * Tech Radar에서 Garnet 자체 개선 기회를 탐색
 * weekly-review에서 호출
 */
export async function scoutSelfImprovements(): Promise<{
  scanned: number
  opportunities: ImprovementOpportunity[]
}> {
  // 아직 평가하지 않은 tech 항목
  const items = await prisma.techRadarItem.findMany({
    where: {
      category: 'tech',
      status: 'assessing',
    },
    orderBy: { addedAt: 'desc' },
    take: 10,
  })

  if (items.length === 0) return { scanned: 0, opportunities: [] }

  const opportunities: ImprovementOpportunity[] = []

  // 배치로 평가
  const batchText = items.map((item, i) =>
    `[${i + 1}] ${item.name}: ${item.description || 'N/A'} (${item.url})`
  ).join('\n')

  const prompt = `Garnet은 AI 마케팅 에이전트로 다음 컴포넌트를 가지고 있습니다:
- World Model (환경 상태 추적)
- Reasoner (LLM 기반 판단)
- Knowledge Store (비즈니스 지식 축적)
- Episodic Memory (과거 경험 저장, 태그 기반 검색)
- Flow Runner (멀티에이전트 실행)
- Data Collectors (웹/SNS 수집)
- Prompt Optimizer (프롬프트 자동 최적화)

다음 기술들이 Garnet의 어떤 부분을 개선할 수 있는지 평가하세요:

${batchText}

JSON 배열로 답하세요. 관련 없으면 빈 배열:
[{"index":1,"garnetComponent":"개선 가능 컴포넌트","improvement":"어떻게 개선","priority":"high|medium|low"}]`

  try {
    const raw = await runLLM(
      'AI 시스템 아키텍처 전문가. JSON 배열만 출력.',
      prompt, 0.3, 1500,
    )
    const parsed = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || '[]') as Array<{
      index: number; garnetComponent: string; improvement: string; priority: string
    }>

    for (const p of parsed) {
      const item = items[p.index - 1]
      if (!item) continue

      const opp: ImprovementOpportunity = {
        techName: item.name,
        url: item.url || '',
        garnetComponent: p.garnetComponent,
        improvement: p.improvement,
        priority: (['high', 'medium', 'low'].includes(p.priority) ? p.priority : 'low') as 'high' | 'medium' | 'low',
      }
      opportunities.push(opp)

      // Knowledge Store에 저장
      await addKnowledge({
        domain: 'self_improvement',
        level: 2,
        pattern: `${item.name} (${p.garnetComponent})`,
        observation: p.improvement,
        source: `tech_radar_${item.url}`,
      })

      // Tech Radar 항목 상태 업데이트
      await prisma.techRadarItem.update({
        where: { id: item.id },
        data: {
          status: p.priority === 'high' ? 'trial' : 'assessed',
          notes: `Garnet 개선: ${p.improvement.slice(0, 100)}`,
        },
      }).catch(() => {})
    }
  } catch { /* batch failed */ }

  // 나머지 항목은 assessed로 마킹
  for (const item of items) {
    await prisma.techRadarItem.update({
      where: { id: item.id },
      data: { status: item.status === 'assessing' ? 'assessed' : item.status },
    }).catch(() => {})
  }

  return { scanned: items.length, opportunities }
}
