/**
 * Recommendation Accuracy Tracker
 * AI 추천 vs 실제 결과를 추적하여 추천 정확도를 측정
 * Phase 5 프롬프트 자동 최적화의 근거 데이터
 */

import { prisma } from '@/lib/prisma'

/**
 * 추천 로그 기록 (추천 시점)
 */
export async function logRecommendation(params: {
  source: 'ga4_ai' | 'sns_ai' | 'action_engine'
  recommendation: string
  predictedImpact?: string
}) {
  return prisma.recommendationLog.create({
    data: {
      source: params.source,
      recommendation: params.recommendation,
      predictedImpact: params.predictedImpact,
    },
  })
}

/**
 * 추천 결과 평가 (실행 후)
 */
export async function evaluateRecommendation(id: string, params: {
  actualResult: string
  accuracyScore: number // 0-100
}) {
  return prisma.recommendationLog.update({
    where: { id },
    data: {
      actualResult: params.actualResult,
      accuracyScore: params.accuracyScore,
      evaluatedAt: new Date(),
    },
  })
}

/**
 * 소스별 추천 정확도 통계
 */
export async function getAccuracyStats() {
  const logs = await prisma.recommendationLog.findMany({
    where: { accuracyScore: { not: null } },
    select: { source: true, accuracyScore: true },
  })

  const bySource = new Map<string, number[]>()
  for (const log of logs) {
    const scores = bySource.get(log.source) || []
    if (log.accuracyScore != null) scores.push(log.accuracyScore)
    bySource.set(log.source, scores)
  }

  return Object.fromEntries(
    [...bySource.entries()].map(([source, scores]) => [
      source,
      {
        count: scores.length,
        avgAccuracy: scores.length > 0
          ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
          : 0,
        trend: scores.length >= 4
          ? (scores.slice(-2).reduce((s, v) => s + v, 0) / 2) >
            (scores.slice(-4, -2).reduce((s, v) => s + v, 0) / 2)
            ? 'improving' : 'declining'
          : 'insufficient_data',
      },
    ])
  )
}
