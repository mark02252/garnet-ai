import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  status: z.enum(['adopted', 'assessing', 'hold']).optional(),
  category: z.enum(['marketing', 'tech']).optional(),
  description: z.string().max(1000).optional().nullable(),
  url: z.string().url().optional().nullable().or(z.literal('')),
  tags: z.array(z.string().max(50)).max(20).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: '수정할 필드가 없습니다.' })

function parseTags(raw: string): string[] {
  try { return JSON.parse(raw) } catch { return [] }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = patchSchema.parse(await req.json())
    const data: Record<string, unknown> = { ...body }
    if (body.tags !== undefined) data.tags = JSON.stringify(body.tags)

    const item = await prisma.techRadarItem.update({ where: { id }, data })
    return NextResponse.json({ ...item, tags: parseTags(item.tags) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '수정에 실패했습니다.' },
      { status: 400 }
    )
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.techRadarItem.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '삭제에 실패했습니다.' },
      { status: 400 }
    )
  }
}
