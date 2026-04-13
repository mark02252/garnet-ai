import { prisma } from '@/lib/prisma'
import { recordAndCalibrate, getCalibratedBias, recordPrediction } from './prediction-calibrator'
type GoalPrediction = {
  goalName: string
  currentPercent: number
  predictedPercent: number  // deadline 시점 예측값
  daysRemaining: number | null
  velocity: number          // % per day
  willMeet: boolean
  shortfall: number         // 부족분 %
  urgency: 'on_track' | 'at_risk' | 'will_miss'
}

/** 목표별 달성 예측 */
export async function predictGoals(): Promise<GoalPrediction[]> {
  // 목표별 최근 GoalState 이력 조회
  const goals = await prisma.goalState.findMany({
    orderBy: { checkedAt: 'desc' },
    distinct: ['goalName'],
    take: 10,
  })

  const predictions: GoalPrediction[] = []

  for (const goal of goals) {
    // 최근 7건의 이력
    const history = await prisma.goalState.findMany({
      where: { goalName: goal.goalName },
      orderBy: { checkedAt: 'desc' },
      take: 7,
    })

    if (history.length < 2) {
      predictions.push({
        goalName: goal.goalName,
        currentPercent: goal.progressPercent,
        predictedPercent: goal.progressPercent,
        daysRemaining: null,
        velocity: 0,
        willMeet: goal.onTrack,
        shortfall: Math.max(0, 100 - goal.progressPercent),
        urgency: goal.onTrack ? 'on_track' : 'at_risk',
      })
      continue
    }

    // 선형 회귀로 velocity 계산 (% per day)
    const points = history.reverse().map((h, i) => ({
      day: i,
      percent: h.progressPercent,
    }))
    const velocity = computeSlope(points)

    // deadline 파싱 (GoalState에는 없으므로 targetValue에서 추정 or 기본 30일)
    const daysRemaining = 30 // 기본값, BusinessContext deadline이 있으면 사용

    // 보정: 이전 예측 vs 현재 실제값 비교 → bias 갱신
    recordAndCalibrate(goal.goalName, goal.progressPercent)

    const rawPrediction = goal.progressPercent + velocity * daysRemaining
    const bias = getCalibratedBias(goal.goalName)
    const predictedPercent = Math.min(100, Math.max(0, rawPrediction - bias))

    // 이번 예측값 기록 (다음 사이클에서 실제값과 비교용)
    recordPrediction(goal.goalName, Math.round(predictedPercent))

    const willMeet = predictedPercent >= 95 // 95% 이상이면 달성 가능
    const shortfall = Math.max(0, 100 - predictedPercent)

    let urgency: GoalPrediction['urgency'] = 'on_track'
    if (!willMeet && shortfall > 30) urgency = 'will_miss'
    else if (!willMeet) urgency = 'at_risk'

    predictions.push({
      goalName: goal.goalName,
      currentPercent: goal.progressPercent,
      predictedPercent: Math.round(predictedPercent),
      daysRemaining,
      velocity: Math.round(velocity * 100) / 100,
      willMeet,
      shortfall: Math.round(shortfall),
      urgency,
    })
  }

  return predictions
}

/** Reasoner 프롬프트용: 예측 요약 */
export async function getPredictionSummary(): Promise<string> {
  const predictions = await predictGoals()
  if (predictions.length === 0) return '목표 예측 데이터 없음'

  return predictions.map(p => {
    const icon = p.urgency === 'on_track' ? '[v]' : p.urgency === 'at_risk' ? '[!]' : '[x]'
    return `${icon} ${p.goalName}: 현재 ${p.currentPercent}% -> 예측 ${p.predictedPercent}% (속도 ${p.velocity}%/일)${p.urgency === 'will_miss' ? ` -- ${p.shortfall}% 부족` : ''}`
  }).join('\n')
}

/** 선형 회귀 기울기 (OLS) */
function computeSlope(points: Array<{ day: number; percent: number }>): number {
  const n = points.length
  if (n < 2) return 0

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (const p of points) {
    sumX += p.day
    sumY += p.percent
    sumXY += p.day * p.percent
    sumX2 += p.day * p.day
  }

  const denom = n * sumX2 - sumX * sumX
  if (Math.abs(denom) < 0.0001) return 0
  return (n * sumXY - sumX * sumY) / denom
}
