import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const { scheduledAt } = await req.json()
    const updated = await prisma.snsScheduledPost.update({
      where: { id },
      data: { scheduledAt: new Date(scheduledAt) },
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const post = await prisma.snsScheduledPost.delete({ where: { id } })
  await prisma.snsContentDraft.update({
    where: { id: post.draftId },
    data: { status: 'DRAFT' },
  })
  return NextResponse.json({ ok: true })
}
