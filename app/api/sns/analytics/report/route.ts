import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generatePerformanceReport } from '@/lib/sns/performance-analyzer'

// GET: fetch latest report for a persona
export async function GET(req: NextRequest) {
  const personaId = req.nextUrl.searchParams.get('personaId')
  if (!personaId) {
    return NextResponse.json({ error: 'personaId가 필요합니다.' }, { status: 400 })
  }

  const latest = await prisma.snsPerformanceReport.findFirst({
    where: { personaId },
    orderBy: { createdAt: 'desc' },
  })

  if (!latest) {
    return NextResponse.json({ report: null })
  }

  return NextResponse.json({
    report: {
      id: latest.id,
      personaId: latest.personaId,
      createdAt: latest.createdAt.toISOString(),
      ...JSON.parse(latest.reportJson),
    },
  })
}

// POST: generate new report
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    personaId?: string
    accessToken?: string
    businessAccountId?: string
    days?: number
  }

  if (!body.personaId || !body.accessToken || !body.businessAccountId) {
    return NextResponse.json(
      { error: 'personaId, accessToken, businessAccountId가 필요합니다.' },
      { status: 400 }
    )
  }

  try {
    const report = await generatePerformanceReport({
      accessToken: body.accessToken,
      businessAccountId: body.businessAccountId,
      personaId: body.personaId,
      days: body.days || 30,
    })

    const saved = await prisma.snsPerformanceReport.create({
      data: {
        personaId: body.personaId,
        period: `${body.days || 30}d`,
        reportJson: JSON.stringify(report),
      },
    })

    return NextResponse.json({
      report: { id: saved.id, personaId: saved.personaId, createdAt: saved.createdAt.toISOString(), ...report },
    })
  } catch (error) {
    console.error('Performance report error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '리포트 생성에 실패했습니다.' },
      { status: 500 }
    )
  }
}
