import { prisma } from '@/lib/prisma'
import { PageTransition } from '@/components/page-transition'
import { KnowledgeClient } from './client'

export const dynamic = 'force-dynamic'

export default async function KnowledgePage() {
  const [entries, stats] = await Promise.all([
    prisma.knowledgeEntry.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        id: true, domain: true, level: true, pattern: true,
        observation: true, confidence: true, observedCount: true,
        isAntiPattern: true, source: true, createdAt: true,
      },
    }),
    prisma.knowledgeEntry.groupBy({
      by: ['domain'],
      _count: true,
      _avg: { confidence: true },
    }),
  ])

  const domains = stats
    .map(s => ({ domain: s.domain, count: s._count, avgConfidence: s._avg?.confidence ?? 0 }))
    .sort((a, b) => b.count - a.count)

  const serialized = entries.map(e => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
  }))

  return (
    <PageTransition>
      <KnowledgeClient entries={serialized} domains={domains} />
    </PageTransition>
  )
}
