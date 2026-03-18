import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchInstagramMediaInsights, fetchInstagramFollowerCount } from '@/lib/sns/instagram-api'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    days?: number; accountId?: string; accessToken?: string; personaId?: string;
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
      lastSyncAt: lastSyncAt ? (lastSyncAt as Date).toISOString() : null,
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json({ error: '대시보드 데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}
