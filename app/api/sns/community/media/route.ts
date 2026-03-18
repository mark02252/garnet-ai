import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const accessToken = searchParams.get('accessToken') || process.env.INSTAGRAM_ACCESS_TOKEN || ''
  const businessAccountId = searchParams.get('businessAccountId') || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || ''

  if (!accessToken || !businessAccountId) {
    return NextResponse.json(
      { error: 'Instagram 연동 설정이 필요합니다. (accessToken, businessAccountId)' },
      { status: 400 }
    )
  }

  try {
    const res = await fetch(
      `https://graph.instagram.com/v19.0/${businessAccountId}/media?fields=id,timestamp,caption,media_type,comments_count&access_token=${accessToken}&limit=20`
    )
    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '미디어 목록 조회 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
