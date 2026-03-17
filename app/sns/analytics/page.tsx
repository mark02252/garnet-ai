'use client'

import { useEffect, useState } from 'react'

type Snapshot = {
  id: string; date: string; reach: number; impressions: number
  engagement: number; followers: number; postCount: number
}
type Persona = { id: string; name: string }

export default function AnalyticsPage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [personaId, setPersonaId] = useState('')
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [syncing, setSyncing] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatAnswer, setChatAnswer] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  useEffect(() => {
    fetch('/api/sns/personas').then(r => r.json()).then((data: Persona[]) => {
      setPersonas(data)
      if (data.length > 0) setPersonaId(data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!personaId) return
    fetch(`/api/sns/analytics?personaId=${personaId}&days=30`)
      .then(r => r.json()).then(setSnapshots)
  }, [personaId])

  const totalReach = snapshots.reduce((s, n) => s + n.reach, 0)
  const avgEngagement = snapshots.length
    ? (snapshots.reduce((s, n) => s + n.engagement, 0) / snapshots.length).toFixed(1)
    : '0'
  const latestFollowers = snapshots.at(-1)?.followers ?? 0
  const totalPosts = snapshots.reduce((s, n) => s + n.postCount, 0)

  async function handleSync() {
    if (!personaId) return
    setSyncing(true)
    await fetch('/api/sns/analytics/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personaId }),
    })
    const updated = await fetch(`/api/sns/analytics?personaId=${personaId}&days=30`).then(r => r.json())
    setSnapshots(updated)
    setSyncing(false)
  }

  async function handleChat() {
    if (!chatInput.trim()) return
    setChatLoading(true)
    const context = JSON.stringify(snapshots.slice(-7))
    const res = await fetch('/api/sns/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt: `당신은 SNS 마케팅 전문가입니다. 다음 최근 7일 성과 데이터를 바탕으로 답변하세요:\n${context}`,
        userMessage: chatInput,
      }),
    }).then(r => r.json())
    setChatAnswer(res.content || '')
    setChatLoading(false)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="dashboard-eyebrow">SNS 스튜디오</p>
          <h1 className="dashboard-title">성과 분석</h1>
        </div>
        <div className="flex items-center gap-3">
          <select className="input" value={personaId} onChange={e => setPersonaId(e.target.value)}>
            {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="button-secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? '수집 중...' : '지금 수집'}
          </button>
        </div>
      </div>

      {/* KPI 타일 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          ['총 도달수', totalReach.toLocaleString()],
          ['평균 인게이지먼트', `${avgEngagement}%`],
          ['팔로워', latestFollowers.toLocaleString()],
          ['발행 수', String(totalPosts)],
        ].map(([label, value]) => (
          <div key={label} className="card">
            <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
            <p className="text-2xl font-bold text-[var(--text-strong)]">{value}</p>
          </div>
        ))}
      </div>

      {/* 도달수 추이 막대 차트 */}
      {snapshots.length > 0 && (
        <div className="card mb-6">
          <p className="section-title mb-3">도달수 추이 (최근 30일)</p>
          <div className="flex items-end gap-1 h-32">
            {snapshots.slice(-30).map((s) => {
              const max = Math.max(...snapshots.map(x => x.reach), 1)
              const pct = Math.round((s.reach / max) * 100)
              return (
                <div key={s.id} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div
                    className="w-full bg-[var(--accent)] rounded-t opacity-80 hover:opacity-100 transition-opacity"
                    style={{ height: `${Math.max(pct, 2)}%` }}
                  />
                  <span className="text-[8px] text-[var(--text-muted)] hidden group-hover:block absolute -bottom-4">
                    {new Date(s.date).getDate()}일
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* AI 디스커션 */}
      <div className="card">
        <p className="section-title mb-3">AI 디스커션</p>
        <div className="flex gap-2 mb-3">
          <input
            className="input flex-1"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            placeholder="이번달 가장 효과적인 콘텐츠 타입은?"
            onKeyDown={e => e.key === 'Enter' && handleChat()}
          />
          <button className="button-primary" onClick={handleChat} disabled={chatLoading}>
            {chatLoading ? '분석 중...' : '질문'}
          </button>
        </div>
        {chatAnswer && (
          <div className="soft-card p-3 text-sm text-[var(--text-base)] whitespace-pre-wrap">{chatAnswer}</div>
        )}
      </div>
    </div>
  )
}
