'use client'

import { useState } from 'react'

type Entry = {
  id: string
  domain: string
  level: number
  pattern: string
  observation: string
  confidence: number
  observedCount: number
  isAntiPattern: boolean
  source: string
  createdAt: string
}

type DomainStat = { domain: string; count: number; avgConfidence: number }

const levelLabels: Record<number, string> = { 1: 'Fact', 2: 'Pattern', 3: 'Principle' }
const levelColors: Record<number, string> = { 1: 'text-zinc-400 bg-zinc-800', 2: 'text-blue-400 bg-blue-900/30', 3: 'text-purple-400 bg-purple-900/30' }

export function KnowledgeClient({ entries, domains }: { entries: Entry[]; domains: DomainStat[] }) {
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const [showAntiPatterns, setShowAntiPatterns] = useState(false)
  const [minConfidence, setMinConfidence] = useState(0)

  const totalKnowledge = entries.length
  const antiCount = entries.filter(e => e.isAntiPattern).length
  const avgConfidence = entries.length > 0
    ? Math.round(entries.reduce((s, e) => s + e.confidence, 0) / entries.length * 100)
    : 0

  // 필터링
  const filtered = entries.filter(e => {
    if (selectedDomain && e.domain !== selectedDomain) return false
    if (!showAntiPatterns && e.isAntiPattern) return false
    if (e.confidence < minConfidence / 100) return false
    return true
  })

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-[var(--accent-text)] mb-1">Knowledge Store</p>
        <h1 className="text-2xl font-bold text-zinc-100">지식 저장소</h1>
        <p className="text-sm text-zinc-500 mt-1">Garnet이 경험과 외부 학습에서 축적한 비즈니스 지식</p>
      </header>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <div className="text-2xl font-bold text-zinc-100">{totalKnowledge}</div>
          <div className="text-xs text-zinc-500">총 지식</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{domains.length}</div>
          <div className="text-xs text-zinc-500">도메인</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{avgConfidence}%</div>
          <div className="text-xs text-zinc-500">평균 신뢰도</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{antiCount}</div>
          <div className="text-xs text-zinc-500">Anti-Patterns</div>
        </div>
      </div>

      {/* 도메인 탭 + 필터 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setSelectedDomain(null)}
          className={`text-[11px] px-2.5 py-1 rounded-full transition ${
            !selectedDomain ? 'bg-[var(--accent)] text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >전체 ({totalKnowledge})</button>
        {domains.map(d => (
          <button
            key={d.domain}
            onClick={() => setSelectedDomain(selectedDomain === d.domain ? null : d.domain)}
            className={`text-[11px] px-2.5 py-1 rounded-full transition ${
              selectedDomain === d.domain ? 'bg-[var(--accent)] text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >{d.domain} ({d.count})</button>
        ))}
      </div>

      <div className="flex items-center gap-4 mb-6">
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          <input
            type="checkbox"
            checked={showAntiPatterns}
            onChange={e => setShowAntiPatterns(e.target.checked)}
            className="rounded border-zinc-700"
          />
          Anti-Pattern 표시
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          신뢰도
          <select
            value={minConfidence}
            onChange={e => setMinConfidence(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-300"
          >
            <option value={0}>전체</option>
            <option value={40}>40%+</option>
            <option value={60}>60%+</option>
            <option value={80}>80%+</option>
          </select>
        </label>
        <span className="text-[10px] text-zinc-600 ml-auto">{filtered.length}건 표시</span>
      </div>

      {/* 도메인 요약 바 (선택된 도메인 없을 때만) */}
      {!selectedDomain && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-6">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">도메인별 분포</h2>
          <div className="space-y-2">
            {domains.map(d => {
              const maxCount = Math.max(...domains.map(x => x.count))
              const width = maxCount > 0 ? (d.count / maxCount) * 100 : 0
              return (
                <button
                  key={d.domain}
                  onClick={() => setSelectedDomain(d.domain)}
                  className="flex items-center gap-3 w-full hover:bg-zinc-800/50 rounded px-1 py-0.5 transition"
                >
                  <span className="text-xs text-zinc-400 w-36 truncate text-left">{d.domain}</span>
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-xs text-zinc-500 w-20 text-right">{d.count}건 ({(d.avgConfidence * 100).toFixed(0)}%)</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* 지식 목록 */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-4">
          {selectedDomain ? `${selectedDomain} 지식` : '최근 지식'}
        </h2>
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {filtered.map(e => (
            <div key={e.id} className={`rounded-lg border ${e.isAntiPattern ? 'border-red-900/50 bg-red-950/10' : 'border-zinc-800/50 bg-zinc-900/30'} p-3`}>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${levelColors[e.level] || 'text-zinc-400 bg-zinc-800'}`}>
                  {levelLabels[e.level] || '?'}
                </span>
                {selectedDomain === null && <span className="text-[10px] text-zinc-600">{e.domain}</span>}
                <span className="text-[10px] text-zinc-600">{(e.confidence * 100).toFixed(0)}%</span>
                {e.isAntiPattern && <span className="text-[10px] text-red-500 font-medium">Anti-Pattern</span>}
                <span className="text-[10px] text-zinc-700 ml-auto">{e.observedCount}회</span>
              </div>
              <p className="text-xs text-zinc-300">{e.pattern.replace(/^\w+:\s*\[검토됨\]\s*/, '')}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{e.observation.split('\n')[0]}</p>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-zinc-600 text-center py-8">
              {entries.length === 0 ? '아직 축적된 지식이 없습니다.' : '필터 조건에 맞는 지식이 없습니다.'}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
