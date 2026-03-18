import { NextRequest, NextResponse } from 'next/server'
import { saveMetaConnectionToFile } from '@/lib/meta-connection-file-store'

// 클라이언트에서 연결 정보 저장 시 파일 백업도 동시에 생성
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    await saveMetaConnectionToFile({
      appId: body.appId || '',
      appSecret: body.appSecret || '',
      accessToken: body.accessToken || '',
      instagramBusinessAccountId: body.instagramBusinessAccountId || '',
      loginMode: body.loginMode || '',
      tokenSource: body.tokenSource || '',
      tokenExpiresIn: body.tokenExpiresIn ?? null,
      lastConnectedAt: body.lastConnectedAt || '',
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
