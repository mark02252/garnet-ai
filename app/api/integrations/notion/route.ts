import { NextRequest, NextResponse } from 'next/server'
import { exportToNotionPage } from '@/lib/integrations/notion'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const parentPageId = body.parentPageId || process.env.NOTION_PARENT_PAGE_ID
  if (!parentPageId || !body.title) {
    return NextResponse.json(
      { error: 'parentPageId(또는 NOTION_PARENT_PAGE_ID 환경변수)와 title이 필요합니다.' },
      { status: 400 }
    )
  }
  const result = await exportToNotionPage({
    parentPageId,
    title: body.title,
    content: body.content || '',
  })
  return NextResponse.json(result)
}

export async function GET() {
  const configured = !!(process.env.NOTION_API_KEY && process.env.NOTION_PARENT_PAGE_ID)
  return NextResponse.json({ configured })
}
