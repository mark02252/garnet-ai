# 대시보드 재설계 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/dashboard`를 마케팅 성과 대시보드로 전면 교체한다 — KPI 달성률, Instagram 도달 추이 차트, Top 게시물, 팔로워 추이를 한눈에 보여준다.

**Architecture:** API 라우트(`/api/dashboard`)에서 Prisma 쿼리로 데이터를 집계하고, 클라이언트 컴포넌트 대시보드 페이지에서 recharts로 시각화한다. accountId는 클라이언트(localStorage)에서 읽어 API에 전달한다.

**Tech Stack:** Next.js 15.2 App Router · Prisma · recharts · 기존 CSS 디자인 시스템

---

## 파일 구조

| 파일 | 유형 | 책임 |
|------|------|------|
| `app/api/dashboard/route.ts` | 신규 | KPI, 도달, 팔로워 데이터 집계 API |
| `lib/sns/instagram-api.ts` | 수정 | InstagramMediaInsight에 caption/media_type/permalink 추가 |
| `app/dashboard/page.tsx` | 전면 교체 | 클라이언트 컴포넌트, API 호출 + 레이아웃 |
| `components/dashboard/reach-chart.tsx` | 신규 | 도달 추이 라인 차트 |
| `components/dashboard/follower-chart.tsx` | 신규 | 팔로워 추이 라인 차트 |
| `components/dashboard/top-posts.tsx` | 신규 | Top 5 게시물 리스트 |

---

## Chunk 1: 인프라 (recharts + API + instagram-api 확장)

### Task 1: recharts 설치

**Files:**
- Modify: `package.json`

- [ ] **Step 1: recharts 설치**

```bash
cd "/Users/rnr/Documents/New project" && npm install recharts
```

- [ ] **Step 2: 설치 확인**

```bash
npm ls recharts
```
Expected: `recharts@2.x.x` 표시

- [ ] **Step 3: 커밋**

```bash
git add package.json package-lock.json
git commit -m "chore: add recharts dependency for dashboard charts"
```

---

### Task 2: InstagramMediaInsight 타입 확장

**Files:**
- Modify: `lib/sns/instagram-api.ts`

- [ ] **Step 1: 타입에 필드 추가**

`InstagramMediaInsight` 타입에 3개 필드 추가:

```typescript
export type InstagramMediaInsight = {
  id: string
  timestamp: string
  impressions: number
  reach: number
  engagement: number
  like_count: number
  comments_count: number
  caption?: string
  media_type?: string
  permalink?: string
}
```

- [ ] **Step 2: API fields 파라미터 확장**

`fetchInstagramMediaInsights` 함수의 Graph API 요청 fields를 변경:

기존:
```
fields=id,timestamp,like_count,comments_count
```

변경:
```
fields=id,timestamp,like_count,comments_count,caption,media_type,permalink
```

`mediaList` 타입도 업데이트:
```typescript
const { data: mediaList } = await mediaRes.json() as {
  data: Array<{
    id: string; timestamp: string; like_count: number; comments_count: number;
    caption?: string; media_type?: string; permalink?: string;
  }>
}
```

return 객체에 3개 필드 추가:
```typescript
return {
  id: media.id,
  timestamp: media.timestamp,
  impressions: getValue('impressions'),
  reach: getValue('reach'),
  engagement: getValue('engagement'),
  like_count: media.like_count,
  comments_count: media.comments_count,
  caption: media.caption,
  media_type: media.media_type,
  permalink: media.permalink,
} satisfies InstagramMediaInsight
```

- [ ] **Step 3: tsc 확인**

