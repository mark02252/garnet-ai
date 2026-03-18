import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { publishDraft } from '@/lib/sns/instagram-publisher'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as {
    accessToken?: string
    businessAccountId?: string
  }

  if (!body.accessToken || !body.businessAccountId) {
    return NextResponse.json(
      { error: 'accessToken과 businessAccountId가 필요합니다.' },
      { status: 400 }
    )
  }

  const draft = await prisma.snsContentDraft.findUnique({ where: { id } })
  if (!draft) {
    return NextResponse.json(
      { error: '콘텐츠를 찾을 수 없습니다.' },
      { status: 404 }
    )
  }

  const result = await publishDraft({
    accessToken: body.accessToken,
    businessAccountId: body.businessAccountId,
    draft,
  })

  if (result.success) {
    await prisma.snsContentDraft.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    })
  }

  return NextResponse.json(result)
}
