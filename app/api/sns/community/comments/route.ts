import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mediaId = searchParams.get('mediaId')

  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
  if (!accessToken) {
    return NextResponse.json({ error: 'Instagram 연동 필요' }, { status: 400 })
  }
  if (!mediaId) {
    return NextResponse.json({ error: 'mediaId 필수' }, { status: 400 })
  }

  const res = await fetch(
    `https://graph.instagram.com/v19.0/${mediaId}/comments?fields=id,text,username,timestamp&access_token=${accessToken}`
  )
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
  const data = await res.json()
  return NextResponse.json(data)
}
