import { prisma } from '@/lib/prisma'

const MEASUREMENT_DELAYS: Record<string, number> = {
  report_generation: 0,           // 즉시
  alert: 0,                       // 즉시
  playbook_update: 24 * 60 * 60 * 1000,  // 1일
  flow_trigger: 24 * 60 * 60 * 1000,     // 1일
  content_publish: 3 * 24 * 60 * 60 * 1000, // 3일
  budget_adjust: 7 * 24 * 60 * 60 * 1000,   // 7일
}

/** 액션 실행 후 PendingOutcome 생성 */
export async function scheduleMeasurement(params: {
  governorActionId: string
  episodeId?: string
  actionKind: string
  metricsBefore: Record<string, number> // 현재 지표 스냅샷
}): Promise<void> {
  const delay = MEASUREMENT_DELAYS[params.actionKind] ?? 24 * 60 * 60 * 1000
  const measureAt = new Date(Date.now() + delay)

  await prisma.pendingOutcome.create({
    data: {
      governorActionId: params.governorActionId,
      episodeId: params.episodeId,
      actionKind: params.actionKind,
      metricsBefore: JSON.stringify(params.metricsBefore),
      measureAt,
    },
  })
}

/** 측정 시점이 된 PendingOutcome을 처리 */
export async function processReadyOutcomes(): Promise<number> {
  const ready = await prisma.pendingOutcome.findMany({
    where: { status: 'pending', measureAt: { lte: new Date() } },
    take: 20,
  })

  let processed = 0
  for (const outcome of ready) {
    try {
      // 현재 지표 가져오기
      const currentMetrics = await getCurrentMetrics()
      const before = JSON.parse(outcome.metricsBefore) as Record<string, number>

      // 영향 점수 계산 (-100 ~ +100)
      const impactScore = calculateImpact(before, currentMetrics)

      await prisma.pendingOutcome.update({
        where: { id: outcome.id },
        data: {
          metricsAfter: JSON.stringify(currentMetrics),
          impactScore,
          measuredAt: new Date(),
          status: 'measured',
        },
      })

      // 인과 관계 기록
      try {
        const { recordCausalLink } = await import('./causal-model')
        const changes: Record<string, number> = {}
        for (const [k, v] of Object.entries(currentMetrics)) {
          if (before[k] && before[k] > 0) {
            changes[k] = ((v - before[k]) / before[k]) * 100
          }
        }
        await recordCausalLink({
          actionKind: outcome.actionKind,
          context: outcome.governorActionId,
          metricChanges: changes,
          lag: `${Math.round((Date.now() - outcome.createdAt.getTime()) / 86400000)}d`,
          domain: inferDomainFromKind(outcome.actionKind),
        })
      } catch { /* non-critical */ }

      // EpisodicMemory 점수 업데이트
      if (outcome.episodeId) {
        const newScore = Math.max(0, Math.min(100, 50 + impactScore))
        await prisma.episodicMemory.update({
          where: { id: outcome.episodeId },
          data: { score: newScore },
        }).catch(() => {})
      }

      processed++
    } catch {
      // 측정 실패 → expired
      await prisma.pendingOutcome.update({
        where: { id: outcome.id },
        data: { status: 'expired' },
      }).catch(() => {})
    }
  }

  return processed
}

/** 현재 주요 지표 가져오기 */
async function getCurrentMetrics(): Promise<Record<string, number>> {
  const [sns, reach] = await Promise.all([
    prisma.snsAnalyticsSnapshot.findFirst({ orderBy: { date: 'desc' } }),
    prisma.instagramReachDaily.findFirst({ orderBy: { metricDate: 'desc' } }),
  ])

  return {
    engagement: sns?.engagement ?? 0,
    followers: sns?.followers ?? 0,
    reach: reach?.reach ?? 0,
  }
}

/** 영향 점수 계산: before vs after의 가중 평균 변화율 */
function calculateImpact(before: Record<string, number>, after: Record<string, number>): number {
  const metrics = ['engagement', 'followers', 'reach']
  let totalChange = 0
  let count = 0

  for (const m of metrics) {
    const b = before[m] ?? 0
    const a = after[m] ?? 0
    if (b > 0) {
      totalChange += ((a - b) / b) * 100 // 변화율 %
      count++
    }
  }

  if (count === 0) return 0
  // 평균 변화율을 -100~+100 범위로 클램프
  return Math.max(-100, Math.min(100, totalChange / count))
}

function inferDomainFromKind(kind: string): string {
  const map: Record<string, string> = {
    content_publish: 'content_strategy', budget_adjust: 'finance',
    flow_trigger: 'operations', report_generation: 'marketing',
    playbook_update: 'marketing', alert: 'operations',
  }
  return map[kind] || 'marketing'
}

/** 30일 이상 된 expired outcomes 정리 */
export async function cleanupOldOutcomes(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const result = await prisma.pendingOutcome.deleteMany({
    where: { status: { in: ['measured', 'expired'] }, createdAt: { lt: cutoff } },
  })
  return result.count
}
