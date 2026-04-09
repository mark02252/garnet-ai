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

  // GA4 — API에서 직접 최신 데이터 가져오기
  let ga4Sessions = 0
  let ga4BounceRate = 0
  let ga4ConversionRate = 0
  let ga4TopChannels: Array<{ name: string; sessions: number }> = []

  try {
    const engRes = await fetch(`http://localhost:3000/api/ga4/engagement`)
    if (engRes.ok) {
      const eng = await engRes.json() as { data?: Array<{ engagementRate?: number; bounceRate?: number }> }
      if (eng.data?.length) {
        const latest = eng.data[eng.data.length - 1]
        ga4BounceRate = (latest.bounceRate ?? 0) * 100
      }
    }
  } catch { /* non-critical */ }

  try {
    const trafRes = await fetch(`http://localhost:3000/api/ga4/report`)
    if (trafRes.ok) {
      const traf = await trafRes.json() as { traffic?: Array<{ sessions?: number }>; channels?: Array<{ channel?: string; sessions?: number }> }
      if (traf.traffic?.length) {
        ga4Sessions = traf.traffic.reduce((s, t) => s + (t.sessions ?? 0), 0)
      }
      if (traf.channels?.length) {
        ga4TopChannels = traf.channels.slice(0, 5).map(c => ({ name: c.channel ?? '', sessions: c.sessions ?? 0 }))
      }
    }
  } catch { /* non-critical */ }

  // 전자상거래 데이터 (결제 전환율)
  try {
    const ecomRes = await fetch(`http://localhost:3000/api/ga4/ecommerce`)
    if (ecomRes.ok) {
      const ecom = await ecomRes.json() as {
        configured?: boolean
        totalTransactions?: number
        totalRevenue?: number
        avgPurchaseRate?: number
      }
      if (ecom.configured && ecom.avgPurchaseRate) {
        ga4ConversionRate = Math.round(ecom.avgPurchaseRate * 10000) / 100 // 소수점 2자리 %
      }
    }
  } catch { /* non-critical */ }

  // 폴백: 전자상거래 데이터 없으면 channel-conv에서
  if (ga4ConversionRate === 0) {
    try {
      const convRes = await fetch(`http://localhost:3000/api/ga4/channel-conv`)
      if (convRes.ok) {
        const conv = await convRes.json() as { data?: Array<{ conversionRate?: number }> }
        if (conv.data?.length) {
          const totalRate = conv.data.reduce((s, c) => s + (c.conversionRate ?? 0), 0)
          ga4ConversionRate = conv.data.length > 0 ? totalRate / conv.data.length : 0
        }
      }
    } catch { /* non-critical */ }
  }

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
      sessions: ga4Sessions,
      bounceRate: Math.round(ga4BounceRate * 10) / 10,
      conversionRate: Math.round(ga4ConversionRate * 1000) / 1000,
      topChannels: ga4TopChannels,
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
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)

    for (const p of pending) {
      const createdDate = new Date(p.createdAt)

      // 3일 이상 미응답 → 자동 만료 (무시됨으로 학습)
      if (createdDate < threeDaysAgo) {
        try {
          const { markRejected } = await import('@/lib/governor')
          await markRejected(p.id)
          const { onActionRejected } = await import('./human-feedback')
          const meta = typeof p.payload === 'object' && p.payload !== null
            ? (p.payload as Record<string, unknown>)._agentLoop as Record<string, string> | undefined
            : undefined
          await onActionRejected({
            actionKind: p.kind,
            title: meta?.title || p.kind,
            rationale: meta?.rationale || '',
            reason: 'bad_timing',
          })
        } catch { /* non-critical */ }
        continue // 만료 처리 후 이슈에 안 넣음
      }

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

  // 뒤처진 목표 감지 (데이터 미수집 0%는 제외)
  try {
    const goals = await prisma.goalState.findMany({
      orderBy: { checkedAt: 'desc' },
      distinct: ['goalName'],
    })
    for (const g of goals) {
      // 0%이고 currentValue가 null/0 → 데이터 미수집 상태, "뒤처짐"이 아님
      if (g.progressPercent === 0 && (!g.currentValue || g.currentValue === 'null' || g.currentValue === '0' || g.currentValue === '0%')) {
        continue // 데이터 수집 대기 — 이슈로 안 올림
      }
      if (!g.onTrack && g.progressPercent < 30 && g.progressPercent > 0) {
        issues.push({
          id: `goal-behind-${g.goalName}`,
          type: 'goal_behind',
          severity: 'normal',
          summary: `목표 뒤처짐: ${g.goalName} (${g.progressPercent}%)`,
          detectedAt: g.checkedAt.toISOString(),
        })
      }
    }
  } catch { /* non-critical */ }

  // 경쟁사 변화는 하루 2회 보고에서 안내 (urgency-check에서 즉시 알림 안 함)

  return issues
}
