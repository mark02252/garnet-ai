import { prisma } from '@/lib/prisma'
import { PageTransition } from '@/components/page-transition'

export const dynamic = 'force-dynamic'

export default async function EvolutionPage() {
  // Strategy mutations (tagged in episodic memory)
  const mutations = await prisma.episodicMemory.findMany({
    where: { tags: { contains: 'mutation_experiment' } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  // Paradigm shifts (from knowledge store)
  const shifts = await prisma.knowledgeEntry.findMany({
    where: { source: 'paradigm_shift' },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  // Cross-domain insights
  const crossInsights = await prisma.knowledgeEntry.findMany({
    where: { source: { startsWith: 'cross_domain_' } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  // Self-improvement suggestions
  const selfImprove = await prisma.knowledgeEntry.findMany({
    where: { domain: 'self_improvement' },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-widest text-[var(--accent-text)] mb-1">Evolution Log</p>
          <h1 className="text-2xl font-bold text-zinc-100">진화 로그</h1>
          <p className="text-sm text-zinc-500 mt-1">Garnet의 전략 변이, 패러다임 전환, 교차 인사이트, 자가 발전 이력</p>
        </header>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
            <div className="text-2xl font-bold text-purple-400">{mutations.length}</div>
            <div className="text-xs text-zinc-500">전략 변이</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
            <div className="text-2xl font-bold text-orange-400">{shifts.length}</div>
            <div className="text-xs text-zinc-500">패러다임 전환</div>
          </div>
        </div>

        {/* Paradigm Shifts */}
        {shifts.length > 0 && (
          <section className="rounded-xl border border-orange-900/30 bg-orange-950/10 p-5 mb-6">
            <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wide mb-4">패러다임 전환</h2>
            <div className="space-y-3">
              {shifts.map(s => (
                <div key={s.id} className="border-l-2 border-orange-500 pl-3">
                  <p className="text-xs text-zinc-300 font-medium">{s.pattern}</p>
                  <p className="text-xs text-zinc-500 mt-1">{s.observation.split('\n')[0].slice(0, 200)}</p>
                  <p className="text-[10px] text-zinc-600 mt-1">{s.createdAt.toLocaleDateString('ko-KR')}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Cross-Domain Insights */}
        {crossInsights.length > 0 && (
          <section className="rounded-xl border border-purple-900/30 bg-purple-950/10 p-5 mb-6">
            <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wide mb-4">교차 도메인 인사이트</h2>
            <div className="space-y-3">
              {crossInsights.map(c => (
                <div key={c.id} className="border-l-2 border-purple-500 pl-3">
                  <p className="text-xs text-zinc-300 font-medium">{c.pattern}</p>
                  <p className="text-xs text-zinc-500 mt-1">{c.observation.split('\n')[0].slice(0, 200)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Self-Improvement */}
        {selfImprove.length > 0 && (
          <section className="rounded-xl border border-blue-900/30 bg-blue-950/10 p-5 mb-6">
            <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wide mb-4">자가 발전 탐색</h2>
            <div className="space-y-3">
              {selfImprove.map(s => (
                <div key={s.id} className="border-l-2 border-blue-500 pl-3">
                  <p className="text-xs text-zinc-300 font-medium">{s.pattern}</p>
                  <p className="text-xs text-zinc-500 mt-1">{s.observation.split('\n')[0].slice(0, 200)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {mutations.length === 0 && shifts.length === 0 && crossInsights.length === 0 && selfImprove.length === 0 && (
          <div className="text-center py-16">
            <p className="text-zinc-600">아직 진화 이력이 없습니다.</p>
            <p className="text-xs text-zinc-700 mt-1">Agent Loop가 충분히 돌면 전략 변이와 교차 인사이트가 여기에 기록됩니다.</p>
          </div>
        )}
      </div>
    </PageTransition>
  )
}
