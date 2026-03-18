import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchInstagramMediaInsights, fetchInstagramFollowerCount } from '@/lib/sns/instagram-api'
import { loadMetaConnectionFromFile, saveMetaConnectionToFile } from '@/lib/meta-connection-file-store'

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

  try {
    const kpiGoals = await prisma.kpiGoal.findMany({
      take: 4,
      orderBy: { updatedAt: 'desc' },
    })

    const accountId = body.accountId || ''
    let reachDaily: Array<{ date: string; reach: number }> = []

    if (accountId) {
      const rows = await prisma.instagramReachDaily.findMany({
        where: { accountId, metricDate: { gte: since } },
        orderBy: { metricDate: 'asc' },
      })
      reachDaily = rows.map((r) => ({
        date: r.metricDate.toISOString().slice(0, 10),
        reach: r.reach,
      }))
    }

    const personaId = body.personaId || ''
    let followerTrend: Array<{ date: string; followers: number }> = []

    if (personaId) {
      const rows = await prisma.snsAnalyticsSnapshot.findMany({
        where: { personaId, date: { gte: since } },
        orderBy: { date: 'asc' },
      })
      followerTrend = rows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        followers: r.followers,
      }))
      if (reachDaily.length === 0) {
        reachDaily = rows.map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          reach: r.reach,
        }))
      }
    }

    let topPosts: Array<{
      id: string; timestamp: string; reach: number;
      caption?: string; media_type?: string; permalink?: string;
    }> = []

    if (accountId) {
      try {
        const accessToken = body.accessToken || ''
        if (accessToken) {
          const allInsights = await fetchInstagramMediaInsights(accessToken, accountId)
          topPosts = allInsights
            .sort((a, b) => {
              // reach가 있으면 reach 기준, 없으면 좋아요+댓글 기준
              const scoreA = a.reach > 0 ? a.reach : (a.like_count + a.comments_count) * 100
              const scoreB = b.reach > 0 ? b.reach : (b.like_count + b.comments_count) * 100
              return scoreB - scoreA
            })
            .slice(0, 5)
            .map((p) => ({
              id: p.id, timestamp: p.timestamp,
              reach: p.reach > 0 ? p.reach : p.like_count + p.comments_count,
              caption: p.caption, media_type: p.media_type, permalink: p.permalink,
              like_count: p.like_count, comments_count: p.comments_count,
            }))
        }
      } catch { /* Instagram API error — don't affect other data */ }
    }

    // 현재 팔로워 수 (실시간)
    let currentFollowers = 0
    if (accountId && body.accessToken) {
      try {
        currentFollowers = await fetchInstagramFollowerCount(body.accessToken, accountId)
      } catch { /* ignore */ }
    }

    // --- 오늘의 할 일: 예약 게시물 카운트 + 목록 ---
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endOfDay = new Date(today)
    endOfDay.setHours(23, 59, 59, 999)
    const weekEnd = new Date(today)
    weekEnd.setDate(weekEnd.getDate() + 7)

    const todayScheduled = await prisma.snsScheduledPost.count({
      where: { scheduledAt: { gte: today, lte: endOfDay }, status: 'PENDING' },
    })
    const weekScheduled = await prisma.snsScheduledPost.count({
      where: { scheduledAt: { gte: today, lte: weekEnd }, status: 'PENDING' },
    })

    const upcomingPosts = await prisma.snsScheduledPost.findMany({
      where: { scheduledAt: { gte: today }, status: 'PENDING' },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
      include: { draft: { select: { title: true, type: true } } },
    })

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

    const lastReachSync = await prisma.instagramReachDaily.findFirst({
      orderBy: { fetchedAt: 'desc' },
      select: { fetchedAt: true },
    })
    const lastAnalyticsSync = await prisma.snsAnalyticsSnapshot.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    const lastSyncAt = [lastReachSync?.fetchedAt, lastAnalyticsSync?.createdAt]
      .filter(Boolean)
      .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] || null

    return NextResponse.json({
      kpiGoals, reachDaily, followerTrend, topPosts, currentFollowers,
      todayScheduled, weekScheduled, upcomingPosts: serializedUpcoming,
      lastSyncAt: lastSyncAt ? (lastSyncAt as Date).toISOString() : null,
      alerts,
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json({ error: '대시보드 데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}
