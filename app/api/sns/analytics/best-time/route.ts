import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const personaId = searchParams.get('personaId')
  if (!personaId) return NextResponse.json({ error: 'personaId 필수' }, { status: 400 })

  const published = await prisma.snsScheduledPost.findMany({
    where: { personaId, status: 'PUBLISHED' },
    select: { publishedAt: true },
  })

  const hourMap = new Map<string, number>()
  for (const post of published) {
    if (!post.publishedAt) continue
    const d = new Date(post.publishedAt)
    const key = `${d.getDay()}-${d.getHours()}`
    hourMap.set(key, (hourMap.get(key) || 0) + 1)
  }

  const sorted = Array.from(hourMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => {
      const [day, hour] = key.split('-').map(Number)
      const days = ['일','월','화','수','목','금','토']
      return { day: days[day], hour: `${hour}:00`, count }
    })

  return NextResponse.json(sorted)
}
