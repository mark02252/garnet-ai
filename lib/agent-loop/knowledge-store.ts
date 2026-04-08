import { prisma } from '@/lib/prisma'

export type KnowledgeDomain =
  | 'marketing' | 'competitive' | 'consumer' | 'b2b'
  | 'operations' | 'finance' | 'macro' | 'self_improvement'
  | 'content_strategy' | 'pricing_strategy'

export type KnowledgeLevel = 1 | 2 | 3 // fact | pattern | principle

export type NewKnowledge = {
  domain: string
  level: KnowledgeLevel
  pattern: string
  observation: string
  source: string
  isAntiPattern?: boolean
}

/** 새 지식 추가 (기존에 유사한 것이 있으면 병합) */
export async function addKnowledge(entry: NewKnowledge): Promise<string> {
  // 유사 지식 검색 (같은 domain + pattern 키워드 매칭)
  const existing = await findSimilarKnowledge(entry.domain, entry.pattern)

  if (existing) {
    // 병합: observedCount 증가, confidence 재계산
    const newCount = existing.observedCount + 1
    const newConfidence = Math.min(0.95, 0.3 + newCount * 0.1)

    await prisma.knowledgeEntry.update({
      where: { id: existing.id },
      data: {
        observedCount: newCount,
        confidence: newConfidence,
        observation: `${existing.observation}\n---\n[${new Date().toISOString().split('T')[0]}] ${entry.observation}`,
        source: existing.source.includes(entry.source) ? existing.source : `${existing.source}, ${entry.source}`,
      },
    })
    return existing.id
  }

  // 신규 생성
  const created = await prisma.knowledgeEntry.create({
    data: {
      domain: entry.domain,
      level: entry.level,
      pattern: entry.pattern,
      observation: entry.observation,
      confidence: 0.4,
      source: entry.source,
      isAntiPattern: entry.isAntiPattern ?? false,
    },
  })
  return created.id
}

/** 유사 지식 검색 (간단한 키워드 매칭) */
async function findSimilarKnowledge(domain: string, pattern: string) {
  const keywords = pattern
    .replace(/[^가-힣a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1)
    .slice(0, 3)

  if (keywords.length === 0) return null

  const candidates = await prisma.knowledgeEntry.findMany({
    where: { domain },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  // 키워드 오버랩으로 유사도 측정
  for (const c of candidates) {
    const matchCount = keywords.filter(k =>
      c.pattern.toLowerCase().includes(k.toLowerCase())
    ).length
    if (matchCount >= Math.ceil(keywords.length * 0.6)) return c
  }

  return null
}

/** Reasoner용: 도메인별 상위 지식 + anti-pattern 조회 */
export async function getKnowledgeForReasoner(domains?: string[]): Promise<{
  effective: Array<{ domain: string; level: number; pattern: string; observation: string; confidence: number }>
  antiPatterns: Array<{ domain: string; pattern: string; observation: string }>
}> {
  const where = domains?.length ? { domain: { in: domains } } : {}

  const [effective, antiPatterns] = await Promise.all([
    prisma.knowledgeEntry.findMany({
      where: { ...where, isAntiPattern: false, confidence: { gte: 0.4 } },
      orderBy: [{ confidence: 'desc' }, { level: 'desc' }],
      take: 15,
      select: { domain: true, level: true, pattern: true, observation: true, confidence: true },
    }),
    prisma.knowledgeEntry.findMany({
      where: { ...where, isAntiPattern: true },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { domain: true, pattern: true, observation: true },
    }),
  ])

  return { effective, antiPatterns }
}

/** 도메인별 지식 통계 */
export async function getKnowledgeStats(): Promise<Array<{
  domain: string
  count: number
  avgConfidence: number
  antiPatternCount: number
}>> {
  const entries = await prisma.knowledgeEntry.findMany({
    select: { domain: true, confidence: true, isAntiPattern: true },
  })

  const stats = new Map<string, { count: number; totalConf: number; antiCount: number }>()
  for (const e of entries) {
    const s = stats.get(e.domain) || { count: 0, totalConf: 0, antiCount: 0 }
    s.count++
    s.totalConf += e.confidence
    if (e.isAntiPattern) s.antiCount++
    stats.set(e.domain, s)
  }

  return [...stats.entries()].map(([domain, s]) => ({
    domain,
    count: s.count,
    avgConfidence: s.count > 0 ? s.totalConf / s.count : 0,
    antiPatternCount: s.antiCount,
  }))
}

/** confidence 낮은 지식 정리 (30일 이상 + 0.3 미만) */
export async function pruneWeakKnowledge(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const result = await prisma.knowledgeEntry.deleteMany({
    where: { confidence: { lt: 0.3 }, observedCount: 1, createdAt: { lt: cutoff } },
  })
  return result.count
}
