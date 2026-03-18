'use client'

import { useEffect, useState } from 'react'
import { loadStoredMetaConnectionDraft } from '@/lib/meta-connection-storage'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

type Snapshot = {
  id: string; date: string; reach: number; impressions: number
  engagement: number; followers: number; postCount: number
}
type Persona = { id: string; name: string }

type ReportTopPost = {
  postId: string; reach: number; engagementRate: number; whyGood: string
  caption?: string; permalink?: string
}
type ReportRecommendation = {
  topic: string; contentType: string; suggestedCaption: string; reason: string
}
type ReportAdSuggestion = {
  postId?: string; reason: string; suggestedBudget: number; expectedReach: number
}
type ReportPatterns = {
  bestTimeSlots: string[]; bestContentTypes: string[]; insights: string[]
}
type Report = {
  id: string; personaId: string; createdAt: string
  summary: { totalReach: number; avgEngagementRate: number; trend: string }
  topPosts: ReportTopPost[]
  lowPosts: ReportTopPost[]
  patterns: ReportPatterns
  recommendations: ReportRecommendation[]
  adSuggestions: ReportAdSuggestion[]
}

export default function AnalyticsPage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [personaId, setPersonaId] = useState('')
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [syncing, setSyncing] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatAnswer, setChatAnswer] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reachDaily, setReachDaily] = useState<Array<{ date: string; reach: number }>>([])
  const [days, setDays] = useState(30)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sns/personas').then(r => r.json()).then((data: Persona[]) => {
      setPersonas(data)
      if (data.length > 0) setPersonaId(data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!personaId) return
    fetch(`/api/sns/analytics?personaId=${personaId}&days=${days}`)
      .then(r => r.json()).then(setSnapshots)

    // Load latest report for persona
    fetch(`/api/sns/analytics/report?personaId=${personaId}`)
      .then(r => { if (r.ok) return r.json(); throw new Error('no report') })
      .then(data => setReport(data.report ?? null))
      .catch(() => setReport(null))

    // Load InstagramReachDaily as fallback for reach chart
    void (async () => {
      try {
        const draft = await loadStoredMetaConnectionDraft(window.location.origin)
        const accountId = draft.value.instagramBusinessAccountId || ''
        const accessToken = draft.value.accessToken || ''
        if (accountId) {
          const res = await fetch('/api/dashboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ days, accountId, accessToken, personaId }),
          })
          if (res.ok) {
            const data = await res.json()
            if (data.reachDaily?.length > 0) setReachDaily(data.reachDaily)
            if (data.lastSyncAt) setLastSyncAt(data.lastSyncAt)
          }
        }
      } catch {}
    })()
  }, [personaId, days])

  // reach fallback: SnsAnalyticsSnapshot에 reach=0이면 InstagramReachDaily 사용
  const hasSnapshotReach = snapshots.some(s => s.reach > 0)
  const effectiveReachData = hasSnapshotReach
    ? snapshots.map(s => ({ date: s.date.slice(0, 10), reach: s.reach }))
    : reachDaily
  const totalReach = hasSnapshotReach
    ? snapshots.reduce((s, n) => s + n.reach, 0)
    : reachDaily.reduce((s, n) => s + n.reach, 0)
  const avgEngagement = snapshots.length
    ? (snapshots.reduce((s, n) => s + n.engagement, 0) / snapshots.length).toFixed(1)
    : '0'
  const latestFollowers = snapshots.at(-1)?.followers ?? 0
  const totalPosts = snapshots.reduce((s, n) => s + n.postCount, 0)

  async function handleSync() {
    if (!personaId) return
    setSyncing(true)
    const draft = await loadStoredMetaConnectionDraft(window.location.origin)
    const accessToken = draft.value.accessToken || ''
    const businessAccountId = draft.value.instagramBusinessAccountId || ''
    await fetch('/api/sns/analytics/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personaId, accessToken, businessAccountId }),
    })
    // InstagramReachDaily도 동기화
    if (accessToken && businessAccountId) {
      await fetch('/api/instagram/reach/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lookbackDays: days, accessToken, instagramBusinessAccountId: businessAccountId,
          graphApiVersion: 'v25.0', connectionMode: 'instagram_login',
        }),
      }).catch(() => {})
    }
    const updated = await fetch(`/api/sns/analytics?personaId=${personaId}&days=${days}`).then(r => r.json())
    setSnapshots(updated)
    // Reach fallback: InstagramReachDaily 데이터로 보완
    if (businessAccountId) {
      try {
        const dashRes = await fetch('/api/dashboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days, accountId: businessAccountId, accessToken, personaId }),
        })
        if (dashRes.ok) {
          const dashData = await dashRes.json()
          if (dashData.reachDaily?.length > 0) setReachDaily(dashData.reachDaily)
          if (dashData.lastSyncAt) setLastSyncAt(dashData.lastSyncAt)
        }
      } catch {}
    }
    setLastSyncAt(new Date().toISOString())
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

  async function handleGenerateReport() {
    if (!personaId) return
    setReportLoading(true)
    try {
      const draft = await loadStoredMetaConnectionDraft(window.location.origin)
      const accessToken = draft.value.accessToken || ''
      const businessAccountId = draft.value.instagramBusinessAccountId || ''
      const res = await fetch('/api/sns/analytics/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId, accessToken, businessAccountId }),
      })
      if (res.ok) {
        const data = await res.json()
        setReport(data.report ?? data)
      }
    } catch {
      /* ignore */
    } finally {
      setReportLoading(false)
    }
  }

  async function handleCreateFromRecommendation(rec: { topic: string; contentType: string; suggestedCaption: string }) {
    const res = await fetch('/api/sns/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personaId,
        type: rec.contentType,
        prompt: `${rec.topic}\n\n${rec.suggestedCaption}`,
      }),
    })
    if (res.ok) {
      const draft = await res.json()
      window.location.href = `/sns/studio/${draft.id}`
    }
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
          <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
            {([7, 30, 90] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  days === d
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface-sub)] text-[var(--text-muted)] hover:text-[var(--text-strong)]'
                }`}
                onClick={() => setDays(d)}
              >
                {d}일
              </button>
            ))}
          </div>
          {lastSyncAt && (
            <p className="text-xs text-[var(--text-muted)]">
              마지막 동기화: {(() => {
                try {
                  return new Intl.DateTimeFormat('ko-KR', {
                    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
                  }).format(new Date(lastSyncAt))
                } catch { return lastSyncAt }
              })()}
            </p>
          )}
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

      {/* 도달수 추이 라인 차트 */}
      {effectiveReachData.length > 0 && (
        <div className="card mb-6">
          <p className="section-title mb-3">도달수 추이 (최근 {days}일)</p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={effectiveReachData.slice(-days)} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={50} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, fontSize: 12 }}
                formatter={(value) => [Number(value).toLocaleString(), '일별 도달']}
              />
              <Line type="monotone" dataKey="reach" stroke="#3182f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* AI 디스커션 */}
      <div className="card mb-6">
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

      {/* AI 성과 리포트 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <p className="section-title">AI 성과 리포트</p>
          <button className="button-primary" onClick={handleGenerateReport} disabled={reportLoading}>
            {reportLoading ? '생성 중...' : 'AI 성과 리포트 생성'}
          </button>
        </div>

        {report && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="status-tile">
                <p className="metric-label">총 도달</p>
                <p className="mt-2 text-lg font-bold text-[var(--text-strong)]">
                  {report.summary.totalReach.toLocaleString()}
                </p>
              </div>
              <div className="status-tile">
                <p className="metric-label">평균 참여율</p>
                <p className="mt-2 text-lg font-bold text-[var(--text-strong)]">
                  {report.summary.avgEngagementRate}%
                </p>
              </div>
              <div className="status-tile">
                <p className="metric-label">추세</p>
                <p className="mt-2 text-lg font-bold text-[var(--text-strong)]">
                  {report.summary.trend}
                </p>
              </div>
            </div>

            {/* Top 게시물 */}
            {report.topPosts.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-[var(--text-strong)] mb-3">Top 게시물</p>
                <div className="space-y-2">
                  {report.topPosts.map((post, i) => (
                    <div key={i} className="list-card">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-[var(--text-strong)]">
                          {post.caption ? post.caption.slice(0, 60) + (post.caption.length > 60 ? '...' : '') : `게시물 #${i + 1}`}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="accent-pill">도달 {post.reach.toLocaleString()}</span>
                          <span className="accent-pill">참여율 {post.engagementRate}%</span>
                        </div>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-1">{post.whyGood}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 추천 콘텐츠 */}
            {report.recommendations.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-[var(--text-strong)] mb-3">추천 콘텐츠</p>
                <div className="space-y-2">
                  {report.recommendations.map((rec, i) => (
                    <div key={i} className="list-card">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-strong)]">{rec.topic}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1">{rec.reason}</p>
                        </div>
                        <button
                          className="button-secondary text-xs whitespace-nowrap"
                          onClick={() => handleCreateFromRecommendation(rec)}
                        >
                          이 추천으로 콘텐츠 만들기
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 광고 예산 제안 */}
            {report.adSuggestions.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-[var(--text-strong)] mb-3">광고 예산 제안</p>
                <div className="space-y-2">
                  {report.adSuggestions.map((ad, i) => (
                    <div key={i} className="list-card">
                      <p className="text-sm text-[var(--text-strong)]">{ad.reason}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="accent-pill">예산 ₩{ad.suggestedBudget.toLocaleString()}</span>
                        <span className="accent-pill">예상 도달 {ad.expectedReach.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 패턴 인사이트 */}
            {report.patterns && (
              <div>
                <p className="text-sm font-semibold text-[var(--text-strong)] mb-3">패턴 인사이트</p>
                <div className="soft-panel">
                  {report.patterns.bestTimeSlots.length > 0 && (
                    <p className="text-sm text-[var(--text-base)] mb-2">
                      <span className="font-medium">최적 시간대:</span>{' '}
                      {report.patterns.bestTimeSlots.join(', ')}
                    </p>
                  )}
                  {report.patterns.bestContentTypes.length > 0 && (
                    <p className="text-sm text-[var(--text-base)] mb-2">
                      <span className="font-medium">콘텐츠 유형:</span>{' '}
                      {report.patterns.bestContentTypes.join(', ')}
                    </p>
                  )}
                  {report.patterns.insights.length > 0 && (
                    <ul className="text-sm text-[var(--text-muted)] space-y-1 mt-2">
                      {report.patterns.insights.map((ins, i) => (
                        <li key={i}>• {ins}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs text-[var(--text-muted)] text-right">
              생성: {new Date(report.createdAt).toLocaleString('ko-KR')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
