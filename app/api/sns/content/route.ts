import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const personaId = searchParams.get('personaId')
  const drafts = await prisma.snsContentDraft.findMany({
    where: personaId ? { personaId } : {},
    orderBy: { createdAt: 'desc' },
    include: { persona: { select: { name: true, tone: true, keywords: true } } },
  })
  return NextResponse.json(drafts)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { personaId, type = 'TEXT', planningMode = 'CREATIVE', prompt, slideCount = 5 } = body

    if (!prompt?.trim()) {
      return NextResponse.json({ error: '프롬프트를 입력하세요.' }, { status: 400 })
    }

    // 페르소나 컨텍스트 로드
    let systemContext = '당신은 SNS 콘텐츠 전문가입니다.'
    if (personaId) {
      const persona = await prisma.snsPersona.findUnique({ where: { id: personaId } })
      if (persona) {
        const keywords = (() => { try { return JSON.parse(persona.keywords) as string[] } catch { return [] } })()
        systemContext = `당신은 ${persona.brandConcept || ''} 브랜드의 SNS 담당자입니다.
타겟: ${persona.targetAudience || ''}
글쓰기 스타일: ${persona.writingStyle || ''}
톤: ${persona.tone || ''}
자주 쓰는 표현: ${keywords.join(', ')}`
      }
    }

    let content = ''
    let slides = null

    if (type === 'TEXT') {
      content = await runLLM(
        systemContext + '\n\nInstagram 포스팅을 작성하세요. 해시태그 포함.',
        prompt
      )
    } else if (type === 'CAROUSEL') {
      const slidePlan = await runLLM(
        systemContext + `\n\n아래 주제로 ${slideCount}장짜리 카드뉴스 기획안을 JSON 배열로만 응답하세요:
[{"title":"슬라이드 제목","body":"본문 내용","imagePrompt":"이미지 생성 프롬프트 (영문)"}]`,
        prompt
      )
      const jsonMatch = slidePlan.match(/\[[\s\S]*\]/)
      slides = jsonMatch ? jsonMatch[0] : '[]'
    }

    const draft = await prisma.snsContentDraft.create({
      data: {
        personaId: personaId || null,
        type,
        planningMode,
        title: prompt.slice(0, 60),
        content: content || null,
        slides: slides || null,
        platform: 'INSTAGRAM',
      },
    })

    return NextResponse.json(draft, { status: 201 })
  } catch {
    return NextResponse.json({ error: '콘텐츠 생성 실패' }, { status: 500 })
  }
}
