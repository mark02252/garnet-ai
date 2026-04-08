import { NextRequest, NextResponse } from 'next/server'
import { designCampaign } from '@/lib/campaign-designer'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    objective?: string
    brand?: string
    budget?: string
    duration?: string
  }

  if (!body.objective) {
    return NextResponse.json({ error: '캠페인 목표가 필요합니다.' }, { status: 400 })
  }

  try {
    const design = await designCampaign(body)
    return NextResponse.json({ design })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '캠페인 설계 실패' },
      { status: 500 }
    )
  }
}
