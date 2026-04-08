'use client'

import { useEffect, useState } from 'react'
import { loadStoredMetaConnectionDraft, saveStoredMetaConnectionDraft } from '@/lib/meta-connection-storage'
import { ensureValidToken, type TokenStatus } from '@/lib/meta-token-manager'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { formatChartTick, formatCompactNumber } from '@/lib/format-number'
import { InstagramLoginButton } from '@/components/instagram-login-button'

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
  mediaId: string
  caption: string
  reach: number
  engagement: number
  mediaType: string
  timestamp: string
  whyGood: string
}
type ReportLowPost = {
  mediaId: string
  caption: string
  reach: number
  mediaType: string
  improvementTip: string
}
type ReportRecommendation = {
  topic: string
  contentType: 'TEXT' | 'CAROUSEL'
  suggestedCaption: string
  reason: string
  suggestedHashtags?: string[]
}
type ReportAdSuggestion = {
  targetPostDescription: string
  suggestedBudget: string
  expectedEffect: string
  objective: string
}
type ReportPatterns = {
  bestPostingTimes: string[] | string
  bestContentType: string
  topHashtags: string[] | string
  topKeywords: string[]
  audienceInsight: string
  savesInsight?: string
  sharesInsight?: string
  videoInsight?: string
}
type Report = {
  id: string
  personaId: string
  createdAt: string
  summary: {
    period: string
    totalReach: number
    avgReach: number
    reachChange: number
    totalEngagement: number
    avgEngagementRate: number
    trendDirection: 'UP' | 'DOWN' | 'FLAT'
    totalSaved?: number
    totalShares?: number
    profileViews?: number
    websiteClicks?: number
    followerCount?: number
  }
  topPosts: ReportTopPost[]
  lowPosts: ReportLowPost[]
  patterns: ReportPatterns
  recommendations: ReportRecommendation[]
  adSuggestions: ReportAdSuggestion[]
  channelHealth?: {
    reachTrend: string
    engagementTrend: string
    followerGrowth: string
    healthScore: number
  }
  weeklyFocus?: string
  contentAnalysis?: {
    byType: Array<{ type: string; count: number; avgReach: number; avgEngRate: number; avgSaves: number }>
    hashtagEffectiveness: Array<{ hashtag: string; avgReach: number; count: number; effectiveness: string }>
    bestPostingTimes: Array<{ day: string; hour: number; avgReach: number; postCount: number }>
  }
}

type OverviewSnapshot = {
  id: string; date: string; reach: number; impressions: number
  engagement: number; followers: number; postCount: number
  persona: { name: string; platform: string; instagramHandle: string | null }
}
type OverviewDraft = {
  id: string; title: string; type: string; platform: string
  publishedAt: string | null; status: string
}
type OverviewData = {
  snapshots: OverviewSnapshot[]
  recentContent: OverviewDraft[]
  scheduledCount: number
  personaCount: number
}

