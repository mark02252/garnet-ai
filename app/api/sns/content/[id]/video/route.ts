import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { renderSlidesToVideo } from '@/lib/sns/video-renderer'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await req.json().catch(() => ({}))
    const durationPerSlide = body.durationPerSlide || 4
    const width = body.width || 1080
    const height = body.height || 1920
    const bgmUrl: string | undefined = body.bgmUrl || undefined
    const transition: 'none' | 'fade' = body.transition === 'fade' ? 'fade' : 'none'

    const draft = await prisma.snsContentDraft.findUnique({ where: { id } })
    if (!draft?.slides) {
      return NextResponse.json({ error: '슬라이드가 없습니다.' }, { status: 400 })
    }

    const slides = JSON.parse(draft.slides) as Array<{ imageUrl?: string; title: string; body: string }>
    const validSlides = slides.filter(s => s.imageUrl)
    if (validSlides.length === 0) {
      return NextResponse.json({ error: '이미지가 있는 슬라이드가 필요합니다. 먼저 이미지를 생성하세요.' }, { status: 400 })
    }

    const result = await renderSlidesToVideo({
      slides: validSlides.map(s => ({ imageUrl: s.imageUrl!, title: s.title || '', body: s.body || '' })),
      durationPerSlide,
      width,
      height,
      bgmUrl,
      transition,
    })

    // Save video URL to draft
    await prisma.snsContentDraft.update({
      where: { id },
      data: { videoUrl: result.videoUrl },
    })

    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '영상 렌더링 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
