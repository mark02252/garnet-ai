import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get('category')
  const templates = await prisma.snsContentTemplate.findMany({
    where: { isActive: true, ...(category ? { category } : {}) },
    orderBy: { usageCount: 'desc' },
  })
  return NextResponse.json(templates)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // Handle usage count increment
  if (body._action === 'increment' && body.id) {
    const updated = await prisma.snsContentTemplate.update({
      where: { id: body.id },
      data: { usageCount: { increment: 1 } },
    })
    return NextResponse.json(updated)
  }

  const template = await prisma.snsContentTemplate.create({
    data: {
      name: body.name,
      category: body.category || 'GENERAL',
      type: body.type || 'TEXT',
      promptTemplate: body.promptTemplate,
      slideCount: body.slideCount || 5,
      hashtags: JSON.stringify(body.hashtags || []),
    },
  })
  return NextResponse.json(template, { status: 201 })
}
