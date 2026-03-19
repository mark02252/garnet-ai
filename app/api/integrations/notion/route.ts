import { NextRequest, NextResponse } from 'next/server'
import { exportToNotionPage } from '@/lib/integrations/notion'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  if (!body.parentPageId || !body.title) {
    return NextResponse.json({ error: 'parentPageId와 title이 필요합니다.' }, { status: 400 })
  }
  const result = await exportToNotionPage({
    parentPageId: body.parentPageId,
    title: body.title,
    content: body.content || '',
  })
  return NextResponse.json(result)
}
