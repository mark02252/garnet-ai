'use client'

import { useEffect, useState } from 'react'
import { loadStoredMetaConnectionDraft } from '@/lib/meta-connection-storage'

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

    // Load latest report for persona
    fetch(`/api/sns/analytics/report?personaId=${personaId}`)
      .then(r => { if (r.ok) return r.json(); throw new Error('no report') })
      .then(data => setReport(data.report ?? null))
      .catch(() => setReport(null))
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
