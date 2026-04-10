/**
 * Goal Manager — 전략 목표 진행률 추적
 * BusinessContext의 StrategicGoal을 WorldModel 데이터와 대조하여 진행률 계산
 */

import { prisma } from '@/lib/prisma'
import { loadBusinessContext } from '@/lib/business-context'
import type { StrategicGoal } from '@/lib/business-context'
import type { WorldModel, GoalProgress } from './types'

// ── Numeric Target Parser ──

/**
 * "20%", "1000명", "50만원", "3.5%" 등에서 숫자 추출
 */
export function parseNumericTarget(target: string): number | null {
  if (!target) return null

  // 퍼센트 처리
  const pctMatch = target.match(/([\d,.]+)\s*%/)
  if (pctMatch) return parseFloat(pctMatch[1].replace(/,/g, ''))

  // "만" 단위 처리 (50만 → 500000)
  const manMatch = target.match(/([\d,.]+)\s*만/)
  if (manMatch) return parseFloat(manMatch[1].replace(/,/g, '')) * 10000

  // "억" 단위 처리 (1억 → 100000000)
  const ukMatch = target.match(/([\d,.]+)\s*억/)
  if (ukMatch) return parseFloat(ukMatch[1].replace(/,/g, '')) * 100000000

  // 일반 숫자 추출
  const numMatch = target.match(/([\d,.]+)/)
  if (numMatch) return parseFloat(numMatch[1].replace(/,/g, ''))

  return null
}

// ── Single Goal Progress ──

export function computeGoalProgress(
  goal: StrategicGoal,
  currentValue: string | null
): GoalProgress {
  const now = new Date().toISOString()

  if (!currentValue) {
    return {
      goal,
      currentValue: null,
      progressPercent: 0,
      onTrack: false,
      lastChecked: now,
    }
  }

  const targetNum = parseNumericTarget(goal.target)
  const currentNum = parseNumericTarget(currentValue)

  if (targetNum === null || currentNum === null || targetNum === 0) {
    // 숫자로 파싱할 수 없으면 문자열 비교
    const isMatch = currentValue.trim().toLowerCase() === goal.target.trim().toLowerCase()
    return {
      goal,
      currentValue,
      progressPercent: isMatch ? 100 : 0,
      onTrack: isMatch,
      lastChecked: now,
    }
  }

  const progressPercent = Math.min(100, Math.round((currentNum / targetNum) * 100))

  // deadline 기반 on-track 판정
  let onTrack = progressPercent >= 50 // 기본: 50% 이상이면 on-track
  if (goal.deadline) {
    const deadline = new Date(goal.deadline)
    const totalDuration = deadline.getTime() - Date.now()
    if (totalDuration > 0) {
      // 남은 시간 대비 진행률이 충분한지 확인
      const elapsed = 1 - (totalDuration / (deadline.getTime() - new Date(now).getTime() + totalDuration))
      const expectedProgress = Math.round(elapsed * 100)
      onTrack = progressPercent >= expectedProgress * 0.8 // 80% 이상이면 on-track
    } else {
      // 이미 deadline 지남
      onTrack = progressPercent >= 100
    }
  }

  return {
    goal,
    currentValue,
    progressPercent,
    onTrack,
    lastChecked: now,
  }
}

// ── Extract Current Value from World Model ──

async function extractCurrentValue(
  goal: StrategicGoal,
  worldModel: WorldModel
): Promise<string | null> {
  const metricLower = goal.metric.toLowerCase()
  const snapshot = worldModel.snapshot

  // GA4 관련 지표 매칭
  if (metricLower.includes('세션') || metricLower.includes('session')) {
    return String(snapshot.ga4.sessions)
  }
  if (metricLower.includes('이탈') || metricLower.includes('bounce')) {
    return `${snapshot.ga4.bounceRate}%`
  }
  if (metricLower.includes('전환') || metricLower.includes('conversion')) {
    return `${snapshot.ga4.conversionRate}%`
  }

  // SNS 관련 지표 매칭
  if (metricLower.includes('참여') || metricLower.includes('engagement')) {
    return String(snapshot.sns.engagement)
  }
  if (metricLower.includes('팔로워') || metricLower.includes('follower')) {
    return String(snapshot.sns.followerGrowth)
  }
  if (metricLower.includes('도달') || metricLower.includes('reach')) {
    // DB에서 직접 조회 (topContent가 비어있을 수 있음)
    try {
      const { prisma: db } = await import('@/lib/prisma')
      const reachData = await db.instagramReachDaily.findFirst({ orderBy: { metricDate: 'desc' } })
      if (reachData?.reach) return String(reachData.reach)
    } catch { /* fallback */ }
    // 폴백: topContent
    const contents = snapshot.sns.topContent
    if (contents.length > 0) {
      return String(Math.round(contents.reduce((s: number, c: { metric: number }) => s + c.metric, 0) / contents.length))
    }
    return '0'
  }

  // 캠페인 관련 지표 매칭
  if (metricLower.includes('캠페인') || metricLower.includes('campaign')) {
    return String(snapshot.campaigns.active)
  }

  return null
}

// ── Evaluate All Goals ──

export async function evaluateGoals(worldModel: WorldModel): Promise<GoalProgress[]> {
  const ctx = loadBusinessContext()
  if (!ctx || !ctx.strategicGoals.length) {
    return []
  }

  const results: GoalProgress[] = []

  for (const goal of ctx.strategicGoals) {
    const currentValue = await extractCurrentValue(goal, worldModel)
    const progress = computeGoalProgress(goal, currentValue)
    results.push(progress)

    // DB에 GoalState 저장
    try {
      await prisma.goalState.create({
        data: {
          goalName: goal.goal,
          metric: goal.metric,
          targetValue: goal.target,
          currentValue: currentValue,
          progressPercent: progress.progressPercent,
          onTrack: progress.onTrack,
        },
      })
    } catch (err) {
      console.error(`[goal-manager] GoalState 저장 실패 (${goal.goal}):`, err)
    }
  }

  return results
}

// ── Goal Behind Detection ──

export function detectGoalsBehind(goals: GoalProgress[]): GoalProgress[] {
  return goals.filter(g => !g.onTrack && g.goal.priority !== 'low')
}
