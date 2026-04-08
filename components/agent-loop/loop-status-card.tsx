'use client'

import { useEffect, useState } from 'react'
import type { AgentLoopStatusResponse } from '@/lib/agent-loop/types'

export function LoopStatusCard() {
  const [data, setData] = useState<AgentLoopStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)

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
    await fetch('/api/agent-loop/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const r = await fetch('/api/agent-loop/status')
    setData(await r.json())
  }

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
