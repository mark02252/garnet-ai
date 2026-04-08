/**
 * Scanner — DB에서 최신 수집 데이터를 읽어 WorldModelSnapshot을 구축
 * 새 수집을 트리거하지 않음 (read-only)
 */

import { prisma } from '@/lib/prisma'
import { listPending } from '@/lib/governor'
import { detectAnomalies } from '@/lib/analytics/forecast'
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

  // SNS — 오늘 예정된 게시물
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)
  const scheduledPosts = await prisma.snsScheduledPost.findMany({
    where: {
      scheduledAt: { gte: now, lte: todayEnd },
      status: 'PENDING',
    },
    include: { draft: { select: { title: true, type: true } } },
    orderBy: { scheduledAt: 'asc' },
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
      recentPerformance: [
        ...scheduledPosts.slice(0, 3).map(sp => ({
          id: sp.id,
          name: `[예정 ${sp.scheduledAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}] ${sp.draft?.title || '게시물'}`,
          score: 0,
        })),
      ],
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

  // GA4 이상 탐지 — 최근 InstagramReachDaily에서 도달 급변 체크
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const reachData = await prisma.instagramReachDaily.findMany({
      where: { metricDate: { gte: thirtyDaysAgo } },
      orderBy: { metricDate: 'asc' },
    })

    if (reachData.length >= 7) {
      const dates = reachData.map(r => r.metricDate.toISOString().split('T')[0])
      const values = reachData.map(r => r.reach)
      const anomalies = detectAnomalies(dates, values, 2.0)

      // 최근 24시간 내 이상치만
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const recentAnomalies = anomalies.filter(a => new Date(a.date) >= oneDayAgo)

      for (const a of recentAnomalies) {
        issues.push({
          id: `anomaly-reach-${a.date}`,
          type: 'anomaly',
          severity: Math.abs(a.zScore) > 3 ? 'critical' : 'high',
          summary: `Instagram 도달 이상 감지: ${a.value} (z=${a.zScore.toFixed(1)})`,
          detectedAt: a.date,
        })
      }
    }
  } catch { /* non-critical */ }

  // 팔로워 급변 탐지 — SnsAnalyticsSnapshot에서 최근 변화
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const snapshots = await prisma.snsAnalyticsSnapshot.findMany({
      where: { date: { gte: sevenDaysAgo } },
      orderBy: { date: 'asc' },
      select: { date: true, followers: true },
    })

    if (snapshots.length >= 3) {
      const latest = snapshots[snapshots.length - 1]
      const previous = snapshots[snapshots.length - 2]
      if (latest && previous && previous.followers > 0) {
        const changePercent = ((latest.followers - previous.followers) / previous.followers) * 100
        // 하루에 3% 이상 급감 시 이슈
        if (changePercent < -3) {
          issues.push({
            id: `follower-drop-${latest.date.toISOString().split('T')[0]}`,
            type: 'anomaly',
            severity: changePercent < -10 ? 'critical' : 'high',
            summary: `팔로워 급감: ${changePercent.toFixed(1)}% (${previous.followers} → ${latest.followers})`,
            detectedAt: latest.date.toISOString(),
          })
        }
      }
    }
  } catch { /* non-critical */ }

  return issues
}
