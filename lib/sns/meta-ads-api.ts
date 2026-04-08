/**
 * Meta Marketing API — 광고 성과 데이터 수집
 * Meta Business Login 모드에서만 작동 (ads_read 권한 필요)
 */

const API_VERSION = 'v25.0'
const BASE = `https://graph.facebook.com/${API_VERSION}`

export type AdAccountInfo = {
  id: string
  name: string
  currency: string
  timezone_name: string
}

export type AdCampaignInsight = {
  campaign_id: string
  campaign_name: string
  objective: string
  status: string
  spend: number
  impressions: number
  reach: number
  clicks: number
  cpc: number
  cpm: number
  ctr: number
  conversions: number
  cost_per_result: number
  date_start: string
  date_stop: string
}

export type AdCreativeInsight = {
  ad_id: string
  ad_name: string
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number
  thumbnail_url?: string
}

/**
 * 광고 계정 목록 가져오기
 */
export async function fetchAdAccounts(accessToken: string): Promise<AdAccountInfo[]> {
  try {
    const res = await fetch(
      `${BASE}/me/adaccounts?fields=id,name,currency,timezone_name&access_token=${accessToken}`
    )
    if (!res.ok) return []
    const data = await res.json() as { data?: Array<Record<string, string>> }
    return (data.data || []).map(acc => ({
      id: acc.id || '',
      name: acc.name || '',
      currency: acc.currency || 'KRW',
      timezone_name: acc.timezone_name || 'Asia/Seoul',
    }))
  } catch {
    return []
  }
}

/**
 * 캠페인별 성과 (최근 N일)
 */
export async function fetchCampaignInsights(
  accessToken: string,
  adAccountId: string,
  days = 30,
): Promise<AdCampaignInsight[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]
  const untilStr = new Date().toISOString().split('T')[0]

  try {
    const res = await fetch(
      `${BASE}/${adAccountId}/insights?fields=campaign_id,campaign_name,objective,spend,impressions,reach,clicks,cpc,cpm,ctr,conversions,cost_per_result&time_range={"since":"${sinceStr}","until":"${untilStr}"}&level=campaign&limit=50&access_token=${accessToken}`
    )
    if (!res.ok) return []
    const data = await res.json() as { data?: Array<Record<string, any>> }
    return (data.data || []).map(row => ({
      campaign_id: row.campaign_id || '',
      campaign_name: row.campaign_name || '',
      objective: row.objective || '',
      status: 'ACTIVE',
      spend: parseFloat(row.spend || '0'),
      impressions: parseInt(row.impressions || '0'),
      reach: parseInt(row.reach || '0'),
      clicks: parseInt(row.clicks || '0'),
      cpc: parseFloat(row.cpc || '0'),
      cpm: parseFloat(row.cpm || '0'),
      ctr: parseFloat(row.ctr || '0'),
      conversions: parseInt(row.conversions || '0'),
      cost_per_result: parseFloat(row.cost_per_result || '0'),
      date_start: row.date_start || sinceStr,
      date_stop: row.date_stop || untilStr,
    }))
  } catch {
    return []
  }
}

/**
 * 일별 광고 지출 추세
 */
export async function fetchDailyAdSpend(
  accessToken: string,
  adAccountId: string,
  days = 30,
): Promise<Array<{ date: string; spend: number; impressions: number; reach: number; clicks: number }>> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]
  const untilStr = new Date().toISOString().split('T')[0]

  try {
    const res = await fetch(
      `${BASE}/${adAccountId}/insights?fields=spend,impressions,reach,clicks&time_range={"since":"${sinceStr}","until":"${untilStr}"}&time_increment=1&limit=90&access_token=${accessToken}`
    )
    if (!res.ok) return []
    const data = await res.json() as { data?: Array<Record<string, any>> }
    return (data.data || []).map(row => ({
      date: row.date_start || '',
      spend: parseFloat(row.spend || '0'),
      impressions: parseInt(row.impressions || '0'),
      reach: parseInt(row.reach || '0'),
      clicks: parseInt(row.clicks || '0'),
    }))
  } catch {
    return []
  }
}

/**
 * 오디언스 인구통계 (Meta Business 모드에서만)
 */
export async function fetchAudienceDemographics(
  accessToken: string,
  igAccountId: string,
): Promise<{
  age_gender: Array<{ age: string; gender: string; value: number }>
  countries: Array<{ country: string; value: number }>
  cities: Array<{ city: string; value: number }>
}> {
  const result = { age_gender: [] as any[], countries: [] as any[], cities: [] as any[] }

  try {
    const res = await fetch(
      `${BASE}/${igAccountId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&access_token=${accessToken}`
    )
    if (!res.ok) return result
    const data = await res.json() as { data?: Array<{ name: string; total_value?: { breakdowns?: Array<{ results: Array<{ dimension_values: string[]; value: number }> }> } }> }

    for (const metric of data.data || []) {
      const breakdowns = metric.total_value?.breakdowns || []
      for (const breakdown of breakdowns) {
        for (const item of breakdown.results || []) {
          const dims = item.dimension_values || []
          if (dims.length === 2 && dims[0].match(/^\d/)) {
            // age_gender: ["18-24", "M"]
            result.age_gender.push({ age: dims[0], gender: dims[1], value: item.value })
          } else if (dims.length === 1 && dims[0].length === 2) {
            // country code
            result.countries.push({ country: dims[0], value: item.value })
          } else if (dims.length === 1) {
            // city
            result.cities.push({ city: dims[0], value: item.value })
          }
        }
      }
    }

    result.countries.sort((a, b) => b.value - a.value)
    result.cities.sort((a, b) => b.value - a.value)
  } catch {
    // ignore
  }

  return result
}
