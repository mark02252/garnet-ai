'use client'

import { useEffect, useRef, useState } from 'react'
import { loadStoredMetaConnectionDraft } from '@/lib/meta-connection-storage'
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

  // 대시보드 데이터 + 리포트 로드
  const connectionRef = useRef({ accountId: '', accessToken: '', personaId: '' })

  async function loadDashboard(daysParam = 30) {
    try {
      const draft = await loadStoredMetaConnectionDraft(window.location.origin)
      const accountId = draft.value.instagramBusinessAccountId || ''
      const accessToken = draft.value.accessToken || ''
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
    return (
      <div className="p-6 space-y-3">
        <div className="error-note">
          <strong>오류:</strong> {error || '데이터를 불러오지 못했습니다.'}
        </div>
        <button onClick={() => loadDashboard(days)} className="button-secondary text-sm">
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <ErrorBoundary>
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      {/* Hero Header */}
      <section className="dashboard-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="dashboard-eyebrow">Dashboard</p>
            <h1 className="dashboard-title">마케팅 대시보드</h1>
            <p className="dashboard-copy">채널 성과와 예약 현황을 한눈에 파악합니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
              {([7, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`px-4 py-1.5 text-xs font-semibold transition-colors ${
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
            {syncMessage && (
              <span className="text-xs font-medium text-[var(--accent)] bg-[var(--accent-soft)] px-2 py-1 rounded-full">
                {syncMessage}
              </span>
            )}
            <p className="text-xs text-[var(--text-muted)]">
              마지막 동기화: {formatSyncTime(data.lastSyncAt)}
            </p>
            <button
              type="button"
              className="button-secondary text-xs"
              onClick={() => void handleSync()}
              disabled={syncing}
            >
              {syncing ? '동기화 중...' : '동기화'}
            </button>
          </div>
        </div>
      </section>

      {/* Performance anomaly alerts */}
      {data.alerts && data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((alert, i) => (
            <div key={i} className={`soft-card flex items-start gap-3 ${
              alert.type === 'warning' ? 'border-l-4 border-rose-500' :
              alert.type === 'success' ? 'border-l-4 border-emerald-500' :
              'border-l-4 border-[var(--accent)]'
            }`}>
              <span className="text-base">{alert.type === 'warning' ? '⚠️' : alert.type === 'success' ? '🎉' : 'ℹ️'}</span>
              <p className="text-sm text-[var(--text-base)]">{alert.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* 오늘의 할 일 AI Briefing Card */}
      {(() => {
        // 도달 추세 계산: 최근 7일 평균 vs 이전 7일 평균
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
            if (changePct > 0) {
              trendText = `상승 중 (전주 대비 +${changePct}%)`
              trendDirection = 'up'
            } else if (changePct < 0) {
              trendText = `하락 중 (전주 대비 ${changePct}%)`
              trendDirection = 'down'
            } else {
              trendText = '변동 없음'
            }
          }
        } else if (reachArr.length >= 7) {
          const recent = reachArr.slice(-7)
          const avg = Math.round(recent.reduce((s, r) => s + r.reach, 0) / 7)
          trendText = `최근 7일 평균 ${avg.toLocaleString()}`
        }

        // AI 추천 (규칙 기반)
        let recommendation = '꾸준한 게시가 도달 성장의 핵심입니다'
        if (data.todayScheduled === 0) {
          recommendation = '오늘 게시할 콘텐츠를 만들어보세요'
        } else if (trendDirection === 'down') {
          recommendation = '캐러셀/릴스 등 다양한 형식을 시도해보세요'
        }

        return (
          <div className="soft-card" style={{ borderLeft: '4px solid var(--accent)' }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-base">📋</span>
              <p className="text-sm font-semibold text-[var(--text-strong)]">오늘의 할 일</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="soft-panel text-center">
                <p className="text-2xl font-bold text-[var(--accent)]">{data.todayScheduled}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">오늘 예약</p>
              </div>
              <div className="soft-panel text-center">
                <p className="text-2xl font-bold text-[var(--text-strong)]">{data.weekScheduled}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">이번 주</p>
              </div>
            </div>
            {trendText && (
              <p className="text-xs text-[var(--text-muted)] mb-2">
                도달 추세: <span className={`font-medium ${trendDirection === 'up' ? 'text-emerald-600' : trendDirection === 'down' ? 'text-rose-600' : 'text-[var(--text-strong)]'}`}>{trendText}</span>
              </p>
            )}
            <p className="text-sm text-[var(--text-base)] mb-4">
              💡 {recommendation}
            </p>
            <div className="flex gap-2">
              <a href="/sns/studio" className="button-primary text-xs flex-1 text-center">콘텐츠 만들기</a>
              <a href="/sns/calendar" className="button-secondary text-xs">캘린더 보기</a>
            </div>
          </div>
        )
      })()}

      {/* 예약된 게시물 미리보기 */}
      {data.upcomingPosts.length > 0 && (
        <div className="panel">
          <p className="text-sm font-semibold text-[var(--text-strong)] mb-3">📅 예약된 게시물</p>
          <div className="space-y-2">
            {data.upcomingPosts.map((post) => {
              const dt = new Date(post.scheduledAt)
              const now = new Date()
              const isToday = dt.toDateString() === now.toDateString()
              const tomorrow = new Date(now)
              tomorrow.setDate(tomorrow.getDate() + 1)
              const isTomorrow = dt.toDateString() === tomorrow.toDateString()
              const dateLabel = isToday
                ? '오늘'
                : isTomorrow
                  ? '내일'
                  : `${dt.getMonth() + 1}/${dt.getDate()}`
              const time = dt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
              const typeLabels: Record<string, string> = { TEXT: '텍스트', CAROUSEL: '카드뉴스', VIDEO: '비디오' }
              return (
                <div key={post.id} className="soft-panel flex items-center gap-3">
                  <span className="accent-pill text-xs">{dateLabel} {time}</span>
                  <span className="text-xs text-[var(--text-muted)]">{typeLabels[post.draftType] || post.draftType}</span>
                  <span className="text-sm text-[var(--text-strong)] truncate">{post.draftTitle}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-3">
            <a href="/sns/calendar" className="text-xs text-[var(--accent)] underline">전체 캘린더 보기 →</a>
          </div>
        </div>
      )}

      {data.kpiGoals.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {data.kpiGoals.map((kpi, i) => {
            const pct = kpi.targetValue > 0 ? Math.round((kpi.currentValue / kpi.targetValue) * 100) : 0
            const borderColors = ['#00d4ff', '#0066ff', '#ffaa00', '#00ff88']
            const borderColor = borderColors[i % borderColors.length]
            return (
              <div key={kpi.id} className="metric-card" style={{ borderTop: `4px solid ${borderColor}` }}>
                <p className="metric-label">{kpi.title}</p>
                <p className="metric-value">
                  {kpi.currentValue.toLocaleString()}{kpi.unit ? ` ${kpi.unit}` : ''}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  목표 {kpi.targetValue.toLocaleString()}{kpi.unit ? ` ${kpi.unit}` : ''} · {pct}%
                </p>
                <div className="mt-3 h-1.5 rounded-full bg-[var(--surface-sub)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: borderColor }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="soft-card">
          <p className="text-sm text-[var(--text-muted)]">
            KPI 목표를 설정하세요.{' '}
            <a href="/goals" className="text-[var(--accent)] underline">KPI 관리 →</a>
          </p>
        </div>
      )}

      {/* Engagement Summary */}
      {(() => {
        const totalLikes = data.topPosts.reduce((s, p) => s + (p.like_count || 0), 0)
        const totalComments = data.topPosts.reduce((s, p) => s + (p.comments_count || 0), 0)
        const postCount = data.topPosts.length
        return (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="metric-card" style={{ borderTop: '4px solid #ff4466' }}>
              <p className="metric-label">총 좋아요</p>
              <p className="metric-value">{totalLikes.toLocaleString()}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">상위 게시물 기준</p>
            </div>
            <div className="metric-card" style={{ borderTop: '4px solid #6aabcc' }}>
              <p className="metric-label">총 댓글</p>
              <p className="metric-value">{totalComments.toLocaleString()}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">상위 게시물 기준</p>
            </div>
            <div className="metric-card" style={{ borderTop: '4px solid #00d4ff' }}>
              <p className="metric-label">게시 빈도</p>
              <p className="metric-value">이번 달 {postCount}개</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">분석된 게시물 수</p>
            </div>
          </div>
        )
      })()}

      {/* Content Type Breakdown */}
      {data.topPosts.length > 0 && (() => {
        const typeCounts: Record<string, number> = {}
        data.topPosts.forEach((p) => {
          const t = p.media_type || 'UNKNOWN'
          typeCounts[t] = (typeCounts[t] || 0) + 1
        })
        const total = data.topPosts.length
        const typeLabels: Record<string, string> = {
          IMAGE: '이미지', VIDEO: '비디오', CAROUSEL_ALBUM: '캐러셀', UNKNOWN: '기타',
        }
        const typeColors: Record<string, string> = {
          IMAGE: '#00d4ff', VIDEO: '#0066ff', CAROUSEL_ALBUM: '#ffaa00', UNKNOWN: '#3a6080',
        }
        return (
          <div className="soft-card">
            <p className="section-title mb-4">콘텐츠 유형별 분포</p>
            <div className="space-y-3">
              {Object.entries(typeCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => {
                  const pct = Math.round((count / total) * 100)
                  const color = typeColors[type] || '#3a6080'
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-[var(--text-strong)] font-semibold">{typeLabels[type] || type}</span>
                        </div>
                        <span className="text-[var(--text-muted)]">{count}개 · {pct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--surface-sub)]">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )
      })()}

      <ReachChart data={data.reachDaily} />
      <p className="text-[11px] text-[var(--text-muted)] mt-1">
        * Instagram Login 연동 기준 데이터입니다. Facebook 연동 시 광고 포함 정확한 도달 데이터를 확인할 수 있습니다.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <TopPosts posts={data.topPosts} />
        <FollowerChart data={data.followerTrend} currentFollowers={data.currentFollowers} />
      </div>

      <div className="soft-card">
        <div className="flex items-center justify-between mb-4">
          <p className="section-title">AI 성과 추천</p>
          <a href="/sns/analytics" className="text-xs text-[var(--accent)] font-medium hover:underline">전체 리포트 보기 →</a>
        </div>
        {report?.recommendations?.length > 0 ? (
          <div className="space-y-3">
            {report.recommendations.slice(0, 3).map((rec: any, i: number) => (
              <div key={i} className="soft-panel" style={{ borderLeft: '3px solid var(--accent)' }}>
                <p className="text-sm font-semibold text-[var(--text-strong)]">{rec.topic}</p>
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
    </ErrorBoundary>
  )
}
