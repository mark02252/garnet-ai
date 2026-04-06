import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(['marketing', 'tech']),
  status: z.enum(['adopted', 'assessing', 'hold']).default('assessing'),
  description: z.string().max(1000).optional(),
  url: z.string().url().optional().or(z.literal('')),
  source: z.enum(['github', 'intel', 'manual']).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
})

function parseTags(raw: string): string[] {
  try { return JSON.parse(raw) } catch { return [] }
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim()
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || ''
  const category = searchParams.get('category')?.trim() || ''
  const status = searchParams.get('status')?.trim() || ''
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'))

  const where: Record<string, unknown> = {}
  if (category === 'marketing' || category === 'tech') where.category = category
  if (status === 'adopted' || status === 'assessing' || status === 'hold') where.status = status
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ]
  }

  const items = await prisma.techRadarItem.findMany({
    where,
    orderBy: { addedAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({
    items: items.map((item) => ({ ...item, tags: parseTags(item.tags) })),
    count: items.length,
  })
}

export async function POST(req: Request) {
  try {
    const body = createSchema.parse(await req.json())
    const normalizedName = normalizeName(body.name)

    const existing = await prisma.techRadarItem.findUnique({ where: { name: normalizedName } })
    if (existing) {
      await prisma.techRadarItem.update({
        where: { name: normalizedName },
        data: { updatedAt: new Date() },
      })
      return NextResponse.json({ ...existing, tags: parseTags(existing.tags), duplicate: true })
    }

    const item = await prisma.techRadarItem.create({
      data: {
        name: normalizedName,
        category: body.category,
        status: body.status,
        description: body.description || null,
        url: body.url || null,
        source: body.source || null,
        tags: JSON.stringify(body.tags),
      },
    })
    return NextResponse.json({ ...item, tags: parseTags(item.tags) }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '저장에 실패했습니다.' },
      { status: 400 }
    )
  }
}
