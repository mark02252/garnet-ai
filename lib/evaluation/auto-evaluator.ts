/**
 * Content Auto-Evaluator
 * Instagram 게시물 성과를 자동 평가하고 패턴을 추출
 * 결과는 ContentEvaluation + EpisodicMemory에 저장
 */

import { prisma } from '@/lib/prisma'
import { fetchInstagramMediaInsights, type InstagramMediaInsight } from '@/lib/sns/instagram-api'
import { storeSnsPostEpisode } from '@/lib/memory/episodic-store'
import { loadMetaConnectionFromFile } from '@/lib/meta-connection-file-store'
import { runLLM } from '@/lib/llm'

/**
 * Instagram 게시물을 가져와서 자동 평가 + 에피소딕 메모리 저장
 */
export async function evaluateRecentPosts(): Promise<{
  evaluated: number
  topPerformers: string[]
  patterns: string[]
}> {
  // 토큰 로드
  const fileData = await loadMetaConnectionFromFile()
  if (!fileData?.accessToken || !fileData?.instagramBusinessAccountId) {
    return { evaluated: 0, topPerformers: [], patterns: [] }
  }

  // 게시물 가져오기
  let posts: InstagramMediaInsight[] = []
  try {
    posts = await fetchInstagramMediaInsights(
      fileData.accessToken,
      fileData.instagramBusinessAccountId,
      25,
    )
  } catch {
    return { evaluated: 0, topPerformers: [], patterns: [] }
  }

  if (posts.length === 0) return { evaluated: 0, topPerformers: [], patterns: [] }

  // 평균 도달 계산 (상대 평가 기준)
  const avgReach = posts.reduce((s, p) => s + (p.reach || 0), 0) / posts.length
  const avgEng = posts.reduce((s, p) => s + (p.engagement || 0), 0) / posts.length

  // 각 게시물 평가 + DB 저장
  let evaluated = 0
  const topPerformers: string[] = []

  for (const post of posts) {
    // 이미 평가된 게시물 스킵
    const existing = await prisma.contentEvaluation.findUnique({
      where: { mediaId: post.id },
    })
    if (existing) continue

    // 상대 순위 결정
    const reachRatio = avgReach > 0 ? (post.reach || 0) / avgReach : 0
    const rank =
      reachRatio >= 1.5 ? 'top10' :
      reachRatio >= 0.8 ? 'above_avg' :
      reachRatio >= 0.4 ? 'below_avg' : 'bottom10'

    // 해시태그 추출
    const hashtags = post.caption?.match(/#[가-힣a-zA-Z0-9_]+/g) || []

    // 패턴 추출
    const patterns: Record<string, unknown> = {
      hashtags,
      mediaType: post.media_type,
      hour: post.timestamp ? new Date(post.timestamp).getHours() : null,
      dayOfWeek: post.timestamp ? new Date(post.timestamp).getDay() : null,
      captionLength: post.caption?.length || 0,
      hasEmoji: /[\u{1F600}-\u{1F9FF}]/u.test(post.caption || ''),
    }

    // DB 저장
    await prisma.contentEvaluation.create({
      data: {
        mediaId: post.id,
        caption: post.caption?.slice(0, 500),
        mediaType: post.media_type,
        publishedAt: post.timestamp ? new Date(post.timestamp) : new Date(),
        reach: post.reach || 0,
        impressions: post.impressions || 0,
        likes: post.like_count || 0,
        comments: post.comments_count || 0,
        saved: post.saved || 0,
        shares: post.shares || 0,
        engagementRate: post.engagement_rate,
        performanceRank: rank,
        patterns: JSON.stringify(patterns),
      },
    })

    // 에피소딕 메모리에도 저장
    await storeSnsPostEpisode({
      caption: post.caption || '',
      mediaType: post.media_type || 'IMAGE',
      reach: post.reach || 0,
      engagement: post.engagement || 0,
      saved: post.saved || 0,
      shares: post.shares || 0,
      hashtags,
    })

    evaluated++
    if (rank === 'top10') {
      topPerformers.push(post.caption?.slice(0, 60) || post.id)
    }
  }

  // 전체 패턴 분석 (상위 게시물 공통점)
  const patternInsights: string[] = []
  const topPosts = posts
    .filter(p => (p.reach || 0) >= avgReach * 1.3)
    .slice(0, 5)

  if (topPosts.length >= 2) {
    try {
      const topData = topPosts.map(p =>
        `[${p.media_type}] 도달:${p.reach} 저장:${p.saved} 공유:${p.shares} | ${p.caption?.slice(0, 60)}`
      ).join('\n')

      const insight = await runLLM(
        '콘텐츠 분석가입니다. 성과 좋은 게시물들의 공통 패턴을 1-2문장으로 한국어로 설명하세요.',
        `상위 성과 게시물:\n${topData}`,
        0.3, 500,
      )
      patternInsights.push(insight)
    } catch { /* skip */ }
  }

  return { evaluated, topPerformers, patterns: patternInsights }
}

/**
 * 상위 10% 게시물 패턴을 플레이북 후보로 자동 등록
 */
export async function autoGeneratePlaybookFromTopPosts(): Promise<number> {
  const topEvals = await prisma.contentEvaluation.findMany({
    where: { performanceRank: 'top10' },
    orderBy: { reach: 'desc' },
    take: 5,
  })

  if (topEvals.length < 2) return 0

  let created = 0
  for (const eval_ of topEvals) {
    if (eval_.autoPlaybookId) continue // 이미 플레이북 생성됨

    const patterns = JSON.parse(eval_.patterns || '{}')
    const hashtags = (patterns.hashtags || []).join(' ')

    try {
      const playbook = await prisma.learningArchive.create({
        data: {
          sourceType: 'auto_evaluation',
          situation: `[자동] 상위 성과 콘텐츠 패턴 (도달 ${eval_.reach}, 저장 ${eval_.saved})`,
          recommendedResponse: eval_.caption || '',
          reasoning: `참여율 ${eval_.engagementRate ? (eval_.engagementRate * 100).toFixed(1) + '%' : 'N/A'}, 저장 ${eval_.saved}건, 공유 ${eval_.shares}건으로 상위 10% 성과`,
          signals: hashtags,
          tags: JSON.stringify(patterns.hashtags || []),
          status: 'DRAFT',
        },
      })

      await prisma.contentEvaluation.update({
        where: { id: eval_.id },
        data: { autoPlaybookId: playbook.id },
      })

      created++
    } catch { /* skip duplicate */ }
  }

  return created
}
