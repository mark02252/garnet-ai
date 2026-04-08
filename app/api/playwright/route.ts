import { NextRequest, NextResponse } from 'next/server'
import { captureUrl, extractPageData, diffSnapshots, validateUrl } from '@/lib/playwright-agent'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    action: 'capture' | 'extract' | 'diff' | 'validate'
    url: string
  }

  if (!body.url) {
    return NextResponse.json({ error: 'url이 필요합니다.' }, { status: 400 })
  }

  try {
    switch (body.action) {
      case 'capture': {
        const result = await captureUrl(body.url)
        return NextResponse.json(result)
      }
      case 'extract': {
        const result = await extractPageData(body.url)
        return NextResponse.json(result)
      }
      case 'diff': {
        const result = await diffSnapshots(body.url)
        return NextResponse.json(result)
      }
      case 'validate': {
        const result = await validateUrl(body.url)
        return NextResponse.json(result)
      }
      default:
        return NextResponse.json({ error: 'action은 capture|extract|diff|validate 중 하나' }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Playwright 실행 실패' },
      { status: 500 }
    )
  }
}
