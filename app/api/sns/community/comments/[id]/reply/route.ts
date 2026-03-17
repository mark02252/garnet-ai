import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const { text } = await req.json()
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN

    if (!accessToken) return NextResponse.json({ error: 'Instagram 연동 필요' }, { status: 400 })
    if (!text?.trim()) return NextResponse.json({ error: '답변 텍스트 필수' }, { status: 400 })

    const res = await fetch(
      `https://graph.instagram.com/v19.0/${id}/replies`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, access_token: accessToken }),
      }
    )

    if (!res.ok) {
      const err = await res.json()
      return NextResponse.json({ error: err.error?.message || '발행 실패' }, { status: 500 })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: '답변 발행 실패' }, { status: 500 })
  }
}
