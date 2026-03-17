// lib/sns/instagram-api.ts
export type InstagramMediaInsight = {
  id: string
  timestamp: string
  impressions: number
  reach: number
  engagement: number
  like_count: number
  comments_count: number
}

export async function fetchInstagramMediaInsights(
  accessToken: string,
  businessAccountId: string
): Promise<InstagramMediaInsight[]> {
  const mediaRes = await fetch(
    `https://graph.instagram.com/v19.0/${businessAccountId}/media?fields=id,timestamp,like_count,comments_count&access_token=${accessToken}&limit=25`
  )
  if (!mediaRes.ok) throw new Error(`Instagram API 오류: ${await mediaRes.text()}`)
  const { data: mediaList } = await mediaRes.json() as { data: Array<{ id: string; timestamp: string; like_count: number; comments_count: number }> }

  const insights = await Promise.allSettled(
    mediaList.map(async (media) => {
      const insightRes = await fetch(
        `https://graph.instagram.com/v19.0/${media.id}/insights?metric=impressions,reach,engagement&access_token=${accessToken}`
      )
      if (!insightRes.ok) return null
      const { data } = await insightRes.json() as { data: Array<{ name: string; values: Array<{ value: number }> }> }
      const getValue = (name: string) => data.find(d => d.name === name)?.values[0]?.value ?? 0
      return {
        id: media.id,
        timestamp: media.timestamp,
        impressions: getValue('impressions'),
        reach: getValue('reach'),
        engagement: getValue('engagement'),
        like_count: media.like_count,
        comments_count: media.comments_count,
      } satisfies InstagramMediaInsight
    })
  )

  return insights
    .filter((r): r is PromiseFulfilledResult<InstagramMediaInsight | null> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value as InstagramMediaInsight)
}

export async function fetchInstagramFollowerCount(
  accessToken: string,
  businessAccountId: string
): Promise<number> {
  const res = await fetch(
    `https://graph.instagram.com/v19.0/${businessAccountId}?fields=followers_count&access_token=${accessToken}`
  )
  if (!res.ok) return 0
  const data = await res.json() as { followers_count?: number }
  return data.followers_count ?? 0
}
