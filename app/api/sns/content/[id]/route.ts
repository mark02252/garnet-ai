import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const draft = await prisma.snsContentDraft.findUnique({
    where: { id },
    include: { persona: true },
  })
  if (!draft) return NextResponse.json({ error: '없음' }, { status: 404 })
  return NextResponse.json(draft)
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const body = await req.json()
    const draft = await prisma.snsContentDraft.update({
      where: { id },
      data: {
        ...(body.content !== undefined && { content: body.content }),
        ...(body.slides !== undefined && { slides: typeof body.slides === 'string' ? body.slides : JSON.stringify(body.slides) }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.title !== undefined && { title: body.title }),
      },
    })
    return NextResponse.json(draft)
  } catch {
    return NextResponse.json({ error: '업데이트 실패' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  await prisma.snsContentDraft.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
