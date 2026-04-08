'use client'

import { useState } from 'react'

type ChannelData = {
  channel: string
  sessions: number
  conversions: number
  engagementRate: number
}

type SimResult = {
  channel: string
  currentSessions: number
  newSessions: number
  currentConversions: number
  newConversions: number
  changePercent: number
}

export function BudgetSimulator({ channels }: { channels: ChannelData[] }) {
  const [adjustments, setAdjustments] = useState<Record<string, number>>({})
  const [results, setResults] = useState<SimResult[]>([])

  if (!channels.length) return null

  const totalSessions = channels.reduce((s, c) => s + c.sessions, 0)
  const totalConversions = channels.reduce((s, c) => s + c.conversions, 0)

  function simulate() {
    const simResults: SimResult[] = channels.map(ch => {
      const adj = (adjustments[ch.channel] || 0) / 100 // -50% → -0.5
      const newSessions = Math.round(ch.sessions * (1 + adj))
      const cvr = ch.sessions > 0 ? ch.conversions / ch.sessions : 0
      const newConversions = Math.round(newSessions * cvr)
      return {
        channel: ch.channel,
        currentSessions: ch.sessions,
        newSessions,
        currentConversions: ch.conversions,
        newConversions,
        changePercent: adjustments[ch.channel] || 0,
      }
    })
    setResults(simResults)
  }

  const totalNewSessions = results.reduce((s, r) => s + r.newSessions, 0)
  const totalNewConversions = results.reduce((s, r) => s + r.newConversions, 0)
  const sessionDiff = totalNewSessions - totalSessions
  const convDiff = totalNewConversions - totalConversions

  return (
    <div className="ops-zone">
      <div className="ops-zone-head">
        <span className="ops-zone-label">Budget Simulator</span>
        <button
          className="button-primary px-3 py-1 text-[10px]"
          onClick={simulate}
        >
          시뮬레이션 실행
        </button>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] text-[var(--text-muted)] mb-3">채널별 예산 조정 비율을 입력하고 예상 결과를 확인하세요.</p>

        <div className="space-y-2 mb-4">
          {channels.slice(0, 8).map(ch => {
            const adj = adjustments[ch.channel] || 0
            return (
              <div key={ch.channel} className="flex items-center gap-3">
                <span className="text-[11px] text-[var(--text-strong)] w-32 truncate shrink-0">{ch.channel}</span>
                <span className="text-[9px] tabular-nums text-[var(--text-disabled)] w-16 shrink-0">{ch.sessions.toLocaleString()} 세션</span>
                <input
                  type="range"
                  min={-100}
                  max={200}
                  step={10}
                  value={adj}
                  onChange={e => setAdjustments(prev => ({ ...prev, [ch.channel]: Number(e.target.value) }))}
                  className="flex-1 h-1 accent-[var(--accent)]"
                  style={{ accentColor: '#C93545' }}
                />
                <span className={`text-[11px] font-bold tabular-nums w-12 text-right ${adj > 0 ? 'text-emerald-400' : adj < 0 ? 'text-rose-400' : 'text-[var(--text-muted)]'}`}>
                  {adj > 0 ? '+' : ''}{adj}%
                </span>
              </div>
            )
          })}
        </div>

        {results.length > 0 && (
          <div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="p-3 rounded bg-[var(--surface-sub)]">
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">예상 세션 변화</p>
                <p className={`text-[18px] font-bold tabular-nums ${sessionDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {sessionDiff >= 0 ? '+' : ''}{sessionDiff.toLocaleString()}
                </p>
                <p className="text-[10px] text-[var(--text-disabled)]">{totalSessions.toLocaleString()} → {totalNewSessions.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded bg-[var(--surface-sub)]">
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">예상 전환 변화</p>
                <p className={`text-[18px] font-bold tabular-nums ${convDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {convDiff >= 0 ? '+' : ''}{convDiff.toLocaleString()}
                </p>
                <p className="text-[10px] text-[var(--text-disabled)]">{totalConversions.toLocaleString()} → {totalNewConversions.toLocaleString()}</p>
              </div>
            </div>

            <div className="space-y-1">
              {results.filter(r => r.changePercent !== 0).map(r => (
                <div key={r.channel} className="flex items-center justify-between text-[10px]">
                  <span className="text-[var(--text-base)]">{r.channel}</span>
                  <span className="tabular-nums text-[var(--text-disabled)]">
                    {r.currentSessions.toLocaleString()} → {r.newSessions.toLocaleString()} 세션
                    {' · '}
                    {r.currentConversions} → {r.newConversions} 전환
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
