/**
 * Campaign Auto-Designer
 * 목표 입력 → AI가 전체 캠페인 설계 (채널/예산/일정/콘텐츠)
 * 에피소딕 메모리에서 과거 성공 사례를 참조
 */

import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'
import { retrieveSimilarEpisodes } from '@/lib/memory/episodic-store'

export type CampaignDesign = {
  name: string
  objective: string
  duration: string
  channels: Array<{
    name: string
    budgetPercent: number
    strategy: string
  }>
  contentPlan: Array<{
    week: number
    type: string
    topic: string
    caption: string
    hashtags: string[]
    bestTime: string
  }>
  kpiTargets: Array<{
    metric: string
    target: string
  }>
  estimatedResults: {
    reach: string
    engagement: string
    conversions: string
  }
  risks: string[]
  weeklyFocus: string[]
}

export async function designCampaign(params: {
  objective: string
  brand?: string
  budget?: string
  duration?: string
}): Promise<CampaignDesign> {
  const { objective, brand, budget, duration } = params

  // 1. 에피소딕 메모리에서 유사 캠페인 검색
  const pastCampaigns = await retrieveSimilarEpisodes({
    category: 'campaign',
    tags: [objective, brand].filter(Boolean) as string[],
    minScore: 60,
    limit: 3,
  })

  const pastContext = pastCampaigns.length > 0
    ? `\n## 과거 유사 캠페인 (참고)\n${pastCampaigns.map(p => `- ${p.input} → ${p.output.slice(0, 100)} (점수: ${p.score})`).join('\n')}`
    : ''

  // 2. 최근 SNS 성과 데이터 가져오기
  let snsContext = ''
  try {
    const recentSnaps = await prisma.snsAnalyticsSnapshot.findMany({
      orderBy: { date: 'desc' },
      take: 7,
    })
    if (recentSnaps.length > 0) {
      const avgReach = Math.round(recentSnaps.reduce((s, r) => s + r.reach, 0) / recentSnaps.length)
      const avgEng = recentSnaps.reduce((s, r) => s + r.engagement, 0) / recentSnaps.length
      snsContext = `\n## 현재 SNS 성과\n- 주간 평균 도달: ${avgReach}\n- 주간 평균 참여: ${avgEng.toFixed(1)}\n- 팔로워: ${recentSnaps[0].followers}`
    }
  } catch { /* skip */ }

  // 3. 최근 성과 좋은 콘텐츠 패턴
  let contentContext = ''
  try {
    const topContent = await prisma.contentEvaluation.findMany({
      where: { performanceRank: 'top10' },
      orderBy: { reach: 'desc' },
      take: 3,
    })
    if (topContent.length > 0) {
      contentContext = `\n## 최근 성과 좋은 콘텐츠\n${topContent.map(c => `- [${c.mediaType}] 도달:${c.reach} 저장:${c.saved} | ${c.caption?.slice(0, 50)}`).join('\n')}`
    }
  } catch { /* skip */ }

  // 4. AI 캠페인 설계
  const prompt = `## 캠페인 설계 요청
- 목표: ${objective}
- 브랜드: ${brand || '미정'}
- 예산: ${budget || '미정'}
- 기간: ${duration || '4주'}
${snsContext}
${contentContext}
${pastContext}

위 정보를 바탕으로 전체 캠페인을 설계하세요. JSON으로만 출력:
{"name":"캠페인명","objective":"목표","duration":"기간","channels":[{"name":"채널","budgetPercent":40,"strategy":"전략"}],"contentPlan":[{"week":1,"type":"IMAGE","topic":"주제","caption":"캡션","hashtags":["#태그"],"bestTime":"화 18시"}],"kpiTargets":[{"metric":"도달","target":"10만"}],"estimatedResults":{"reach":"예상","engagement":"예상","conversions":"예상"},"risks":["리스크1"],"weeklyFocus":["1주차 액션","2주차 액션"]}`

  const result = await runLLM(
    '10년차 마케팅 전략가입니다. 데이터 기반으로 실행 가능한 캠페인을 설계합니다. 한국어. JSON만 출력.',
    prompt, 0.4, 4000,
  )

  const jsonMatch = result.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('캠페인 설계 JSON 파싱 실패')

  return JSON.parse(jsonMatch[0]) as CampaignDesign
}
