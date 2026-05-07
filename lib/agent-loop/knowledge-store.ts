import { prisma } from '@/lib/prisma'

// ── CocoIndex 패턴: 인메모리 임베딩 캐시 + 증분 업데이트 ──

type CachedEntry = {
  id: string
  domain: string
  level: number
  pattern: string
  observation: string
  confidence: number
  isAntiPattern: boolean
  embedding: number[]
  observedCount: number
  updatedAt: number // timestamp
}

let _embeddingCache: CachedEntry[] = []
let _cacheLoadedAt = 0
let _cacheVersion = 0
const CACHE_TTL = 10 * 60 * 1000 // 10분 TTL — 10분마다 증분 체크

/** 캐시 초기 로드 또는 증분 업데이트 */
async function ensureCache(): Promise<CachedEntry[]> {
  const now = Date.now()

  if (_cacheLoadedAt === 0) {
    // 최초 로드: 전체
    const entries = await prisma.knowledgeEntry.findMany({
      where: { embedding: { not: null } },
      select: {
        id: true, domain: true, level: true, pattern: true,
        observation: true, confidence: true, isAntiPattern: true,
        embedding: true, observedCount: true, updatedAt: true,
      },
    })
    _embeddingCache = entries.map(e => ({
      ...e,
      embedding: JSON.parse(e.embedding!) as number[],
      updatedAt: e.updatedAt.getTime(),
    }))
    _cacheLoadedAt = now
    _cacheVersion++
    return _embeddingCache
  }

  if (now - _cacheLoadedAt < CACHE_TTL) {
    // TTL 내 — 캐시 그대로 사용
    return _embeddingCache
  }

  // 증분 업데이트: 마지막 로드 이후 변경된 것만
  const since = new Date(_cacheLoadedAt - 5000) // 5초 여유
  const updated = await prisma.knowledgeEntry.findMany({
    where: { embedding: { not: null }, updatedAt: { gte: since } },
    select: {
      id: true, domain: true, level: true, pattern: true,
      observation: true, confidence: true, isAntiPattern: true,
      embedding: true, observedCount: true, updatedAt: true,
    },
  })

  if (updated.length > 0) {
    const idSet = new Set(updated.map(e => e.id))
    // 기존에서 업데이트된 것 제거
    _embeddingCache = _embeddingCache.filter(e => !idSet.has(e.id))
    // 새 데이터 추가
    for (const e of updated) {
      _embeddingCache.push({
        ...e,
        embedding: JSON.parse(e.embedding!) as number[],
        updatedAt: e.updatedAt.getTime(),
      })
    }
    _cacheVersion++
  }

  _cacheLoadedAt = now
  return _embeddingCache
}

/** 캐시 무효화 (addKnowledge 후 호출) */
function invalidateCache() {
  _cacheLoadedAt = 0
}

/** 캐시 통계 */
export function getCacheStats() {
  return {
    entries: _embeddingCache.length,
    version: _cacheVersion,
    loadedAt: _cacheLoadedAt ? new Date(_cacheLoadedAt).toISOString() : 'not loaded',
  }
}

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

    invalidateCache() // 병합 시 캐시 무효화
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

  // 중요 지식 발견 시 Slack 알림 (Principle level만 — 희귀하고 가치 높음)
  if (entry.level === 3 && !entry.isAntiPattern) {
    try {
      const { isSlackConfigured, slackKnowledgeDiscovery } = await import('./slack-notifier')
      if (isSlackConfigured()) {
        await slackKnowledgeDiscovery({
          domain: entry.domain,
          pattern: entry.pattern,
          observation: entry.observation,
          confidence: 0.4,
        }).catch(() => {})
      }
    } catch { /* non-critical */ }
  }

  invalidateCache() // 새 지식 추가 시 캐시 무효화
  return created.id
}

