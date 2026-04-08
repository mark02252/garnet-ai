import { prisma } from '@/lib/prisma'
import { getKnowledgeStats } from './knowledge-store'

export type DomainBenchmark = {
  domain: string
  knowledgeCount: number
  avgConfidence: number
  antiPatternCount: number
  causalLinkCount: number
  capability: 'strong' | 'moderate' | 'weak' | 'learning' | 'none'
}

export type OverallBenchmark = {
  domains: DomainBenchmark[]
  totalKnowledge: number
  totalCausalLinks: number
  strongDomains: string[]
  weakDomains: string[]
  growthRate: number // 지난 주 대비 지식 증가율 %
}

/** 도메인별 능력 벤치마크 */
export async function computeBenchmark(): Promise<OverallBenchmark> {
  const knowledgeStats = await getKnowledgeStats()

  // CausalLink 도메인별 통계
  const causalStats = await prisma.causalLink.groupBy({
    by: ['domain'],
    _count: true,
  })
  const causalMap = new Map(causalStats.map(c => [c.domain, c._count]))

  const domains: DomainBenchmark[] = knowledgeStats.map(s => {
    const causalCount = causalMap.get(s.domain) || 0
    let capability: DomainBenchmark['capability'] = 'none'

    if (s.count >= 50 && s.avgConfidence >= 0.7) capability = 'strong'
    else if (s.count >= 20 && s.avgConfidence >= 0.5) capability = 'moderate'
    else if (s.count >= 5) capability = 'weak'
    else if (s.count > 0) capability = 'learning'

    return {
      domain: s.domain,
      knowledgeCount: s.count,
      avgConfidence: Math.round(s.avgConfidence * 100) / 100,
      antiPatternCount: s.antiPatternCount,
      causalLinkCount: causalCount,
      capability,
    }
  })

  // 지식 증가율 (7일 전 대비)
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [totalNow, totalWeekAgo] = await Promise.all([
    prisma.knowledgeEntry.count(),
    prisma.knowledgeEntry.count({ where: { createdAt: { lt: oneWeekAgo } } }),
  ])
  const growth = totalWeekAgo > 0 ? ((totalNow - totalWeekAgo) / totalWeekAgo) * 100 : 0

  const totalCausal = causalStats.reduce((s, c) => s + c._count, 0)

  return {
    domains: domains.sort((a, b) => b.knowledgeCount - a.knowledgeCount),
    totalKnowledge: totalNow,
    totalCausalLinks: totalCausal,
    strongDomains: domains.filter(d => d.capability === 'strong').map(d => d.domain),
    weakDomains: domains.filter(d => d.capability === 'weak' || d.capability === 'learning').map(d => d.domain),
    growthRate: Math.round(growth),
  }
}

/** Reasoner/브리핑용 벤치마크 요약 */
export async function getBenchmarkSummary(): Promise<string> {
  const bm = await computeBenchmark()
  const lines = [
    `총 지식: ${bm.totalKnowledge}건, 인과관계: ${bm.totalCausalLinks}건 (주간 성장 ${bm.growthRate > 0 ? '+' : ''}${bm.growthRate}%)`,
  ]

  for (const d of bm.domains.slice(0, 6)) {
    const icon = d.capability === 'strong' ? '\u{1F7E2}' : d.capability === 'moderate' ? '\u{1F7E1}' : d.capability === 'weak' ? '\u{1F7E0}' : '\u{1F534}'
    lines.push(`${icon} ${d.domain}: ${d.knowledgeCount}건 (신뢰도 ${d.avgConfidence})`)
  }

  if (bm.weakDomains.length > 0) {
    lines.push(`학습 우선순위: ${bm.weakDomains.join(', ')}`)
  }

  return lines.join('\n')
}
