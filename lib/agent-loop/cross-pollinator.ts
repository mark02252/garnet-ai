import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'
import { addKnowledge } from './knowledge-store'
import { isTelegramConfigured, sendMessage } from '@/lib/telegram'

/**
 * 서로 다른 도메인의 지식을 교차 연결하여 새 인사이트 생성
 * weekly-review에서 호출
 */
export async function synthesizeCrossDomain(): Promise<{
  pairsAnalyzed: number
  newInsights: number
}> {
  // 도메인별 상위 지식 추출
  const domains = await prisma.knowledgeEntry.groupBy({
    by: ['domain'],
    _count: true,
    where: { isAntiPattern: false, confidence: { gte: 0.4 } },
    having: { domain: { _count: { gte: 3 } } }, // 최소 3건 이상인 도메인만
  })

  if (domains.length < 2) return { pairsAnalyzed: 0, newInsights: 0 }

  const domainKnowledge = new Map<string, Array<{ pattern: string; observation: string }>>()

  for (const d of domains) {
    const entries = await prisma.knowledgeEntry.findMany({
      where: { domain: d.domain, isAntiPattern: false, confidence: { gte: 0.4 } },
      orderBy: { confidence: 'desc' },
      take: 5,
      select: { pattern: true, observation: true },
    })
    domainKnowledge.set(d.domain, entries)
  }

  // 도메인 쌍 조합
  const domainList = [...domainKnowledge.keys()]
  let pairsAnalyzed = 0
  let newInsights = 0

  for (let i = 0; i < domainList.length && i < 4; i++) {
    for (let j = i + 1; j < domainList.length && j < 5; j++) {
      const domA = domainList[i]
      const domB = domainList[j]
      const knowledgeA = domainKnowledge.get(domA) || []
      const knowledgeB = domainKnowledge.get(domB) || []

      if (knowledgeA.length === 0 || knowledgeB.length === 0) continue

      // 기존 cross_domain 인사이트 조회 (중복 방지)
      const existingCross = await prisma.knowledgeEntry.findMany({
        where: {
          source: { in: [`cross_domain_${domA}_${domB}`, `cross_domain_${domB}_${domA}`] },
        },
        select: { pattern: true },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      })
      const existingPatterns = existingCross.map(e => e.pattern).join('\n')

      const prompt = `두 도메인의 지식을 교차 분석하여 새로운 인사이트를 도출하세요.

## ${domA} 도메인 지식
${knowledgeA.map(k => `- ${k.pattern} → ${k.observation.split('\n')[0]}`).join('\n')}

## ${domB} 도메인 지식
${knowledgeB.map(k => `- ${k.pattern} → ${k.observation.split('\n')[0]}`).join('\n')}
${existingPatterns ? `\n## 이미 발견된 교차 인사이트 (중복 금지)\n${existingPatterns}\n` : ''}
두 도메인을 결합하면 어떤 새로운 인사이트가 나오는지 분석하세요.
기존에 각 도메인 단독으로는 도출할 수 없는 교차 인사이트만 제시하세요.
위에 이미 발견된 인사이트와 겹치면 빈 배열을 반환하세요.

가장 핵심적인 인사이트 1개만 출력. JSON 배열: [{"pattern":"교차 상황","observation":"새 인사이트","domain":"가장 관련 도메인"}]
인사이트가 없으면 빈 배열. JSON만 출력.`

      try {
        const raw = await runLLM('비즈니스 전략가. 교차 도메인 분석 전문. JSON만 출력.', prompt, 0.4, 1000)
        const parsed = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || '[]') as Array<{
          pattern: string; observation: string; domain: string
        }>

        // 1개만 저장 (가장 첫 유효 인사이트)
        const insight = parsed.find(p => p.pattern && p.observation)
        if (insight) {
          await addKnowledge({
            domain: insight.domain || domA,
            level: 2, // Pattern — 검증 전까지 L2, promoteRepeatedLessons로 L3 승격
            pattern: insight.pattern,
            observation: `[${domA}×${domB}] ${insight.observation}`,
            source: `cross_domain_${domA}_${domB}`,
          })
          newInsights++
        }

        // 인사이트 발견 시 알림
        if (insight && isTelegramConfigured()) {
          const text = `💡 *교차 도메인 인사이트*\n\n${domA} × ${domB}:\n• ${insight.observation.slice(0, 100)}`
          await sendMessage(text, { parseMode: 'Markdown' }).catch(() => {})
        }
      } catch { /* pair failed, continue */ }

      pairsAnalyzed++
    }
  }

  return { pairsAnalyzed, newInsights }
}
