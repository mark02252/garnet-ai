import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const personas = await prisma.snsPersona.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { contentDrafts: true } } },
  })
  return NextResponse.json(personas)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, platform, learnMode, instagramHandle } = body

    if (!name?.trim() || !learnMode) {
      return NextResponse.json({ error: '이름과 학습 모드는 필수입니다.' }, { status: 400 })
    }

    const persona = await prisma.snsPersona.create({
      data: {
        name: name.trim(),
        platform: platform || 'INSTAGRAM',
        learnMode,
        instagramHandle: instagramHandle?.trim() || null,
      },
    })
    return NextResponse.json(persona, { status: 201 })
  } catch {
    return NextResponse.json({ error: '페르소나 생성에 실패했습니다.' }, { status: 500 })
  }
}
