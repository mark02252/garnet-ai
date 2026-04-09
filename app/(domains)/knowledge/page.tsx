import { prisma } from '@/lib/prisma'
import { PageTransition } from '@/components/page-transition'

export const dynamic = 'force-dynamic'

export default async function KnowledgePage() {
  const [entries, stats, recentAnti] = await Promise.all([
    prisma.knowledgeEntry.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    prisma.knowledgeEntry.groupBy({
      by: ['domain'],
      _count: true,
      _avg: { confidence: true },
    }),
    prisma.knowledgeEntry.findMany({
      where: { isAntiPattern: true },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
  ])

  const levelLabels: Record<number, string> = { 1: 'Fact', 2: 'Pattern', 3: 'Principle' }
  const levelColors: Record<number, string> = { 1: 'text-zinc-400', 2: 'text-blue-400', 3: 'text-purple-400' }

  const totalKnowledge = entries.length
  const avgConfidence = entries.length > 0
    ? (entries.reduce((s, e) => s + e.confidence, 0) / entries.length * 100).toFixed(0)
    : '0'

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-widest text-[var(--accent-text)] mb-1">Knowledge Store</p>
          <h1 className="text-2xl font-bold text-zinc-100">지식 저장소</h1>
          <p className="text-sm text-zinc-500 mt-1">Garnet이 경험과 외부 학습에서 축적한 비즈니스 지식</p>
        </header>

        {/* KPI Strip */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
            <div className="text-2xl font-bold text-zinc-100">{totalKnowledge}</div>
            <div className="text-xs text-zinc-500">총 지식</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">{stats.length}</div>
            <div className="text-xs text-zinc-500">도메인</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{avgConfidence}%</div>
            <div className="text-xs text-zinc-500">평균 신뢰도</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
            <div className="text-2xl font-bold text-red-400">{recentAnti.length}</div>
            <div className="text-xs text-zinc-500">Anti-Patterns</div>
          </div>
        </div>

        {/* Domain Distribution */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-6">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">도메인별 분포</h2>
          <div className="space-y-2">
            {stats.sort((a, b) => b._count - a._count).map(s => {
              const maxCount = Math.max(...stats.map(x => x._count))
              const width = maxCount > 0 ? (s._count / maxCount) * 100 : 0
              return (
                <div key={s.domain} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 w-36 truncate">{s.domain}</span>
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-xs text-zinc-500 w-16 text-right">{s._count}건 ({((s._avg?.confidence ?? 0) * 100).toFixed(0)}%)</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Knowledge Entries */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-6">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">최근 지식</h2>
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {entries.map(e => (
              <div key={e.id} className={`rounded-lg border ${e.isAntiPattern ? 'border-red-900/50 bg-red-950/10' : 'border-zinc-800 bg-zinc-900/30'} p-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${levelColors[e.level] || 'text-zinc-400'} bg-zinc-800`}>
                    {levelLabels[e.level] || 'Unknown'}
                  </span>
                  <span className="text-[10px] text-zinc-600">{e.domain}</span>
                  <span className="text-[10px] text-zinc-600">신뢰도 {(e.confidence * 100).toFixed(0)}%</span>
                  {e.isAntiPattern && <span className="text-[10px] text-red-500">Anti-Pattern</span>}
                  <span className="text-[10px] text-zinc-700 ml-auto">{e.observedCount}회 관찰</span>
                </div>
                <p className="text-xs text-zinc-300 font-medium">{e.pattern}</p>
                <p className="text-xs text-zinc-500 mt-1">{e.observation.split('\n')[0].slice(0, 200)}</p>
              </div>
            ))}
            {entries.length === 0 && (
              <p className="text-sm text-zinc-600 text-center py-8">아직 축적된 지식이 없습니다. Agent Loop가 학습을 시작하면 여기에 표시됩니다.</p>
            )}
          </div>
        </section>

        {/* Anti-Patterns */}
        {recentAnti.length > 0 && (
          <section className="rounded-xl border border-red-900/30 bg-red-950/10 p-5">
            <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wide mb-4">Anti-Patterns (하지 말아야 할 것)</h2>
            <div className="space-y-2">
              {recentAnti.map(a => (
                <div key={a.id} className="text-xs">
                  <span className="text-red-400">{a.pattern}</span>
                  <span className="text-zinc-600 ml-2">{a.observation.split('\n')[0].slice(0, 100)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </PageTransition>
  )
}
