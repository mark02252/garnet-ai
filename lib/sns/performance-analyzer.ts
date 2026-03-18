import { prisma } from '@/lib/prisma'
import { fetchInstagramMediaInsights, type InstagramMediaInsight } from '@/lib/sns/instagram-api'
import { runLLM } from '@/lib/llm'

export type PerformanceReport = {
  summary: {
    period: string
    totalReach: number
    avgReach: number
    reachChange: number
    totalEngagement: number
    avgEngagementRate: number
    trendDirection: 'UP' | 'DOWN' | 'FLAT'
  }
  topPosts: Array<{
    mediaId: string
    caption: string
    reach: number
    engagement: number
    mediaType: string
    timestamp: string
    whyGood: string
  }>
  lowPosts: Array<{
    mediaId: string
    caption: string
    reach: number
    mediaType: string
    improvementTip: string
  }>
  patterns: {
    bestPostingTimes: string[]
    bestContentType: string
    topHashtags: string[]
    topKeywords: string[]
    audienceInsight: string
  }
  recommendations: Array<{
    topic: string
    contentType: 'TEXT' | 'CAROUSEL'
    reason: string
    suggestedCaption: string
    suggestedHashtags: string[]
  }>
  adSuggestions: Array<{
    targetPostDescription: string
    suggestedBudget: string
    expectedEffect: string
    objective: string
  }>
}

export async function generatePerformanceReport(params: {
  accessToken: string
  businessAccountId: string
  personaId: string
  days?: number
}): Promise<PerformanceReport> {
  const { accessToken, businessAccountId, personaId, days = 30 } = params
  const since = new Date()
  since.setDate(since.getDate() - days)

  // 1. Fetch persona
  const persona = await prisma.snsPersona.findUnique({ where: { id: personaId } })
  if (!persona) throw new Error('페르소나를 찾을 수 없습니다.')

  // 2. Fetch media insights
  let mediaInsights: InstagramMediaInsight[] = []
  try {
    mediaInsights = await fetchInstagramMediaInsights(accessToken, businessAccountId)
  } catch { /* empty array if API fails */ }

  // 3. Fetch reach daily
  const reachDaily = await prisma.instagramReachDaily.findMany({
    where: { accountId: businessAccountId, metricDate: { gte: since } },
    orderBy: { metricDate: 'asc' },
  })

  // 4. Fetch scheduled posts for timing analysis
  const scheduledPosts = await prisma.snsScheduledPost.findMany({
    where: { personaId, status: 'PUBLISHED' },
    orderBy: { scheduledAt: 'desc' },
    take: 50,
  })

  // 5. Build LLM prompt with all collected data
  const mediaTable = mediaInsights
    .sort((a, b) => b.reach - a.reach)
    .map((m, i) => `${i + 1}. [${m.media_type || 'IMAGE'}] 도달:${m.reach} 참여:${m.engagement} 좋아요:${m.like_count} 댓글:${m.comments_count} | ${(m.caption || '').slice(0, 80)} (${m.timestamp?.slice(0, 10)})`)
    .join('\n')

  const reachSummary = reachDaily.map(r => `${r.metricDate.toISOString().slice(0, 10)}: ${r.reach}`).join(', ')

  const postingTimes = scheduledPosts.map(p => {
    const d = new Date(p.scheduledAt)
    return `${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]}요일 ${d.getHours()}시`
  })

  const userPrompt = `## 계정 정보
- 페르소나: ${persona.name}
- 브랜드 컨셉: ${persona.brandConcept || '미설정'}
- 타겟 오디언스: ${persona.targetAudience || '미설정'}
- 글쓰기 스타일: ${persona.writingStyle || '미설정'}

## 최근 게시물 인사이트 (도달 순, 최대 25개)
${mediaTable || '게시물 데이터 없음'}

## 최근 ${days}일 일별 도달 추이
${reachSummary || '도달 데이터 없음'}

## 게시 시간대 분포
${postingTimes.length > 0 ? postingTimes.join(', ') : '게시 이력 없음'}

## 요청
위 데이터를 기반으로 아래 JSON 구조의 성과 분석 리포트를 생성하세요.
반드시 유효한 JSON만 출력하세요. 다른 텍스트는 포함하지 마세요.

{
  "summary": { "period": "최근 ${days}일", "totalReach": number, "avgReach": number, "reachChange": number, "totalEngagement": number, "avgEngagementRate": number, "trendDirection": "UP"|"DOWN"|"FLAT" },
  "topPosts": [{ "mediaId": "", "caption": "", "reach": 0, "engagement": 0, "mediaType": "", "timestamp": "", "whyGood": "성공 이유" }],
  "lowPosts": [{ "mediaId": "", "caption": "", "reach": 0, "mediaType": "", "improvementTip": "개선 제안" }],
  "patterns": { "bestPostingTimes": [], "bestContentType": "", "topHashtags": [], "topKeywords": [], "audienceInsight": "" },
  "recommendations": [{ "topic": "추천 주제", "contentType": "TEXT"|"CAROUSEL", "reason": "추천 이유", "suggestedCaption": "예시 캡션", "suggestedHashtags": [] }],
  "adSuggestions": [{ "targetPostDescription": "", "suggestedBudget": "3~5만원", "expectedEffect": "", "objective": "도달" }]
}

주의:
- 한국어로 작성
- 추천 콘텐츠는 3~5개, 실행 가능한 구체적 주제
- 광고 예산은 소규모 사업자 기준 (1~10만원)
- 데이터가 없는 항목은 빈 배열이나 기본값으로 채우기`

  const systemPrompt = `당신은 Instagram 마케팅 분석 전문가입니다.
유효한 JSON만 출력하세요. Markdown 코드 펜스, 추가 설명 등 다른 텍스트는 절대 포함하지 마세요.`

  // 6. Call LLM (same pattern as persona-learner.ts)
  const llmResult = await runLLM(systemPrompt, userPrompt, 0.35, 4000)

  // 7. Parse LLM response
  const jsonMatch = llmResult.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('리포트 JSON 파싱에 실패했습니다.')
  const report = JSON.parse(jsonMatch[0]) as PerformanceReport
  return report
}
