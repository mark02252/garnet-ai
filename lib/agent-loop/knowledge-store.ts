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

    // Generate and store embedding for merged entry
    try {
      const { getEmbedding } = await import('./embeddings')
      const text = `${entry.pattern} ${entry.observation}`
      const embedding = await getEmbedding(text)
      if (embedding) {
        await prisma.knowledgeEntry.update({
          where: { id: existing.id },
          data: { embedding: JSON.stringify(embedding) },
        })
      }
    } catch { /* Ollama may not be running */ }

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

  // Generate and store embedding for new entry
  try {
    const { getEmbedding } = await import('./embeddings')
    const text = `${entry.pattern} ${entry.observation}`
    const embedding = await getEmbedding(text)
    if (embedding) {
      await prisma.knowledgeEntry.update({
        where: { id: created.id },
        data: { embedding: JSON.stringify(embedding) },
      })
    }
  } catch { /* Ollama may not be running */ }

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

/** 의미 기반 지식 검색 (벡터 유사도) */
export async function searchKnowledgeSemantic(
  query: string,
  options?: {
    domain?: string
    limit?: number
    minSimilarity?: number
  },
): Promise<
  Array<{
    id: string
    domain: string
    level: number
    pattern: string
    observation: string
    confidence: number
    isAntiPattern: boolean
    similarity: number
  }>
> {
  const { getEmbedding, cosineSimilarity } = await import('./embeddings')
  const limit = options?.limit ?? 10
  const minSim = options?.minSimilarity ?? 0.3

  const queryEmbedding = await getEmbedding(query)
  if (!queryEmbedding) {
    // Fallback to keyword search if Ollama unavailable
    return fallbackKeywordSearch(query, options?.domain, limit)
  }

  // Get all entries with embeddings
  const where: Record<string, unknown> = { embedding: { not: null } }
  if (options?.domain) where.domain = options.domain

  const entries = await prisma.knowledgeEntry.findMany({
    where,
    select: {
      id: true,
      domain: true,
      level: true,
      pattern: true,
      observation: true,
      confidence: true,
      isAntiPattern: true,
      embedding: true,
    },
  })

  // Calculate similarities
  const scored = entries
    .map((e) => {
      const emb = JSON.parse(e.embedding!) as number[]
      const similarity = cosineSimilarity(queryEmbedding, emb)
      return { ...e, embedding: undefined, similarity }
    })
    .filter((e) => e.similarity >= minSim)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)

  return scored
}

/** Keyword fallback when Ollama is unavailable */
async function fallbackKeywordSearch(query: string, domain?: string, limit = 10) {
  const keywords = query
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 5)
  const where: Record<string, unknown> = {}
  if (domain) where.domain = domain

  const entries = await prisma.knowledgeEntry.findMany({
    where,
    orderBy: { confidence: 'desc' },
    take: limit * 3,
  })

  return entries
    .map((e) => {
      const text = `${e.pattern} ${e.observation}`.toLowerCase()
      const matchCount = keywords.filter((k) => text.includes(k.toLowerCase())).length
      return {
        id: e.id,
        domain: e.domain,
        level: e.level,
        pattern: e.pattern,
        observation: e.observation,
        confidence: e.confidence,
        isAntiPattern: e.isAntiPattern,
        similarity: keywords.length > 0 ? matchCount / keywords.length : 0,
      }
    })
    .filter((e) => e.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
}

/** 기존 지식에 임베딩 추가 (1회 실행용) */
export async function backfillEmbeddings(): Promise<{ total: number; embedded: number }> {
  const { getEmbedding } = await import('./embeddings')

  const entries = await prisma.knowledgeEntry.findMany({
    where: { embedding: null },
    select: { id: true, pattern: true, observation: true },
  })

  let embedded = 0
  for (const e of entries) {
    const text = `${e.pattern} ${e.observation}`
    const emb = await getEmbedding(text)
    if (emb) {
      await prisma.knowledgeEntry.update({
        where: { id: e.id },
        data: { embedding: JSON.stringify(emb) },
      })
      embedded++
    }
    // Rate limit: 100ms between calls
    await new Promise((r) => setTimeout(r, 100))
  }

  return { total: entries.length, embedded }
}
