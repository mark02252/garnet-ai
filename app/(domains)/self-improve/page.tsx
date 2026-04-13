import { prisma } from '@/lib/prisma'
import { PageTransition } from '@/components/page-transition'
import { SelfImproveClient } from './client'

export const dynamic = 'force-dynamic'

export default async function SelfImprovePage() {
  // 사이클 리플렉션 교훈
  const lessons = await prisma.knowledgeEntry.findMany({
    where: { source: { contains: 'cycle_reflector' } },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true, domain: true, level: true, pattern: true,
      observation: true, confidence: true, observedCount: true,
      source: true, createdAt: true, updatedAt: true,
    },
  })

  const totalLessons = lessons.length
  const principleCount = lessons.filter(l => l.level === 3).length
  const domains = [...new Set(lessons.map(l => l.domain))]

  const serialized = lessons.map(l => ({
    ...l,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }))

  return (
    <PageTransition>
      <SelfImproveClient
        lessons={serialized}
        totalLessons={totalLessons}
        principleCount={principleCount}
        domains={domains}
      />
    </PageTransition>
  )
}