export default function AnalyticsPage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [personaId, setPersonaId] = useState('')
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [followerDaily, setFollowerDaily] = useState<Array<{date: string; change: number}>>([])
  const [onlineFollowers, setOnlineFollowers] = useState<Record<string, number>>({})
  const [chatInput, setChatInput] = useState('')
  const [chatAnswer, setChatAnswer] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reachDaily, setReachDaily] = useState<Array<{ date: string; reach: number }>>([])
  const [days, setDays] = useState(30)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [dashTopPosts, setDashTopPosts] = useState<DashboardTopPost[]>([])
  const [currentFollowers, setCurrentFollowers] = useState(0)
  const [bestTimes, setBestTimes] = useState<BestTimeSlot[]>([])
  const [contentTypeStats, setContentTypeStats] = useState<ContentTypeStat[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [tokenExpired, setTokenExpired] = useState(false)
  const [createdDraft, setCreatedDraft] = useState<{id: string; title: string} | null>(null)
  const [showContentKit, setShowContentKit] = useState(false)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [metaConfigured, setMetaConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    // Load SNS overview aggregated metrics
    fetch('/api/sns/overview')
      .then(r => r.ok ? r.json() : null)
      .then((data: OverviewData | null) => setOverview(data))
      .catch(() => {})

    // Check Meta/Instagram connection status
    fetch('/api/meta/status')
      .then(r => r.json())
      .then(data => setMetaConfigured(data.hasAppId && data.hasAppSecret))
      .catch(() => setMetaConfigured(false))
  }, [])

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
        let accessToken = draft.value.accessToken || ''

        // 토큰 자동 갱신
        if (accessToken) {
          const tokenResult = await ensureValidToken(accessToken)
          if (tokenResult.refreshed) {
            accessToken = tokenResult.token
            await saveStoredMetaConnectionDraft({ ...draft.value, accessToken })
          }
          if (tokenResult.status === 'expired') {
            setTokenExpired(true)
          }
        }
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

          // 팔로워 일별 + 시간대별 활성 데이터도 로드
          if (accessToken && accountId) {
            try {
              const syncRes = await fetch('/api/sns/analytics/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ personaId, accessToken, businessAccountId: accountId }),
              })
              if (syncRes.ok) {
                const sd = await syncRes.json()
                if (sd.followerDaily?.length) setFollowerDaily(sd.followerDaily)
                if (sd.onlineFollowers && Object.keys(sd.onlineFollowers).length > 0) setOnlineFollowers(sd.onlineFollowers)
              }
            } catch {}
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
    setSyncing(true)

    const draft = await loadStoredMetaConnectionDraft(window.location.origin)
    const accessToken = draft.value.accessToken || ''
    const businessAccountId = draft.value.instagramBusinessAccountId || ''

    // 페르소나가 없으면 자동 생성 시도
    let pid = personaId
    if (!pid) {
      try {
        const username = draft.value.connectedAccounts?.[0]?.username || 'my-account'
        const createRes = await fetch('/api/sns/personas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: username, instagramHandle: username, learnMode: 'FROM_POSTS', platform: 'INSTAGRAM' }),
        })
        if (createRes.ok) {
          const created = await createRes.json()
          pid = created.id
          setPersonaId(pid)
          setPersonas(prev => [...prev, created])
        }
      } catch { /* ignore */ }
    }
    if (!pid) { setSyncing(false); setSyncStatus('페르소나 생성 실패'); return }

    setSyncStatus('1/3 Instagram 게시물 수집 중...')
    const syncRes = await fetch('/api/sns/analytics/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personaId: pid, accessToken, businessAccountId }),
    })
    try {
      const syncData = await syncRes.json()
      console.log('[SNS] syncData keys:', Object.keys(syncData), 'followerDaily:', syncData.followerDaily?.length, 'onlineFollowers:', Object.keys(syncData.onlineFollowers || {}).length)
      if (syncData.followerDaily?.length) setFollowerDaily(syncData.followerDaily)
      if (syncData.onlineFollowers && Object.keys(syncData.onlineFollowers).length > 0) setOnlineFollowers(syncData.onlineFollowers)
    } catch { /* ignore */ }

    setSyncStatus('2/3 도달 데이터 수집 중...')
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
    setSyncStatus('3/3 분석 데이터 로드 중...')
    const updated = await fetch(`/api/sns/analytics?personaId=${pid}&days=${days}`).then(r => r.json())
    setSnapshots(updated)
    // Reach fallback
    if (businessAccountId) {
      try {
        const dashRes = await fetch('/api/dashboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days, accountId: businessAccountId, accessToken, personaId: pid }),
        })
        if (dashRes.ok) {
          const dashData = await dashRes.json()
          if (dashData.reachDaily?.length > 0) setReachDaily(dashData.reachDaily)
          if (dashData.lastSyncAt) setLastSyncAt(dashData.lastSyncAt)
        }
      } catch {}
    }
    setLastSyncAt(new Date().toISOString())
    setSyncStatus('수집 완료')
    setSyncing(false)
    setTimeout(() => setSyncStatus(''), 3000)
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
    setReportError(null)
    try {
      const draft = await loadStoredMetaConnectionDraft(window.location.origin)
      const accessToken = draft.value.accessToken || ''
      const businessAccountId = draft.value.instagramBusinessAccountId || ''
      const res = await fetch('/api/sns/analytics/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId, accessToken, businessAccountId }),
      })
      const data = await res.json()
      if (res.ok) {
        setReport(data.report ?? data)
      } else {
        setReportError(data.error || '리포트 생성에 실패했습니다.')
      }
    } catch {
      setReportError('리포트 생성 중 오류가 발생했습니다.')
    } finally {
      setReportLoading(false)
    }
  }

  function handleExportReport() {
    if (!report) return

    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const persona = personas.find(p => p.id === personaId)

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>성과 분석 리포트 — ${persona?.name || 'Garnet'}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #333; }
          h1 { font-size: 24px; margin-bottom: 4px; }
          h2 { font-size: 16px; margin-top: 32px; margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
          .subtitle { color: #888; font-size: 13px; }
          .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 20px 0; }
          .metric { background: #f5f6f7; border-radius: 8px; padding: 16px; }
          .metric-value { font-size: 24px; font-weight: bold; }
          .metric-label { font-size: 12px; color: #888; margin-top: 4px; }
          .card { background: #f9fafb; border-radius: 8px; padding: 12px; margin: 8px 0; }
          .tag { display: inline-block; background: #e8ebed; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin: 2px; }
          ul { padding-left: 20px; }
          li { margin: 4px 0; }
          .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; font-size: 11px; color: #888; }
        </style>
      </head>
      <body>
        <h1>성과 분석 리포트</h1>
        <p class="subtitle">${persona?.name || ''} · ${report.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10)} · Garnet</p>

        <h2>성과 요약</h2>
        <div class="metrics">
          <div class="metric">
            <div class="metric-value">${(report.summary?.totalReach || 0).toLocaleString()}</div>
            <div class="metric-label">총 도달</div>
          </div>
          <div class="metric">
            <div class="metric-value">${report.summary?.avgEngagementRate || 0}%</div>
            <div class="metric-label">평균 참여율</div>
          </div>
          <div class="metric">
            <div class="metric-value">${report.summary?.trendDirection === 'UP' ? '▲ 상승' : report.summary?.trendDirection === 'DOWN' ? '▼ 하락' : '→ 보합'}</div>
            <div class="metric-label">추세</div>
          </div>
        </div>

        ${report.topPosts?.length ? `
          <h2>Top 게시물</h2>
          ${report.topPosts?.map((p: ReportTopPost, i: number) => `
            <div class="card">
              <strong>${i + 1}. ${p.caption?.slice(0, 60) || ''}</strong>
              <br><small>도달: ${p.reach?.toLocaleString() || '?'} · ${p.whyGood || ''}</small>
            </div>
          `).join('')}
        ` : ''}

        ${report.recommendations?.length ? `
          <h2>추천 콘텐츠</h2>
          ${report.recommendations.map((r: ReportRecommendation, i: number) => `
            <div class="card">
              <strong>${i + 1}. ${r.topic}</strong>
              <br><small>${r.reason || ''}</small>
              ${r.suggestedHashtags?.length ? `<br>${r.suggestedHashtags.map((t: string) => `<span class="tag">${t}</span>`).join(' ')}` : ''}
            </div>
          `).join('')}
        ` : ''}

        ${report.patterns ? `
          <h2>패턴 인사이트</h2>
          <ul>
            ${report.patterns?.bestPostingTimes ? `<li>최적 시간: ${Array.isArray(report.patterns?.bestPostingTimes) ? report.patterns?.bestPostingTimes.join(', ') : report.patterns?.bestPostingTimes}</li>` : ''}
            ${report.patterns?.bestContentType ? `<li>최적 유형: ${report.patterns?.bestContentType}</li>` : ''}
            ${report.patterns?.audienceInsight ? `<li>${report.patterns?.audienceInsight}</li>` : ''}
          </ul>
        ` : ''}

        ${report.adSuggestions?.length ? `
          <h2>광고 예산 제안</h2>
          ${report.adSuggestions.map((a: ReportAdSuggestion) => `
            <div class="card">
              <strong>${a.targetPostDescription || ''}</strong>
              <br><small>예산: ${a.suggestedBudget || ''} · ${a.expectedEffect || ''}</small>
            </div>
          `).join('')}
        ` : ''}

        <div class="footer">
          이 리포트는 Garnet AI 마케팅 OS에서 자동 생성되었습니다.
        </div>
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  async function handleCreateFromRecommendation(rec: {
    topic: string; contentType: string; suggestedCaption: string;
    reason: string; suggestedHashtags?: string[]
  }) {
    const hashtags = rec.suggestedHashtags?.map(t => t.startsWith('#') ? t : `#${t}`).join(' ') || ''
    const prompt = `주제: ${rec.topic}\n\n방향: ${rec.reason}\n\n예시 캡션:\n${rec.suggestedCaption}\n\n해시태그: ${hashtags}`

    const res = await fetch('/api/sns/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personaId,
        type: rec.contentType,
        prompt,
      }),
    })
    if (!res.ok) return
    const draft = await res.json()

    setCreatedDraft(draft)
    setShowContentKit(true)
  }

  // Compute overview KPIs from aggregated snapshots
  const overviewFollowers = overview
    ? overview.snapshots.reduce((max, s) => Math.max(max, s.followers), 0)
    : 0
  const overviewReach = overview
    ? overview.snapshots.reduce((sum, s) => sum + s.reach, 0)
    : 0
  const overviewEngagement = overview && overview.snapshots.length > 0
    ? (overview.snapshots.reduce((sum, s) => sum + s.engagement, 0) / overview.snapshots.length).toFixed(1)
    : '0'
  const overviewScheduled = overview?.scheduledCount ?? 0

  // Follower trend from overview snapshots (sorted by date asc)
  const followerTrend = overview
    ? [...overview.snapshots]
        .filter(s => s.followers > 0)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(s => ({ date: s.date.slice(0, 10), followers: s.followers }))
    : []

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* 토큰 만료 경고 */}
      {tokenExpired && (
        <div className="error-note flex items-center justify-between gap-4">
          <div>
            <strong>Instagram 토큰이 만료되었습니다.</strong>
            <p className="mt-1 text-[12px]">재로그인하면 자동 갱신 시스템이 활성화되어 앞으로는 끊기지 않습니다.</p>
          </div>
          <a href="/meta/connect" className="button-primary text-xs px-3 py-2 shrink-0">재연결</a>
        </div>
      )}

      {/* Instagram 연결 배너 */}
      {!tokenExpired && metaConfigured === false && (
        <div className="soft-card flex items-center justify-between gap-4 p-4">
          <p className="text-sm text-[var(--text-base)]">
            Instagram을 연결하면 실시간 인사이트를 확인할 수 있습니다.
          </p>
          <InstagramLoginButton />
        </div>
      )}

      {/* KPI 카드 (Overview API 기반) */}
      {overview && (
        <div className="ops-kpi-grid">
          <div className="ops-kpi-cell">
            <p className="ops-kpi-val">{formatCompactNumber(overviewFollowers)}</p>
            <p className="ops-kpi-label">총 팔로워</p>
          </div>
          <div className="ops-kpi-cell">
            <p className="ops-kpi-val">{formatCompactNumber(overviewReach)}</p>
            <p className="ops-kpi-label">총 도달</p>
          </div>
          <div className="ops-kpi-cell" style={{ '--kpi-accent': '#10b981' } as React.CSSProperties}>
            <p className="ops-kpi-val">{overviewEngagement}%</p>
            <p className="ops-kpi-label">참여율</p>
          </div>
          <div className="ops-kpi-cell" style={{ '--kpi-accent': '#ffaa00' } as React.CSSProperties}>
            <p className="ops-kpi-val">{overviewScheduled}</p>
            <p className="ops-kpi-label">발행 대기</p>
          </div>
        </div>
      )}

      {/* 팔로워 추이 → 도달 추이 (팔로워는 과거 이력 없어 동일값이므로 도달 추이로 대체) */}
      {(() => {
        // 팔로워 데이터에 변화가 있으면 팔로워 차트, 없으면 도달 추이 차트
        const uniqueFollowers = new Set(followerTrend.map(f => f.followers))
        const hasFollowerVariation = uniqueFollowers.size > 1

        if (hasFollowerVariation && followerTrend.length > 1) {
          return (
            <div className="ops-zone">
              <div className="ops-zone-head">
                <span className="ops-zone-label">Follower Trend</span>
                <span className="text-[10px] tabular-nums text-[var(--text-disabled)]">현재 {formatCompactNumber(currentFollowers || latestFollowers)}</span>
              </div>
              <div style={{ padding: 16 }}>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={followerTrend} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,53,69,0.08)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7E8A98' }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: '#7E8A98' }} width={55} tickFormatter={formatChartTick} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(8,10,20,0.94)', border: '1px solid rgba(201,53,69,0.14)', borderRadius: 8, fontSize: 12, color: '#F0ECE8' }} labelStyle={{ color: '#7E8A98' }} itemStyle={{ color: '#B0B8C4' }}
                      formatter={(value) => [formatCompactNumber(Number(value)), '팔로워']} />
                    <Line type="monotone" dataKey="followers" stroke="#C93545" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        }

        // 팔로워 변화 없음 → 계정 도달 추이 표시 (InstagramReachDaily 데이터 활용)
        if (effectiveReachData.length > 1) {
          return (
            <div className="ops-zone">
              <div className="ops-zone-head">
                <span className="ops-zone-label">Account Reach Trend</span>
                <span className="text-[10px] tabular-nums text-[var(--text-disabled)]">팔로워 {formatCompactNumber(currentFollowers || latestFollowers)} (추이 데이터 수집 중)</span>
              </div>
              <div style={{ padding: 16 }}>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={effectiveReachData.slice(-days)} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,53,69,0.08)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7E8A98' }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: '#7E8A98' }} width={50} tickFormatter={formatChartTick} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(8,10,20,0.94)', border: '1px solid rgba(201,53,69,0.14)', borderRadius: 8, fontSize: 12, color: '#F0ECE8' }} labelStyle={{ color: '#7E8A98' }} itemStyle={{ color: '#B0B8C4' }}
                      formatter={(value) => [formatCompactNumber(Number(value)), '일별 도달']} />
                    <Line type="monotone" dataKey="reach" stroke="#C93545" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-[9px] text-[var(--text-disabled)] mt-1">* 팔로워 추이는 매일 수집 시 자동으로 쌓입니다. 현재는 계정 도달 추이를 표시합니다.</p>
              </div>
            </div>
          )
        }

        return null
      })()}

      {/* 팔로워 일별 증감 차트 */}
      {followerDaily.length > 1 && (() => {
        // 누적 팔로워 계산 (현재 팔로워에서 역산)
        const currentF = currentFollowers || latestFollowers || 7025
        let cumulative = currentF
        const dailySorted = [...followerDaily].sort((a, b) => b.date.localeCompare(a.date))
        const cumulativeData: Array<{date: string; followers: number; change: number}> = []
        for (const d of dailySorted) {
          cumulativeData.unshift({ date: d.date, followers: cumulative, change: d.change })
          cumulative -= d.change
        }
        const totalGain = followerDaily.reduce((s, d) => s + d.change, 0)
        return (
          <div className="ops-zone">
            <div className="ops-zone-head">
              <span className="ops-zone-label">Follower Growth</span>
              <span className="text-[10px] tabular-nums text-[var(--text-disabled)]">30일 +{totalGain} ({currentF.toLocaleString()}명)</span>
            </div>
            <div style={{ padding: 16 }}>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={cumulativeData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,53,69,0.08)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#7E8A98' }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: '#7E8A98' }} width={50} tickFormatter={formatChartTick} domain={['dataMin - 50', 'dataMax + 50']} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(8,10,20,0.94)', border: '1px solid rgba(201,53,69,0.14)', borderRadius: 8, fontSize: 12, color: '#F0ECE8' }} labelStyle={{ color: '#7E8A98' }} itemStyle={{ color: '#B0B8C4' }}
                    formatter={(value: number, name: string) => [name === 'change' ? `+${value}` : formatCompactNumber(value), name === 'change' ? '일별 증감' : '누적 팔로워']} />
                  <Line type="monotone" dataKey="followers" stroke="#C93545" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      })()}

      {/* 시간대별 활성 팔로워 */}
      {Object.keys(onlineFollowers).length > 0 && (() => {
        const hourlyData = Object.entries(onlineFollowers)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([hour, count]) => ({ hour: `${hour}시`, count, hourNum: Number(hour) }))
        const peakHour = hourlyData.reduce((max, d) => d.count > max.count ? d : max, hourlyData[0])
        return (
          <div className="ops-zone">
            <div className="ops-zone-head">
              <span className="ops-zone-label">Online Followers by Hour</span>
              <span className="text-[10px] text-[var(--text-disabled)]">피크: <strong className="text-[var(--text-strong)]">{peakHour.hour}</strong> ({peakHour.count.toLocaleString()}명)</span>
            </div>
            <div style={{ padding: 16 }}>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={hourlyData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#7E8A98' }} interval={2} />
                  <YAxis tick={{ fontSize: 9, fill: '#7E8A98' }} width={35} tickFormatter={formatChartTick} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(8,10,20,0.94)', border: '1px solid rgba(201,53,69,0.14)', borderRadius: 8, fontSize: 12, color: '#F0ECE8' }} labelStyle={{ color: '#7E8A98' }} itemStyle={{ color: '#B0B8C4' }}
                    formatter={(value: number) => [value.toLocaleString() + '명', '활성 팔로워']} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}
                    fill="#C93545"
                    fillOpacity={0.7}
                  />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[9px] text-[var(--text-disabled)] mt-1">* 팔로워가 Instagram에서 가장 활발한 시간대입니다. 이 시간에 게시하면 도달이 극대화됩니다.</p>
            </div>
          </div>
        )
      })()}

      {/* 최근 게시물 성과 */}
      {overview && overview.recentContent.length > 0 && (
        <div className="ops-zone">
          <div className="ops-zone-head">
            <span className="ops-zone-label">Recent Posts</span>
            <span className="text-[10px] tabular-nums text-[var(--text-disabled)]">{overview.recentContent.length}건</span>
          </div>
          <div className="ops-zone-body">
            {overview.recentContent.map((draft) => {
              const typeLabel = draft.type === 'VIDEO' ? '영상' : draft.type === 'CAROUSEL' ? '캐러셀' : '이미지'
              const dateStr = draft.publishedAt
                ? (() => { try { return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(new Date(draft.publishedAt)) } catch { return draft.publishedAt.slice(5, 10) } })()
                : '-'
              return (
                <a key={draft.id} href={`/sns/studio/${draft.id}`} className="ops-row">
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-[var(--surface-sub)] text-[var(--text-muted)]">{typeLabel}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-[var(--text-strong)] truncate">{draft.title || '(제목 없음)'}</p>
                  </div>
                  <span className="text-[10px] tabular-nums text-[var(--text-disabled)]">{dateStr}</span>
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* 헤더 — 성과 분석 + 컨트롤 */}
      <header className="ops-zone">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex items-center gap-3">
            {personaId && (() => {
              const currentPersona = personas.find(p => p.id === personaId)
              return (
                <>
                  <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-bold text-xs shrink-0">
                    {(currentPersona?.name || 'P')[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="ops-zone-label" style={{ letterSpacing: '0.06em' }}>
                        {currentPersona?.instagramHandle ? `@${currentPersona.instagramHandle.replace(/^@/, '')}` : currentPersona?.name || ''}
                      </p>
                      <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                    </div>
                    <h1 className="text-lg font-bold tracking-tight text-[var(--text-strong)]">성과 분석</h1>
                  </div>
                </>
              )
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input text-xs py-1 px-2" value={personaId} onChange={e => setPersonaId(e.target.value)} style={{ maxWidth: 140 }}>
              {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex rounded overflow-hidden border border-[var(--border)]">
              {([7, 30, 90] as const).map((d) => (
                <button key={d} type="button"
                  className={`px-3 py-1 text-[10px] font-semibold transition-colors ${days === d ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-sub)] text-[var(--text-muted)]'}`}
                  onClick={() => setDays(d)}>{d}일</button>
              ))}
            </div>
            {lastSyncAt && <span className="text-[10px] text-[var(--text-disabled)]">{(() => { try { return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(lastSyncAt)) } catch { return '' } })()}</span>}
            <button className="button-primary px-3 py-1.5 text-[10px]" onClick={handleSync} disabled={syncing}>
              {syncing ? syncStatus || '수집 중...' : '지금 수집'}
            </button>
          </div>
        </div>
      </header>

      {/* 빠른 링크 */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Meta BS', href: 'https://business.facebook.com' },
          { label: '광고 관리자', href: 'https://adsmanager.facebook.com' },
          { label: 'IG 인사이트', href: 'https://www.instagram.com/accounts/insights/' },
        ].map(({ label, href }) => (
          <a key={href} href={href} target="_blank" rel="noopener noreferrer"
            className="text-[10px] font-medium text-[var(--accent-text)] hover:underline">{label} →</a>
        ))}
      </div>

      {/* KPI 타일 — 확장 (저장, 공유, 프로필방문, 웹사이트 클릭 포함) */}
      {(() => {
        const totalSaved = snapshots.reduce((s, snap) => s + ((snap as any).saved || 0), 0)
        const totalShares = snapshots.reduce((s, snap) => s + ((snap as any).shares || 0), 0)
        const profileViews = snapshots.reduce((s, snap) => s + ((snap as any).profileViews || 0), 0)
        const websiteClicks = snapshots.reduce((s, snap) => s + ((snap as any).websiteClicks || 0), 0)
        return (
          <>
            <div className="ops-kpi-grid">
              <div className="ops-kpi-cell">
                <p className="ops-kpi-val">{formatCompactNumber(totalReach)}</p>
                <p className="ops-kpi-label">총 도달</p>
              </div>
              <div className="ops-kpi-cell" style={{ '--kpi-accent': '#10b981' } as React.CSSProperties}>
                <p className="ops-kpi-val">{avgEngagement}%</p>
                <p className="ops-kpi-label">참여율</p>
              </div>
              <div className="ops-kpi-cell">
                <p className="ops-kpi-val">{formatCompactNumber(latestFollowers)}</p>
                <p className="ops-kpi-label">팔로워</p>
              </div>
              <div className="ops-kpi-cell">
                <p className="ops-kpi-val">{totalPosts}</p>
                <p className="ops-kpi-label">발행 수</p>
              </div>
            </div>
            <div className="ops-kpi-grid">
              <div className="ops-kpi-cell" style={{ '--kpi-accent': '#6366f1' } as React.CSSProperties}>
                <p className="ops-kpi-val">{formatCompactNumber(totalSaved)}</p>
                <p className="ops-kpi-label">저장</p>
                <p className="ops-kpi-sub">구매 의향 지표</p>
              </div>
              <div className="ops-kpi-cell" style={{ '--kpi-accent': '#0066ff' } as React.CSSProperties}>
                <p className="ops-kpi-val">{formatCompactNumber(totalShares)}</p>
                <p className="ops-kpi-label">공유</p>
                <p className="ops-kpi-sub">바이럴 지표</p>
              </div>
              <div className="ops-kpi-cell" style={{ '--kpi-accent': '#ffaa00' } as React.CSSProperties}>
                <p className="ops-kpi-val">{formatCompactNumber(profileViews)}</p>
                <p className="ops-kpi-label">프로필 방문</p>
              </div>
              <div className="ops-kpi-cell" style={{ '--kpi-accent': '#00ff88' } as React.CSSProperties}>
                <p className="ops-kpi-val">{formatCompactNumber(websiteClicks)}</p>
                <p className="ops-kpi-label">웹사이트 클릭</p>
              </div>
            </div>
          </>
        )
      })()}

      {/* 도달수 추이 */}
      {effectiveReachData.length > 0 && (
        <div className="ops-zone">
          <div className="ops-zone-head">
            <span className="ops-zone-label">Reach Trend</span>
            <span className="text-[10px] tabular-nums text-[var(--text-disabled)]">최근 {days}일</span>
          </div>
          <div style={{ padding: 16 }}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={effectiveReachData.slice(-days)} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,53,69,0.08)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#7E8A98' }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: '#7E8A98' }} width={50} tickFormatter={formatChartTick} />
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(8,10,20,0.94)', border: '1px solid rgba(201,53,69,0.14)', borderRadius: 8, fontSize: 12, color: '#F0ECE8' }} labelStyle={{ color: '#7E8A98' }} itemStyle={{ color: '#B0B8C4' }}
                formatter={(value) => [formatCompactNumber(Number(value)), '일별 도달']}
              />
              <Line type="monotone" dataKey="reach" stroke="#C93545" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-[var(--text-disabled)] mt-1">* Instagram Login 연동 기준. Facebook 연동 시 광고 포함 정확한 도달 제공.</p>
          </div>
        </div>
      )}

      {/* 콘텐츠 유형별 성과 비교 */}
      {contentTypeStats.length > 0 && (
        <div className="ops-zone">
          <div className="ops-zone-head">
            <span className="ops-zone-label">Content Type Performance</span>
          </div>
          <div className="px-4 py-3 space-y-2">
            {(() => {
              const maxReach = Math.max(...contentTypeStats.map(s => s.avgReach), 1)
              const typeColors: Record<string, string> = { VIDEO: '#0066ff', CAROUSEL_ALBUM: '#ffaa00', IMAGE: '#C93545' }
              return contentTypeStats.map(stat => (
                <div key={stat.type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-[var(--text-base)]">{stat.label}</span>
                    <span className="text-[11px] tabular-nums text-[var(--text-strong)]">
                      {formatCompactNumber(stat.avgReach)} <span className="text-[var(--text-disabled)]">({stat.count}건)</span>
                    </span>
                  </div>
                  <div className="ops-bar-track" style={{ height: 5 }}>
                    <div className="ops-bar-fill" style={{ width: `${Math.round((stat.avgReach / maxReach) * 100)}%`, backgroundColor: typeColors[stat.type] || '#C93545' }} />
                  </div>
                </div>
              ))
            })()}
          </div>
        </div>
      )}

      {/* 최적 게시 시간 + 인게이지먼트 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="ops-zone">
          <div className="ops-zone-head">
            <span className="ops-zone-label">Best Posting Times</span>
          </div>
          <div className="ops-zone-body">
            {bestTimes.length > 0 ? bestTimes.map((slot, i) => (
              <div key={i} className="ops-row">
                <span className="text-[14px] font-bold tabular-nums text-[var(--accent-text)] w-5 text-center shrink-0">{i + 1}</span>
                <div className="flex-1">
                  <p className="text-[12px] font-medium text-[var(--text-strong)]">{slot.day}요일 {slot.hour}</p>
                </div>
                <span className="text-[10px] tabular-nums text-[var(--text-disabled)]">{slot.count}회</span>
              </div>
            )) : (
              <div className="px-4 py-3"><p className="text-[11px] text-[var(--text-muted)]">게시물이 쌓이면 표시됩니다.</p></div>
            )}
          </div>
        </div>

        <div className="ops-zone">
          <div className="ops-zone-head">
            <span className="ops-zone-label">Engagement Rate</span>
            <span className="text-[10px] text-[var(--text-disabled)]">{Number(avgEngagement) >= 3 ? '우수' : Number(avgEngagement) >= 1 ? '양호' : '개선 필요'}</span>
          </div>
          <div className="px-4 py-3">
            <p className="text-[24px] font-bold tabular-nums text-[var(--text-strong)]">{avgEngagement}% <span className="text-[12px] font-normal text-[var(--text-muted)]">평균</span></p>
            <div className="mt-3">
              <div className="ops-bar-track relative" style={{ height: 8 }}>
                <div className="absolute h-full rounded" style={{ left: '10%', width: '20%', background: 'rgba(0,255,136,0.12)' }} />
                <div className="ops-bar-fill" style={{ width: `${Math.min(Number(avgEngagement) * 10, 100)}%`, backgroundColor: Number(avgEngagement) >= 3 ? '#00ff88' : Number(avgEngagement) >= 1 ? '#C93545' : '#ffaa00' }} />
              </div>
              <div className="flex justify-between text-[9px] text-[var(--text-disabled)] mt-1">
                <span>0%</span><span>업계 1~3%</span><span>10%</span>
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
      </div>

      {/* Top 게시물 (상세) */}
      {dashTopPosts.length > 0 && (
        <div className="ops-zone">
          <div className="ops-zone-head">
            <span className="ops-zone-label">Top Posts</span>
            <span className="text-[10px] tabular-nums text-[var(--text-disabled)]">{dashTopPosts.length}건</span>
          </div>
          <div className="ops-zone-body">
            {dashTopPosts.map((post, i) => {
              const typeLabel = post.media_type === 'VIDEO' ? '영상' : post.media_type === 'CAROUSEL_ALBUM' ? '캐러셀' : '이미지'
              const dateStr = (() => {
                try { return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(new Date(post.timestamp)) }
                catch { return post.timestamp.slice(5, 10) }
              })()
              return (
                <div key={post.id} className="ops-row" style={{ alignItems: 'start' }}>
                  <span className="text-[12px] font-bold tabular-nums text-[var(--accent-text)] w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-[var(--text-base)] line-clamp-1">{post.caption?.slice(0, 60) || '(캡션 없음)'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--surface-sub)] text-[var(--text-disabled)]">{typeLabel}</span>
                      <span className="text-[9px] text-[var(--text-disabled)]">{dateStr}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-[11px] font-semibold tabular-nums text-[var(--text-strong)]">도달 {formatCompactNumber(post.reach)}</p>
                    <div className="flex items-center justify-end gap-1.5 text-[9px] text-[var(--text-disabled)]">
                      <span>♥ {post.like_count || 0}</span>
                      {(post as any).saved > 0 && <span className="text-[#6366f1]">저장 {(post as any).saved}</span>}
                      {(post as any).shares > 0 && <span className="text-[#0066ff]">공유 {(post as any).shares}</span>}
                    </div>
                    {(post as any).engagement_rate != null && (
                      <p className="text-[9px] tabular-nums text-emerald-400">{((post as any).engagement_rate * 100).toFixed(1)}%</p>
                    )}
                    {post.permalink && <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-[9px] text-[var(--accent-text)]">보기</a>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* AI 디스커션 */}
      <div className="ops-zone">
        <div className="ops-zone-head">
          <span className="ops-zone-label">AI Discussion</span>
        </div>
        <div className="px-4 py-3">
          <div className="flex gap-2">
            <input
              className="input flex-1 text-xs"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="이번달 가장 효과적인 콘텐츠 타입은?"
              onKeyDown={e => e.key === 'Enter' && handleChat()}
            />
            <button className="button-primary px-3 py-1.5 text-[10px]" onClick={handleChat} disabled={chatLoading}>
              {chatLoading ? '분석 중...' : '질문'}
            </button>
          </div>
          {chatAnswer && (
            <div className="mt-3 p-3 rounded bg-[var(--surface-sub)] text-[12px] text-[var(--text-base)] whitespace-pre-wrap leading-5">{chatAnswer}</div>
          )}
        </div>
      </div>

      {/* 콘텐츠 킷 확인 배너 */}
      {showContentKit && createdDraft && (
        <div className="panel border-2 border-[var(--accent)] bg-[var(--accent-soft)]">
          <p className="text-sm font-semibold text-[var(--text-strong)]">
            콘텐츠 킷이 생성되었습니다
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            &ldquo;{createdDraft.title}&rdquo; — 최적 시간에 자동 예약하거나 편집할 수 있습니다.
          </p>
          <div className="flex gap-2 mt-3">
            <a href={`/sns/studio/${createdDraft.id}`} className="button-primary text-xs">
              스튜디오에서 편집
            </a>
            <a href={`/sns/calendar?draftId=${createdDraft.id}`} className="button-secondary text-xs">
              캘린더에서 예약
            </a>
            <button className="text-xs text-[var(--text-muted)]" onClick={() => setShowContentKit(false)}>
              닫기
            </button>
          </div>
        </div>
      )}

      {/* AI 성과 리포트 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <p className="section-title">AI 성과 리포트</p>
          <div className="flex items-center gap-2">
            <button className="button-primary" onClick={handleGenerateReport} disabled={reportLoading}>
              {reportLoading ? '생성 중...' : 'AI 성과 리포트 생성'}
            </button>
            <button
              className="button-secondary text-xs"
              onClick={handleExportReport}
              disabled={!report}
            >
              PDF 내보내기
            </button>
          </div>
        </div>

        {reportError && (
          <p className="text-sm text-[var(--status-error)] mt-2">{reportError}</p>
        )}

        {report && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="status-tile">
                <p className="metric-label">총 도달</p>
                <p className="mt-2 text-lg font-bold text-[var(--text-strong)]">
                  {formatCompactNumber(report.summary?.totalReach)}
                </p>
              </div>
              <div className="status-tile">
                <p className="metric-label">평균 참여율</p>
                <p className="mt-2 text-lg font-bold text-[var(--text-strong)]">
                  {report.summary?.avgEngagementRate}%
                </p>
              </div>
              <div className="status-tile">
                <p className="metric-label">추세</p>
                <p className="mt-2 text-lg font-bold text-[var(--text-strong)]">
                  {report.summary?.trendDirection === 'UP' ? '▲ 상승' : report.summary?.trendDirection === 'DOWN' ? '▼ 하락' : '→ 보합'}
                </p>
              </div>
            </div>

            {/* Top 게시물 */}
            {report.topPosts?.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-[var(--text-strong)] mb-3">Top 게시물</p>
                <div className="space-y-2">
                  {report.topPosts?.map((post, i) => (
                    <div key={post.mediaId || `top-${i}`} className="list-card">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-[var(--text-strong)]">
                          {post.caption ? post.caption.slice(0, 60) + (post.caption.length > 60 ? '...' : '') : `게시물 #${i + 1}`}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="accent-pill">도달 {formatCompactNumber(post.reach)}</span>
                          <span className="accent-pill">참여 {formatCompactNumber(post.engagement)}</span>
                        </div>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-1">{post.whyGood}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 저성과 게시물 진단 */}
            {report.lowPosts?.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-[var(--text-strong)] mb-3">저성과 게시물 진단</p>
                <div className="space-y-2">
                  {report.lowPosts?.map((post, i) => (
                    <div key={post.mediaId || `low-${i}`} className="list-card border-l-2 border-[var(--status-warning)]">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-[var(--text-strong)]">
                          {post.caption ? post.caption.slice(0, 60) + (post.caption.length > 60 ? '...' : '') : `게시물 #${i + 1}`}
                        </p>
                        <span className="accent-pill">도달 {formatCompactNumber(post.reach)}</span>
                      </div>
                      <p className="text-xs text-[var(--accent-text)] mt-1">💡 {post.improvementTip}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 추천 콘텐츠 */}
            {report.recommendations?.length > 0 && (
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
            {report.adSuggestions?.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-[var(--text-strong)] mb-3">광고 예산 제안</p>
                <div className="space-y-2">
                  {report.adSuggestions.map((ad, i) => (
                    <div key={i} className="list-card">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm text-[var(--text-strong)]">{ad.targetPostDescription}</p>
                        <span className="text-xs text-[var(--text-muted)]">{ad.objective}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="accent-pill">예산 {ad.suggestedBudget}</span>
                        <span className="accent-pill">{ad.expectedEffect}</span>
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
                <div className="soft-panel space-y-2">
                  {report.patterns?.bestPostingTimes && (Array.isArray(report.patterns?.bestPostingTimes) ? report.patterns?.bestPostingTimes : [report.patterns?.bestPostingTimes]).length > 0 && (
                    <p className="text-sm text-[var(--text-base)]">
                      <span className="font-medium">최적 시간대:</span>{' '}
                      {(Array.isArray(report.patterns?.bestPostingTimes) ? report.patterns?.bestPostingTimes : [String(report.patterns?.bestPostingTimes)]).join(', ')}
                    </p>
                  )}
                  {report.patterns?.bestContentType && (
                    <p className="text-sm text-[var(--text-base)]">
                      <span className="font-medium">최적 콘텐츠 유형:</span>{' '}
                      {report.patterns?.bestContentType}
                    </p>
                  )}
                  {report.patterns?.topHashtags.length > 0 && (
                    <p className="text-sm text-[var(--text-base)]">
                      <span className="font-medium">Top 해시태그:</span>{' '}
                      {Array.isArray(report.patterns?.topHashtags) ? report.patterns?.topHashtags.join(' ') : String(report.patterns?.topHashtags || '')}
                    </p>
                  )}
                  {report.patterns?.audienceInsight && (
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                      {report.patterns?.audienceInsight}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── 채널 건강도 + 주간 포커스 ── */}
            {(report.channelHealth || report.weeklyFocus) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {report.channelHealth && (
                  <div className="ops-zone">
                    <div className="ops-zone-head">
                      <span className="ops-zone-label">Channel Health</span>
                      <span className="text-[18px] font-bold text-[var(--text-strong)]">{(report.channelHealth as any).healthScore ?? '-'}/100</span>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[var(--text-muted)]">도달 추세</span>
                        <span className={`font-semibold ${(report.channelHealth as any).reachTrend === 'growing' ? 'text-emerald-400' : (report.channelHealth as any).reachTrend === 'declining' ? 'text-rose-400' : 'text-[var(--text-base)]'}`}>
                          {(report.channelHealth as any).reachTrend === 'growing' ? '성장' : (report.channelHealth as any).reachTrend === 'declining' ? '하락' : '안정'}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[var(--text-muted)]">참여 추세</span>
                        <span className={`font-semibold ${(report.channelHealth as any).engagementTrend === 'growing' ? 'text-emerald-400' : (report.channelHealth as any).engagementTrend === 'declining' ? 'text-rose-400' : 'text-[var(--text-base)]'}`}>
                          {(report.channelHealth as any).engagementTrend === 'growing' ? '성장' : (report.channelHealth as any).engagementTrend === 'declining' ? '하락' : '안정'}
                        </span>
                      </div>
                      {(report.channelHealth as any).followerGrowth && (
                        <div className="flex justify-between text-[11px]">
                          <span className="text-[var(--text-muted)]">팔로워 변화</span>
                          <span className="font-semibold text-[var(--text-strong)]">{(report.channelHealth as any).followerGrowth}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {report.weeklyFocus && (
                  <div className="ops-zone">
                    <div className="ops-zone-head">
                      <span className="ops-zone-label">This Week&apos;s Focus</span>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-[13px] font-semibold text-[var(--text-strong)] leading-6">{(report as any).weeklyFocus}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── 저장/공유/영상 인사이트 ── */}
            {(report.patterns?.savesInsight || report.patterns?.sharesInsight || report.patterns?.videoInsight) && (
              <div className="ops-zone">
                <div className="ops-zone-head">
                  <span className="ops-zone-label">Deep Insights</span>
                </div>
                <div className="divide-y divide-[var(--surface-border)]">
                  {report.patterns?.savesInsight && (
                    <div className="px-4 py-3">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#6366f1] mb-1">저장 패턴</p>
                      <p className="text-[12px] text-[var(--text-base)] leading-5">{report.patterns?.savesInsight}</p>
                    </div>
                  )}
                  {report.patterns?.sharesInsight && (
                    <div className="px-4 py-3">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#0066ff] mb-1">공유 패턴</p>
                      <p className="text-[12px] text-[var(--text-base)] leading-5">{report.patterns?.sharesInsight}</p>
                    </div>
                  )}
                  {report.patterns?.videoInsight && (
                    <div className="px-4 py-3">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#ffaa00] mb-1">영상 성과</p>
                      <p className="text-[12px] text-[var(--text-base)] leading-5">{report.patterns?.videoInsight}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── 해시태그 효과 분석 ── */}
            {report.contentAnalysis?.hashtagEffectiveness && report.contentAnalysis.hashtagEffectiveness.length > 0 && (
              <div className="ops-zone">
                <div className="ops-zone-head">
                  <span className="ops-zone-label">Hashtag Performance</span>
                </div>
                <div className="px-4 py-3 space-y-2">
                  {report.contentAnalysis.hashtagEffectiveness.slice(0, 10).map((h: any) => (
                    <div key={h.hashtag} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          h.effectiveness === 'high' ? 'bg-emerald-900/40 text-emerald-300' :
                          h.effectiveness === 'low' ? 'bg-rose-900/40 text-rose-300' :
                          'bg-[var(--surface-sub)] text-[var(--text-muted)]'
                        }`}>{h.effectiveness === 'high' ? '높음' : h.effectiveness === 'low' ? '낮음' : '보통'}</span>
                        <span className="text-[var(--text-strong)] font-medium">{h.hashtag}</span>
                      </div>
                      <span className="text-[var(--text-muted)] tabular-nums">도달 {h.avgReach?.toLocaleString()} · {h.count}회</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 콘텐츠별 참여율/저장율 ── */}
            {report.contentAnalysis?.byType && report.contentAnalysis.byType.length > 0 && (
              <div className="ops-zone">
                <div className="ops-zone-head">
                  <span className="ops-zone-label">Content Type Deep Dive</span>
                </div>
                <div className="grid gap-px bg-[var(--surface-border)]" style={{ gridTemplateColumns: `repeat(${Math.min(report.contentAnalysis.byType.length, 4)}, 1fr)` }}>
                  {report.contentAnalysis.byType.map((t: any) => (
                    <div key={t.type} className="bg-[var(--surface)] p-3 text-center">
                      <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">{t.type}</p>
                      <p className="text-[16px] font-bold text-[var(--text-strong)] mt-1">{t.avgReach?.toLocaleString()}</p>
                      <p className="text-[9px] text-[var(--text-disabled)]">평균 도달</p>
                      <div className="mt-2 flex justify-center gap-3 text-[9px]">
                        <span className="text-emerald-400">참여 {t.avgEngRate}%</span>
                        <span className="text-[#6366f1]">저장 {t.avgSaves}</span>
                      </div>
                      <p className="text-[9px] text-[var(--text-disabled)] mt-1">{t.count}건</p>
                    </div>
                  ))}
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
