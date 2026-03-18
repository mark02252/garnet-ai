import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { personaId, url, referenceText, outputType = 'TEXT', prompt, slideCount = 5 } = body

  // 1. Extract content from URL (if provided)
  let extractedContent = referenceText || ''
  if (url?.trim()) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      const html = await res.text()
      // Simple extraction: get text content, strip HTML tags
      const textContent = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3000)
      extractedContent = textContent
    } catch {
      if (!referenceText) {
        return NextResponse.json({ error: 'URL에서 콘텐츠를 가져올 수 없습니다.' }, { status: 400 })
      }
    }
  }

  if (!extractedContent.trim()) {
    return NextResponse.json({ error: '참고할 콘텐츠를 입력하세요.' }, { status: 400 })
  }

  // 2. Load persona context
  let personaContext = '당신은 SNS 콘텐츠 전문가입니다.'
  if (personaId) {
    const persona = await prisma.snsPersona.findUnique({ where: { id: personaId } })
    if (persona) {
      const keywords = (() => { try { return JSON.parse(persona.keywords) as string[] } catch { return [] } })()
      personaContext = `당신은 ${persona.brandConcept || ''} 브랜드의 SNS 담당자입니다.
타겟: ${persona.targetAudience || ''}
글쓰기 스타일: ${persona.writingStyle || ''}
톤: ${persona.tone || ''}
자주 쓰는 표현: ${keywords.join(', ')}`
    }
  }

  // 3. Generate content based on reference
  const transformPrompt = prompt?.trim() || '우리 브랜드 스타일로 변형해주세요'

  let content = ''
  let slides = null

  if (outputType === 'TEXT') {
    content = await runLLM(
      personaContext + `\n\n아래 참고 콘텐츠를 분석하고, 요청에 맞게 Instagram 게시물을 작성하세요.

규칙:
- 참고 콘텐츠의 구조, 톤, 매력 포인트를 분석하세요
- 그 스타일을 우리 브랜드에 맞게 변형하세요
- 단순 복사가 아니라 창의적 변형이어야 합니다
- 5~10문장 이상의 풍부한 본문
- 이모지 활용
- 해시태그 5~10개

참고 콘텐츠:
${extractedContent.slice(0, 2000)}

변형 요청: ${transformPrompt}`,
      transformPrompt
    )
  } else {
    const slidePlan = await runLLM(
      personaContext + `\n\n아래 참고 콘텐츠를 분석하고, ${slideCount}장짜리 카드뉴스로 변형하세요.

규칙:
- 참고 콘텐츠의 핵심 메시지와 구조를 파악하세요
- 우리 브랜드 톤에 맞게 재구성하세요
- 각 슬라이드 body는 3~5문장
- 마지막 슬라이드에 CTA + 해시태그

참고 콘텐츠:
${extractedContent.slice(0, 2000)}

변형 요청: ${transformPrompt}

JSON 배열로만 응답하세요:
[{"title":"슬라이드 제목","body":"본문 3~5문장","imagePrompt":"영문 이미지 프롬프트"}]`,
      transformPrompt
    )
    const jsonMatch = slidePlan.match(/\[[\s\S]*\]/)
    slides = jsonMatch ? jsonMatch[0] : null
    if (!slides || slides === '[]') {
      const retry = await runLLM(
        'JSON 배열만 출력하세요. [{"title":"","body":"","imagePrompt":""}]',
        `${slideCount}장 카드뉴스, 주제: ${transformPrompt}, 참고: ${extractedContent.slice(0, 500)}`
      )
      const retryMatch = retry.match(/\[[\s\S]*\]/)
      slides = retryMatch ? retryMatch[0] : '[]'
    }
  }

  // 4. Save draft
  const draft = await prisma.snsContentDraft.create({
    data: {
      personaId: personaId || null,
      type: outputType === 'TEXT' ? 'TEXT' : 'CAROUSEL',
      planningMode: 'CREATIVE',
      title: `[참고] ${transformPrompt}`.slice(0, 60),
      content: content || null,
      slides: slides || null,
      platform: 'INSTAGRAM',
    },
  })

  return NextResponse.json(draft, { status: 201 })
}
