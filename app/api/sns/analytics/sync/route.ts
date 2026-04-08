import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchInstagramInsights } from '@/lib/instagram-insights'
import { fetchInstagramMediaInsights, fetchInstagramAccountMetrics, fetchFollowerDaily, fetchOnlineFollowers, fetchAccountViews } from '@/lib/sns/instagram-api'
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

    // Fetch all Instagram insights (legacy)
    const result = await fetchInstagramInsights(accessToken, businessAccountId, {
      periodDays: 30,
      mediaLimit: 25,
    })

    // Fetch enhanced media insights (saves, shares, video_views)
    let enhancedMedia: Awaited<ReturnType<typeof fetchInstagramMediaInsights>> = []
    try {
      console.log(`[Sync] Calling enhanced media with token length: ${accessToken.length}, accountId: ${businessAccountId}`)
      enhancedMedia = await fetchInstagramMediaInsights(accessToken, businessAccountId, 25)
      console.log(`[Sync] Enhanced media: ${enhancedMedia.length} items, first reach: ${enhancedMedia[0]?.reach}, saved: ${enhancedMedia[0]?.saved}`)
    } catch (e) {
      console.error('[Sync] Enhanced media failed:', e instanceof Error ? e.message : e)
    }

    // Fetch account-level metrics (profile views, website clicks)
    let accountMetrics = { followers_count: 0, media_count: 0, profile_views: 0, website_clicks: 0, reach: 0, impressions: 0, accounts_engaged: 0 }
    try {
      accountMetrics = await fetchInstagramAccountMetrics(accessToken, businessAccountId)
      console.log(`[Sync] Account metrics: followers=${accountMetrics.followers_count}, profileViews=${accountMetrics.profile_views}`)
    } catch (e) {
      console.error('[Sync] Account metrics failed:', e instanceof Error ? e.message : e)
    }

    // Fetch follower daily changes (일별 팔로워 증감)
    let followerDaily: Array<{ date: string; change: number }> = []
    try {
      followerDaily = await fetchFollowerDaily(accessToken, businessAccountId, 30)
      console.log(`[Sync] Follower daily: ${followerDaily.length} days, last change: ${followerDaily[followerDaily.length - 1]?.change}`)
    } catch { /* skip */ }

    // Fetch online followers (시간대별 활성)
    let onlineFollowers: Record<string, number> = {}
    try {
      onlineFollowers = await fetchOnlineFollowers(accessToken, businessAccountId)
    } catch { /* skip */ }

    // Fetch account views
    let accountViews = { totalViews: 0, totalInteractions: 0 }
    try {
      accountViews = await fetchAccountViews(accessToken, businessAccountId, 30)
      console.log(`[Sync] Views: ${accountViews.totalViews}, Interactions: ${accountViews.totalInteractions}`)
    } catch { /* skip */ }

    const followers = accountMetrics.followers_count || result.account.followersCount

    // 팔로워 일별 데이터로 스냅샷 보정 (과거 팔로워 복원)
    if (followerDaily.length > 0) {
      let cumulative = followers
      // followerDaily는 일별 증감값. 역순으로 계산하면 과거 팔로워 추정 가능
      const dailyMap = new Map(followerDaily.map(d => [d.date, d.change]))
      const sortedDates = [...dailyMap.keys()].sort().reverse()
      const followerByDate = new Map<string, number>()
      for (const date of sortedDates) {
        followerByDate.set(date, cumulative)
        cumulative -= (dailyMap.get(date) || 0)
      }
      // 기존 스냅샷의 팔로워 업데이트 (과거 데이터 보정)
      for (const [date, fCount] of followerByDate) {
        if (fCount > 0) {
          await prisma.snsAnalyticsSnapshot.updateMany({
            where: { personaId, date: new Date(date) },
            data: { followers: fCount },
          }).catch(() => {})
        }
      }
    }

    // Aggregate media by date (use enhanced data if available, else legacy)
    const mediaSource = enhancedMedia.length > 0 ? enhancedMedia : result.recentMedia
    const byDate = new Map<string, {
      reach: number; impressions: number; engagement: number; postCount: number;
      saved: number; shares: number; profileViews: number; websiteClicks: number;
    }>()

    for (const media of mediaSource) {
      const dateKey = media.timestamp.split('T')[0]
      const existing = byDate.get(dateKey) ?? {
        reach: 0, impressions: 0, engagement: 0, postCount: 0,
        saved: 0, shares: 0, profileViews: 0, websiteClicks: 0,
      }
      byDate.set(dateKey, {
        reach: existing.reach + (media.reach || 0),
        impressions: existing.impressions + (media.impressions || 0),
        engagement: existing.engagement + (media.engagement || media.like_count + media.comments_count),
        postCount: existing.postCount + 1,
        saved: existing.saved + ((media as any).saved || 0),
        shares: existing.shares + ((media as any).shares || 0),
        profileViews: 0,
        websiteClicks: 0,
      })
    }

    // Distribute account-level metrics to today's entry
    const todayKey = new Date().toISOString().split('T')[0]
    if (byDate.has(todayKey)) {
      const today = byDate.get(todayKey)!
      today.profileViews = accountMetrics.profile_views
      today.websiteClicks = accountMetrics.website_clicks
    } else if (accountMetrics.profile_views > 0 || accountMetrics.reach > 0) {
      byDate.set(todayKey, {
        reach: accountMetrics.reach,
        impressions: accountMetrics.impressions,
        engagement: accountMetrics.accounts_engaged,
        postCount: accountMetrics.media_count,
        saved: 0, shares: 0,
        profileViews: accountMetrics.profile_views,
        websiteClicks: accountMetrics.website_clicks,
      })
    }

    const upserts = await Promise.allSettled(
      Array.from(byDate.entries()).map(([date, data]) => {
        const isToday = date === todayKey
        return prisma.snsAnalyticsSnapshot.upsert({
          where: { personaId_date: { personaId, date: new Date(date) } },
          create: { personaId, date: new Date(date), followers, ...data },
          // 과거 데이터는 followers를 덮어쓰지 않음 (추이 보존)
          update: isToday ? { followers, ...data } : { ...data },
        })
      })
    )

    const syncedCount = upserts.filter(r => r.status === 'fulfilled').length
    const totalSaved = enhancedMedia.reduce((s, m) => s + (m.saved || 0), 0)
    const totalShares = enhancedMedia.reduce((s, m) => s + (m.shares || 0), 0)

    return NextResponse.json({
      synced: syncedCount,
      followers,
      recentMediaCount: enhancedMedia.length || result.recentMedia.length,
      insights: {
        reach: accountMetrics.reach || result.insights.reach,
        impressions: accountMetrics.impressions || result.insights.impressions,
        totalInteractions: result.insights.totalInteractions,
        profileViews: accountMetrics.profile_views,
        websiteClicks: accountMetrics.website_clicks,
        totalSaved,
        totalShares,
        totalViews: accountViews.totalViews,
        accountInteractions: accountViews.totalInteractions,
      },
      followerDaily,
      onlineFollowers,
      fetchedAt: result.fetchedAt,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '동기화 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
