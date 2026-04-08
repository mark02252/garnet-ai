// lib/sns/instagram-api.ts — Performance Marketing Grade

export type InstagramMediaInsight = {
  id: string
  timestamp: string
  impressions: number
  reach: number
  engagement: number
  like_count: number
  comments_count: number
  saved: number
  shares: number
  caption?: string
  media_type?: string
  permalink?: string
  // Video-specific
  video_views?: number
  // Calculated
  engagement_rate?: number
}

export type InstagramAccountMetrics = {
  followers_count: number
  media_count: number
  profile_views: number
  website_clicks: number
  reach: number
  impressions: number
  accounts_engaged: number
}

const API_VERSION = 'v25.0'
const BASE = `https://graph.instagram.com/${API_VERSION}`

/**
 * 미디어 인사이트 수집 (최대 50개, saves/shares 포함)
 */
export async function fetchInstagramMediaInsights(
  accessToken: string,
  businessAccountId: string,
  limit = 50,
): Promise<InstagramMediaInsight[]> {
  // Step 1: 미디어 목록 가져오기
  const mediaRes = await fetch(
    `${BASE}/${businessAccountId}/media?fields=id,timestamp,like_count,comments_count,caption,media_type,permalink&access_token=${accessToken}&limit=${Math.min(limit, 50)}`
  )
  if (!mediaRes.ok) throw new Error(`Instagram API 오류: ${await mediaRes.text()}`)
  const { data: mediaList } = await mediaRes.json() as {
    data: Array<{
      id: string; timestamp: string; like_count: number; comments_count: number;
      caption?: string; media_type?: string; permalink?: string
    }>
  }

  // Step 2: 각 미디어의 인사이트 수집
  // Instagram Login API는 미디어 타입별로 지원 메트릭이 다름
  // reach는 모든 타입에서 지원, saved/shares는 개별 시도
  const insights = await Promise.allSettled(
    mediaList.map(async (media) => {
      let reachVal = 0, impressionsVal = 0, savedVal = 0, sharesVal = 0, videoViews = 0

      // 1차: reach만 (가장 안정적)
      try {
        const res = await fetch(`${BASE}/${media.id}/insights?metric=reach&access_token=${accessToken}`)
        if (res.ok) {
          const { data } = await res.json() as { data: Array<{ name: string; values: Array<{ value: number }> }> }
          reachVal = data?.[0]?.values?.[0]?.value ?? 0
        }
      } catch { /* skip */ }

      // 2차: saved (개별)
      try {
        const res = await fetch(`${BASE}/${media.id}/insights?metric=saved&access_token=${accessToken}`)
        if (res.ok) {
          const { data } = await res.json() as { data: Array<{ name: string; values: Array<{ value: number }> }> }
          savedVal = data?.[0]?.values?.[0]?.value ?? 0
        }
      } catch { /* skip */ }

      // 3차: shares (개별)
      try {
        const res = await fetch(`${BASE}/${media.id}/insights?metric=shares&access_token=${accessToken}`)
        if (res.ok) {
          const { data } = await res.json() as { data: Array<{ name: string; values: Array<{ value: number }> }> }
          sharesVal = data?.[0]?.values?.[0]?.value ?? 0
        }
      } catch { /* skip */ }

      // 4차: plays (VIDEO/REEL만)
      if (media.media_type === 'VIDEO' || media.media_type === 'REEL') {
        try {
          const res = await fetch(`${BASE}/${media.id}/insights?metric=plays&access_token=${accessToken}`)
          if (res.ok) {
            const { data } = await res.json() as { data: Array<{ name: string; values: Array<{ value: number }> }> }
            videoViews = data?.[0]?.values?.[0]?.value ?? 0
          }
        } catch { /* skip */ }
      }

      // 참여 = 좋아요 + 댓글 + 저장 + 공유
      const totalEngagement = media.like_count + media.comments_count + savedVal + sharesVal
      // 참여율 = 참여 / 도달 (도달 0이면 null)
      const engagementRate = reachVal > 0 ? totalEngagement / reachVal : undefined

      return {
        id: media.id,
        timestamp: media.timestamp,
        impressions: impressionsVal,
        reach: reachVal,
        engagement: totalEngagement,
        like_count: media.like_count,
        comments_count: media.comments_count,
        saved: savedVal,
        shares: sharesVal,
        caption: media.caption,
        media_type: media.media_type,
        permalink: media.permalink,
        video_views: (media.media_type === 'VIDEO' || media.media_type === 'REEL') ? videoViews : undefined,
        engagement_rate: engagementRate,
      } as InstagramMediaInsight
    })
  )

  return insights
    .filter((r) => r.status === 'fulfilled' && r.value !== null)
    .map(r => (r as PromiseFulfilledResult<InstagramMediaInsight>).value)
}

/**
 * 계정 전체 지표 (팔로워, 프로필 방문, 웹사이트 클릭 등)
 */
