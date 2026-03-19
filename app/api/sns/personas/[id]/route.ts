import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest, unauthorizedResponse } from '@/lib/supabase/auth-middleware'

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const persona = await prisma.snsPersona.findUnique({
    where: { id },
    include: { sourcePosts: true },
  })
  if (!persona) return NextResponse.json({ error: '없음' }, { status: 404 })
  return NextResponse.json(persona)
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const body = await req.json()
    const {
      name, brandConcept, targetAudience, writingStyle,
      tone, keywords, sampleSentences, instagramHandle,
    } = body

    const persona = await prisma.snsPersona.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(brandConcept !== undefined && { brandConcept }),
        ...(targetAudience !== undefined && { targetAudience }),
        ...(writingStyle !== undefined && { writingStyle }),
        ...(tone !== undefined && { tone }),
        ...(keywords !== undefined && { keywords: JSON.stringify(keywords) }),
        ...(sampleSentences !== undefined && { sampleSentences: JSON.stringify(sampleSentences) }),
        ...(instagramHandle !== undefined && { instagramHandle }),
      },
    })
    return NextResponse.json(persona)
  } catch (error) {
    console.error('PATCH /api/sns/personas/[id] error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : '업데이트 실패' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req)
  if (!auth.authenticated) return unauthorizedResponse()
  try {
    const { id } = await context.params
    await prisma.snsPersona.update({
      where: { id },
      data: { isActive: false },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/sns/personas/[id] error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : '삭제 실패' }, { status: 500 })
  }
}
