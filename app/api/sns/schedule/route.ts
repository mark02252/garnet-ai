import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const year = Number(searchParams.get('year') || new Date().getFullYear())
    const month = Number(searchParams.get('month') || new Date().getMonth() + 1)

    const from = new Date(year, month - 1, 1)
    const to   = new Date(year, month, 1)

    const scheduled = await prisma.snsScheduledPost.findMany({
      where: { scheduledAt: { gte: from, lt: to } },
      include: {
        draft: { select: { type: true, title: true, content: true } },
        persona: { select: { name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    })
    return NextResponse.json(scheduled)
  } catch (error) {
    console.error('GET /api/sns/schedule error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : '예약 목록 조회 실패' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { draftId, personaId, scheduledAt } = body

    if (!draftId || !scheduledAt) {
      return NextResponse.json({ error: 'draftId와 scheduledAt은 필수입니다.' }, { status: 400 })
    }

    // idempotency guard
    const existing = await prisma.snsScheduledPost.findUnique({ where: { draftId } })
    if (existing && existing.status === 'PENDING') {
      return NextResponse.json({ error: '이미 예약된 초안입니다.' }, { status: 409 })
    }

    const scheduled = await prisma.snsScheduledPost.upsert({
      where: { draftId },
      create: {
        draftId,
        personaId,
        scheduledAt: new Date(scheduledAt),
        platform: 'INSTAGRAM',
      },
      update: {
        scheduledAt: new Date(scheduledAt),
        status: 'PENDING',
        errorMsg: null,
      },
    })

    await prisma.snsContentDraft.update({
      where: { id: draftId },
      data: { status: 'SCHEDULED' },
    })

    return NextResponse.json(scheduled, { status: 201 })
  } catch {
    return NextResponse.json({ error: '예약 생성 실패' }, { status: 500 })
  }
}
