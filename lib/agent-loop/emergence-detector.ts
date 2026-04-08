import { getKnowledgeStats } from './knowledge-store'
import { isTelegramConfigured, sendMessage } from '@/lib/telegram'

type EmergentCapability = {
  name: string
  description: string
  requiredDomains: string[]
  readiness: number // 0-100
}

const CAPABILITY_DEFINITIONS: Array<{
  name: string
  description: string
  requiredDomains: string[]
  minCount: number
  minConfidence: number
}> = [
  {
    name: 'ROI 기반 캠페인 최적화',
    description: '마케팅 효과를 재무 관점으로 분석하여 ROI 최적화',
    requiredDomains: ['marketing', 'finance'],
    minCount: 30,
    minConfidence: 0.5,
  },
  {
    name: '시장 진입 전략 수립',
    description: '경쟁 분석 + 트렌드 + 거시경제를 종합한 전략적 판단',
    requiredDomains: ['competitive', 'macro'],
    minCount: 20,
    minConfidence: 0.5,
  },
  {
    name: '콘텐츠 자율 운영',
    description: '콘텐츠 전략 + 소비자 행동을 결합한 자율 발행 판단',
    requiredDomains: ['content_strategy', 'consumer'],
    minCount: 40,
    minConfidence: 0.6,
  },
  {
    name: 'B2B 영업 지원',
    description: 'B2B 패턴 + 경쟁 분석을 결합한 영업 전략 제안',
    requiredDomains: ['b2b', 'competitive'],
    minCount: 25,
    minConfidence: 0.5,
  },
  {
    name: '가격 전략 자문',
    description: '가격 전략 + 소비자 행동 + 경쟁 분석 기반 가격 제안',
    requiredDomains: ['pricing_strategy', 'consumer', 'competitive'],
    minCount: 20,
    minConfidence: 0.5,
  },
  {
    name: 'Garnet 자가 진화',
    description: '기술 탐색 결과를 바탕으로 Garnet 아키텍처 개선 제안',
    requiredDomains: ['self_improvement'],
    minCount: 10,
    minConfidence: 0.5,
  },
]

/**
 * 지식 임계점 도달 여부를 감지하여 새 능력 제안
 * weekly-review에서 호출
 */
export async function detectEmergentCapabilities(): Promise<EmergentCapability[]> {
  const stats = await getKnowledgeStats()
  const statMap = new Map(stats.map(s => [s.domain, s]))

  const capabilities: EmergentCapability[] = []

  for (const def of CAPABILITY_DEFINITIONS) {
    const domainStats = def.requiredDomains.map(d => statMap.get(d))

    // 모든 필수 도메인이 존재하는지
    if (domainStats.some(s => !s)) continue

    // readiness 계산: 각 도메인의 (count/minCount + confidence/minConfidence) / 2
    const readinessPerDomain = domainStats.map(s => {
      if (!s) return 0
      const countRatio = Math.min(1, s.count / def.minCount)
      const confRatio = Math.min(1, s.avgConfidence / def.minConfidence)
      return (countRatio + confRatio) / 2
    })

    const overallReadiness = Math.round(
      (readinessPerDomain.reduce((a, b) => a + b, 0) / readinessPerDomain.length) * 100
    )

    if (overallReadiness >= 30) { // 30% 이상이면 보고
      capabilities.push({
        name: def.name,
        description: def.description,
        requiredDomains: def.requiredDomains,
        readiness: overallReadiness,
      })
    }
  }

  // readiness 순 정렬
  capabilities.sort((a, b) => b.readiness - a.readiness)

  // 80% 이상 도달한 능력이 있으면 알림
  const ready = capabilities.filter(c => c.readiness >= 80)
  if (ready.length > 0 && isTelegramConfigured()) {
    const text = `🧬 *새 능력 창발 감지*\n\n${ready.map(c =>
      `✨ *${c.name}* (준비도 ${c.readiness}%)\n${c.description}`
    ).join('\n\n')}`
    await sendMessage(text, { parseMode: 'Markdown' }).catch(() => {})
  }

  return capabilities
}
