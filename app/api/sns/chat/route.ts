import { NextRequest, NextResponse } from 'next/server'
import { runLLM } from '@/lib/llm'

export async function POST(req: NextRequest) {
  try {
    const { systemPrompt, userMessage } = await req.json()
    if (!userMessage?.trim()) {
      return NextResponse.json({ error: 'userMessage 필수' }, { status: 400 })
    }
    const content = await runLLM(
      systemPrompt || '당신은 SNS 마케팅 전문가입니다.',
      userMessage
    )
    return NextResponse.json({ content })
  } catch {
    return NextResponse.json({ error: 'LLM 호출 실패' }, { status: 500 })
  }
}
