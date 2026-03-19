import { NextRequest, NextResponse } from 'next/server'
import { loadMetaConnectionFromFile } from '@/lib/meta-connection-file-store'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mediaId = searchParams.get('mediaId')
  let accessToken = searchParams.get('accessToken') || process.env.INSTAGRAM_ACCESS_TOKEN || ''
  if (!accessToken) {
    const fileData = await loadMetaConnectionFromFile()
    if (fileData) accessToken = fileData.accessToken
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'accessToken이 필요합니다. 설정 페이지에서 Instagram을 연동하세요.' }, { status: 400 })
  }
  if (!mediaId) {
    return NextResponse.json({ error: 'mediaId 필수' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://graph.instagram.com/v25.0/${mediaId}/comments?fields=id,text,username,timestamp,like_count&access_token=${accessToken}`
    )
    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({ error: errText, data: [] }, { status: 200 })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '댓글 조회 실패', data: [] }, { status: 200 })
  }
}
