import { NextResponse } from 'next/server'

export async function POST() {
  // Server-side logout is primarily handled by the client
  // This endpoint exists for completeness and any server-side cleanup
  return NextResponse.json({ ok: true, message: '로그아웃되었습니다.' })
}
