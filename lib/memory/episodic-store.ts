/**
 * Episodic Memory Store
 * Flow 실행, SNS 게시물, AI 분석 결과를 저장하고 검색
 * Phase 5 자가 개선의 기반 데이터
 */

import { prisma } from '@/lib/prisma'

export type EpisodicEntry = {
  category: 'flow_run' | 'sns_post' | 'campaign' | 'ai_report'
  input: string
  output: string
  score?: number
  tags?: string[]
  metadata?: Record<string, unknown>
  feedback?: string
}

/**
 * 에피소딕 메모리에 저장
 */
export async function storeEpisode(entry: EpisodicEntry) {
  return prisma.episodicMemory.create({
    data: {
      category: entry.category,
      input: entry.input,
      output: entry.output,
      score: entry.score,
      tags: JSON.stringify(entry.tags || []),
      metadata: JSON.stringify(entry.metadata || {}),
      feedback: entry.feedback,
    },
  })
}

/**
 * 유사한 과거 에피소드 검색 (카테고리 + 태그 기반)
 * Phase 5에서 few-shot 예시로 활용
 */
export async function retrieveSimilarEpisodes(params: {
  category: string
  tags?: string[]
  minScore?: number
  limit?: number
}) {
  const { category, tags, minScore, limit = 5 } = params

  const episodes = await prisma.episodicMemory.findMany({
    where: {
      category,
      ...(minScore != null ? { score: { gte: minScore } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit * 3, // 태그 매칭을 위해 여유분 가져옴
  })

  // 태그 매칭으로 재정렬
  if (tags && tags.length > 0) {
    const tagSet = new Set(tags.map(t => t.toLowerCase()))
    const scored = episodes.map(ep => {
      const epTags: string[] = JSON.parse(ep.tags || '[]')
      const matchCount = epTags.filter(t => tagSet.has(t.toLowerCase())).length
      return { ...ep, matchScore: matchCount }
    })
    scored.sort((a, b) => b.matchScore - a.matchScore || (b.score || 0) - (a.score || 0))
    return scored.slice(0, limit)
  }

  return episodes.slice(0, limit)
}

/**
 * 최고 성과 에피소드 가져오기 (프롬프트 최적화용)
 */
export async function getTopEpisodes(category: string, limit = 10) {
  return prisma.episodicMemory.findMany({
    where: { category, score: { not: null } },
    orderBy: { score: 'desc' },
    take: limit,
  })
}

/**
 * Flow 실행 결과를 에피소딕 메모리에 저장
 */
export async function storeFlowRunEpisode(params: {
  topic: string
  brand?: string
  nodes: string[]
  output: string
  score?: number
}) {
  return storeEpisode({
    category: 'flow_run',
    input: `주제: ${params.topic}${params.brand ? ` | 브랜드: ${params.brand}` : ''} | 노드: ${params.nodes.join(', ')}`,
    output: params.output.slice(0, 2000),
    score: params.score,
    tags: [params.topic, params.brand, ...params.nodes].filter(Boolean) as string[],
    metadata: { nodeCount: params.nodes.length },
  })
}

/**
 * SNS 게시물 성과를 에피소딕 메모리에 저장
 */
export async function storeSnsPostEpisode(params: {
  caption: string
  mediaType: string
  reach: number
  engagement: number
  saved: number
  shares: number
  hashtags: string[]
}) {
  const engRate = params.reach > 0 ? (params.engagement / params.reach * 100) : 0
  // 성과 점수: 도달 + 참여율 + 저장 가중
  const score = Math.min(100, Math.round(
    (params.reach / 100) * 0.3 +
    engRate * 10 +
    params.saved * 2 +
    params.shares * 3
  ))

  return storeEpisode({
    category: 'sns_post',
    input: `[${params.mediaType}] ${params.caption.slice(0, 200)}`,
    output: `도달:${params.reach} 참여:${params.engagement} 저장:${params.saved} 공유:${params.shares} 참여율:${engRate.toFixed(1)}%`,
    score,
    tags: params.hashtags,
    metadata: { mediaType: params.mediaType, reach: params.reach, saved: params.saved, shares: params.shares },
  })
}
