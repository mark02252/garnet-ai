import { NextRequest, NextResponse } from 'next/server'
import { runLLM } from '@/lib/llm'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { systemPrompt, userMessage } = body
    if (!userMessage?.trim()) {
      return NextResponse.json({ error: 'userMessage 필수' }, { status: 400 })
    }
    if (typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      return NextResponse.json({ error: '유효한 메시지를 입력하세요.' }, { status: 400 })
    }
    const content = await runLLM(
      systemPrompt || '당신은 SNS 마케팅 전문가입니다.',
      userMessage
    )
    return NextResponse.json({ content })
  } catch (error) {
    console.error('POST /api/sns/chat error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'LLM 호출 실패' }, { status: 500 })
  }
}
