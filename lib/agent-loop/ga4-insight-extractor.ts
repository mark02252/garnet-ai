/**
 * GA4 Insight Extractor — GA4 데이터에서 패턴을 자동 추출하여 Knowledge Store에 축적
 *
 * 매 routine-cycle에서 실행:
 * 1. GA4 API로 이번주 vs 지난주 데이터 비교
 * 2. 지점별 전환율, 채널별 ROI, 요일/시간 패턴 분석
 * 3. 이상 감지 (평균 대비 ±20% 이상)
 * 4. 발견된 패턴을 Knowledge Store에 자동 축적
 */

import { runLLM } from '@/lib/llm'
import { addKnowledge } from './knowledge-store'

// GA4 API 호출 헬퍼 (내부 API 사용)
async function fetchGA4(endpoint: string, params?: Record<string, string>): Promise<unknown> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`http://localhost:3000/api/ga4/${endpoint}${qs}`)
  if (!res.ok) return null
  return res.json()
}

type GA4InsightResult = {
  patternsFound: number
  knowledgeStored: number
  insights: string[]
}

/**
 * GA4 데이터에서 인사이트를 자동 추출하고 Knowledge Store에 저장
 * routine-cycle에서 호출 (1시간마다)
 * 단, 무거운 분석은 6시간마다만 실행
 */
export async function extractGA4Insights(): Promise<GA4InsightResult> {
  const result: GA4InsightResult = { patternsFound: 0, knowledgeStored: 0, insights: [] }

  // 6시간 쿨다운 체크
  const lastRunKey = 'ga4_insight_last_run'
  const { prisma } = await import('@/lib/prisma')
  const lastRun = await prisma.knowledgeEntry.findFirst({
    where: { source: 'ga4_insight_extractor', pattern: { startsWith: '[run]' } },
    orderBy: { updatedAt: 'desc' },
  })
  if (lastRun && Date.now() - lastRun.updatedAt.getTime() < 6 * 60 * 60 * 1000) {
    return result // 6시간 내 이미 실행됨
  }

  try {
    // 1. 퍼널 분석
    const funnelInsights = await analyzeFunnel()
    result.patternsFound += funnelInsights.length
    for (const insight of funnelInsights) {
      await storeInsight(insight)
      result.knowledgeStored++
      result.insights.push(insight.pattern)
    }

    // 2. 채널별 전환율 분석
    const channelInsights = await analyzeChannels()
    result.patternsFound += channelInsights.length
    for (const insight of channelInsights) {
      await storeInsight(insight)
      result.knowledgeStored++
      result.insights.push(insight.pattern)
    }

    // 3. 지점별 이상 감지
    const theaterInsights = await analyzeTheaters()
    result.patternsFound += theaterInsights.length
    for (const insight of theaterInsights) {
      await storeInsight(insight)
      result.knowledgeStored++
      result.insights.push(insight.pattern)
    }

    // 4. 요일/시간 패턴
    const timeInsights = await analyzeTimePatterns()
    result.patternsFound += timeInsights.length
    for (const insight of timeInsights) {
      await storeInsight(insight)
      result.knowledgeStored++
      result.insights.push(insight.pattern)
    }

    // 실행 기록
    await addKnowledge({
      domain: 'analytics',
      level: 1,
      pattern: `[run] GA4 insight extraction ${new Date().toISOString().split('T')[0]}`,
      observation: `패턴 ${result.patternsFound}건 발견, ${result.knowledgeStored}건 저장`,
      source: 'ga4_insight_extractor',
    })
  } catch { /* non-critical */ }

  return result
}

// ── 퍼널 분석 ──

type InsightEntry = {
  domain: string
  level: 1 | 2 | 3
  pattern: string
  observation: string
}

async function analyzeFunnel(): Promise<InsightEntry[]> {
  const insights: InsightEntry[] = []

  try {
    const data = await fetchGA4('funnel', { days: '7' }) as {
      funnel?: Array<{ step: string; users: number; dropoff: number }>
    } | null
    if (!data?.funnel?.length) return insights

    // 이탈률이 50% 이상인 단계 감지
    for (const step of data.funnel) {
      if (step.dropoff >= 50) {
        insights.push({
          domain: 'analytics',
          level: 2,
          pattern: `퍼널 병목: ${step.step} 이탈률 ${step.dropoff}%`,
          observation: `${step.step} 단계에서 ${step.dropoff}% 이탈 발생 (${step.users}명). 이 단계의 UX/가격/로딩 속도 점검 필요.`,
        })
      }
    }

    // 전체 전환율
    const first = data.funnel[0]
    const last = data.funnel[data.funnel.length - 1]
    if (first && last && first.users > 0) {
      const totalConv = ((last.users / first.users) * 100).toFixed(1)
      insights.push({
        domain: 'analytics',
        level: 1,
        pattern: `전체 퍼널 전환율: ${totalConv}%`,
        observation: `${first.step}(${first.users}명) → ${last.step}(${last.users}명). 전환율 ${totalConv}%.`,
      })
    }
  } catch { /* */ }

  return insights
}

