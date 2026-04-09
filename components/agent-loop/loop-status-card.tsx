'use client'

import { useEffect, useState } from 'react'
import type { AgentLoopStatusResponse } from '@/lib/agent-loop/types'

export function LoopStatusCard() {
  const [data, setData] = useState<AgentLoopStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [deferringId, setDeferringId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/agent-loop/status')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))

    const interval = setInterval(() => {
      fetch('/api/agent-loop/status').then(r => r.json()).then(setData).catch(() => {})
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 animate-pulse h-48" />

  // API 실패 또는 데이터 없음 → 기본 상태 표시
  const d: AgentLoopStatusResponse = data ?? {
    status: 'idle',
    lastCycle: null,
    nextScheduled: { cycleType: 'routine-cycle', scheduledAt: '' },
    today: { autoExecuted: 0, sentToGovernor: 0, totalCycles: 0 },
    goals: [],
    recentDecisions: [],
    recentActions: [],
    pendingApprovals: [],
  }

  const statusColors: Record<string, string> = {
    running: 'text-green-400',
    paused: 'text-yellow-400',
    error: 'text-red-400',
    idle: 'text-zinc-400',
  }

  const statusLabels: Record<string, string> = {
    running: '작동 중',
    paused: '일시 정지',
    error: '오류',
    idle: '대기',
  }

  async function handleControl(action: string) {
    try {
      await fetch('/api/agent-loop/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const r = await fetch('/api/agent-loop/status')
      if (r.ok) setData(await r.json())
    } catch { /* ignore */ }
  }

  async function handleDecision(id: string, decision: 'APPROVED' | 'REJECTED' | 'DEFERRED', reason?: string) {
    try {
      await fetch(`/api/governor/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason }),
      })
      setDeferringId(null)
      const r = await fetch('/api/agent-loop/status')
      if (r.ok) setData(await r.json())
    } catch { /* ignore */ }
  }

  const deferReasons = [
    { key: 'no_budget', label: '예산 부족' },
    { key: 'prerequisite', label: '선행 작업 필요' },
    { key: 'too_early', label: '시기상조' },
    { key: 'external_dependency', label: '외부 의존' },
    { key: 'good_idea_later', label: '나중에 참고' },
  ]

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Agent Loop</h2>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${statusColors[d.status]}`}>
            {'\u25CF'} {statusLabels[d.status]}
          </span>
          {d.status === 'running' ? (
            <button onClick={() => handleControl('pause')} className="text-xs text-zinc-500 hover:text-zinc-300 transition">일시정지</button>
          ) : (
            <button onClick={() => handleControl('start')} className="text-xs text-garnet-400 hover:text-garnet-300 font-medium transition">시작</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <div className="text-lg font-bold text-zinc-100">{d.today.totalCycles}</div>
          <div className="text-xs text-zinc-500">사이클</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-green-400">{d.today.autoExecuted}</div>
          <div className="text-xs text-zinc-500">자동실행</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-yellow-400">{d.today.sentToGovernor}</div>
          <div className="text-xs text-zinc-500">승인대기</div>
        </div>
      </div>

      {d.goals.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs text-zinc-500 mb-2">목표 진행률</h3>
          {d.goals.map(g => (
            <div key={g.name} className="flex items-center gap-2 mb-1.5">
              <span className="text-xs text-zinc-400 w-32 truncate">{g.name}</span>
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${g.onTrack ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, g.progressPercent)}%` }}
                />
              </div>
              <span className="text-xs text-zinc-500 w-10 text-right">{g.progressPercent}%</span>
            </div>
          ))}
        </div>
      )}

      {/* 승인 대기 항목 */}
      {(d.pendingApprovals?.length ?? 0) > 0 && (
        <div className="mb-4">
          <h3 className="text-xs text-zinc-500 mb-2">승인 대기</h3>
          <div className="space-y-2">
            {d.pendingApprovals!.map(a => (
              <div key={a.id} className="rounded-lg border border-yellow-900/50 bg-yellow-950/20 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-yellow-400">{a.title || a.kind}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/40 text-yellow-500">{a.riskLevel}</span>
                </div>
                {a.rationale && (
                  <p className="text-[11px] text-zinc-500 leading-relaxed">{a.rationale.slice(0, 150)}{a.rationale.length > 150 ? '...' : ''}</p>
                )}
                {deferringId === a.id ? (
                  <div className="mt-2">
                    <p className="text-[10px] text-zinc-500 mb-1.5">보류 이유:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {deferReasons.map(r => (
                        <button
                          key={r.key}
                          onClick={() => handleDecision(a.id, 'DEFERRED', r.key)}
                          className="text-[10px] px-2 py-1 rounded bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 transition"
                        >{r.label}</button>
                      ))}
                      <button
                        onClick={() => setDeferringId(null)}
                        className="text-[10px] px-2 py-1 rounded bg-zinc-800 text-zinc-600 hover:text-zinc-400 transition"
                      >취소</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleDecision(a.id, 'APPROVED')}
                      className="text-[10px] px-2 py-1 rounded bg-green-900/40 text-green-400 hover:bg-green-900/60 transition"
                    >승인</button>
                    <button
                      onClick={() => setDeferringId(a.id)}
                      className="text-[10px] px-2 py-1 rounded bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 transition"
                    >보류</button>
                    <button
                      onClick={() => handleDecision(a.id, 'REJECTED')}
                      className="text-[10px] px-2 py-1 rounded bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
                    >거절</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 최근 액션 내역 */}
      {(d.recentActions?.length ?? 0) > 0 && (
        <div className="mb-4">
          <h3 className="text-xs text-zinc-500 mb-2">최근 액션</h3>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {d.recentActions!.slice(0, 6).map(a => {
              const icon = a.status === 'executed' ? '✓' : a.status === 'failed' ? '✗' : '⏳'
              const color = a.status === 'executed' ? 'text-green-500' : a.status === 'failed' ? 'text-red-500' : 'text-yellow-500'
              const time = new Date(a.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={a.id} className="flex items-center gap-2 text-xs">
                  <span className={`w-4 ${color}`}>{icon}</span>
                  <span className="text-zinc-600 w-10 shrink-0">{time}</span>
                  <span className="text-zinc-400 flex-1 truncate">{a.title || a.kind}</span>
                  <span className="text-[10px] text-zinc-600">{a.riskLevel}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 최근 판단 */}
      {d.recentDecisions.length > 0 && (
        <div>
          <h3 className="text-xs text-zinc-500 mb-2">최근 판단</h3>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {d.recentDecisions.slice(0, 5).map((dec, i) => {
              const statusIcon = dec.status === 'executed' ? '\u2713' : dec.status === 'pending_approval' ? '\u23F3' : '\u2014'
              const time = new Date(dec.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-zinc-600 w-12 shrink-0">{time}</span>
                  <span className="text-zinc-400 flex-1 truncate">{dec.summary}</span>
                  <span className="text-zinc-600">{statusIcon}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