/** 유사 지식 검색 (임베딩 기반 + 키워드 폴백, 전체 도메인 검색) */
async function findSimilarKnowledge(domain: string, pattern: string) {
  // 1) 임베딩 기반 검색 시도 (전체 도메인에서)
  try {
    const { getEmbedding, cosineSimilarity } = await import('./embeddings')
    const queryEmb = await getEmbedding(pattern)
    if (queryEmb) {
      const candidates = await prisma.knowledgeEntry.findMany({
        where: { embedding: { not: null } },
        select: { id: true, domain: true, pattern: true, observation: true, observedCount: true, source: true, confidence: true, embedding: true },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      })

      let bestMatch: typeof candidates[0] | null = null
      let bestSim = 0
      for (const c of candidates) {
        const emb = JSON.parse(c.embedding!) as number[]
        const sim = cosineSimilarity(queryEmb, emb)
        // 같은 도메인이면 threshold 낮게, 다른 도메인이면 높게
        const threshold = c.domain === domain ? 0.75 : 0.85
        if (sim >= threshold && sim > bestSim) {
          bestSim = sim
          bestMatch = c
        }
      }
      if (bestMatch) return bestMatch
    }
  } catch { /* Ollama unavailable, fall through to keyword */ }

  // 2) 키워드 폴백 (같은 도메인 + 관련 도메인)
  const keywords = pattern
    .replace(/[^가-힣a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1)
    .slice(0, 5)

  if (keywords.length === 0) return null

  // 같은 도메인 우선, cross_domain 포함 도메인도 검색
  const candidates = await prisma.knowledgeEntry.findMany({
    where: {
      OR: [
        { domain },
        { domain: { contains: domain } }, // cross_domain 조합에서 원본 도메인 포함
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })

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

/** 의미 기반 지식 검색 (LightRAG 패턴: 벡터 유사도 + 키워드 부스트 + 신뢰도/레벨 가중) */
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
  const minSim = options?.minSimilarity ?? 0.25  // LightRAG: 다중 신호로 보완하므로 임계값 낮춤

  const queryEmbedding = await getEmbedding(query)
  if (!queryEmbedding) {
    return fallbackKeywordSearch(query, options?.domain, limit)
  }

  // 쿼리에서 키워드 추출 (LightRAG: low-level keywords)
  const queryKeywords = query
    .replace(/[^가-힣a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1)
    .map(w => w.toLowerCase())

  // CocoIndex 패턴: 인메모리 캐시에서 검색 (DB 호출 없음)
  const cache = await ensureCache()
  const entries = options?.domain
    ? cache.filter(e => e.domain === options.domain)
    : cache

  // 다중 신호 스코어링 (LightRAG 패턴)
  const scored = entries
    .map((e) => {
      const emb = e.embedding

      // 신호 1: 벡터 유사도 (0~1)
      const vectorSim = cosineSimilarity(queryEmbedding, emb)

      // 신호 2: 키워드 오버랩 부스트 (0~0.2)
      const text = `${e.pattern} ${e.observation}`.toLowerCase()
      const keywordHits = queryKeywords.filter(k => text.includes(k)).length
      const keywordBoost = queryKeywords.length > 0
        ? (keywordHits / queryKeywords.length) * 0.2
        : 0

      // 신호 3: 지식 레벨 부스트 — L3(원칙) > L2(패턴) > L1(팩트)
      const levelBoost = e.level === 3 ? 0.05 : e.level === 2 ? 0.02 : 0

      // 신호 4: 신뢰도 부스트 (confidence 0.7+ → +0.03)
      const confBoost = e.confidence >= 0.7 ? 0.03 : 0

      // 신호 5: 관찰 빈도 부스트 (3회+ → +0.02)
      const freqBoost = (e.observedCount ?? 0) >= 3 ? 0.02 : 0

      // 복합 스코어
      const similarity = vectorSim + keywordBoost + levelBoost + confBoost + freqBoost

      return { id: e.id, domain: e.domain, level: e.level, pattern: e.pattern, observation: e.observation, confidence: e.confidence, isAntiPattern: e.isAntiPattern, similarity }
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

/**
 * 3회 이상 관찰한 패턴을 Level 3(Principle)으로 승격
 * cycle_reflector + cross_domain 모두 대상
 */
export async function promoteRepeatedLessons(): Promise<number> {
  const candidates = await prisma.knowledgeEntry.findMany({
    where: {
      level: 2,
      observedCount: { gte: 3 },
    },
  })

  let promoted = 0
  for (const entry of candidates) {
    await prisma.knowledgeEntry.update({
      where: { id: entry.id },
      data: { level: 3 },
    })
    promoted++
  }
  return promoted
}

/**
 * 기존 cross_domain L3 → L2 다운그레이드 + 중복 병합 (1회 실행용)
 */
export async function mergeAndDowngradeCrossDomain(): Promise<{
  downgraded: number
  merged: number
  deleted: number
}> {
  const { getEmbedding, cosineSimilarity } = await import('./embeddings')

  // 1) cross_domain L3 → L2 다운그레이드 (observedCount < 3인 것만)
  const downgradeResult = await prisma.knowledgeEntry.updateMany({
    where: {
      source: { startsWith: 'cross_domain_' },
      level: 3,
      observedCount: { lt: 3 },
    },
    data: { level: 2 },
  })

  // 2) 중복 병합: cross_domain 엔트리 간 임베딩 유사도 0.85 이상이면 병합
  const crossEntries = await prisma.knowledgeEntry.findMany({
    where: { source: { startsWith: 'cross_domain_' } },
    orderBy: { observedCount: 'desc' }, // 관찰 많은 것 우선
  })

  const embeddings = new Map<string, number[]>()
  for (const entry of crossEntries) {
    if (entry.embedding) {
      embeddings.set(entry.id, JSON.parse(entry.embedding) as number[])
    } else {
      const emb = await getEmbedding(`${entry.pattern} ${entry.observation}`)
      if (emb) {
        embeddings.set(entry.id, emb)
        await prisma.knowledgeEntry.update({
          where: { id: entry.id },
          data: { embedding: JSON.stringify(emb) },
        })
      }
      await new Promise(r => setTimeout(r, 50))
    }
  }

  const deletedIds = new Set<string>()
  let merged = 0

  for (let i = 0; i < crossEntries.length; i++) {
    const a = crossEntries[i]
    if (deletedIds.has(a.id)) continue
    const embA = embeddings.get(a.id)
    if (!embA) continue

    for (let j = i + 1; j < crossEntries.length; j++) {
      const b = crossEntries[j]
      if (deletedIds.has(b.id)) continue
      const embB = embeddings.get(b.id)
      if (!embB) continue

      const sim = cosineSimilarity(embA, embB)
      if (sim >= 0.85) {
        // b를 a에 병합
        await prisma.knowledgeEntry.update({
          where: { id: a.id },
          data: {
            observedCount: a.observedCount + b.observedCount,
            confidence: Math.min(0.95, a.confidence + 0.05),
            observation: `${a.observation}\n---\n[병합] ${b.observation}`,
            source: a.source.includes(b.source) ? a.source : `${a.source}, ${b.source}`,
          },
        })
        await prisma.knowledgeEntry.delete({ where: { id: b.id } })
        deletedIds.add(b.id)
        merged++
      }
    }
  }

  return { downgraded: downgradeResult.count, merged, deleted: deletedIds.size }
}
