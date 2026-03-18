import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchInstagramMediaInsights, fetchInstagramFollowerCount } from '@/lib/sns/instagram-api'
import { loadMetaConnectionFromFile } from '@/lib/meta-connection-file-store'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const personaId = body.personaId
    if (!personaId) return NextResponse.json({ error: 'personaId 필수' }, { status: 400 })

    const persona = await prisma.snsPersona.findUnique({ where: { id: personaId } })
    if (!persona) return NextResponse.json({ error: '페르소나 없음' }, { status: 404 })

    // body → 파일 백업 → 환경변수 순서로 폴백
    let accessToken = body.accessToken || ''
    let businessAccountId = body.businessAccountId || ''
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
      return NextResponse.json({ error: 'Instagram 연동 설정이 필요합니다. accessToken과 businessAccountId를 전달하거나 환경변수를 설정하세요.' }, { status: 400 })
    }

    // 팔로워 수 가져오기
    const followers = await fetchInstagramFollowerCount(accessToken, businessAccountId)

    // 미디어 인사이트 가져오기 (insights 권한 없으면 기본 데이터로 폴백)
    let insights: Awaited<ReturnType<typeof fetchInstagramMediaInsights>> = []
    try {
      insights = await fetchInstagramMediaInsights(accessToken, businessAccountId)
    } catch {
      // insights 권한 없을 때: 기본 미디어 데이터(like/comments)로 폴백
      try {
        const mediaRes = await fetch(
          `https://graph.instagram.com/v19.0/${businessAccountId}/media?fields=id,timestamp,like_count,comments_count,media_type,caption&access_token=${accessToken}&limit=25`
        )
        if (mediaRes.ok) {
          const { data } = await mediaRes.json() as { data: Array<{ id: string; timestamp: string; like_count: number; comments_count: number; media_type?: string; caption?: string }> }
          insights = (data || []).map(m => ({
            id: m.id,
            timestamp: m.timestamp,
            impressions: 0,
            reach: 0,
            engagement: m.like_count + m.comments_count,
            like_count: m.like_count,
            comments_count: m.comments_count,
            media_type: m.media_type,
            caption: m.caption,
          }))
        }
      } catch { /* ignore */ }
    }

    const byDate = new Map<string, { reach: number; impressions: number; engagement: number; postCount: number }>()
    for (const insight of insights) {
      const dateKey = insight.timestamp.split('T')[0]
      const existing = byDate.get(dateKey) || { reach: 0, impressions: 0, engagement: 0, postCount: 0 }
      byDate.set(dateKey, {
        reach: existing.reach + insight.reach,
        impressions: existing.impressions + insight.impressions,
        engagement: existing.engagement + insight.engagement,
        postCount: existing.postCount + 1,
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

    return NextResponse.json({ synced: upserts.filter(r => r.status === 'fulfilled').length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '동기화 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
