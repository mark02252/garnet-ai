/**
 * Goal Planner — 데이터 기반 목표 자동 설정
 *
 * GA4 매출/트래픽 + SNS 지표를 분석하여
 * 현실적인 단기/중기/장기 목표를 자동 산출
 */

import { runLLM } from '@/lib/llm'
import { loadBusinessContext, saveBusinessContext } from '@/lib/business-context'
import { getKnowledgeForReasoner } from './knowledge-store'
import { isSlackConfigured, slackEvolutionAlert } from './slack-notifier'
import { isTelegramConfigured, sendMessage } from '@/lib/telegram'

export type GoalPlan = {
  timeframe: 'short' | 'mid' | 'long' // 1개월 / 3개월 / 6개월
  goals: Array<{
    name: string
    metric: string
    current: number
    target: number
    unit: string
    rationale: string
  }>
  projectedRevenue?: number
}

type BusinessMetrics = {
  sessions: number
  sessionsTrend: number // 주간 변화율 %
  purchasers: number
  revenue: number
  conversionRate: number
  avgOrderValue: number
  arpu: number // 활성 사용자당 수익
  followers: number
  engagement: number
}

/** 현재 비즈니스 지표 수집 */
async function collectCurrentMetrics(): Promise<BusinessMetrics | null> {
  try {
    const [ecomRes, reportRes] = await Promise.all([
      fetch('http://localhost:3000/api/ga4/ecommerce').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('http://localhost:3000/api/ga4/report').then(r => r.ok ? r.json() : null).catch(() => null),
    ])

    const { prisma } = await import('@/lib/prisma')
    const latestSns = await prisma.snsAnalyticsSnapshot.findFirst({ orderBy: { date: 'desc' } })

    const totalSessions = reportRes?.traffic?.reduce((s: number, t: { sessions?: number }) => s + (t.sessions ?? 0), 0) ?? 0
    const dailyData = ecomRes?.dailyData?.filter((d: { revenue: number }) => d.revenue > 0) ?? []
    const recentRevenue = dailyData.length > 0 ? dailyData[dailyData.length - 1] : null

    return {
      sessions: totalSessions,
      sessionsTrend: 0, // World Model에서 가져올 수도 있지만 단순화
      purchasers: recentRevenue?.transactions ?? 0,
      revenue: recentRevenue?.revenue ?? 0,
      conversionRate: ecomRes?.avgPurchaseRate ?? 0,
      avgOrderValue: ecomRes?.avgOrderValue ?? 0,
      arpu: 912, // GA4 대시보드 기준 (Knowledge Store에서 가져올 수도 있음)
      followers: latestSns?.followers ?? 0,
      engagement: latestSns?.engagement ?? 0,
    }
  } catch {
    return null
  }
}

/** 데이터 기반 목표 자동 산출 */
export async function planGoals(): Promise<GoalPlan[]> {
  const metrics = await collectCurrentMetrics()
  if (!metrics || metrics.sessions === 0) return []

  const knowledge = await getKnowledgeForReasoner()

  const prompt = `현재 비즈니스 데이터를 기반으로 현실적인 목표를 설정하세요.

## 현재 지표
- 월간 세션: ${metrics.sessions.toLocaleString()}
- 일 매출: ₩${metrics.revenue.toLocaleString()} (구매자 ${metrics.purchasers}명)
- 구매 전환율: ${(metrics.conversionRate * 100).toFixed(1)}%
- 인당 주문금액: ₩${metrics.avgOrderValue.toLocaleString()}
- 활성 사용자당 수익: ₩${metrics.arpu}
- Instagram 팔로워: ${metrics.followers.toLocaleString()}
- SNS 참여율: ${metrics.engagement}%

## 축적된 비즈니스 지식
${knowledge.effective.slice(0, 5).map(k => `- ${k.pattern}: ${k.observation.split('\n')[0]}`).join('\n')}

## 규칙
1. 현재 성장률과 데이터를 기반으로 현실적인 목표만 설정
2. 너무 공격적이거나 비현실적인 목표는 금지
3. 각 목표에 "왜 이 수치인지" 근거 포함
4. 매출 목표는 세션 × 전환율 × 인당금액으로 산출

JSON:
[
  {
    "timeframe": "short",
    "goals": [
      {"name":"목표명","metric":"지표","current":현재값,"target":목표값,"unit":"단위","rationale":"근거"}
    ],
    "projectedRevenue": 예상월매출
  },
  {"timeframe": "mid", ...},
  {"timeframe": "long", ...}
]`

  try {
    const raw = await runLLM(
      '데이터 기반 비즈니스 목표 설정 전문가. 현실적이고 근거 있는 목표만 제시. JSON만 출력.',
      prompt, 0.3, 2000,
    )
    const parsed = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || '[]') as GoalPlan[]
    return parsed.filter(p => p.timeframe && p.goals?.length > 0)
  } catch {
    return []
  }
}

/** 목표 계획을 BusinessContext에 반영 + 알림 */
export async function updateGoalsFromPlan(): Promise<{
  updated: boolean
  plans: GoalPlan[]
}> {
  const plans = await planGoals()
  if (plans.length === 0) return { updated: false, plans: [] }

  const ctx = loadBusinessContext()
  if (!ctx) return { updated: false, plans }

  // 단기 목표만 strategicGoals에 반영 (중기/장기는 참고용)
  const shortTerm = plans.find(p => p.timeframe === 'short')
  if (shortTerm?.goals?.length) {
    const newGoals = shortTerm.goals.map(g => ({
      goal: g.name,
      metric: g.metric,
      target: `${g.target}${g.unit}`,
      priority: 'high' as const,
    }))

    // 기존 목표와 비교하여 변경된 것만 업데이트
    let changed = false
    for (const ng of newGoals) {
      const existing = ctx.strategicGoals.find(eg => eg.metric === ng.metric)
      if (existing) {
        if (existing.target !== ng.target) {
          existing.target = ng.target
          changed = true
        }
      }
      // 새 목표는 추가하지 않음 — 기존 목표의 target만 데이터 기반으로 조정
    }

    if (changed) {
      ctx.lastUpdated = new Date().toISOString()
      saveBusinessContext(ctx)
    }
  }

  // 알림 — 단기/중기/장기 계획 공유
  const timeframeLabels: Record<string, string> = { short: '단기 (1개월)', mid: '중기 (3개월)', long: '장기 (6개월)' }

  const planSummary = plans.map(p => {
    const label = timeframeLabels[p.timeframe] || p.timeframe
    const goalsText = p.goals.map(g => `  • ${g.name}: ${g.current}${g.unit} → ${g.target}${g.unit}`).join('\n')
    const revText = p.projectedRevenue ? `  💰 예상 월매출: ₩${p.projectedRevenue.toLocaleString()}` : ''
    return `*${label}*\n${goalsText}${revText ? '\n' + revText : ''}`
  }).join('\n\n')

  if (isSlackConfigured()) {
    await slackEvolutionAlert({
      type: 'self_improve',
      title: '📋 데이터 기반 목표 계획 수립',
      description: planSummary,
    }).catch(() => {})
  }

  if (isTelegramConfigured()) {
    await sendMessage(
      `📋 *Garnet 목표 계획*\n\n${planSummary}`,
      { parseMode: 'Markdown' },
    ).catch(() => {})
  }

  return { updated: true, plans }
}
