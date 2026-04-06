import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { validateFlow } from '@/lib/flow/graph'
import type { FlowNode, FlowEdge } from '@/lib/flow/types'

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nodes: z.string().optional(),
  edges: z.string().optional(),
})
.refine(v => Object.keys(v).length > 0, { message: '수정할 필드가 없습니다.' })
.refine(
  v => (v.nodes === undefined) === (v.edges === undefined),
  { message: 'nodes와 edges는 함께 저장해야 합니다.' }
)

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const template = await prisma.flowTemplate.findUnique({ where: { id } })
    if (!template) return NextResponse.json({ error: '템플릿을 찾을 수 없습니다.' }, { status: 404 })
    return NextResponse.json(template)
  } catch (error) {
    console.error('[flow-templates] GET by id error:', error)
    return NextResponse.json(
      { error: '템플릿을 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = patchSchema.parse(await req.json())

    // If saving nodes+edges, validate graph
    if (body.nodes && body.edges) {
      const nodes = JSON.parse(body.nodes) as FlowNode[]
      const edges = JSON.parse(body.edges) as FlowEdge[]
      const error = validateFlow(nodes, edges)
      if (error) return NextResponse.json({ error }, { status: 400 })
    }

    const template = await prisma.flowTemplate.update({ where: { id }, data: body })
    return NextResponse.json(template)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '수정에 실패했습니다.' },
      { status: 400 }
    )
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.flowTemplate.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '삭제에 실패했습니다.' },
      { status: 400 }
    )
  }
}
