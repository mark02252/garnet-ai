import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchInstagramInsights } from '@/lib/instagram-insights'
import { loadMetaConnectionFromFile } from '@/lib/meta-connection-file-store'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const personaId = body.personaId
    if (!personaId) return NextResponse.json({ error: 'personaId 필수' }, { status: 400 })

    const persona = await prisma.snsPersona.findUnique({ where: { id: personaId } })
    if (!persona) return NextResponse.json({ error: '페르소나 없음' }, { status: 404 })

    // Token resolution: body → file store → env vars
    let accessToken: string = body.accessToken || ''
    let businessAccountId: string = body.businessAccountId || ''

    if (!accessToken || !businessAccountId) {
      const fileData = await loadMetaConnectionFromFile()
      if (fileData) {
        if (!accessToken) accessToken = fileData.accessToken
        if (!businessAccountId) businessAccountId = fileData.instagramBusinessAccountId
      }
    }

    if (!accessToken) accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || ''
    if (!businessAccountId) businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || ''

    if (!accessToken || !businessAccountId) {
      return NextResponse.json(
        {
          error:
            'Instagram 연동 설정이 필요합니다. Instagram 로그인 후 다시 시도하거나, 환경변수(INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ACCOUNT_ID)를 설정하세요.',
        },
        { status: 400 }
      )
    }

    // Fetch all Instagram insights
    const result = await fetchInstagramInsights(accessToken, businessAccountId, {
      periodDays: 30,
      mediaLimit: 25,
    })

    const followers = result.account.followersCount

    // Aggregate media by date for SnsAnalyticsSnapshot upserts
    const byDate = new Map<
      string,
      { reach: number; impressions: number; engagement: number; postCount: number }
    >()

    for (const media of result.recentMedia) {
      const dateKey = media.timestamp.split('T')[0]
      const existing = byDate.get(dateKey) ?? {
        reach: 0,
        impressions: 0,
        engagement: 0,
        postCount: 0,
      }
      byDate.set(dateKey, {
        reach: existing.reach + media.reach,
        impressions: existing.impressions + media.impressions,
        engagement: existing.engagement + media.engagement,
        postCount: existing.postCount + 1,
      })
    }

    // If no per-media data but we have account-level insights, store as a single "today" entry
    if (byDate.size === 0 && (result.insights.reach > 0 || result.insights.impressions > 0)) {
      const todayKey = new Date().toISOString().split('T')[0]
      byDate.set(todayKey, {
        reach: result.insights.reach,
        impressions: result.insights.impressions,
        engagement: result.insights.totalInteractions,
        postCount: result.account.mediaCount,
      })
    }

    const upserts = await Promise.allSettled(
      Array.from(byDate.entries()).map(([date, data]) =>
        prisma.snsAnalyticsSnapshot.upsert({
          where: { personaId_date: { personaId, date: new Date(date) } },
          create: { personaId, date: new Date(date), followers, ...data },
          update: { followers, ...data },
        })
      )
    )

    const syncedCount = upserts.filter(r => r.status === 'fulfilled').length

    return NextResponse.json({
      synced: syncedCount,
      followers,
      recentMediaCount: result.recentMedia.length,
      insights: {
        reach: result.insights.reach,
        impressions: result.insights.impressions,
        totalInteractions: result.insights.totalInteractions,
      },
      fetchedAt: result.fetchedAt,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '동기화 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