```bash
npx tsc --noEmit 2>&1 | grep -v "learn/route\|image-generator"
```
Expected: 새 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add lib/sns/instagram-api.ts
git commit -m "feat(instagram-api): add caption, media_type, permalink to media insights"
```

---

### Task 3: 대시보드 데이터 API 라우트

**Files:**
- Create: `app/api/dashboard/route.ts`

이 API는 대시보드에 필요한 모든 데이터를 한 번에 반환한다.

- [ ] **Step 1: API 라우트 생성**

```typescript
// app/api/dashboard/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchInstagramMediaInsights } from '@/lib/sns/instagram-api'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    days?: number; accountId?: string; accessToken?: string; personaId?: string;
  }
  const days = body.days || 30
  const since = new Date()
  since.setDate(since.getDate() - days)

  try {
    // 1. KPI Goals (상위 4개)
    const kpiGoals = await prisma.kpiGoal.findMany({
      take: 4,
      orderBy: { updatedAt: 'desc' },
    })

    // 2. Instagram Reach Daily
    const accountId = body.accountId || ''
    let reachDaily: Array<{ date: string; reach: number }> = []

    if (accountId) {
      const rows = await prisma.instagramReachDaily.findMany({
        where: { accountId, metricDate: { gte: since } },
        orderBy: { metricDate: 'asc' },
      })
      reachDaily = rows.map((r) => ({
        date: r.metricDate.toISOString().slice(0, 10),
        reach: r.reach,
      }))
    }

    // 3. Follower trend (SnsAnalyticsSnapshot)
    const personaId = body.personaId || ''
    let followerTrend: Array<{ date: string; followers: number }> = []

    if (personaId) {
      const rows = await prisma.snsAnalyticsSnapshot.findMany({
        where: { personaId, date: { gte: since } },
        orderBy: { date: 'asc' },
      })
      followerTrend = rows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        followers: r.followers,
      }))

      // 도달 데이터 보완 (InstagramReachDaily 없을 경우)
      if (reachDaily.length === 0) {
        reachDaily = rows.map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          reach: r.reach,
        }))
      }
    }

    // 4. Top posts (Instagram API 직접 호출)
    let topPosts: Array<{
      id: string; timestamp: string; reach: number;
      caption?: string; media_type?: string; permalink?: string;
    }> = []

    if (accountId) {
      try {
        const accessToken = body.accessToken || ''
        if (accessToken) {
          const allInsights = await fetchInstagramMediaInsights(accessToken, accountId)
          topPosts = allInsights
            .sort((a, b) => b.reach - a.reach)
            .slice(0, 5)
            .map((p) => ({
              id: p.id,
              timestamp: p.timestamp,
              reach: p.reach,
              caption: p.caption,
              media_type: p.media_type,
              permalink: p.permalink,
            }))
        }
      } catch {
        // Instagram API 오류 시 빈 배열 — 다른 데이터에 영향 없음
      }
    }

    // 5. 마지막 동기화 시간
    const lastReachSync = await prisma.instagramReachDaily.findFirst({
      orderBy: { fetchedAt: 'desc' },
      select: { fetchedAt: true },
    })
    const lastAnalyticsSync = await prisma.snsAnalyticsSnapshot.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    const lastSyncAt = [lastReachSync?.fetchedAt, lastAnalyticsSync?.createdAt]
      .filter(Boolean)
      .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] || null

    return NextResponse.json({
      kpiGoals,
      reachDaily,
      followerTrend,
      topPosts,
      lastSyncAt: lastSyncAt ? (lastSyncAt as Date).toISOString() : null,
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json({ error: '대시보드 데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}
```

- [ ] **Step 2: tsc 확인**

```bash
npx tsc --noEmit 2>&1 | grep -v "learn/route\|image-generator"
```

- [ ] **Step 3: 수동 확인**

```bash
curl -s -X POST "http://localhost:3000/api/dashboard" -H "Content-Type: application/json" -d '{"days":30}' | head -c 300
```
Expected: JSON 응답 (kpiGoals, reachDaily 등)

- [ ] **Step 4: 커밋**

```bash
git add app/api/dashboard/route.ts
git commit -m "feat(dashboard): add aggregated dashboard data API route"
```

---

## Chunk 2: 차트 컴포넌트

### Task 4: 도달 추이 차트 컴포넌트

**Files:**
- Create: `components/dashboard/reach-chart.tsx`

- [ ] **Step 1: 컴포넌트 생성**

```tsx
'use client'

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

type ReachDataPoint = { date: string; reach: number; avg7d?: number }

function computeMovingAverage(data: ReachDataPoint[]): ReachDataPoint[] {
  return data.map((point, i) => {
    if (i < 6) return point
    const window = data.slice(i - 6, i + 1)
    const avg = Math.round(window.reduce((sum, p) => sum + p.reach, 0) / 7)
    return { ...point, avg7d: avg }
  })
}

export function ReachChart({ data }: { data: ReachDataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="panel flex items-center justify-center" style={{ height: 300 }}>
        <p className="text-sm text-[var(--text-muted)]">
          Instagram 연동 후 도달 데이터가 여기에 표시됩니다.{' '}
          <a href="/settings" className="text-[var(--accent)] underline">설정 →</a>
        </p>
      </div>
    )
  }

  const enriched = computeMovingAverage(data)

  return (
    <div className="panel">
      <p className="text-sm font-semibold text-[var(--text-strong)] mb-4">Instagram 도달 추이 (30일)</p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={enriched} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={50} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--surface-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [
              value.toLocaleString(),
              name === 'reach' ? '일별 도달' : '7일 평균',
            ]}
          />
          <Line
            type="monotone"
            dataKey="reach"
            stroke="#3182f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="avg7d"
            stroke="#6b7684"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
mkdir -p components/dashboard
git add components/dashboard/reach-chart.tsx
git commit -m "feat(dashboard): add reach trend line chart component"
```

---

### Task 5: 팔로워 추이 차트 컴포넌트

**Files:**
- Create: `components/dashboard/follower-chart.tsx`

- [ ] **Step 1: 컴포넌트 생성**

```tsx
'use client'

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

type FollowerDataPoint = { date: string; followers: number }

export function FollowerChart({ data }: { data: FollowerDataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="panel flex items-center justify-center" style={{ minHeight: 240 }}>
        <p className="text-sm text-[var(--text-muted)]">분석 동기화를 실행하면 팔로워 추이가 표시됩니다.</p>
      </div>
    )
  }

  const current = data[data.length - 1]?.followers ?? 0
  const oldest = data[0]?.followers ?? 0
  const diff = current - oldest
  const diffLabel = diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()

  return (
    <div className="panel">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-sm font-semibold text-[var(--text-strong)]">팔로워 추이</p>
        <div className="text-right">
          <p className="text-lg font-bold text-[var(--text-strong)]">{current.toLocaleString()}</p>
          <p className={`text-xs ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            30일 전 대비 {diffLabel}
          </p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={50} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--surface-border)',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number) => [value.toLocaleString(), '팔로워']}
          />
          <Line type="monotone" dataKey="followers" stroke="#3182f6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add components/dashboard/follower-chart.tsx
git commit -m "feat(dashboard): add follower trend line chart component"
```

---

### Task 6: Top 게시물 컴포넌트

**Files:**
- Create: `components/dashboard/top-posts.tsx`

- [ ] **Step 1: 컴포넌트 생성**

```tsx
'use client'

type TopPost = {
  id: string
  timestamp: string
  reach: number
  caption?: string
  media_type?: string
  permalink?: string
}

function mediaTypeLabel(type?: string) {
  if (type === 'VIDEO') return '영상'
  if (type === 'CAROUSEL_ALBUM') return '캐러셀'
  return '이미지'
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(new Date(iso))
  } catch { return iso.slice(5, 10) }
}

export function TopPosts({ posts }: { posts: TopPost[] }) {
  if (posts.length === 0) {
    return (
      <div className="panel flex items-center justify-center" style={{ minHeight: 240 }}>
        <p className="text-sm text-[var(--text-muted)]">
          Instagram 연동 후 인기 게시물이 여기에 표시됩니다.
        </p>
      </div>
    )
  }

  return (
    <div className="panel">
      <p className="text-sm font-semibold text-[var(--text-strong)] mb-3">Top 게시물 (도달 기준)</p>
      <div className="space-y-2">
        {posts.map((post, i) => (
          <div key={post.id} className="flex items-start gap-3 py-2 border-b border-[var(--surface-border)] last:border-0">
            <span className="text-sm font-bold text-[var(--accent)] w-5 shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[var(--text-base)] truncate">
                {post.caption?.slice(0, 50) || '(캡션 없음)'}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {mediaTypeLabel(post.media_type)} · {formatDate(post.timestamp)}
              </p>
            </div>
            <span className="text-sm font-semibold text-[var(--text-strong)] shrink-0">
              {post.reach.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add components/dashboard/top-posts.tsx
git commit -m "feat(dashboard): add top posts list component"
```

---

## Chunk 3: 대시보드 페이지 교체

### Task 7: 대시보드 페이지 전면 교체

**Files:**
- Modify: `app/dashboard/page.tsx` (전면 교체)

- [ ] **Step 1: 대시보드 페이지 작성**

기존 내용 전체를 아래로 교체:

```tsx
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

  useEffect(() => {
    void (async () => {
      try {
        const draft = await loadStoredMetaConnectionDraft(window.location.origin)
        const accountId = draft.value.instagramBusinessAccountId || ''
        const accessToken = draft.value.accessToken || ''

        // personaId 찾기: instagramHandle이 있는 첫 번째 페르소나
        let personaId = ''
        try {
          const pRes = await fetch('/api/sns/personas')
          if (pRes.ok) {
            const personas = await pRes.json() as Array<{ id: string; instagramHandle?: string | null }>
            const linked = personas.find((p) => p.instagramHandle)
            if (linked) personaId = linked.id
          }
        } catch { /* 무시 */ }

        const res = await fetch('/api/dashboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days: 30, accountId, accessToken, personaId }),
        })
        if (!res.ok) throw new Error('API 오류')
        const json = await res.json() as DashboardData
        setData(json)
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
      {/* 헤더 */}
      <div className="flex items-baseline justify-between">
        <div>
          <p className="dashboard-eyebrow">Garnet</p>
          <h1 className="dashboard-title">마케팅 대시보드</h1>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          마지막 동기화: {formatSyncTime(data.lastSyncAt)}
        </p>
      </div>

      {/* KPI 카드 */}
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

      {/* 도달 추이 차트 */}
      <ReachChart data={data.reachDaily} />

      {/* 하단 2열: Top 게시물 + 팔로워 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TopPosts posts={data.topPosts} />
        <FollowerChart data={data.followerTrend} />
      </div>

      {/* AI 추천 플레이스홀더 */}
      <div className="soft-panel">
        <p className="text-sm font-semibold text-[var(--text-strong)]">AI 성과 추천</p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Phase 2에서 AI 성과 분석 리포트가 연동되면, 추천 콘텐츠와 개선 방향이 여기에 표시됩니다.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: tsc 확인**

```bash
npx tsc --noEmit 2>&1 | grep -v "learn/route\|image-generator"
```

- [ ] **Step 3: 수동 확인**

`http://localhost:3000/dashboard` 접속:
- KPI 카드 표시 (또는 설정 안내)
- 도달 추이 차트 표시 (데이터 있으면 라인, 없으면 안내)
- Top 게시물 표시 (또는 안내)
- 팔로워 차트 표시 (또는 안내)
- AI 추천 플레이스홀더 표시

- [ ] **Step 4: 커밋**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(dashboard): replace playbook stats with marketing performance dashboard"
```

---

### Task 8: 통합 확인 + 최종 커밋

- [ ] **Step 1: 전체 확인**

1. `http://localhost:3000/dashboard` — 모든 섹션 렌더 확인
2. KPI가 있으면 카드 + 프로그레스 바 확인
3. Instagram 연동 상태면 도달 차트에 데이터 라인 확인
4. Top 게시물 5개 표시 확인 (caption, media_type, reach)
5. 팔로워 추이 차트 + 증감 표시 확인
6. 반응형: 브라우저 폭 줄여서 모바일 레이아웃 확인

- [ ] **Step 2: 최종 커밋 (변경사항 있으면)**

```bash
git add -A
git commit -m "feat: marketing dashboard v1 complete — KPI cards, reach chart, top posts, follower trend"
```
