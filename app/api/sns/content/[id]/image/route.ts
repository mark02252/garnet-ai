import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateSlideImage } from '@/lib/sns/image-generator'

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const body = await req.json()
    const { slideIndex, imagePrompt, referenceImageUrls = [] } = body

    if (!imagePrompt?.trim()) {
      return NextResponse.json({ error: 'imagePrompt 필수' }, { status: 400 })
    }

    const { url } = await generateSlideImage(imagePrompt, referenceImageUrls)

    // slides JSON에서 해당 슬라이드 imageUrl 업데이트
    if (slideIndex !== undefined) {
      const draft = await prisma.snsContentDraft.findUnique({ where: { id } })
      if (draft?.slides) {
        const slides = JSON.parse(draft.slides) as Array<Record<string, unknown>>
        if (slides[slideIndex]) {
          slides[slideIndex].imageUrl = url
          await prisma.snsContentDraft.update({
            where: { id },
            data: { slides: JSON.stringify(slides) },
          })
        }
      }
    }

    return NextResponse.json({ url })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '이미지 생성 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
