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
type Persona = { id: string; name: string; instagramHandle?: string | null }

type DashboardTopPost = {
  id: string; timestamp: string; reach: number;
  caption?: string; media_type?: string; permalink?: string;
  like_count?: number; comments_count?: number;
}
type BestTimeSlot = { day: string; hour: string; count: number }
type ContentTypeStat = { type: string; label: string; avgReach: number; count: number }

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
  const [dashTopPosts, setDashTopPosts] = useState<DashboardTopPost[]>([])
  const [currentFollowers, setCurrentFollowers] = useState(0)
  const [bestTimes, setBestTimes] = useState<BestTimeSlot[]>([])
  const [contentTypeStats, setContentTypeStats] = useState<ContentTypeStat[]>([])
  const [isConnected, setIsConnected] = useState(false)

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

    // Load InstagramReachDaily + dashboard data as fallback for reach chart
    void (async () => {
      try {
        const draft = await loadStoredMetaConnectionDraft(window.location.origin)
        const accountId = draft.value.instagramBusinessAccountId || ''
        const accessToken = draft.value.accessToken || ''
        setIsConnected(!!accountId && !!accessToken)
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
            if (data.topPosts) setDashTopPosts(data.topPosts)
            if (data.currentFollowers) setCurrentFollowers(data.currentFollowers)

            // Compute content type stats from topPosts
            if (data.topPosts?.length > 0) {
              const byType = new Map<string, { totalReach: number; count: number }>()
              for (const p of data.topPosts as DashboardTopPost[]) {
                const t = p.media_type || 'IMAGE'
                const cur = byType.get(t) || { totalReach: 0, count: 0 }
                cur.totalReach += p.reach
                cur.count += 1
                byType.set(t, cur)
              }
              const labels: Record<string, string> = { IMAGE: '이미지', VIDEO: '영상', CAROUSEL_ALBUM: '캐러셀' }
              const stats: ContentTypeStat[] = Array.from(byType.entries()).map(([type, v]) => ({
                type,
                label: labels[type] || type,
                avgReach: Math.round(v.totalReach / v.count),
                count: v.count,
              })).sort((a, b) => b.avgReach - a.avgReach)
              setContentTypeStats(stats)
            }
          }
        }
      } catch {}
    })()

    // Load best posting times
    fetch(`/api/sns/analytics/best-time?personaId=${personaId}`)
      .then(r => { if (r.ok) return r.json(); return [] })
      .then((data: BestTimeSlot[]) => setBestTimes(data))
      .catch(() => setBestTimes([]))
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

      {/* 계정 개요 */}
      {personaId && (() => {
        const currentPersona = personas.find(p => p.id === personaId)
        return (
          <div className="card mb-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {(currentPersona?.name || 'P')[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-[var(--text-strong)]">
                  {currentPersona?.instagramHandle ? `@${currentPersona.instagramHandle.replace(/^@/, '')}` : currentPersona?.name || ''}
                </p>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  isConnected
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                  {isConnected ? '연결됨' : '미연결'}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-[var(--text-muted)]">
                {(currentFollowers > 0 || latestFollowers > 0) && (
                  <span>팔로워 {(currentFollowers || latestFollowers).toLocaleString()}</span>
                )}
                {lastSyncAt && (
                  <span>마지막 동기화: {(() => {
                    try {
                      return new Intl.DateTimeFormat('ko-KR', {
                        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
                      }).format(new Date(lastSyncAt))
                    } catch { return lastSyncAt }
                  })()}</span>
                )}
              </div>
            </div>
          </div>
        )
      })()}

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

      {/* 콘텐츠 유형별 성과 비교 */}
      {contentTypeStats.length > 0 && (
        <div className="card mb-6">
          <p className="section-title mb-3">콘텐츠 유형별 평균 도달</p>
          <div className="space-y-3">
            {(() => {
              const maxReach = Math.max(...contentTypeStats.map(s => s.avgReach), 1)
              return contentTypeStats.map(stat => (
                <div key={stat.type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-[var(--text-base)]">{stat.label}</span>
                    <span className="text-sm font-semibold text-[var(--text-strong)]">
                      {stat.avgReach.toLocaleString()} <span className="text-xs font-normal text-[var(--text-muted)]">({stat.count}건)</span>
                    </span>
                  </div>
                  <div className="w-full h-5 bg-[var(--surface-sub)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.round((stat.avgReach / maxReach) * 100)}%`,
                        background: stat.type === 'VIDEO' ? '#8b5cf6' : stat.type === 'CAROUSEL_ALBUM' ? '#f59e0b' : '#3182f6',
                      }}
                    />
                  </div>
                </div>
              ))
            })()}
          </div>
        </div>
      )}

      {/* 최적 게시 시간 + 인게이지먼트 요약 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* 최적 게시 시간 */}
        <div className="card">
          <p className="section-title mb-3">최적 게시 시간</p>
          {bestTimes.length > 0 ? (
            <div className="space-y-2">
              {bestTimes.map((slot, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-[var(--surface-border)] last:border-0">
                  <span className="text-lg font-bold text-[var(--accent)] w-6 text-center">{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--text-strong)]">{slot.day}요일 {slot.hour}</p>
                    <p className="text-xs text-[var(--text-muted)]">{slot.count}회 게시</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">발행된 게시물이 쌓이면 최적 시간대가 표시됩니다.</p>
          )}
        </div>

        {/* 인게이지먼트율 상세 */}
        <div className="card">
          <p className="section-title mb-3">인게이지먼트율</p>
          <div className="flex items-end gap-2 mb-2">
            <p className="text-3xl font-bold text-[var(--text-strong)]">{avgEngagement}%</p>
            <p className="text-xs text-[var(--text-muted)] pb-1">평균</p>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
              <span>업계 평균 (1~3%)</span>
              <span>{Number(avgEngagement) >= 3 ? '우수' : Number(avgEngagement) >= 1 ? '양호' : '개선 필요'}</span>
            </div>
            <div className="w-full h-3 bg-[var(--surface-sub)] rounded-full overflow-hidden relative">
              {/* Industry range marker 1-3% */}
              <div className="absolute h-full bg-emerald-200/40 dark:bg-emerald-800/30 rounded-full"
                style={{ left: '10%', width: '20%' }} />
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(Number(avgEngagement) * 10, 100)}%`,
                  background: Number(avgEngagement) >= 3 ? '#10b981' : Number(avgEngagement) >= 1 ? '#3182f6' : '#f59e0b',
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1">
              <span>0%</span><span>5%</span><span>10%</span>
            </div>
          </div>
          {snapshots.length >= 2 && (() => {
            const recent = snapshots.slice(-Math.ceil(snapshots.length / 2))
            const older = snapshots.slice(0, Math.ceil(snapshots.length / 2))
            const recentAvg = recent.reduce((s, n) => s + n.engagement, 0) / recent.length
            const olderAvg = older.reduce((s, n) => s + n.engagement, 0) / older.length
            const diff = recentAvg - olderAvg
            return (
              <p className="text-xs text-[var(--text-muted)] mt-3">
                기간 전반 대비 {diff >= 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(1)}%p{' '}
                {diff >= 0 ? '상승' : '하락'} 추세
              </p>
            )
          })()}
        </div>
      </div>

      {/* Top 게시물 (상세) */}
      {dashTopPosts.length > 0 && (
        <div className="card mb-6">
          <p className="section-title mb-3">Top 게시물</p>
          <div className="space-y-2">
            {dashTopPosts.map((post, i) => {
              const typeLabel = post.media_type === 'VIDEO' ? '영상' : post.media_type === 'CAROUSEL_ALBUM' ? '캐러셀' : '이미지'
              const dateStr = (() => {
                try { return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(new Date(post.timestamp)) }
                catch { return post.timestamp.slice(5, 10) }
              })()
              return (
                <div key={post.id} className="flex items-start gap-3 py-3 border-b border-[var(--surface-border)] last:border-0">
                  <span className="text-sm font-bold text-[var(--accent)] w-5 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-base)] line-clamp-2">{post.caption?.slice(0, 80) || '(캡션 없음)'}{post.caption && post.caption.length > 80 ? '...' : ''}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface-sub)] text-[var(--text-muted)]">{typeLabel}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{dateStr}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-sm font-semibold text-[var(--text-strong)]">도달 {post.reach.toLocaleString()}</p>
                    {post.like_count != null && (
                      <p className="text-[11px] text-[var(--text-muted)]">♥ {post.like_count}{post.comments_count ? ` · 댓글 ${post.comments_count}` : ''}</p>
                    )}
                    {post.permalink && (
                      <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--accent)] hover:underline">보기</a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
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
