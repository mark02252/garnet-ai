// lib/instagram-insights.ts
// Instagram Graph API v25.0 insights fetcher
// Supports both instagram_login and meta_business connection modes

const GRAPH_BASE = 'https://graph.instagram.com/v25.0'

export type InstagramAccountInfo = {
  id: string
  username: string
  name?: string
  biography?: string
  followersCount: number
  mediaCount: number
  profilePictureUrl?: string
  website?: string
}

export type InstagramAccountInsights = {
  reach: number
  impressions: number
  totalInteractions: number
  accountsEngaged: number
  followerCount: number
  periodDays: number
}

export type InstagramMediaItem = {
  id: string
  timestamp: string
  mediaType: string
  caption?: string
  permalink?: string
  likeCount: number
  commentsCount: number
  reach: number
  impressions: number
  engagement: number
}

export type InstagramInsightsResult = {
  account: InstagramAccountInfo
  insights: InstagramAccountInsights
  recentMedia: InstagramMediaItem[]
  fetchedAt: string
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Instagram API error ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

/** Fetch basic account info: followers, media_count, username */
export async function fetchAccountInfo(
  accessToken: string,
  businessAccountId: string
): Promise<InstagramAccountInfo> {
  const fields = [
    'id', 'username', 'name', 'biography',
    'followers_count', 'media_count',
    'profile_picture_url', 'website'
  ].join(',')

  const data = await apiFetch<{
    id: string
    username: string
    name?: string
    biography?: string
    followers_count?: number
    media_count?: number
    profile_picture_url?: string
    website?: string
  }>(`${GRAPH_BASE}/${businessAccountId}?fields=${fields}&access_token=${accessToken}`)

  return {
    id: data.id,
    username: data.username,
    name: data.name,
    biography: data.biography,
    followersCount: data.followers_count ?? 0,
    mediaCount: data.media_count ?? 0,
    profilePictureUrl: data.profile_picture_url,
    website: data.website,
  }
}

/**
 * Fetch account-level insights for the last N days.
 * Uses the /insights endpoint with period=day and aggregates.
 * Falls back to zeros if insufficient permissions.
 */
export async function fetchAccountInsights(
  accessToken: string,
  businessAccountId: string,
  periodDays = 30
): Promise<InstagramAccountInsights> {
  // Instagram Basic Display / instagram_login supports account-level insights
  // Metrics available: reach, impressions, total_interactions, accounts_engaged, follower_count
  const metrics = [
    'reach',
    'impressions',
    'total_interactions',
    'accounts_engaged',
    'follower_count',
  ].join(',')

  const until = Math.floor(Date.now() / 1000)
  const since = until - periodDays * 24 * 60 * 60

  try {
    const data = await apiFetch<{
      data: Array<{
        name: string
        period: string
        values: Array<{ value: number; end_time: string }>
        title?: string
        description?: string
        id: string
      }>
    }>(
      `${GRAPH_BASE}/${businessAccountId}/insights?metric=${metrics}&period=day&since=${since}&until=${until}&access_token=${accessToken}`
    )

    const sumMetric = (name: string) => {
      const entry = data.data.find(d => d.name === name)
      if (!entry) return 0
      return entry.values.reduce((sum, v) => sum + (v.value || 0), 0)
    }

    const lastValue = (name: string) => {
      const entry = data.data.find(d => d.name === name)
      if (!entry || entry.values.length === 0) return 0
      return entry.values[entry.values.length - 1]?.value ?? 0
    }

    return {
      reach: sumMetric('reach'),
      impressions: sumMetric('impressions'),
      totalInteractions: sumMetric('total_interactions'),
      accountsEngaged: sumMetric('accounts_engaged'),
      followerCount: lastValue('follower_count'),
      periodDays,
    }
  } catch {
    // Fallback if insights permission is not granted
    return {
      reach: 0,
      impressions: 0,
      totalInteractions: 0,
      accountsEngaged: 0,
      followerCount: 0,
      periodDays,
    }
  }
}

/**
 * Fetch recent media and per-post performance metrics.
 * Uses v25.0 Instagram Graph API.
 * Falls back gracefully if insights are not available.
 */
export async function fetchRecentMedia(
  accessToken: string,
  businessAccountId: string,
  limit = 25
): Promise<InstagramMediaItem[]> {
  const fields = [
    'id', 'timestamp', 'media_type', 'caption',
    'permalink', 'like_count', 'comments_count'
  ].join(',')

  let mediaList: Array<{
    id: string
    timestamp: string
    media_type?: string
    caption?: string
    permalink?: string
    like_count: number
    comments_count: number
  }> = []

  try {
    const res = await apiFetch<{
      data: typeof mediaList
    }>(`${GRAPH_BASE}/${businessAccountId}/media?fields=${fields}&access_token=${accessToken}&limit=${limit}`)
    mediaList = res.data || []
  } catch {
    return []
  }

  // For each media item try to get reach via insights endpoint
  const results = await Promise.allSettled(
    mediaList.map(async (media): Promise<InstagramMediaItem> => {
      let reach = 0
      let impressions = 0
      let engagement = 0

      try {
        // Instagram Login for Business supports reach metric on image posts
        // For VIDEO/REEL posts the metric may differ
        const insightRes = await fetch(
          `${GRAPH_BASE}/${media.id}/insights?metric=reach&access_token=${accessToken}`
        )
        if (insightRes.ok) {
          const insightData = await insightRes.json() as {
            data: Array<{ name: string; values: Array<{ value: number }> }>
          }
          const getValue = (name: string) =>
            insightData.data.find(d => d.name === name)?.values[0]?.value ?? 0
          reach = getValue('reach')
          impressions = getValue('impressions')
          engagement = getValue('engagement')
        }
      } catch {
        // No insights permission — use engagement proxy
      }

      // Fallback engagement: likes + comments
      if (engagement === 0) {
        engagement = (media.like_count || 0) + (media.comments_count || 0)
      }

      return {
        id: media.id,
        timestamp: media.timestamp,
        mediaType: media.media_type || 'IMAGE',
        caption: media.caption,
        permalink: media.permalink,
        likeCount: media.like_count || 0,
        commentsCount: media.comments_count || 0,
        reach,
        impressions,
        engagement,
      }
    })
  )

  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<InstagramMediaItem>).value)
}

/**
 * Main entry point: fetch all Instagram insights in one call.
 * Returns account info, aggregated account insights, and recent media performance.
 */
export async function fetchInstagramInsights(
  accessToken: string,
  businessAccountId: string,
  options?: { periodDays?: number; mediaLimit?: number }
): Promise<InstagramInsightsResult> {
  const periodDays = options?.periodDays ?? 30
  const mediaLimit = options?.mediaLimit ?? 25

  const [account, insights, recentMedia] = await Promise.all([
    fetchAccountInfo(accessToken, businessAccountId),
    fetchAccountInsights(accessToken, businessAccountId, periodDays),
    fetchRecentMedia(accessToken, businessAccountId, mediaLimit),
  ])

  return {
    account,
    insights,
    recentMedia,
    fetchedAt: new Date().toISOString(),
  }
}
