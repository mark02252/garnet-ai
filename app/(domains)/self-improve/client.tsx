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

type SubReasonerData = {
  analysis?: { insights: Array<{ finding: string; significance: string; dataEvidence: string }> }
  content?: { contentIdeas: Array<{ concept: string; rationale: string; format: string }> }
  strategy?: { strategicDirections: Array<{ direction: string; timeframe: string; reasoning: string }> }
  generatedAt?: string
}

type ApiData = {
  calibration: { goals: Record<string, GoalCalibration> }
  promptVersions: Array<{ filename: string; date: string }>
  changelog: ChangelogEntry[]
  activePrompt: string
  activePromptLength: number
  subReasoners?: SubReasonerData | null
}

const levelLabels: Record<number, string> = { 1: 'Fact', 2: 'Pattern', 3: 'Principle' }
const levelColors: Record<number, string> = { 2: 'text-blue-400 bg-blue-900/30', 3: 'text-purple-400 bg-purple-900/30' }
const tabs = ['전문가 분석', '교훈', '예측 보정', '프롬프트'] as const
type Tab = typeof tabs[number]

export function SelfImproveClient({ lessons, totalLessons, principleCount, domains }: {
  lessons: Lesson[]; totalLessons: number; principleCount: number; domains: string[]
}) {
  const [tab, setTab] = useState<Tab>('전문가 분석')
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

      {/* Tab 0: Expert Analysis (Sub-Reasoners) */}
      {tab === '전문가 분석' && (
        <div>
          {apiData?.subReasoners ? (
            <div>
              {apiData.subReasoners.generatedAt && (
                <p className="text-xs text-zinc-500 mb-4">
                  마지막 분석: {new Date(apiData.subReasoners.generatedAt).toLocaleString('ko-KR')}
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Analysis */}
                <div className="rounded-xl border border-blue-900/30 bg-blue-950/10 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">📊</span>
                    <h3 className="text-sm font-semibold text-blue-300">데이터 분석가</h3>
                  </div>
                  <p className="text-[10px] text-zinc-500 mb-3">숫자 뒤의 의미를 찾는 전문가</p>
                  {apiData.subReasoners.analysis?.insights.length ? (
                    <div className="space-y-3">
                      {apiData.subReasoners.analysis.insights.map((i, idx) => {
                        const sigColor = i.significance === 'high' ? 'text-red-400' : i.significance === 'medium' ? 'text-yellow-400' : 'text-zinc-400'
                        return (
                          <div key={idx} className="border-t border-zinc-800 pt-2 first:border-0 first:pt-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] font-medium ${sigColor}`}>{i.significance.toUpperCase()}</span>
                            </div>
                            <p className="text-xs text-zinc-200">{i.finding}</p>
                            {i.dataEvidence && (
                              <p className="text-[11px] text-zinc-500 mt-1">근거: {i.dataEvidence}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-600">분석 결과 없음</p>
                  )}
                </div>

                {/* Content */}
                <div className="rounded-xl border border-purple-900/30 bg-purple-950/10 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">🎬</span>
                    <h3 className="text-sm font-semibold text-purple-300">콘텐츠 전략가</h3>
                  </div>
                  <p className="text-[10px] text-zinc-500 mb-3">브랜드와 트렌드를 연결</p>
                  {apiData.subReasoners.content?.contentIdeas.length ? (
                    <div className="space-y-3">
                      {apiData.subReasoners.content.contentIdeas.map((c, idx) => (
                        <div key={idx} className="border-t border-zinc-800 pt-2 first:border-0 first:pt-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300">
                              {c.format}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-200">{c.concept}</p>
                          <p className="text-[11px] text-zinc-500 mt-1">{c.rationale}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-600">제안 없음</p>
                  )}
                </div>

                {/* Strategy */}
                <div className="rounded-xl border border-green-900/30 bg-green-950/10 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">🧭</span>
                    <h3 className="text-sm font-semibold text-green-300">마케팅 전략가</h3>
                  </div>
                  <p className="text-[10px] text-zinc-500 mb-3">경쟁/거시 환경에서 기회 포착</p>
                  {apiData.subReasoners.strategy?.strategicDirections.length ? (
                    <div className="space-y-3">
                      {apiData.subReasoners.strategy.strategicDirections.map((s, idx) => {
                        const tfLabel = s.timeframe === 'immediate' ? '즉시' : s.timeframe === 'short_term' ? '단기' : '중기'
                        const tfColor = s.timeframe === 'immediate' ? 'bg-red-900/40 text-red-300' : s.timeframe === 'short_term' ? 'bg-yellow-900/40 text-yellow-300' : 'bg-zinc-800 text-zinc-400'
                        return (
                          <div key={idx} className="border-t border-zinc-800 pt-2 first:border-0 first:pt-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${tfColor}`}>{tfLabel}</span>
                            </div>
                            <p className="text-xs text-zinc-200">{s.direction}</p>
                            <p className="text-[11px] text-zinc-500 mt-1">{s.reasoning}</p>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-600">전략 없음</p>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
                <p className="text-xs text-zinc-400">
                  💡 이 3명의 전문가(Sub-Reasoner)가 병렬로 분석한 결과를 메인 Reasoner가 종합하여 최종 액션을 결정합니다.
                  매 routine-cycle마다 재생성됩니다.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-600 text-center py-8">
              아직 Sub-Reasoner 분석 결과가 없습니다. routine-cycle이 실행되면 자동으로 생성됩니다.
            </p>
          )}
        </div>
      )}

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
