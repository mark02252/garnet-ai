import { prisma } from '@/lib/prisma'
import {
  fetchInstagramMediaInsights,
  fetchInstagramAccountMetrics,
  type InstagramMediaInsight,
} from '@/lib/sns/instagram-api'
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
    totalSaved: number
    totalShares: number
    profileViews: number
    websiteClicks: number
    followerCount: number
  }
  topPosts: Array<{
    mediaId: string
    caption: string
    reach: number
    engagement: number
    engagementRate: number
    saved: number
    shares: number
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
  contentAnalysis: {
    byType: Array<{
      type: string
      count: number
      avgReach: number
      avgEngRate: number
      avgSaves: number
    }>
    hashtagEffectiveness: Array<{
      hashtag: string
      avgReach: number
      count: number
      effectiveness: 'high' | 'medium' | 'low'
    }>
    bestPostingTimes: Array<{
      day: string
      hour: number
      avgReach: number
      postCount: number
    }>
  }
  patterns: {
    bestPostingTimes: string[]
    bestContentType: string
    topHashtags: string[]
    topKeywords: string[]
    audienceInsight: string
    savesInsight: string
    sharesInsight: string
    videoInsight: string
  }
  weeklyFocus: string
  channelHealth: {
    reachTrend: 'growing' | 'declining' | 'stable'
    engagementTrend: 'growing' | 'declining' | 'stable'
    followerGrowth: string
    healthScore: number // 0-100
  }
  recommendations: Array<{
    topic: string
    contentType: 'TEXT' | 'CAROUSEL' | 'VIDEO' | 'REEL'
    reason: string
    priority: 'high' | 'medium' | 'low'
    suggestedCaption: string
    suggestedHashtags: string[]
    expectedImpact: string
  }>
  adSuggestions: Array<{
    targetPostDescription: string
    suggestedBudget: string
    expectedEffect: string
    objective: string
  }>
}

/**
 * 해시태그 효과 분석 — 각 해시태그별 평균 도달 계산
 */
