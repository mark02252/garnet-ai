import { runLLM } from '@/lib/llm'
import { addKnowledge, type NewKnowledge } from './knowledge-store'

const SYSTEM_PROMPT = `당신은 비즈니스 지식 추출 전문가입니다. 액션의 결과를 범용 비즈니스 지식으로 일반화합니다.

규칙:
1. 특정 회사명(MONOPLEX 등)을 제거하고 범용적으로 기술
2. level 1=특정 사실, 2=관찰된 패턴, 3=범용 원칙
3. isAntiPattern: 부정적 결과면 true
4. domain: marketing, competitive, consumer, b2b, operations, finance, macro, content_strategy, pricing_strategy 중 선택

JSON만 출력:
{"domain":"...","level":1|2|3,"pattern":"어떤 상황에서","observation":"어떤 결과","isAntiPattern":false}`

/** 액션 결과를 지식으로 변환하여 Knowledge Store에 저장 */
export async function extractKnowledge(params: {
  actionKind: string
  context: string // 액션 제목/설명
  impactScore: number
  source: string
}): Promise<string | null> {
  const prompt = `다음 마케팅 액션의 결과를 범용 비즈니스 지식으로 일반화하세요:

액션 종류: ${params.actionKind}
액션 내용: ${params.context}
영향 점수: ${params.impactScore > 0 ? '+' : ''}${params.impactScore.toFixed(1)}% (긍정/부정)

이 결과에서 다른 비즈니스에도 적용 가능한 지식을 추출하세요.`

  try {
    const raw = await runLLM(SYSTEM_PROMPT, prompt, 0.2, 500)
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}') as Partial<NewKnowledge>

    if (!parsed.domain || !parsed.pattern || !parsed.observation) return null

    // impactScore가 부정적이면 anti-pattern으로 강제
    if (params.impactScore < -10) parsed.isAntiPattern = true

    return await addKnowledge({
      domain: parsed.domain,
      level: (parsed.level || 2) as 1 | 2 | 3,
      pattern: parsed.pattern,
      observation: parsed.observation,
      source: params.source,
      isAntiPattern: parsed.isAntiPattern,
    })
  } catch {
    return null
  }
}

/** 기존 에피소딕 메모리에서 지식 배치 추출 (초기 시딩용) */
export async function seedKnowledgeFromEpisodes(limit = 20): Promise<number> {
  const { prisma } = await import('@/lib/prisma')
  const episodes = await prisma.episodicMemory.findMany({
    where: { score: { gte: 60 } },
    orderBy: { score: 'desc' },
    take: limit,
  })

  let extracted = 0
  for (const ep of episodes) {
    const id = await extractKnowledge({
      actionKind: ep.category,
      context: ep.input.slice(0, 300),
      impactScore: (ep.score ?? 50) - 50, // 50을 기준점으로
      source: `episodic_memory_${ep.id}`,
    })
    if (id) extracted++
  }

  return extracted
}