export async function fetchInstagramAccountMetrics(
  accessToken: string,
  businessAccountId: string,
): Promise<InstagramAccountMetrics> {
  // 기본 정보
  const infoRes = await fetch(
    `${BASE}/${businessAccountId}?fields=followers_count,media_count&access_token=${accessToken}`
  )
  const info = infoRes.ok
    ? await infoRes.json() as { followers_count?: number; media_count?: number }
    : { followers_count: 0, media_count: 0 }

  // 계정 인사이트 (30일)
  let profileViews = 0, websiteClicks = 0, reach = 0, impressions = 0, accountsEngaged = 0

  try {
    const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000)
    const until = Math.floor(Date.now() / 1000)
    const insightRes = await fetch(
      `${BASE}/${businessAccountId}/insights?metric=profile_views,website_clicks,reach,impressions,accounts_engaged&period=day&since=${since}&until=${until}&access_token=${accessToken}`
    )
    if (insightRes.ok) {
      const { data } = await insightRes.json() as {
        data: Array<{ name: string; values: Array<{ value: number }> }>
      }
      const sumMetric = (name: string) =>
        data.find(d => d.name === name)?.values.reduce((s, v) => s + (v.value || 0), 0) ?? 0
      profileViews = sumMetric('profile_views')
      websiteClicks = sumMetric('website_clicks')
      reach = sumMetric('reach')
      impressions = sumMetric('impressions')
      accountsEngaged = sumMetric('accounts_engaged')
    }
  } catch {
    // 인사이트 실패 시 기본값 유지
  }

  return {
    followers_count: info.followers_count ?? 0,
    media_count: info.media_count ?? 0,
    profile_views: profileViews,
    website_clicks: websiteClicks,
    reach,
    impressions,
    accounts_engaged: accountsEngaged,
  }
}

/**
 * 팔로워 수만 빠르게 조회
 */
export async function fetchInstagramFollowerCount(
  accessToken: string,
  businessAccountId: string
): Promise<number> {
  const res = await fetch(
    `${BASE}/${businessAccountId}?fields=followers_count&access_token=${accessToken}`
  )
  if (!res.ok) return 0
  const data = await res.json() as { followers_count?: number }
  return data.followers_count ?? 0
}

/**
 * 팔로워 일별 증감 (follower_count metric)
 */
export async function fetchFollowerDaily(
  accessToken: string,
  businessAccountId: string,
  days = 30,
): Promise<Array<{ date: string; change: number }>> {
  const since = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000)
  const until = Math.floor(Date.now() / 1000)
  try {
    const res = await fetch(
      `${BASE}/${businessAccountId}/insights?metric=follower_count&period=day&since=${since}&until=${until}&access_token=${accessToken}`
    )
    if (!res.ok) return []
    const { data } = await res.json() as { data: Array<{ values: Array<{ value: number; end_time: string }> }> }
    return (data?.[0]?.values || []).map(v => ({
      date: v.end_time?.slice(0, 10) || '',
      change: v.value || 0,
    }))
  } catch { return [] }
}

/**
 * 시간대별 활성 팔로워 (online_followers)
 */
export async function fetchOnlineFollowers(
  accessToken: string,
  businessAccountId: string,
): Promise<Record<string, number>> {
  try {
    const res = await fetch(
      `${BASE}/${businessAccountId}/insights?metric=online_followers&period=lifetime&access_token=${accessToken}`
    )
    if (!res.ok) return {}
    const { data } = await res.json() as { data: Array<{ values: Array<{ value: Record<string, number> }> }> }
    return data?.[0]?.values?.[0]?.value || {}
  } catch { return {} }
}

/**
 * 계정 조회수 + 상호작용 (views, total_interactions)
 */
export async function fetchAccountViews(
  accessToken: string,
  businessAccountId: string,
  days = 30,
): Promise<{ totalViews: number; totalInteractions: number }> {
  const since = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000)
  const until = Math.floor(Date.now() / 1000)
  let totalViews = 0, totalInteractions = 0
  try {
    const r1 = await fetch(`${BASE}/${businessAccountId}/insights?metric=views&period=day&since=${since}&until=${until}&access_token=${accessToken}`)
    if (r1.ok) {
      const d = await r1.json() as { data: Array<{ values: Array<{ value: number }> }> }
      totalViews = d.data?.[0]?.values?.reduce((s, v) => s + (v.value || 0), 0) ?? 0
    }
  } catch { /* skip */ }
  try {
    const r2 = await fetch(`${BASE}/${businessAccountId}/insights?metric=total_interactions&period=day&since=${since}&until=${until}&access_token=${accessToken}`)
    if (r2.ok) {
      const d = await r2.json() as { data: Array<{ values: Array<{ value: number }> }> }
      totalInteractions = d.data?.[0]?.values?.reduce((s, v) => s + (v.value || 0), 0) ?? 0
    }
  } catch { /* skip */ }
  return { totalViews, totalInteractions }
}
