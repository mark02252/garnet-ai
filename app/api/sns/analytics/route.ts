import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const personaId = searchParams.get('personaId')
  const days = Number(searchParams.get('days') || 30)

  const since = new Date()
  since.setDate(since.getDate() - days)

  const snapshots = await prisma.snsAnalyticsSnapshot.findMany({
    where: {
      ...(personaId ? { personaId } : {}),
      date: { gte: since },
    },
    orderBy: { date: 'asc' },
  })

  return NextResponse.json(snapshots)
}
