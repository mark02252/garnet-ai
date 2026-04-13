'use client'

import { useState, useEffect } from 'react'

type Lesson = {
  id: string; domain: string; level: number; pattern: string
  observation: string; confidence: number; observedCount: number
  source: string; createdAt: string; updatedAt: string
}

type GoalCalibration = {
  bias: number; lastPredicted: number | null; lastActual: number | null
  errorHistory: number[]; updatedAt: string
}

type ChangelogEntry = { timestamp: string; reason: string; promptLength: number }

type ApiData = {
  calibration: { goals: Record<string, GoalCalibration> }
  promptVersions: Array<{ filename: string; date: string }>
  changelog: ChangelogEntry[]
  activePrompt: string
  activePromptLength: number
}

const levelLabels: Record<number, string> = { 1: 'Fact', 2: 'Pattern', 3: 'Principle' }
const levelColors: Record<number, string> = { 2: 'text-blue-400 bg-blue-900/30', 3: 'text-purple-400 bg-purple-900/30' }
const tabs = ['교훈', '예측 보정', '프롬프트'] as const
type Tab = typeof tabs[number]

export function SelfImproveClient({ lessons, totalLessons, principleCount, domains }: {
  lessons: Lesson[]; totalLessons: number; principleCount: number; domains: string[]
}) {
  const [tab, setTab] = useState<Tab>('교훈')
  const [domainFilter, setDomainFilter] = useState<string | null>(null)
  const [apiData, setApiData] = useState<ApiData | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    fetch('/api/self-improve').then(r => r.json()).then(setApiData).catch(() => {})
  }, [])

  const goalEntries = apiData ? Object.entries(apiData.calibration.goals) : []
  const avgBias = goalEntries.length > 0
    ? goalEntries.reduce((s, [, g]) => s + Math.abs(g.bias), 0) / goalEntries.length
    : 0

  const filteredLessons = domainFilter ? lessons.filter(l => l.domain === domainFilter) : lessons

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-[var(--accent-text)] mb-1">Self-Improvement</p>
        <h1 className="text-2xl font-bold text-zinc-100">자기 개선</h1>
        <p className="text-sm text-zinc-500 mt-1">Garnet이 스스로 학습하고 개선하는 과정</p>
      </header>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <div className="text-2xl font-bold text-zinc-100">{totalLessons}</div>
          <div className="text-xs text-zinc-500">축적 교훈</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <div className="text-2xl font-bold text-purple-400">{principleCount}</div>
          <div className="text-xs text-zinc-500">확립된 원칙</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <div className="text-2xl font-bold" style={{ color: avgBias < 3 ? '#4ade80' : avgBias < 8 ? '#facc15' : '#f87171' }}>
            {avgBias.toFixed(1)}
          </div>
          <div className="text-xs text-zinc-500">평균 예측 오차</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
          <div className="text-2xl font-bold text-zinc-100">{apiData?.promptVersions.length ?? 0}</div>
          <div className="text-xs text-zinc-500">프롬프트 버전</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-zinc-800">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm transition border-b-2 ${
              tab === t
                ? 'text-[var(--accent-text)] border-[var(--accent)]'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >{t}</button>
        ))}
      </div>

      {/* Tab 1: Cycle Lessons */}
      {tab === '교훈' && (
        <div>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setDomainFilter(null)}
              className={`text-[11px] px-2.5 py-1 rounded-full transition ${
                !domainFilter ? 'bg-[var(--accent)] text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >전체 ({totalLessons})</button>
            {domains.map(d => (
              <button
                key={d}
                onClick={() => setDomainFilter(domainFilter === d ? null : d)}
                className={`text-[11px] px-2.5 py-1 rounded-full transition ${
                  domainFilter === d ? 'bg-[var(--accent)] text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >{d} ({lessons.filter(l => l.domain === d).length})</button>
            ))}
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredLessons.map(l => (
              <div key={l.id} className={`rounded-lg border p-3 ${
                l.level === 3 ? 'border-purple-800/50 bg-purple-950/10' : 'border-zinc-800/50 bg-zinc-900/30'
              }`}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${levelColors[l.level] || 'text-zinc-400 bg-zinc-800'}`}>
                    {levelLabels[l.level] || '?'}
                  </span>
                  <span className="text-[10px] text-zinc-600">{l.domain}</span>
                  <span className="text-[10px] text-zinc-600">{(l.confidence * 100).toFixed(0)}%</span>
                  <span className="text-[10px] text-zinc-700">{l.observedCount}회 관찰</span>
                  {l.level === 3 && <span className="text-[10px] text-purple-400 font-medium">원칙 승격</span>}
                  <span className="text-[10px] text-zinc-700 ml-auto">{new Date(l.updatedAt).toLocaleDateString('ko-KR')}</span>
                </div>
                <p className="text-xs text-zinc-300">{l.pattern}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{l.observation.split('\n')[0]}</p>
              </div>
            ))}
            {filteredLessons.length === 0 && (
              <p className="text-sm text-zinc-600 text-center py-8">아직 사이클 교훈이 없습니다. routine-cycle이 실행되면 자동으로 축적됩니다.</p>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Prediction Calibration */}
      {tab === '예측 보정' && (
        <div>
          {goalEntries.length === 0 ? (
            <p className="text-sm text-zinc-600 text-center py-8">보정 데이터가 아직 없습니다. routine-cycle이 실행되면 자동으로 수집됩니다.</p>
          ) : (
            <div className="space-y-4">
              {goalEntries.map(([name, g]) => {
                const biasColor = Math.abs(g.bias) < 3 ? 'text-green-400' : Math.abs(g.bias) < 8 ? 'text-yellow-400' : 'text-red-400'
                const biasLabel = g.bias > 0.5 ? '과대추정' : g.bias < -0.5 ? '과소추정' : '정확'
                const maxError = Math.max(1, ...g.errorHistory.map(Math.abs))
                return (
                  <div key={name} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-zinc-200">{name}</h3>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium ${biasColor}`}>{biasLabel}</span>
                        <span className={`text-lg font-bold ${biasColor}`}>{g.bias > 0 ? '+' : ''}{g.bias.toFixed(1)}</span>
                      </div>
                    </div>

                    {/* Last prediction vs actual */}
                    <div className="flex gap-4 mb-3 text-xs text-zinc-500">
                      <span>마지막 예측: <strong className="text-zinc-300">{g.lastPredicted ?? '-'}%</strong></span>
                      <span>실제: <strong className="text-zinc-300">{g.lastActual ?? '-'}%</strong></span>
                    </div>

                    {/* Error history bar chart */}
                    {g.errorHistory.length > 0 && (
                      <div className="flex items-end gap-1 h-12">
                        {g.errorHistory.map((err, i) => {
                          const height = Math.abs(err) / maxError * 100
                          const color = err > 0 ? 'bg-red-500/60' : 'bg-blue-500/60'
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full relative">
                              {err > 0 ? (
                                <div className={`w-full rounded-t ${color}`} style={{ height: `${height}%` }} />
                              ) : (
                                <>
                                  <div className="flex-1" />
                                  <div className={`w-full rounded-b ${color}`} style={{ height: `${height}%` }} />
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {g.errorHistory.length > 0 && (
                      <div className="flex justify-between text-[9px] text-zinc-700 mt-1">
                        <span>과거</span>
                        <span className="text-zinc-600">빨강=과대추정 / 파랑=과소추정</span>
                        <span>최근</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Prompt Evolution */}
      {tab === '프롬프트' && (
        <div>
          {/* Active prompt */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-zinc-200">현재 활성 프롬프트</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-600">{apiData?.activePromptLength ?? 0}자</span>
                <button
                  onClick={() => setShowPrompt(!showPrompt)}
                  className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
                >{showPrompt ? '접기' : '펼치기'}</button>
              </div>
            </div>
            {showPrompt && (
              <pre className="text-[11px] text-zinc-400 bg-zinc-950 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                {apiData?.activePrompt || '로딩 중...'}
              </pre>
            )}
          </div>

          {/* Changelog */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <h3 className="text-sm font-medium text-zinc-200 mb-3">변경 이력</h3>
            {(apiData?.changelog.length ?? 0) === 0 ? (
              <p className="text-sm text-zinc-600 text-center py-4">아직 프롬프트 변경 이력이 없습니다.</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {apiData?.changelog.map((c, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 border-b border-zinc-800/50 last:border-0">
                    <div className="w-2 h-2 rounded-full bg-[var(--accent)] mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-300">{c.reason}</p>
                      <p className="text-[10px] text-zinc-600">{new Date(c.timestamp).toLocaleString('ko-KR')} · {c.promptLength}자</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Versions */}
          {(apiData?.promptVersions.length ?? 0) > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 mt-4">
              <h3 className="text-sm font-medium text-zinc-200 mb-3">백업 버전</h3>
              <div className="space-y-1">
                {apiData?.promptVersions.map((v, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 text-xs text-zinc-500">
                    <span>{v.filename}</span>
                    <span>{v.date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