function analyzeHashtagEffectiveness(posts: InstagramMediaInsight[]) {
  const hashtagMap = new Map<string, { totalReach: number; count: number }>()
  for (const post of posts) {
    if (!post.caption) continue
    const hashtags = post.caption.match(/#[가-힣a-zA-Z0-9_]+/g) || []
    for (const tag of hashtags) {
      const entry = hashtagMap.get(tag) || { totalReach: 0, count: 0 }
      entry.totalReach += post.reach || 0
      entry.count += 1
      hashtagMap.set(tag, entry)
    }
  }
  return [...hashtagMap.entries()]
    .filter(([, v]) => v.count >= 2) // 2회 이상 사용된 해시태그만
    .map(([tag, v]) => {
      const avgReach = Math.round(v.totalReach / v.count)
      const overallAvg = posts.reduce((s, p) => s + (p.reach || 0), 0) / Math.max(posts.length, 1)
      const effectiveness = avgReach > overallAvg * 1.2 ? 'high' as const
        : avgReach < overallAvg * 0.8 ? 'low' as const : 'medium' as const
      return { hashtag: tag, avgReach, count: v.count, effectiveness }
    })
    .sort((a, b) => b.avgReach - a.avgReach)
    .slice(0, 15)
}

/**
 * 콘텐츠 유형별 분석
 */
function analyzeByContentType(posts: InstagramMediaInsight[]) {
  const typeMap = new Map<string, { reaches: number[]; engRates: number[]; saves: number[] }>()
  for (const post of posts) {
    const type = post.media_type || 'IMAGE'
    const entry = typeMap.get(type) || { reaches: [], engRates: [], saves: [] }
    entry.reaches.push(post.reach || 0)
    if (post.engagement_rate != null) entry.engRates.push(post.engagement_rate)
    entry.saves.push(post.saved || 0)
    typeMap.set(type, entry)
  }
  return [...typeMap.entries()].map(([type, v]) => ({
    type,
    count: v.reaches.length,
    avgReach: Math.round(v.reaches.reduce((s, r) => s + r, 0) / Math.max(v.reaches.length, 1)),
    avgEngRate: v.engRates.length > 0
      ? parseFloat((v.engRates.reduce((s, r) => s + r, 0) / v.engRates.length * 100).toFixed(2))
      : 0,
    avgSaves: Math.round(v.saves.reduce((s, r) => s + r, 0) / Math.max(v.saves.length, 1)),
  }))
}

/**
 * 최적 게시 시간 분석 (통계 기반)
 */
function analyzeBestTimes(posts: InstagramMediaInsight[]) {
  const dayNames = ['일', '월', '화', '수', '목', '금', '토']
  const slotMap = new Map<string, { reaches: number[]; count: number }>()
  for (const post of posts) {
    if (!post.timestamp) continue
    const d = new Date(post.timestamp)
    const key = `${dayNames[d.getDay()]}-${d.getHours()}`
    const entry = slotMap.get(key) || { reaches: [], count: 0 }
    entry.reaches.push(post.reach || 0)
    entry.count += 1
    slotMap.set(key, entry)
  }
  return [...slotMap.entries()]
    .map(([key, v]) => {
      const [day, hourStr] = key.split('-')
      return {
        day,
        hour: Number(hourStr),
        avgReach: Math.round(v.reaches.reduce((s, r) => s + r, 0) / Math.max(v.reaches.length, 1)),
        postCount: v.count,
      }
    })
    .sort((a, b) => b.avgReach - a.avgReach)
    .slice(0, 10)
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

  // 2. Fetch media insights (확장: saves, shares, video_views 포함)
  let mediaInsights: InstagramMediaInsight[] = []
  try {
    mediaInsights = await fetchInstagramMediaInsights(accessToken, businessAccountId, 50)
  } catch { /* empty array if API fails */ }

  // 3. Fetch account-level metrics (프로필 방문, 웹사이트 클릭 등)
  let accountMetrics = { followers_count: 0, media_count: 0, profile_views: 0, website_clicks: 0, reach: 0, impressions: 0, accounts_engaged: 0 }
  try {
    accountMetrics = await fetchInstagramAccountMetrics(accessToken, businessAccountId)
  } catch { /* defaults */ }

  // 4. Fetch reach daily
  const reachDaily = await prisma.instagramReachDaily.findMany({
    where: { accountId: businessAccountId, metricDate: { gte: since } },
    orderBy: { metricDate: 'asc' },
  })

  // 5. Pre-compute analytics
  const hashtagAnalysis = analyzeHashtagEffectiveness(mediaInsights)
  const contentTypeAnalysis = analyzeByContentType(mediaInsights)
  const bestTimesAnalysis = analyzeBestTimes(mediaInsights)

  const totalSaved = mediaInsights.reduce((s, m) => s + (m.saved || 0), 0)
  const totalShares = mediaInsights.reduce((s, m) => s + (m.shares || 0), 0)
  const totalReach = mediaInsights.reduce((s, m) => s + (m.reach || 0), 0)
  const totalEngagement = mediaInsights.reduce((s, m) => s + (m.engagement || 0), 0)
  const avgEngRate = mediaInsights.filter(m => m.engagement_rate != null).length > 0
    ? mediaInsights.filter(m => m.engagement_rate != null).reduce((s, m) => s + m.engagement_rate!, 0) / mediaInsights.filter(m => m.engagement_rate != null).length
    : 0

  // 6. Build comprehensive LLM prompt
  const mediaTable = mediaInsights
    .sort((a, b) => (b.reach || 0) - (a.reach || 0))
    .map((m, i) => `${i + 1}. [${m.media_type || 'IMAGE'}] 도달:${m.reach} 참여:${m.engagement} 좋아요:${m.like_count} 댓글:${m.comments_count} 저장:${m.saved} 공유:${m.shares} 참여율:${m.engagement_rate ? (m.engagement_rate * 100).toFixed(1) + '%' : 'N/A'}${m.video_views ? ` 재생:${m.video_views}` : ''} | ${(m.caption || '').slice(0, 80)} (${m.timestamp?.slice(0, 10)})`)
    .join('\n')

  const reachSummary = reachDaily.map(r => `${r.metricDate.toISOString().slice(0, 10)}: ${r.reach}`).join(', ')

  const userPrompt = `## 계정 정보
- 페르소나: ${persona.name}
- 브랜드 컨셉: ${persona.brandConcept || '미설정'}
- 타겟 오디언스: ${persona.targetAudience || '미설정'}
- 글쓰기 스타일: ${persona.writingStyle || '미설정'}
- 팔로워: ${accountMetrics.followers_count.toLocaleString()}
- 총 게시물: ${accountMetrics.media_count}
- 30일 프로필 방문: ${accountMetrics.profile_views.toLocaleString()}
- 30일 웹사이트 클릭: ${accountMetrics.website_clicks}
- 30일 도달 계정: ${accountMetrics.accounts_engaged.toLocaleString()}

## 게시물 (상위 10개)
${mediaInsights.sort((a, b) => (b.reach || 0) - (a.reach || 0)).slice(0, 10).map((m, i) => `${i + 1}.[${m.media_type || 'IMG'}] R:${m.reach} E:${m.engagement} S:${m.saved} Sh:${m.shares} | ${(m.caption || '').slice(0, 40)}`).join('\n') || '없음'}

## 콘텐츠 유형별: ${JSON.stringify(contentTypeAnalysis)}
## 해시태그 Top5: ${JSON.stringify(hashtagAnalysis.slice(0, 5))}
## 최적 시간 Top3: ${JSON.stringify(bestTimesAnalysis.slice(0, 3))}

## 핵심 지표
- 총 저장: ${totalSaved}, 총 공유: ${totalShares}
- 평균 참여율: ${(avgEngRate * 100).toFixed(2)}%
- 총 도달: ${totalReach.toLocaleString()}, 총 참여: ${totalEngagement.toLocaleString()}

## 분석 요청 (10년차 퍼포먼스 마케터 관점)
1. 콘텐츠 유형별 성과 진단 + 투자 방향
2. 해시태그 전략 — 효과 높은/낮은 해시태그 구분
3. 저장/공유가 많은 콘텐츠 패턴 분석 (구매 의향 신호)
4. 동영상 vs 이미지 vs 캐러셀 ROI 비교
5. 이번 주 가장 먼저 해야 할 액션 1가지
6. 채널 건강도 (0-100점)

반드시 아래 JSON만 출력하세요. 모든 필드를 빠짐없이 채우세요:
{"summary":{"period":"최근 ${days}일","totalReach":${totalReach},"avgReach":${Math.round(totalReach / Math.max(mediaInsights.length, 1))},"reachChange":0,"totalEngagement":${totalEngagement},"avgEngagementRate":${parseFloat((avgEngRate * 100).toFixed(2))},"trendDirection":"UP or DOWN or FLAT","totalSaved":${totalSaved},"totalShares":${totalShares},"followerCount":${accountMetrics.followers_count}},
"topPosts":[{"mediaId":"id","caption":"캡션","reach":0,"engagement":0,"saved":0,"shares":0,"mediaType":"IMAGE","whyGood":"성공이유"}],
"lowPosts":[{"mediaId":"id","caption":"캡션","reach":0,"mediaType":"IMAGE","improvementTip":"개선안"}],
"patterns":{"bestPostingTimes":["시간"],"bestContentType":"TYPE","topHashtags":["#태그"],"audienceInsight":"분석","savesInsight":"저장패턴","sharesInsight":"공유패턴","videoInsight":"영상분석"},
"weeklyFocus":"이번주 최우선 액션 1가지",
"channelHealth":{"reachTrend":"growing","engagementTrend":"stable","followerGrowth":"+0%","healthScore":50},
"recommendations":[{"topic":"주제","contentType":"CAROUSEL","reason":"이유","priority":"high","expectedImpact":"효과"}],
"adSuggestions":[{"targetPostDescription":"설명","suggestedBudget":"3만원","expectedEffect":"효과","objective":"도달"}]}`

  const systemPrompt = `당신은 10년차 Instagram 퍼포먼스 마케터입니다.
저장(saves)과 공유(shares)를 구매 의향의 핵심 지표로 봅니다.
참여율 = (좋아요+댓글+저장+공유) / 도달 로 계산합니다.
유효한 JSON만 출력하세요. Markdown 코드 펜스, 추가 설명은 절대 포함하지 마세요.`

  const llmResult = await runLLM(systemPrompt, userPrompt, 0.3, 8000)

  // Robust JSON parsing — handle truncated responses
  let report: PerformanceReport
  const fenced = llmResult.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  const rawJson = fenced ? fenced[1] : llmResult
  const start = rawJson.indexOf('{')
  const end = rawJson.lastIndexOf('}')

  if (start === -1) throw new Error('리포트 JSON 파싱에 실패했습니다.')

  let jsonStr = end > start ? rawJson.slice(start, end + 1) : rawJson.slice(start)

  // Try to fix truncated JSON by closing open brackets
  try {
    report = JSON.parse(jsonStr) as PerformanceReport
  } catch {
    // Attempt repair: close any open arrays/objects
    let openBrackets = 0, openBraces = 0
    for (const ch of jsonStr) {
      if (ch === '[') openBrackets++
      else if (ch === ']') openBrackets--
      else if (ch === '{') openBraces++
      else if (ch === '}') openBraces--
    }
    // Remove trailing incomplete values (after last comma)
    jsonStr = jsonStr.replace(/,\s*"[^"]*"?\s*:?\s*[^}\]]*$/, '')
    jsonStr += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces))
    try {
      report = JSON.parse(jsonStr) as PerformanceReport
    } catch (e2) {
      console.error('[SNS Report] JSON repair failed:', e2)
      throw new Error(`리포트 JSON 파싱에 실패했습니다: ${e2 instanceof Error ? e2.message : ''}`)
    }
  }

  // Inject pre-computed analytics
  report.contentAnalysis = {
    byType: contentTypeAnalysis,
    hashtagEffectiveness: hashtagAnalysis,
    bestPostingTimes: bestTimesAnalysis,
  }

  return report
}
