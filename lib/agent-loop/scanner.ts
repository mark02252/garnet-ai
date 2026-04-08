/**
 * Scanner — DB에서 최신 수집 데이터를 읽어 WorldModelSnapshot을 구축
 * 새 수집을 트리거하지 않음 (read-only)
 */

import { prisma } from '@/lib/prisma'
import { listPending } from '@/lib/governor'
import type { WorldModelSnapshot, OpenIssue } from './types'

export async function buildSnapshotFromDb(): Promise<WorldModelSnapshot> {
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  // GA4 — KpiGoal에서 주요 지표 최신값
  const kpiGoals = await prisma.kpiGoal.findMany({
    where: { metric: { in: ['sessions', 'bounce_rate', 'conversion_rate'] } },
    orderBy: { createdAt: 'desc' },
  })
  const kpiMap = new Map(kpiGoals.map(k => [k.metric, k]))

  // SNS — SnsAnalyticsSnapshot 최신
  const latestSns = await prisma.snsAnalyticsSnapshot.findFirst({
    orderBy: { date: 'desc' },
  })

  // SNS — 최근 마케팅 인텔
  const snsIntel = await prisma.marketingIntel.findMany({
    where: {
      platform: { in: ['TWITTER', 'REDDIT', 'YOUTUBE'] },
      createdAt: { gte: oneDayAgo },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  // 경쟁사 — 최근 MarketingIntel에서 competitor 태그
  const competitorIntel = await prisma.marketingIntel.findMany({
    where: {
      tags: { contains: 'competitor' },
      createdAt: { gte: oneDayAgo },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  // Governor 대기 건 (raw SQL — GovernorAction은 Prisma 모델이 아님)
  const pendingCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int as count FROM "GovernorAction" WHERE "status" IN ('PENDING_APPROVAL', 'PENDING_SCORE') AND "deletedAt" IS NULL`
  ).then(r => r[0]?.count ?? 0).catch(() => 0)

  // 캠페인 — 최근 실행
  const recentRuns = await prisma.run.findMany({
    where: { createdAt: { gte: oneDayAgo } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  return {
    ga4: {
      sessions: kpiMap.get('sessions')?.currentValue ?? 0,
      bounceRate: kpiMap.get('bounce_rate')?.currentValue ?? 0,
      conversionRate: kpiMap.get('conversion_rate')?.currentValue ?? 0,
      topChannels: [],
      trend: 'stable',
    },
    sns: {
      engagement: latestSns?.engagement ?? 0,
      followerGrowth: latestSns?.followers ?? 0,
      topContent: snsIntel.slice(0, 3).map(i => ({
        platform: i.platform,
        id: i.id,
        metric: i.views ?? i.likes ?? 0,
      })),
      trend: 'stable',
    },
    competitors: {
      recentMoves: competitorIntel.map(i => ({
        competitor: i.query,
        action: i.title,
        detectedAt: i.createdAt.toISOString(),
      })),
      threatLevel: competitorIntel.length > 3 ? 'high' : competitorIntel.length > 0 ? 'medium' : 'low',
    },
    campaigns: {
      active: recentRuns.length,
      pendingApproval: pendingCount,
      recentPerformance: [],
    },
  }
}

export async function detectOpenIssues(): Promise<OpenIssue[]> {
  const issues: OpenIssue[] = []

  try {
    const pending = await listPending(['PENDING_APPROVAL'], 10)
    for (const p of pending) {
      issues.push({
        id: `gov-${p.id}`,
        type: 'approval_pending',
        severity: p.riskLevel === 'HIGH' ? 'high' : 'normal',
        summary: `[${p.kind}] 승인 대기 중`,
        detectedAt: p.createdAt,
      })
    }
  } catch { /* governor table may not exist yet */ }

  return issues
}
