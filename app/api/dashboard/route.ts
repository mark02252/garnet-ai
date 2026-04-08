import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchInstagramMediaInsights, fetchInstagramFollowerCount } from '@/lib/sns/instagram-api'
import { loadMetaConnectionFromFile, saveMetaConnectionToFile } from '@/lib/meta-connection-file-store'
import { sendSlackMessage, buildPerformanceAlert } from '@/lib/integrations/slack'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    days?: number; accountId?: string; accessToken?: string; personaId?: string;
  }

  // 클라이언트에서 토큰이 없으면 파일 백업에서 읽기
  if (!body.accessToken || !body.accountId) {
    const fileData = await loadMetaConnectionFromFile()
    if (fileData) {
      if (!body.accessToken) body.accessToken = fileData.accessToken
      if (!body.accountId) body.accountId = fileData.instagramBusinessAccountId
    }
  }

  // 클라이언트에서 토큰이 왔으면 파일에도 백업
  if (body.accessToken && body.accountId) {
    void saveMetaConnectionToFile({
      accessToken: body.accessToken,
      instagramBusinessAccountId: body.accountId,
    })
  }

  const days = body.days || 30
  const since = new Date()
  since.setDate(since.getDate() - days)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const endOfDay = new Date(today)
  endOfDay.setHours(23, 59, 59, 999)
  const weekEnd = new Date(today)
  weekEnd.setDate(weekEnd.getDate() + 7)

  try {
    const accountId = body.accountId || ''
    const personaId = body.personaId || ''

    // DB 쿼리 모두 병렬 실행
    const [kpiGoals, reachDailyRows, snapshotRows, todayScheduled, weekScheduled, upcomingPosts, lastReachSync, lastAnalyticsSync] = await Promise.all([
      prisma.kpiGoal.findMany({ take: 4, orderBy: { updatedAt: 'desc' } }),
      accountId
        ? prisma.instagramReachDaily.findMany({ where: { accountId, metricDate: { gte: since } }, orderBy: { metricDate: 'asc' } })
        : Promise.resolve([]),
      personaId
        ? prisma.snsAnalyticsSnapshot.findMany({ where: { personaId, date: { gte: since } }, orderBy: { date: 'asc' } })
        : Promise.resolve([]),
      prisma.snsScheduledPost.count({ where: { scheduledAt: { gte: today, lte: endOfDay }, status: 'PENDING' } }),
      prisma.snsScheduledPost.count({ where: { scheduledAt: { gte: today, lte: weekEnd }, status: 'PENDING' } }),
      prisma.snsScheduledPost.findMany({
        where: { scheduledAt: { gte: today }, status: 'PENDING' },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        include: { draft: { select: { title: true, type: true } } },
      }),
      prisma.instagramReachDaily.findFirst({ orderBy: { fetchedAt: 'desc' }, select: { fetchedAt: true } }),
      prisma.snsAnalyticsSnapshot.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ])

    let reachDaily: Array<{ date: string; reach: number }> = reachDailyRows.map((r) => ({
      date: r.metricDate.toISOString().slice(0, 10),
      reach: r.reach,
    }))

    const followerTrend: Array<{ date: string; followers: number }> = snapshotRows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      followers: r.followers,
    }))

    if (reachDaily.length === 0 && snapshotRows.length > 0) {
      reachDaily = snapshotRows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        reach: r.reach,
      }))
    }

    // topPosts + currentFollowers 병렬 실행
    const accessToken = body.accessToken || ''
    const [topPostsResult, currentFollowersResult] = await Promise.allSettled([
      accountId && accessToken
        ? fetchInstagramMediaInsights(accessToken, accountId)
        : Promise.resolve([]),
      accountId && accessToken
        ? fetchInstagramFollowerCount(accessToken, accountId)
        : Promise.resolve(0),
    ])

    let topPosts: Array<{
      id: string; timestamp: string; reach: number;
      caption?: string; media_type?: string; permalink?: string;
    }> = []

    if (topPostsResult.status === 'fulfilled' && Array.isArray(topPostsResult.value)) {
      const allInsights = topPostsResult.value
      const filtered = allInsights.filter(p => {
        if (!p.timestamp) return true
        return new Date(p.timestamp) >= since
      })
      topPosts = (filtered.length > 0 ? filtered : allInsights)
        .sort((a, b) => {
          const scoreA = a.reach > 0 ? a.reach : a.like_count + a.comments_count
          const scoreB = b.reach > 0 ? b.reach : b.like_count + b.comments_count
          return scoreB - scoreA
        })
        .slice(0, 10)
        .map((p) => ({
          id: p.id, timestamp: p.timestamp,
          reach: p.reach > 0 ? p.reach : p.like_count + p.comments_count,
          caption: p.caption, media_type: p.media_type, permalink: p.permalink,
          like_count: p.like_count, comments_count: p.comments_count,
          saved: p.saved || 0, shares: p.shares || 0,
          engagement_rate: p.engagement_rate,
        }))
    }

    const currentFollowers = currentFollowersResult.status === 'fulfilled'
      ? (currentFollowersResult.value as number)
      : 0

    const serializedUpcoming = upcomingPosts.map((p) => ({
      id: p.id,
      scheduledAt: p.scheduledAt.toISOString(),
      draftTitle: p.draft?.title || '(제목 없음)',
      draftType: p.draft?.type || 'TEXT',
    }))

    // --- Anomaly detection ---
    const alerts: Array<{ type: 'warning' | 'info' | 'success'; message: string }> = []

    if (reachDaily.length >= 14) {
      const recent7 = reachDaily.slice(-7)
      const previous7 = reachDaily.slice(-14, -7)
      const recentAvg = recent7.reduce((s, r) => s + r.reach, 0) / 7
      const previousAvg = previous7.reduce((s, r) => s + r.reach, 0) / 7

      if (previousAvg > 0) {
        const changePct = ((recentAvg - previousAvg) / previousAvg) * 100

        if (changePct <= -30) {
          alerts.push({ type: 'warning', message: `도달이 전주 대비 ${Math.abs(Math.round(changePct))}% 급감했습니다. 콘텐츠 전략을 검토하세요.` })
        } else if (changePct <= -15) {
          alerts.push({ type: 'warning', message: `도달이 전주 대비 ${Math.abs(Math.round(changePct))}% 감소했습니다.` })
        } else if (changePct >= 30) {
          alerts.push({ type: 'success', message: `도달이 전주 대비 ${Math.round(changePct)}% 급증했습니다! 잘하고 있습니다.` })
        }
      }
    }

    // Check if no posts in last 3 days
    if (reachDaily.length >= 3) {
      const last3 = reachDaily.slice(-3)
      if (last3.every(r => r.reach === 0)) {
        alerts.push({ type: 'info', message: '최근 3일간 도달이 없습니다. 새 콘텐츠를 게시해보세요.' })
      }
    }

    // Send alerts to Slack (fire-and-forget; no-op if SLACK_WEBHOOK_URL is unset)
    for (const alert of alerts) {
      void sendSlackMessage(buildPerformanceAlert(alert.message, alert.type))
    }

    const lastSyncAt = [lastReachSync?.fetchedAt, lastAnalyticsSync?.createdAt]
      .filter(Boolean)
      .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] || null

    // Aggregate saved/shares from snapshots
    const totalSaved = snapshotRows.reduce((s, r) => s + ((r as any).saved || 0), 0)
    const totalShares = snapshotRows.reduce((s, r) => s + ((r as any).shares || 0), 0)

    return NextResponse.json({
      kpiGoals, reachDaily, followerTrend, topPosts, currentFollowers,
      todayScheduled, weekScheduled, upcomingPosts: serializedUpcoming,
      lastSyncAt: lastSyncAt ? (lastSyncAt as Date).toISOString() : null,
      alerts, totalSaved, totalShares,
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json({ error: '대시보드 데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}
