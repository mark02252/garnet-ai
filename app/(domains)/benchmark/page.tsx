import { prisma } from '@/lib/prisma'
import { PageTransition } from '@/components/page-transition'

export const dynamic = 'force-dynamic'

export default async function BenchmarkPage() {
  // Knowledge stats per domain
  const knowledgeStats = await prisma.knowledgeEntry.groupBy({
    by: ['domain'],
    _count: true,
    _avg: { confidence: true },
  })

  // Causal links per domain
  const causalStats = await prisma.causalLink.groupBy({
    by: ['domain'],
    _count: true,
  })
  const causalMap = new Map(causalStats.map(c => [c.domain, c._count]))

  // Anti-patterns per domain
  const antiStats = await prisma.knowledgeEntry.groupBy({
    by: ['domain'],
    where: { isAntiPattern: true },
    _count: true,
  })
  const antiMap = new Map(antiStats.map(a => [a.domain, a._count]))

  // Weekly growth
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [totalNow, totalBefore] = await Promise.all([
    prisma.knowledgeEntry.count(),
    prisma.knowledgeEntry.count({ where: { createdAt: { lt: oneWeekAgo } } }),
  ])
  const growthRate = totalBefore > 0 ? Math.round(((totalNow - totalBefore) / totalBefore) * 100) : 0

  // Loop stats
  const totalCycles = await prisma.agentLoopCycle.count()
  const totalCausal = causalStats.reduce((s, c) => s + c._count, 0)

  // Build domain list
  const domains = knowledgeStats.map(s => {
    const count = s._count
    const conf = s._avg?.confidence ?? 0
    const causal = causalMap.get(s.domain) || 0
    const anti = antiMap.get(s.domain) || 0

    let capability = 'none'
    if (count >= 50 && conf >= 0.7) capability = 'strong'
    else if (count >= 20 && conf >= 0.5) capability = 'moderate'
    else if (count >= 5) capability = 'weak'
    else if (count > 0) capability = 'learning'

    return { domain: s.domain, count, confidence: conf, causal, anti, capability }
  }).sort((a, b) => b.count - a.count)

  const capColors: Record<string, string> = {
    strong: 'text-green-400 bg-green-900/30',
    moderate: 'text-yellow-400 bg-yellow-900/30',
    weak: 'text-orange-400 bg-orange-900/30',
    learning: 'text-red-400 bg-red-900/30',
    none: 'text-zinc-500 bg-zinc-800',
  }
  const capLabels: Record<string, string> = {
    strong: '강함', moderate: '보통', weak: '약함', learning: '학습 중', none: '없음',
  }

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-widest text-[var(--accent-text)] mb-1">Self Benchmark</p>
          <h1 className="text-2xl font-bold text-zinc-100">능력 벤치마크</h1>
          <p className="text-sm text-zinc-500 mt-1">Garnet의 도메인별 능력과 성장 추적</p>
        </header>

        {/* Overall Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
            <div className="text-2xl font-bold text-zinc-100">{totalNow}</div>
            <div className="text-xs text-zinc-500">총 지식</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">{totalCausal}</div>
            <div className="text-xs text-zinc-500">인과 관계</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
            <div className="text-2xl font-bold text-purple-400">{totalCycles}</div>
            <div className="text-xs text-zinc-500">학습 사이클</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
            <div className={`text-2xl font-bold ${growthRate > 0 ? 'text-green-400' : 'text-zinc-400'}`}>
              {growthRate > 0 ? '+' : ''}{growthRate}%
            </div>
            <div className="text-xs text-zinc-500">주간 성장률</div>
          </div>
        </div>

        {/* Domain Capabilities */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">도메인별 능력</h2>
          <div className="space-y-3">
            {domains.map(d => (
              <div key={d.domain} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-200">{d.domain}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${capColors[d.capability]}`}>
                    {capLabels[d.capability]}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-zinc-500">지식</span>
                    <span className="text-zinc-300 ml-2">{d.count}건</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">신뢰도</span>
                    <span className="text-zinc-300 ml-2">{(d.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">인과</span>
                    <span className="text-zinc-300 ml-2">{d.causal}건</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Anti</span>
                    <span className="text-red-400 ml-2">{d.anti}건</span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${d.capability === 'strong' ? 'bg-green-500' : d.capability === 'moderate' ? 'bg-yellow-500' : d.capability === 'weak' ? 'bg-orange-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(100, (d.count / 50) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {domains.length === 0 && (
              <p className="text-sm text-zinc-600 text-center py-8">아직 학습 데이터가 없습니다.</p>
            )}
          </div>
        </section>
      </div>
    </PageTransition>
  )
}
