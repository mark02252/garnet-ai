import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  title: z.string().min(1).max(300),
  content: z.string().max(5000).optional(),
  url: z.string().url().optional().or(z.literal('')),
  type: z.enum(['external', 'internal']),
  tags: z.array(z.string().max(50)).max(20).default([]),
  source: z.string().max(200).optional(),
  savedAt: z.string().datetime().optional(),
})

function parseTags(raw: string): string[] {
  try { return JSON.parse(raw) } catch { return [] }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || ''
  const type = searchParams.get('type')?.trim() || ''
  const tags = searchParams.get('tags')?.trim() || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.min(50, parseInt(searchParams.get('limit') || '20'))

  const where: Record<string, unknown> = {}
  if (type === 'external' || type === 'internal') where.type = type
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { content: { contains: q, mode: 'insensitive' } },
      { source: { contains: q, mode: 'insensitive' } },
      { tags: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.researchMemory.findMany({
      where,
      orderBy: { savedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.researchMemory.count({ where }),
  ])

  const parsed = items.map((item) => ({
    ...item,
    tags: parseTags(item.tags),
    savedAt: item.savedAt.toISOString(),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }))

  const tagFilter = tags ? tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) : []
  const filtered = tagFilter.length > 0
    ? parsed.filter((item) => tagFilter.every((t) => item.tags.some((tag) => tag.toLowerCase().includes(t))))
    : parsed

  return NextResponse.json({ items: filtered, total, page, limit })
}

export async function POST(req: Request) {
  try {
    const body = createSchema.parse(await req.json())
    const item = await prisma.researchMemory.create({
      data: {
        title: body.title,
        content: body.content || null,
        url: body.url || null,
        type: body.type,
        tags: JSON.stringify(body.tags),
        source: body.source || null,
        savedAt: body.savedAt ? new Date(body.savedAt) : new Date(),
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
