import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const now = new Date()
  const result = await prisma.snsScheduledPost.updateMany({
    where: { status: 'PENDING', scheduledAt: { lt: now } },
    data: { status: 'MISSED' },
  })
  return NextResponse.json({ missed: result.count })
}
