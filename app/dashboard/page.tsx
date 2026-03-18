'use client'

import { useEffect, useState } from 'react'
import { loadStoredMetaConnectionDraft } from '@/lib/meta-connection-storage'
import { ReachChart } from '@/components/dashboard/reach-chart'
import { FollowerChart } from '@/components/dashboard/follower-chart'
import { TopPosts } from '@/components/dashboard/top-posts'

type KpiGoal = {
  id: string; title: string; metric: string; targetValue: number;
  currentValue: number; unit: string; updatedAt: string;
}
type ReachPoint = { date: string; reach: number }
type FollowerPoint = { date: string; followers: number }
type TopPost = {
  id: string; timestamp: string; reach: number;
  caption?: string; media_type?: string; permalink?: string;
}
type DashboardData = {
  kpiGoals: KpiGoal[]
  reachDaily: ReachPoint[]
  followerTrend: FollowerPoint[]
  topPosts: TopPost[]
  lastSyncAt: string | null
}

function formatSyncTime(iso: string | null) {
  if (!iso) return '동기화 기록 없음'
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(iso))
  } catch { return iso }
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [report, setReport] = useState<any>(null)

  useEffect(() => {
    void (async () => {
      try {
        const draft = await loadStoredMetaConnectionDraft(window.location.origin)
        const accountId = draft.value.instagramBusinessAccountId || ''
        const accessToken = draft.value.accessToken || ''

        let personaId = ''
        try {
          const pRes = await fetch('/api/sns/personas')
          if (pRes.ok) {
            const personas = await pRes.json() as Array<{ id: string; instagramHandle?: string | null }>
            const linked = personas.find((p) => p.instagramHandle)
            if (linked) personaId = linked.id
          }
        } catch { /* ignore */ }

        const res = await fetch('/api/dashboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days: 30, accountId, accessToken, personaId }),
        })
        if (!res.ok) throw new Error('API 오류')
        const json = await res.json() as DashboardData
        setData(json)

        if (personaId) {
          try {
            const reportRes = await fetch(`/api/sns/analytics/report?personaId=${personaId}`)
            if (reportRes.ok) {
              const reportData = await reportRes.json()
              setReport(reportData.report)
            }
          } catch { /* ignore */ }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '대시보드 데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-[var(--text-muted)]">대시보드를 불러오는 중...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <p className="text-sm text-rose-700">{error || '데이터를 불러오지 못했습니다.'}</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="dashboard-eyebrow">Garnet</p>
          <h1 className="dashboard-title">마케팅 대시보드</h1>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          마지막 동기화: {formatSyncTime(data.lastSyncAt)}
        </p>
      </div>

      {data.kpiGoals.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {data.kpiGoals.map((kpi) => {
            const pct = kpi.targetValue > 0 ? Math.round((kpi.currentValue / kpi.targetValue) * 100) : 0
            return (
              <div key={kpi.id} className="status-tile">
                <p className="metric-label">{kpi.title}</p>
                <p className="mt-2 text-lg font-bold text-[var(--text-strong)]">
                  {kpi.currentValue.toLocaleString()}{kpi.unit ? ` ${kpi.unit}` : ''}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  목표 {kpi.targetValue.toLocaleString()}{kpi.unit ? ` ${kpi.unit}` : ''} · {pct}%
                </p>
                <div className="mt-2 h-1.5 rounded-full bg-[var(--surface-sub)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="soft-panel">
          <p className="text-sm text-[var(--text-muted)]">
            KPI 목표를 설정하세요.{' '}
            <a href="/goals" className="text-[var(--accent)] underline">KPI 관리 →</a>
          </p>
        </div>
      )}

      <ReachChart data={data.reachDaily} />

      <div className="grid gap-6 lg:grid-cols-2">
        <TopPosts posts={data.topPosts} />
        <FollowerChart data={data.followerTrend} />
      </div>

      <div className="panel">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-[var(--text-strong)]">AI 성과 추천</p>
          <a href="/sns/analytics" className="text-xs text-[var(--accent)] underline">전체 리포트 보기 →</a>
        </div>
        {report?.recommendations?.length > 0 ? (
          <div className="space-y-2">
            {report.recommendations.slice(0, 3).map((rec: any, i: number) => (
              <div key={i} className="soft-panel">
                <p className="text-sm font-medium text-[var(--text-strong)]">{rec.topic}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{rec.reason}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            SNS 분석 페이지에서 AI 리포트를 생성하면 추천 콘텐츠가 여기에 표시됩니다.
          </p>
        )}
      </div>
    </div>
  )
}
