import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import type { FlowNode } from '@/lib/flow/types'

const createSchema = z.object({
  name: z.string().min(1).max(200).default('새 플로우'),
})

export async function GET() {
  try {
    const templates = await prisma.flowTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json({ templates })
  } catch (error) {
    console.error('[flow-templates] GET error:', error)
    return NextResponse.json(
      { error: '템플릿 목록을 불러오지 못했습니다.', templates: [] },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = createSchema.parse(await req.json())
    const defaultNodes: FlowNode[] = [
      { type: 'start', id: 'start-1', position: { x: 100, y: 200 }, data: { topic: '토론 주제를 입력하세요' } },
      { type: 'end', id: 'end-1', position: { x: 700, y: 200 }, data: {} },
    ]
    const template = await prisma.flowTemplate.create({
      data: {
        name: body.name,
        nodes: JSON.stringify(defaultNodes),
        edges: JSON.stringify([]),
      },
    })
    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '생성에 실패했습니다.' },
      { status: 400 }
    )
  }
}
