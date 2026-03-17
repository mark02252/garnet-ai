import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'

export async function POST(req: NextRequest) {
  try {
    const { personaId, comments } = await req.json()

    if (!personaId || !comments?.length) {
      return NextResponse.json({ error: 'personaId와 comments 필수' }, { status: 400 })
    }

    const persona = await prisma.snsPersona.findUnique({ where: { id: personaId } })
    if (!persona) return NextResponse.json({ error: '페르소나 없음' }, { status: 404 })

    const keywords = (() => { try { return JSON.parse(persona.keywords) as string[] } catch { return [] } })()

    const replies = await Promise.allSettled(
      comments.map(async (comment: { id: string; text: string; username: string }) => {
        const reply = await runLLM(
          `당신은 ${persona.brandConcept || ''} 브랜드의 SNS 담당자입니다.
글쓰기 스타일: ${persona.writingStyle || ''}
톤: ${persona.tone || ''}
자주 쓰는 표현: ${keywords.join(', ')}
댓글에 짧고 자연스럽게 답변하세요. 1-2문장으로.`,
          `@${comment.username}: ${comment.text}`
        )
        return { commentId: comment.id, username: comment.username, originalText: comment.text, reply }
      })
    )

    const results = replies
      .filter((r): r is PromiseFulfilledResult<{ commentId: string; username: string; originalText: string; reply: string }> => r.status === 'fulfilled')
      .map(r => r.value)

    return NextResponse.json(results)
  } catch {
    return NextResponse.json({ error: '답변 생성 실패' }, { status: 500 })
  }
}
