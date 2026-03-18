import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    accessToken?: string
  }

  if (!body.accessToken) {
    return NextResponse.json({ error: 'accessToken이 필요합니다.' }, { status: 400 })
  }

  try {
    const url = new URL('https://graph.instagram.com/refresh_access_token')
    url.searchParams.set('grant_type', 'ig_refresh_token')
    url.searchParams.set('access_token', body.accessToken)

    const res = await fetch(url.toString())
    const data = await res.json() as {
      access_token?: string
      token_type?: string
      expires_in?: number
      error?: { message: string }
    }

    if (!res.ok || !data.access_token) {
      return NextResponse.json({
        error: data.error?.message || '토큰 갱신 실패',
      }, { status: 400 })
    }

    return NextResponse.json({
      accessToken: data.access_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '토큰 갱신 중 오류',
    }, { status: 500 })
  }
}
