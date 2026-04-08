'use client'

import { useEffect, useRef, useState } from 'react'
import { loadStoredMetaConnectionDraft, saveStoredMetaConnectionDraft } from '@/lib/meta-connection-storage'
import { ensureValidToken, getTokenStatus, getTokenRemainingDays, setTokenExpiry, type TokenStatus } from '@/lib/meta-token-manager'
import { LoadingSpinner } from '@/components/loading-spinner'
import { Skeleton, SkeletonCard } from '@/components/skeleton'
import { ErrorBoundary } from '@/components/error-boundary'
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
  like_count?: number; comments_count?: number;
}
type UpcomingPost = {
  id: string
  scheduledAt: string
  draftTitle: string
  draftType: string
}
type AlertItem = { type: 'warning' | 'info' | 'success'; message: string }
type DashboardData = {
  kpiGoals: KpiGoal[]
  reachDaily: ReachPoint[]
  followerTrend: FollowerPoint[]
  topPosts: TopPost[]
  currentFollowers: number
  lastSyncAt: string | null
  todayScheduled: number
  weekScheduled: number
  upcomingPosts: UpcomingPost[]
  alerts?: AlertItem[]
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
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [days, setDays] = useState(30)
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>('unknown')
  const [tokenDays, setTokenDays] = useState<number | null>(null)

  // 대시보드 데이터 + 리포트 로드
  const connectionRef = useRef({ accountId: '', accessToken: '', personaId: '' })

  async function loadDashboard(daysParam = 30) {
    try {
      const draft = await loadStoredMetaConnectionDraft(window.location.origin)
      let accountId = draft.value.instagramBusinessAccountId || ''
      let accessToken = draft.value.accessToken || ''

      // 토큰 자동 갱신
      if (accessToken) {
        const tokenResult = await ensureValidToken(accessToken)
        setTokenStatus(tokenResult.status)
        setTokenDays(getTokenRemainingDays())
        if (tokenResult.refreshed) {
          accessToken = tokenResult.token
          // 갱신된 토큰 저장
          await saveStoredMetaConnectionDraft({ ...draft.value, accessToken })
        }
        if (tokenResult.status === 'expired') {
          setError('Instagram 토큰이 만료되었습니다. 설정 → Meta 연동에서 다시 로그인해주세요.')
          setLoading(false)
          return null
        }
      }

      connectionRef.current.accountId = accountId
      connectionRef.current.accessToken = accessToken

      let personaId = ''
      try {
        const pRes = await fetch('/api/sns/personas')
        if (pRes.ok) {
          const personas = await pRes.json() as Array<{ id: string; instagramHandle?: string | null }>
          const linked = personas.find((p) => p.instagramHandle)
          if (linked) personaId = linked.id
        }
      } catch { /* ignore */ }
      connectionRef.current.personaId = personaId

      const res = await fetch('/api/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: daysParam, accountId, accessToken, personaId }),
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

      return json
    } catch (e) {
      setError(e instanceof Error ? e.message : '대시보드 데이터를 불러오지 못했습니다.')
      return null
    }
  }

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    setSyncMessage('')
    try {
      const { accountId, accessToken, personaId } = connectionRef.current
      // Instagram 도달 동기화 + SNS 분석 동기화 병렬 실행
      // 토큰이 없어도 서버에서 파일스토어 폴백으로 처리
      await Promise.all([
        fetch('/api/instagram/reach/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lookbackDays: 30,
            ...(accessToken && accountId ? { accessToken, instagramBusinessAccountId: accountId } : {}),
            graphApiVersion: 'v25.0',
            connectionMode: 'instagram_login',
          }),
        }),
        ...(personaId ? [fetch('/api/sns/analytics/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken,
            businessAccountId: accountId,
            personaId,
          }),
        })] : []),
      ])
      // 3. 대시보드 다시 로드
      setLoading(true)
      await loadDashboard(days)
      setSyncMessage('동기화 완료')
    } catch {
      setSyncMessage('동기화 실패')
    } finally {
      setSyncing(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void (async () => {
      const result = await loadDashboard(days)
      setLoading(false)

      // 자동 동기화: 마지막 동기화가 6시간 이상 지났을 때만 자동 실행
      if (result?.lastSyncAt) {
        const elapsed = Date.now() - new Date(result.lastSyncAt).getTime()
        if (elapsed > 6 * 60 * 60 * 1000) {
          void handleSync()
        }
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonCard />
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  if (error || !data) {
    const isTokenError = error?.includes('토큰') || error?.includes('만료') || tokenStatus === 'expired'
    return (
      <div className="p-6 space-y-3">
        <div className="error-note">
          <strong>{isTokenError ? 'Instagram 연결 끊김' : '오류'}:</strong> {error || '데이터를 불러오지 못했습니다.'}
        </div>
        <div className="flex gap-2">
          <button onClick={() => loadDashboard(days)} className="button-secondary text-sm">다시 시도</button>
          {isTokenError && (
            <a href="/meta/connect" className="button-primary text-sm">Instagram 재연결</a>
          )}
        </div>
      </div>
    )
  }

  // Compute trend
  const reachArr = data.reachDaily
  let trendText = ''
  let trendDirection: 'up' | 'down' | 'flat' = 'flat'
  if (reachArr.length >= 14) {
    const recent7 = reachArr.slice(-7)
    const prev7 = reachArr.slice(-14, -7)
    const recentAvg = recent7.reduce((s, r) => s + r.reach, 0) / 7
    const prevAvg = prev7.reduce((s, r) => s + r.reach, 0) / 7
    if (prevAvg > 0) {
      const changePct = Math.round(((recentAvg - prevAvg) / prevAvg) * 100)
      if (changePct > 0) { trendText = `+${changePct}%`; trendDirection = 'up' }
      else if (changePct < 0) { trendText = `${changePct}%`; trendDirection = 'down' }
      else { trendText = '0%' }
    }
  } else if (reachArr.length >= 7) {
    const avg = Math.round(reachArr.slice(-7).reduce((s, r) => s + r.reach, 0) / 7)
    trendText = `7d avg ${avg.toLocaleString()}`
  }

  let recommendation = '꾸준한 게시가 도달 성장의 핵심입니다'
  if (data.todayScheduled === 0) recommendation = '오늘 게시할 콘텐츠를 만들어보세요'
  else if (trendDirection === 'down') recommendation = '캐러셀/릴스 등 다양한 형식을 시도해보세요'

  const totalLikes = data.topPosts.reduce((s, p) => s + (p.like_count || 0), 0)
  const totalComments = data.topPosts.reduce((s, p) => s + (p.comments_count || 0), 0)

  const kpiColors = ['#C93545', '#0066ff', '#ffaa00', '#00ff88']

  return (
    <ErrorBoundary>
    <div className="space-y-3">

      {/* ═══ Header ═══ */}
      <header className="ops-zone">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="ops-zone-label">Marketing Dashboard</p>
            <h1 className="mt-1 text-lg font-bold tracking-tight text-[var(--text-strong)]">마케팅 대시보드</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded overflow-hidden border border-[var(--border)]">
              {([7, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`px-3 py-1 text-[10px] font-semibold transition-colors ${
                    days === d ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-sub)] text-[var(--text-muted)] hover:text-[var(--text-strong)]'
                  }`}
                  onClick={() => setDays(d)}
                >{d}일</button>
              ))}
            </div>
            <span className="text-[10px] text-[var(--text-disabled)]">{formatSyncTime(data.lastSyncAt)}</span>
            {tokenStatus === 'expiring_soon' && (
              <span className="text-[10px] font-medium text-[#ffaa00]">토큰 만료 {tokenDays}일 남음</span>
            )}
            {tokenStatus === 'expired' && (
              <a href="/meta/connect" className="text-[10px] font-medium text-[#ff4466]">토큰 만료 — 재연결</a>
            )}
            <button type="button" className="button-secondary px-3 py-1.5 text-[10px]" onClick={() => void handleSync()} disabled={syncing}>
              {syncing ? '동기화 중...' : '동기화'}
            </button>
            {syncMessage && <span className="text-[10px] font-medium text-[var(--accent-text)]">{syncMessage}</span>}
          </div>
        </div>
      </header>

      {/* ═══ Alerts ═══ */}
      {data.alerts && data.alerts.length > 0 && (
        <div className="ops-zone">
          <div className="ops-zone-body">
            {data.alerts.map((alert, i) => {
              const dotColor = alert.type === 'warning' ? '#ff4466' : alert.type === 'success' ? '#00ff88' : 'var(--accent)'
              return (
                <div key={i} className="ops-row">
                  <span className="ops-dot" style={{ backgroundColor: dotColor }} />
                  <p className="text-[12px] text-[var(--text-base)]">{alert.message}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ KPI Strip ═══ */}
      <div className="ops-kpi-grid">
        <div className="ops-kpi-cell">
          <p className="ops-kpi-val">{data.todayScheduled}</p>
          <p className="ops-kpi-label">오늘 예약</p>
          <p className="ops-kpi-sub">이번 주 {data.weekScheduled}건</p>
        </div>
        <div className="ops-kpi-cell">
          <p className="ops-kpi-val">{data.currentFollowers.toLocaleString()}</p>
          <p className="ops-kpi-label">팔로워</p>
          <p className="ops-kpi-sub">현재 기준</p>
        </div>
        <div className="ops-kpi-cell" style={{ '--kpi-accent': trendDirection === 'down' ? '#ff4466' : '#10b981' } as React.CSSProperties}>
          <p className={`ops-kpi-val ${trendDirection === 'up' ? 'text-emerald-400' : trendDirection === 'down' ? 'text-rose-400' : ''}`}>
            {trendText || '-'}
          </p>
          <p className="ops-kpi-label">도달 추세</p>
          <p className="ops-kpi-sub">전주 대비</p>
        </div>
        <div className="ops-kpi-cell">
          <p className="ops-kpi-val">{totalLikes.toLocaleString()}</p>
          <p className="ops-kpi-label">좋아요</p>
          <p className="ops-kpi-sub">댓글 {totalComments.toLocaleString()}</p>
        </div>
      </div>

      {/* ═══ 저장/공유 KPI ═══ */}
      {((data as any).totalSaved > 0 || (data as any).totalShares > 0) && (
        <div className="ops-kpi-grid">
          <div className="ops-kpi-cell" style={{ '--kpi-accent': '#6366f1' } as React.CSSProperties}>
            <p className="ops-kpi-val">{((data as any).totalSaved || 0).toLocaleString()}</p>
            <p className="ops-kpi-label">저장</p>
            <p className="ops-kpi-sub">구매 의향</p>
          </div>
          <div className="ops-kpi-cell" style={{ '--kpi-accent': '#0066ff' } as React.CSSProperties}>
            <p className="ops-kpi-val">{((data as any).totalShares || 0).toLocaleString()}</p>
            <p className="ops-kpi-label">공유</p>
            <p className="ops-kpi-sub">바이럴</p>
          </div>
        </div>
      )}

      {/* ═══ Briefing + Upcoming ═══ */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="ops-zone">
          <div className="ops-zone-head">
            <span className="ops-zone-label">AI 브리핑</span>
          </div>
          <div className="px-4 py-3">
            <p className="text-[13px] font-semibold text-[var(--text-strong)]">{recommendation}</p>
            <div className="mt-3 flex gap-2">
              <a href="/sns/studio" className="button-primary px-3 py-1.5 text-[10px]">콘텐츠 만들기</a>
              <a href="/sns/calendar" className="button-secondary px-3 py-1.5 text-[10px]">캘린더</a>
            </div>
          </div>
        </div>

        {data.upcomingPosts.length > 0 && (
          <div className="ops-zone">
            <div className="ops-zone-head">
              <span className="ops-zone-label">예약 게시물</span>
              <a href="/sns/calendar" className="text-[10px] font-semibold text-[var(--accent-text)] hover:underline">전체</a>
            </div>
            <div className="ops-zone-body">
              {data.upcomingPosts.map((post) => {
                const dt = new Date(post.scheduledAt)
                const now = new Date()
                const isToday = dt.toDateString() === now.toDateString()
                const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
                const isTomorrow = dt.toDateString() === tomorrow.toDateString()
                const dl = isToday ? '오늘' : isTomorrow ? '내일' : `${dt.getMonth() + 1}/${dt.getDate()}`
                const time = dt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
                const typeLabels: Record<string, string> = { TEXT: '텍스트', CAROUSEL: '카드뉴스', VIDEO: '비디오' }
                return (
                  <div key={post.id} className="ops-row">
                    <span className="text-[10px] font-bold tabular-nums text-[var(--accent-text)] w-16 shrink-0">{dl} {time}</span>
                    <span className="text-[10px] text-[var(--text-disabled)] w-12 shrink-0">{typeLabels[post.draftType] || post.draftType}</span>
                    <span className="text-[12px] text-[var(--text-strong)] truncate">{post.draftTitle}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ═══ KPI Goals ═══ */}
      {data.kpiGoals.length > 0 ? (
        <div className="ops-zone">
          <div className="ops-zone-head">
            <span className="ops-zone-label">KPI 목표</span>
            <a href="/goals" className="text-[10px] font-semibold text-[var(--accent-text)] hover:underline">관리</a>
          </div>
          <div className="grid gap-px bg-[var(--surface-border)] md:grid-cols-2 lg:grid-cols-4">
            {data.kpiGoals.map((kpi, i) => {
              const pct = kpi.targetValue > 0 ? Math.round((kpi.currentValue / kpi.targetValue) * 100) : 0
              const color = kpiColors[i % kpiColors.length]
              return (
                <div key={kpi.id} className="bg-[var(--surface)] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{kpi.title}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-[var(--text-strong)]">
                    {kpi.currentValue.toLocaleString()}{kpi.unit ? ` ${kpi.unit}` : ''}
                  </p>
                  <p className="mt-0.5 text-[10px] tabular-nums text-[var(--text-disabled)]">목표 {kpi.targetValue.toLocaleString()} · {pct}%</p>
                  <div className="mt-2 ops-bar-track">
                    <div className="ops-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="ops-zone">
          <div className="px-4 py-3">
            <p className="text-[12px] text-[var(--text-muted)]">KPI 목표를 설정하세요. <a href="/goals" className="text-[var(--accent-text)] hover:underline">KPI 관리 →</a></p>
          </div>
        </div>
      )}

      {/* ═══ Content Type + Engagement ═══ */}
      {data.topPosts.length > 0 && (() => {
        const typeCounts: Record<string, number> = {}
        data.topPosts.forEach((p) => { typeCounts[p.media_type || 'UNKNOWN'] = (typeCounts[p.media_type || 'UNKNOWN'] || 0) + 1 })
        const total = data.topPosts.length
        const typeLabels: Record<string, string> = { IMAGE: '이미지', VIDEO: '비디오', CAROUSEL_ALBUM: '캐러셀', UNKNOWN: '기타' }
        const typeColors: Record<string, string> = { IMAGE: '#C93545', VIDEO: '#0066ff', CAROUSEL_ALBUM: '#ffaa00', UNKNOWN: '#4A5568' }
        return (
          <div className="ops-zone">
            <div className="ops-zone-head">
              <span className="ops-zone-label">콘텐츠 유형별 분포</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              {Object.entries(typeCounts).sort(([, a], [, b]) => b - a).map(([type, count]) => {
                const pct = Math.round((count / total) * 100)
                const color = typeColors[type] || '#4A5568'
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-medium text-[var(--text-strong)]">{typeLabels[type] || type}</span>
                      </div>
                      <span className="tabular-nums text-[var(--text-disabled)]">{count}개 · {pct}%</span>
                    </div>
                    <div className="ops-bar-track" style={{ height: 2 }}>
                      <div className="ops-bar-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ═══ Charts ═══ */}
      <ReachChart data={data.reachDaily} />
      <p className="text-[10px] text-[var(--text-disabled)]">* Instagram Login 연동 기준. Facebook 연동 시 광고 포함 정확한 도달 데이터 제공.</p>

      <div className="grid gap-3 lg:grid-cols-2">
        <TopPosts posts={data.topPosts} />
        <FollowerChart data={data.followerTrend} currentFollowers={data.currentFollowers} />
      </div>

      {/* ═══ AI Recommendations ═══ */}
      <section className="ops-zone">
        <div className="ops-zone-head">
          <span className="ops-zone-label">AI 성과 추천</span>
          <a href="/sns/analytics" className="text-[10px] font-semibold text-[var(--accent-text)] hover:underline">전체 리포트</a>
        </div>
        <div className="ops-zone-body">
          {report?.recommendations?.length > 0 ? (
            report.recommendations.slice(0, 3).map((rec: any, i: number) => (
              <div key={i} className="ops-row">
                <span className="ops-dot bg-[var(--accent)]" />
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-[var(--text-strong)]">{rec.topic}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{rec.reason}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-3">
              <p className="text-[11px] text-[var(--text-muted)]">SNS 분석 페이지에서 AI 리포트를 생성하면 추천이 표시됩니다.</p>
            </div>
          )}
        </div>
      </section>
    </div>
    </ErrorBoundary>
  )
}
