import { prisma } from '@/lib/prisma'
import { PageTransition } from '@/components/page-transition'

export const dynamic = 'force-dynamic'

export default async function EvolutionPage() {
  const [mutations, shifts, crossInsights, selfImprove, humanFeedback, reflections, causalLinks] = await Promise.all([
    // 전략 변이
    prisma.episodicMemory.findMany({
      where: { tags: { contains: 'mutation' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    // 패러다임 전환
    prisma.knowledgeEntry.findMany({
      where: { source: 'paradigm_shift' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    // 교차 인사이트
    prisma.knowledgeEntry.findMany({
      where: { source: { startsWith: 'cross_domain' } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    // 자가 발전 탐색
    prisma.knowledgeEntry.findMany({
      where: { domain: 'self_improvement' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    // 인간 피드백 학습
    prisma.knowledgeEntry.findMany({
      where: { source: { startsWith: 'human_feedback' } },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
    // 자기비판 교훈
    prisma.knowledgeEntry.findMany({
      where: { source: 'reflective_critic' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    // 인과 관계 발견
    prisma.causalLink.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
  ])

  const totalEvents = mutations.length + shifts.length + crossInsights.length
    + selfImprove.length + humanFeedback.length + reflections.length + causalLinks.length

  const sourceIcon: Record<string, string> = {
    human_feedback_approved: '✅',
    human_feedback_rejected: '❌',
    human_feedback_deferred: '⏸️',
    human_feedback_context: '📝',
    reflective_critic: '🔍',
  }

  const sourceLabel: Record<string, string> = {
    human_feedback_approved: '승인 학습',
    human_feedback_rejected: '거절 학습',
    human_feedback_deferred: '보류 학습',
    human_feedback_context: '맥락 학습',
    reflective_critic: '자기비판 교훈',
  }

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-widest text-[var(--accent-text)] mb-1">Evolution Log</p>
          <h1 className="text-2xl font-bold text-zinc-100">진화 로그</h1>
          <p className="text-sm text-zinc-500 mt-1">Garnet이 어떻게 학습하고 변화하고 있는지</p>
        </header>

        {/* KPI Strip */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{humanFeedback.length}</div>
            <div className="text-xs text-zinc-500">피드백 학습</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
            <div className="text-2xl font-bold text-yellow-400">{reflections.length}</div>
            <div className="text-xs text-zinc-500">자기비판</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
            <div className="text-2xl font-bold text-purple-400">{mutations.length}</div>
            <div className="text-xs text-zinc-500">전략 변이</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
            <div className="text-2xl font-bold text-cyan-400">{causalLinks.length}</div>
            <div className="text-xs text-zinc-500">인과 관계</div>
          </div>
        </div>

        {/* 인간 피드백 학습 */}
        {humanFeedback.length > 0 && (
          <section className="rounded-xl border border-green-900/30 bg-green-950/10 p-5 mb-6">
            <h2 className="text-sm font-semibold text-green-400 uppercase tracking-wide mb-4">
              사용자 피드백에서 학습 ({humanFeedback.length})
            </h2>
            <div className="space-y-2.5">
              {humanFeedback.map(f => (
                <div key={f.id} className="border-l-2 border-green-500/50 pl-3">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm">{sourceIcon[f.source] || '📌'}</span>
                    <span className="text-[10px] text-green-500/70">{sourceLabel[f.source] || f.source}</span>
                    <span className="text-[10px] text-zinc-600">{f.domain}</span>
                    {f.isAntiPattern && <span className="text-[10px] text-red-500">Anti-Pattern</span>}
                  </div>
                  <p className="text-xs text-zinc-300">{f.pattern.replace(/^\w+:\s*/, '').slice(0, 80)}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{f.observation.split('\n')[0].slice(0, 150)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 자기비판 교훈 */}
        {reflections.length > 0 && (
          <section className="rounded-xl border border-yellow-900/30 bg-yellow-950/10 p-5 mb-6">
            <h2 className="text-sm font-semibold text-yellow-400 uppercase tracking-wide mb-4">
              자기비판 교훈 ({reflections.length})
            </h2>
            <div className="space-y-2.5">
              {reflections.map(r => (
                <div key={r.id} className="border-l-2 border-yellow-500/50 pl-3">
                  <p className="text-xs text-zinc-300">{r.pattern}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{r.observation.split('\n')[0].slice(0, 200)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 인과 관계 발견 */}
        {causalLinks.length > 0 && (
          <section className="rounded-xl border border-cyan-900/30 bg-cyan-950/10 p-5 mb-6">
            <h2 className="text-sm font-semibold text-cyan-400 uppercase tracking-wide mb-4">
              인과 관계 발견 ({causalLinks.length})
            </h2>
            <div className="space-y-2.5">
              {causalLinks.map(c => (
                <div key={c.id} className="border-l-2 border-cyan-500/50 pl-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-300">{c.cause}</span>
                    <span className="text-zinc-600">→</span>
                    <span className="text-xs text-zinc-300">{c.effect}</span>
                  </div>
                  <div className="flex gap-3 mt-0.5">
                    <span className="text-[10px] text-zinc-500">강도 {(c.strength * 100).toFixed(0)}%</span>
                    <span className="text-[10px] text-zinc-500">{c.observedCount}회 관찰</span>
                    <span className="text-[10px] text-zinc-500">{c.lag} 후 효과</span>
                    <span className="text-[10px] text-zinc-600">{c.domain}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 전략 변이 */}
        {mutations.length > 0 && (
          <section className="rounded-xl border border-purple-900/30 bg-purple-950/10 p-5 mb-6">
            <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wide mb-4">
              전략 변이 ({mutations.length})
            </h2>
            <div className="space-y-2.5">
              {mutations.map(m => {
                let title = ''
                try { title = JSON.parse(m.output)?.actions?.find((a: Record<string, unknown>) => a.kind === 'mutation_experiment')?.title || '' } catch { /* */ }
                return (
                  <div key={m.id} className="border-l-2 border-purple-500/50 pl-3">
                    <p className="text-xs text-zinc-300">{title || m.input.slice(0, 80)}</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">점수: {m.score ?? '미평가'}</p>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 패러다임 전환 */}
        {shifts.length > 0 && (
          <section className="rounded-xl border border-orange-900/30 bg-orange-950/10 p-5 mb-6">
            <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wide mb-4">패러다임 전환 ({shifts.length})</h2>
            <div className="space-y-3">
              {shifts.map(s => (
                <div key={s.id} className="border-l-2 border-orange-500 pl-3">
                  <p className="text-xs text-zinc-300 font-medium">{s.pattern}</p>
                  <p className="text-xs text-zinc-500 mt-1">{s.observation.split('\n')[0].slice(0, 200)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 교차 인사이트 */}
        {crossInsights.length > 0 && (
          <section className="rounded-xl border border-indigo-900/30 bg-indigo-950/10 p-5 mb-6">
            <h2 className="text-sm font-semibold text-indigo-400 uppercase tracking-wide mb-4">교차 도메인 인사이트 ({crossInsights.length})</h2>
            <div className="space-y-3">
              {crossInsights.map(c => (
                <div key={c.id} className="border-l-2 border-indigo-500 pl-3">
                  <p className="text-xs text-zinc-300 font-medium">{c.pattern}</p>
                  <p className="text-xs text-zinc-500 mt-1">{c.observation.split('\n')[0].slice(0, 200)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 자가 발전 */}
        {selfImprove.length > 0 && (
          <section className="rounded-xl border border-blue-900/30 bg-blue-950/10 p-5 mb-6">
            <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wide mb-4">자가 발전 탐색 ({selfImprove.length})</h2>
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

        {totalEvents === 0 && (
          <div className="text-center py-16">
            <p className="text-zinc-600">아직 진화 이력이 없습니다.</p>
            <p className="text-xs text-zinc-700 mt-1">Agent Loop가 학습하면서 진화 데이터가 여기에 기록됩니다.</p>
          </div>
        )}
      </div>
    </PageTransition>
  )
}