// ── 채널별 분석 ──

async function analyzeChannels(): Promise<InsightEntry[]> {
  const insights: InsightEntry[] = []

  try {
    const data = await fetchGA4('channel-conv', { days: '7' }) as {
      channels?: Array<{ source: string; sessions: number; conversions: number; revenue: number }>
    } | null
    if (!data?.channels?.length) return insights

    // 전환율 상위/하위 채널 감지
    const withConv = data.channels
      .filter(c => c.sessions >= 20)
      .map(c => ({ ...c, convRate: c.sessions > 0 ? c.conversions / c.sessions * 100 : 0 }))
      .sort((a, b) => b.convRate - a.convRate)

    if (withConv.length >= 2) {
      const best = withConv[0]
      const worst = withConv[withConv.length - 1]

      insights.push({
        domain: 'analytics',
        level: 2,
        pattern: `최고 전환 채널: ${best.source} (${best.convRate.toFixed(1)}%)`,
        observation: `${best.source}에서 ${best.sessions}세션 중 ${best.conversions}건 전환 (${best.convRate.toFixed(1)}%). 매출 ${best.revenue.toLocaleString()}원. 이 채널 투자 확대 고려.`,
      })

      if (worst.convRate < best.convRate * 0.3 && worst.sessions >= 50) {
        insights.push({
          domain: 'analytics',
          level: 2,
          pattern: `저효율 채널: ${worst.source} (${worst.convRate.toFixed(1)}%)`,
          observation: `${worst.source}에서 ${worst.sessions}세션이지만 전환율 ${worst.convRate.toFixed(1)}%로 최고 대비 1/3 이하. 트래픽 품질 점검 필요.`,
        })
      }
    }
  } catch { /* */ }

  return insights
}

// ── 지점별 이상 감지 ──

async function analyzeTheaters(): Promise<InsightEntry[]> {
  const insights: InsightEntry[] = []

  try {
    const { prisma } = await import('@/lib/prisma')
    const { BetaAnalyticsDataClient } = await import('@google-analytics/data')

    const client = new BetaAnalyticsDataClient({
      credentials: {
        client_email: process.env.GA4_CLIENT_EMAIL!,
        private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      },
    })

    const propertyId = process.env.GA4_PROPERTY_ID!
    const events = ['add_shipping_info', 'add_payment_info', 'purchase']

    // 지점별 퍼널 데이터
    const theaterData: Record<string, Record<string, number>> = {}

    for (const ev of events) {
      const [r] = await client.runReport({
        property: 'properties/' + propertyId,
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'customEvent:theater_code' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: { fieldName: 'eventName', stringFilter: { value: ev } },
        },
        limit: 20,
      })

      for (const row of (r.rows || [])) {
        const theater = row.dimensionValues?.[0]?.value || ''
        if (theater === '(not set)' || theater.trim() === '') continue
        if (!theaterData[theater]) theaterData[theater] = {}
        theaterData[theater][ev] = parseInt(row.metricValues?.[0]?.value || '0')
      }
    }

    // 지점별 전환율 계산 + 이상 감지
    const convRates: Array<{ theater: string; rate: number; seat: number; purchase: number }> = []

    for (const [theater, evts] of Object.entries(theaterData)) {
      const seat = evts['add_shipping_info'] || 0
      const purchase = evts['purchase'] || 0
      if (seat < 5) continue // 모수 부족
      const rate = purchase / seat * 100
      convRates.push({ theater, rate, seat, purchase })
    }

    if (convRates.length >= 3) {
      const avgRate = convRates.reduce((sum, c) => sum + c.rate, 0) / convRates.length

      for (const c of convRates) {
        // 평균 대비 ±30% 이상 차이
        if (c.rate < avgRate * 0.7 && c.seat >= 10) {
          insights.push({
            domain: 'analytics',
            level: 2,
            pattern: `지점 전환율 하락: ${c.theater} (${c.rate.toFixed(0)}%)`,
            observation: `${c.theater} 좌석선택→결제 전환율 ${c.rate.toFixed(0)}% (평균 ${avgRate.toFixed(0)}% 대비 낮음). 좌석 ${c.seat}건 중 결제 ${c.purchase}건. 해당 지점 UX/편성 점검 필요.`,
          })
        }
        if (c.rate > avgRate * 1.3 && c.seat >= 10) {
          insights.push({
            domain: 'analytics',
            level: 2,
            pattern: `지점 전환율 우수: ${c.theater} (${c.rate.toFixed(0)}%)`,
            observation: `${c.theater} 좌석선택→결제 전환율 ${c.rate.toFixed(0)}% (평균 ${avgRate.toFixed(0)}% 대비 높음). 이 지점의 편성/UX 패턴을 다른 지점에 적용 검토.`,
          })
        }
      }
    }
  } catch { /* */ }

  return insights
}

