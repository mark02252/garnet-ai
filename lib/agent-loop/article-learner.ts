import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'
import { addKnowledge } from './knowledge-store'

/**
 * 최근 MarketingIntel에서 아직 학습하지 않은 기사를 분석하여 지식 추출
 * daily-briefing에서 호출
 */
export async function learnFromArticles(hoursBack = 24): Promise<{ learned: number; extracted: number }> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000)

  // 아직 'learned' 태그가 없는 기사
  const articles = await prisma.marketingIntel.findMany({
    where: {
      createdAt: { gte: since },
      NOT: { tags: { contains: 'learned' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  if (articles.length === 0) return { learned: 0, extracted: 0 }

  // 5개씩 배치로 LLM 호출 (비용 절약)
  let extracted = 0
  const batchSize = 5

  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize)
    const batchText = batch.map((a, idx) =>
      `[${idx + 1}] ${a.title}\n${a.snippet?.slice(0, 200) || ''}`
    ).join('\n\n')

    const prompt = `다음 기사들에서 비즈니스에 유용한 지식을 추출하세요.
특정 회사명을 제거하고 범용적으로 기술하세요.

${batchText}

각 기사에서 추출 가능한 지식을 JSON 배열로:
[{"domain":"marketing|competitive|consumer|b2b|operations|finance|macro|content_strategy|pricing_strategy","level":1|2|3,"pattern":"어떤 상황에서","observation":"어떤 결과/트렌드"}]

추출할 지식이 없는 기사는 건너뛰세요. JSON 배열만 출력.`

    try {
      const raw = await runLLM(
        '비즈니스 지식 추출 전문가. JSON 배열만 출력.',
        prompt, 0.2, 1500,
      )
      const parsed = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || '[]') as Array<{
        domain: string; level: number; pattern: string; observation: string
      }>

      for (const k of parsed) {
        if (!k.domain || !k.pattern || !k.observation) continue
        await addKnowledge({
          domain: k.domain,
          level: (k.level || 2) as 1 | 2 | 3,
          pattern: k.pattern,
          observation: k.observation,
          source: `marketing_intel_batch_${new Date().toISOString().split('T')[0]}`,
        })
        extracted++
      }
    } catch { /* batch failed, continue */ }

    // 학습 완료 표시
    for (const a of batch) {
      try {
        const currentTags = JSON.parse(a.tags || '[]') as string[]
        currentTags.push('learned')
        await prisma.marketingIntel.update({
          where: { id: a.id },
          data: { tags: JSON.stringify(currentTags) },
        })
      } catch { /* non-critical */ }
    }
  }

  return { learned: articles.length, extracted }
}
