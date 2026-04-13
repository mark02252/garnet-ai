'use client'

import { useEffect, useState } from 'react'

type FunnelStage = {
  eventName: string
  label: string
  count: number
  dropRate: number
  continueRate: number
}

type FunnelData = {
  configured: boolean
  days: number
  stages: FunnelStage[]
}

export function FunnelSection() {
  const [data, setData] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/ga4/funnel?days=${days}`)
      .then(r => r.json())
      .then(d => { if (d.configured) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [days])

  if (loading) return <div className="animate-pulse h-64 rounded-xl bg-zinc-900/50 mb-6" />
  if (!data || data.stages.every(s => s.count === 0)) return null

  const maxCount = Math.max(...data.stages.map(s => s.count))
  const firstStageCount = data.stages.find(s => s.count > 0)?.count ?? 0
  const lastStageCount = data.stages[data.stages.length - 1]?.count ?? 0
  const overallConversion = firstStageCount > 0 ? (lastStageCount / firstStageCount) * 100 : 0

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-[var(--accent-text)] mb-1">Purchase Funnel</p>
          <h2 className="text-lg font-semibold text-zinc-100">구매 여정 이탈률</h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
          >
            <option value={7}>최근 7일</option>
            <option value={14}>최근 14일</option>
            <option value={30}>최근 30일</option>
          </select>
        </div>
      </div>

      {/* 전체 전환율 요약 */}
      <div className="flex items-center gap-6 mb-6 pb-4 border-b border-zinc-800">
        <div>
          <div className="text-xs text-zinc-500 mb-0.5">전체 전환율</div>
          <div className="text-2xl font-bold text-zinc-100">
            {overallConversion.toFixed(2)}<span className="text-base text-zinc-500 ml-1">%</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500 mb-0.5">시작 지점</div>
          <div className="text-sm text-zinc-300">{firstStageCount.toLocaleString()}회</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500 mb-0.5">최종 구매</div>
          <div className="text-sm text-green-400">{lastStageCount.toLocaleString()}회</div>
        </div>
      </div>

      {/* 퍼널 단계별 */}
      <div className="space-y-3">
        {data.stages.map((stage, i) => {
          const width = maxCount > 0 ? (stage.count / maxCount) * 100 : 0
          const isFirst = i === 0
          const isLast = i === data.stages.length - 1
          const dropPercent = stage.dropRate * 100
          const continuePercent = stage.continueRate * 100
          const hasData = stage.count > 0
          const prevHadData = i > 0 && data.stages[i - 1].count > 0

          return (
            <div key={stage.eventName}>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-400 shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-sm font-medium text-zinc-200 truncate">{stage.label}</span>
                      <span className="text-[10px] text-zinc-600 shrink-0">{stage.eventName}</span>
                    </div>
                    <span className="text-sm font-semibold text-zinc-300 shrink-0">
                      {stage.count.toLocaleString()}회
                    </span>
                  </div>
                  <div className="mt-1 h-6 bg-zinc-800 rounded overflow-hidden relative">
                    <div
                      className={`h-full rounded ${hasData ? 'bg-gradient-to-r from-[var(--accent)]/80 to-[var(--accent)]' : 'bg-zinc-700'}`}
                      style={{ width: `${Math.max(width, hasData ? 2 : 0)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 이탈률 표시 (첫 단계 제외) */}
              {!isFirst && prevHadData && hasData && (
                <div className="ml-11 flex items-center gap-3 text-[11px] mb-1">
                  <span className="text-zinc-600">이전 단계 대비:</span>
                  <span className="text-green-500">▲ 진행 {continuePercent.toFixed(1)}%</span>
                  <span className="text-red-500">▼ 이탈 {dropPercent.toFixed(1)}%</span>
                </div>
              )}
              {!isFirst && !hasData && prevHadData && (
                <div className="ml-11 text-[11px] text-yellow-600 mb-1">
                  ⚠️ 데이터 없음 (GTM 반영 지연 또는 미세팅)
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 안내 */}
      <p className="text-[10px] text-zinc-600 mt-4">
        GA4 Data API는 24~48시간 지연이 있어 최근 이벤트는 아직 반영되지 않을 수 있습니다.
      </p>
    </section>
  )
}
