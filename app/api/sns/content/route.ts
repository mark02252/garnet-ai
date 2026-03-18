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
        systemContext + `\n\nInstagram 포스팅을 작성하세요.

규칙:
- 주제에 대한 구체적인 정보, 근거, 사례를 포함하세요
- 단순 훅이 아니라 읽을거리가 있는 본문을 작성하세요 (최소 5~10문장)
- 이모지를 적절히 활용하세요
- 마지막에 관련 해시태그 5~10개 포함
- 첫 줄은 주목을 끄는 훅으로 시작`,
        prompt
      )
    } else if (type === 'CAROUSEL') {
      const slidePlan = await runLLM(
        systemContext + `\n\n아래 주제로 ${slideCount}장짜리 Instagram 카드뉴스를 작성하세요.

규칙:
- 슬라이드 1: 주목을 끄는 제목 + 핵심 질문/훅
- 슬라이드 2~${slideCount - 1}: 각 슬라이드마다 구체적인 정보, 근거, 사례를 포함한 본문 (3~5문장)
- 마지막 슬라이드: CTA (행동 유도) + 해시태그
- body는 각 슬라이드의 핵심 내용을 충분히 설명하세요. 짧은 한 줄이 아니라 읽을거리가 있어야 합니다.
- 이모지를 적절히 활용하세요.

JSON 배열로만 응답하세요:
[{"title":"슬라이드 제목","body":"본문 내용 (3~5문장, 구체적 정보 포함)","imagePrompt":"이미지 생성 프롬프트 (영문, 구체적 장면 묘사)"}]`,
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