// ── 요일/시간 패턴 ──

async function analyzeTimePatterns(): Promise<InsightEntry[]> {
  const insights: InsightEntry[] = []

  try {
    const { BetaAnalyticsDataClient } = await import('@google-analytics/data')
    const client = new BetaAnalyticsDataClient({
      credentials: {
        client_email: process.env.GA4_CLIENT_EMAIL!,
        private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      },
    })

    const propertyId = process.env.GA4_PROPERTY_ID!

    // 요일별
    const [dayResult] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'dayOfWeekName' }],
      metrics: [{ name: 'eventCount' }, { name: 'purchaseRevenue' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', stringFilter: { value: 'purchase' } },
      },
    })

    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const dayKo: Record<string, string> = { Monday: '월', Tuesday: '화', Wednesday: '수', Thursday: '목', Friday: '금', Saturday: '토', Sunday: '일' }
    const dayData: Record<string, { count: number; rev: number }> = {}
    for (const row of (dayResult.rows || [])) {
      dayData[row.dimensionValues?.[0]?.value || ''] = {
        count: parseInt(row.metricValues?.[0]?.value || '0'),
        rev: parseInt(row.metricValues?.[1]?.value || '0'),
      }
    }

    let bestDay = '', worstDay = '', bestCount = 0, worstCount = Infinity
    for (const day of dayOrder) {
      const count = dayData[day]?.count || 0
      if (count > bestCount) { bestCount = count; bestDay = day }
      if (count < worstCount) { worstCount = count; worstDay = day }
    }

    if (bestDay && worstDay && bestCount > worstCount * 2) {
      insights.push({
        domain: 'analytics',
        level: 2,
        pattern: `요일 패턴: ${dayKo[bestDay]}(${bestCount}건) vs ${dayKo[worstDay]}(${worstCount}건)`,
        observation: `${dayKo[bestDay]}요일 결제 ${bestCount}건으로 최고, ${dayKo[worstDay]}요일 ${worstCount}건으로 최저. ${bestCount / Math.max(worstCount, 1)}배 차이. ${dayKo[worstDay]}요일 프로모션 또는 편성 조정 검토.`,
      })
    }

    // 주중 vs 주말
    let weekday = 0, weekend = 0
    for (const day of dayOrder) {
      const count = dayData[day]?.count || 0
      if (['Saturday', 'Sunday'].includes(day)) weekend += count
      else weekday += count
    }

    if (weekday + weekend > 0) {
      const weekendPct = (weekend / (weekday + weekend) * 100).toFixed(0)
      insights.push({
        domain: 'analytics',
        level: 1,
        pattern: `주중/주말 비율: 주중 ${weekday}건 vs 주말 ${weekend}건 (${weekendPct}%)`,
        observation: `주말 매출 비중 ${weekendPct}%. ${parseInt(weekendPct) > 60 ? '주말 집중형 — 주말 회차 확대 고려' : '주중에도 수요 있음 — 주중 프로모션 효과 기대'}`,
      })
    }
  } catch { /* */ }

  return insights
}

// ── Knowledge Store 저장 ──

async function storeInsight(insight: InsightEntry): Promise<void> {
  await addKnowledge({
    domain: insight.domain,
    level: insight.level,
    pattern: insight.pattern,
    observation: insight.observation,
    source: 'ga4_insight_extractor',
  })
}
