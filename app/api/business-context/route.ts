import { NextRequest, NextResponse } from 'next/server'
import {
  loadBusinessContext,
  saveBusinessContext,
  analyzeWebsite,
  analyzeDocument,
  mergeContextSources,
  type BusinessContext,
} from '@/lib/business-context'

// GET: 현재 Business Context 조회
export async function GET() {
  const context = loadBusinessContext()
  return NextResponse.json({ context })
}

// POST: Business Context 생성/업데이트
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    action: 'analyze-url' | 'analyze-document' | 'save' | 'merge'
    url?: string
    content?: string
    filename?: string
    context?: Partial<BusinessContext>
    sources?: Array<{ type: 'website' | 'document' | 'manual'; data: Partial<BusinessContext> }>
  }

  try {
    switch (body.action) {
      case 'analyze-url': {
        if (!body.url) return NextResponse.json({ error: 'URL이 필요합니다.' }, { status: 400 })
        const result = await analyzeWebsite(body.url)
        return NextResponse.json({ analyzed: result })
      }

      case 'analyze-document': {
        if (!body.content) return NextResponse.json({ error: '문서 내용이 필요합니다.' }, { status: 400 })
        const result = await analyzeDocument(body.content, body.filename)
        return NextResponse.json({ analyzed: result })
      }

      case 'save': {
        if (!body.context) return NextResponse.json({ error: 'context가 필요합니다.' }, { status: 400 })
        const existing = loadBusinessContext()
        const merged = { ...existing, ...body.context, lastUpdated: new Date().toISOString() } as BusinessContext
        saveBusinessContext(merged)
        return NextResponse.json({ context: merged })
      }

      case 'merge': {
        if (!body.sources?.length) return NextResponse.json({ error: 'sources가 필요합니다.' }, { status: 400 })
        const result = await mergeContextSources(body.sources)
        return NextResponse.json({ context: result })
      }

      default:
        return NextResponse.json({ error: 'action은 analyze-url|analyze-document|save|merge 중 하나' }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Business Context 처리 실패' },
      { status: 500 }
    )
  }
}
