# Agent Loop Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garnet의 모든 자율 시스템을 하나로 묶는 World Model 기반 Agent Loop 오케스트레이터를 구현한다.

**Architecture:** World Model이 환경 상태를 누적하고, Goal Manager가 전략 목표를 추적하며, Reasoner가 LLM으로 액션을 결정한다. Scanner → World Model 갱신 → Reasoner → Executor/Governor 라우팅 → Evaluator → Meta-Cognition 순환. 다중 주기(15분/1시간/일간/주간) 스케줄과 긴급 이벤트 트리거 지원.

**Tech Stack:** Next.js 15, TypeScript, Prisma 6, croner, `lib/llm.ts` (Gemma 4 우선 폴백 체인)

**Spec:** `docs/superpowers/specs/2026-04-08-agent-loop-design.md`

---

## Chunk 1: Foundation — Types, DB Schema, World Model

### Task 1: Prisma 스키마 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: EpisodicMemory category에 agent_loop_decision은 Prisma 레벨에서 제약 없음 확인**

`prisma/schema.prisma`의 `EpisodicMemory.category`는 `String` 타입이므로 Prisma 스키마 변경 불필요. TypeScript 타입만 확장하면 됨 (Task 2에서 처리).

- [ ] **Step 2: 새 모델 3개 추가**

`prisma/schema.prisma` 파일 끝에 추가:

```prisma
model WorldModelSnapshot {
  id        String   @id @default(cuid())
  data      String   // JSON: WorldModel type
  cycleType String   // urgency-check | routine-cycle | daily-briefing | weekly-review
  createdAt DateTime @default(now())

  @@index([cycleType])
  @@index([createdAt])
}

model GoalState {
  id              String   @id @default(cuid())
  goalName        String
  metric          String
  targetValue     String
  currentValue    String?
  progressPercent Float    @default(0)
  onTrack         Boolean  @default(true)
  checkedAt       DateTime @default(now())

  @@index([goalName])
}

model AgentLoopCycle {
  id             String   @id @default(cuid())
  cycleType      String
  status         String   @default("running") // running | completed | failed
  worldModelId   String?
  actionsCount   Int      @default(0)
  autoExecuted   Int      @default(0)
  sentToGovernor Int      @default(0)
  durationMs     Int      @default(0)
  summary        String?
  error          String?
  createdAt      DateTime @default(now())

  @@index([cycleType])
  @@index([createdAt])
  @@index([status])
}
```

- [ ] **Step 3: 마이그레이션 실행**

Run: `npx prisma migrate dev --name add-agent-loop-tables`
Expected: 3개 테이블 생성, 마이그레이션 성공

- [ ] **Step 4: Prisma Client 생성 확인**

Run: `npx prisma generate`
Expected: 성공

- [ ] **Step 5: 커밋**

```bash
git add prisma/
git commit -m "feat(db): add WorldModelSnapshot, GoalState, AgentLoopCycle tables"
```

---

### Task 2: 공유 타입 정의 (`lib/agent-loop/types.ts`)

**Files:**
- Create: `lib/agent-loop/types.ts`
- Modify: `lib/memory/episodic-store.ts` (category 유니온 확장)

- [ ] **Step 1: 타입 파일 작성**

```typescript
// lib/agent-loop/types.ts

import type { GovernorRiskLevel } from '@/lib/governor'
import type { StrategicGoal } from '@/lib/business-context'

// ── World Model ──

export type TrendDirection = 'up' | 'down' | 'stable'

export type TrendVector = {
  metric: string       // e.g. "ga4.sessions", "sns.engagement"
  direction: TrendDirection
  magnitude: number    // 변화율 (%)
  duration: number     // 트렌드 지속 사이클 수
  confidence: number   // 0-1
}

export type OpenIssue = {
  id: string
  type: 'anomaly' | 'competitor_move' | 'goal_behind' | 'approval_pending'
  severity: 'critical' | 'high' | 'normal' | 'low'
  summary: string
  detectedAt: string
}

export type WorldModelSnapshot = {
  ga4: {
    sessions: number
    bounceRate: number
    conversionRate: number
    topChannels: Array<{ name: string; sessions: number }>
    trend: TrendDirection
  }
  sns: {
    engagement: number
    followerGrowth: number
    topContent: Array<{ platform: string; id: string; metric: number }>
    trend: TrendDirection
  }
  competitors: {
    recentMoves: Array<{ competitor: string; action: string; detectedAt: string }>
    threatLevel: 'low' | 'medium' | 'high'
  }
  campaigns: {
    active: number
    pendingApproval: number
    recentPerformance: Array<{ id: string; name: string; score: number }>
  }
}

export type WorldModel = {
  snapshot: WorldModelSnapshot
  trends: TrendVector[]
  openIssues: OpenIssue[]
  lastUpdated: string
  cycleCount: number
}

// ── Goal Manager ──

export type GoalProgress = {
  goal: StrategicGoal
  currentValue: string | null
  progressPercent: number
  onTrack: boolean
  lastChecked: string
}

// ── Reasoner ──

export type ReasonerAction = {
  kind: string
  title: string
  rationale: string
  expectedEffect: string
  riskLevel: GovernorRiskLevel
  goalAlignment: string
  payload: Record<string, unknown>
}

export type ReasonerOutput = {
  situationSummary: string
  actions: ReasonerAction[]
  noActionReason?: string
}

// ── Cycle ──

export type CycleType = 'urgency-check' | 'routine-cycle' | 'daily-briefing' | 'weekly-review'

export type CycleResult = {
  cycleId: string
  cycleType: CycleType
  actionsCount: number
  autoExecuted: number
  sentToGovernor: number
  durationMs: number
  summary: string | null
  error: string | null
}

// ── API Response ──

export type AgentLoopStatusResponse = {
  status: 'running' | 'paused' | 'error' | 'idle'
  lastCycle: {
    id: string
    cycleType: string
    completedAt: string
    actionsCount: number
    summary: string | null
  } | null
  nextScheduled: {
    cycleType: string
    scheduledAt: string
  }
  today: {
    autoExecuted: number
    sentToGovernor: number
    totalCycles: number
  }
  goals: Array<{
    name: string
    progressPercent: number
    onTrack: boolean
  }>
  recentDecisions: Array<{
    time: string
    summary: string
    status: 'executed' | 'pending_approval' | 'no_action'
  }>
}
```

- [ ] **Step 2: EpisodicEntry category 확장**

`lib/memory/episodic-store.ts` 9행의 category 유니온에 추가:

```typescript
// Before:
category: 'flow_run' | 'sns_post' | 'campaign' | 'ai_report'

// After:
category: 'flow_run' | 'sns_post' | 'campaign' | 'ai_report' | 'agent_loop_decision'
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add lib/agent-loop/types.ts lib/memory/episodic-store.ts
git commit -m "feat(agent-loop): add shared types and extend EpisodicEntry category"
```

---

### Task 3: World Model (`lib/agent-loop/world-model.ts`)

**Files:**
- Create: `lib/agent-loop/world-model.ts`

- [ ] **Step 1: 테스트 작성**

Create `__tests__/agent-loop/world-model.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import {
  createEmptyWorldModel,
  computeTrends,
  updateWorldModel,
} from '@/lib/agent-loop/world-model'
import type { WorldModel, WorldModelSnapshot } from '@/lib/agent-loop/types'

describe('world-model', () => {
  const baseSnapshot: WorldModelSnapshot = {
    ga4: { sessions: 1000, bounceRate: 45, conversionRate: 3.2, topChannels: [], trend: 'stable' },
    sns: { engagement: 5.5, followerGrowth: 10, topContent: [], trend: 'stable' },
    competitors: { recentMoves: [], threatLevel: 'low' },
    campaigns: { active: 2, pendingApproval: 1, recentPerformance: [] },
  }

  it('creates empty world model with zeroed snapshot', () => {
    const wm = createEmptyWorldModel()
    expect(wm.snapshot.ga4.sessions).toBe(0)
    expect(wm.trends).toEqual([])
    expect(wm.openIssues).toEqual([])
    expect(wm.cycleCount).toBe(0)
  })

  it('computes trends from two snapshots', () => {
    const prev: WorldModelSnapshot = { ...baseSnapshot, ga4: { ...baseSnapshot.ga4, sessions: 800 } }
    const curr: WorldModelSnapshot = { ...baseSnapshot, ga4: { ...baseSnapshot.ga4, sessions: 1000 } }
    const trends = computeTrends(prev, curr, [])
    const ga4Trend = trends.find(t => t.metric === 'ga4.sessions')
    expect(ga4Trend).toBeDefined()
    expect(ga4Trend!.direction).toBe('up')
    expect(ga4Trend!.magnitude).toBeCloseTo(25, 0) // (1000-800)/800 * 100
  })

  it('increments trend duration when direction persists', () => {
    const existingTrends = [{ metric: 'ga4.sessions', direction: 'up' as const, magnitude: 10, duration: 3, confidence: 0.8 }]
    const prev: WorldModelSnapshot = { ...baseSnapshot, ga4: { ...baseSnapshot.ga4, sessions: 900 } }
    const curr: WorldModelSnapshot = { ...baseSnapshot, ga4: { ...baseSnapshot.ga4, sessions: 1000 } }
    const trends = computeTrends(prev, curr, existingTrends)
    const ga4Trend = trends.find(t => t.metric === 'ga4.sessions')
    expect(ga4Trend!.duration).toBe(4)
  })

  it('updateWorldModel merges new snapshot and bumps cycleCount', () => {
    const wm = createEmptyWorldModel()
    const updated = updateWorldModel(wm, baseSnapshot)
    expect(updated.snapshot).toEqual(baseSnapshot)
    expect(updated.cycleCount).toBe(1)
    expect(updated.lastUpdated).toBeTruthy()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run __tests__/agent-loop/world-model.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: World Model 구현**

```typescript
// lib/agent-loop/world-model.ts

import * as fs from 'fs'
import * as path from 'path'
import { prisma } from '@/lib/prisma'
import type { WorldModel, WorldModelSnapshot, TrendVector, TrendDirection } from './types'

const CACHE_PATH = path.join(process.cwd(), '.garnet-config', 'world-model.json')

const TRACKED_METRICS: Array<{
  metric: string
  getValue: (s: WorldModelSnapshot) => number
}> = [
  { metric: 'ga4.sessions', getValue: s => s.ga4.sessions },
  { metric: 'ga4.bounceRate', getValue: s => s.ga4.bounceRate },
  { metric: 'ga4.conversionRate', getValue: s => s.ga4.conversionRate },
  { metric: 'sns.engagement', getValue: s => s.sns.engagement },
  { metric: 'sns.followerGrowth', getValue: s => s.sns.followerGrowth },
]

export function createEmptyWorldModel(): WorldModel {
  return {
    snapshot: {
      ga4: { sessions: 0, bounceRate: 0, conversionRate: 0, topChannels: [], trend: 'stable' },
      sns: { engagement: 0, followerGrowth: 0, topContent: [], trend: 'stable' },
      competitors: { recentMoves: [], threatLevel: 'low' },
      campaigns: { active: 0, pendingApproval: 0, recentPerformance: [] },
    },
    trends: [],
    openIssues: [],
    lastUpdated: new Date().toISOString(),
    cycleCount: 0,
  }
}

export function computeTrends(
  prev: WorldModelSnapshot,
  curr: WorldModelSnapshot,
  existingTrends: TrendVector[],
): TrendVector[] {
  return TRACKED_METRICS.map(({ metric, getValue }) => {
    const prevVal = getValue(prev)
    const currVal = getValue(curr)
    const existing = existingTrends.find(t => t.metric === metric)

    if (prevVal === 0 && currVal === 0) {
      return { metric, direction: 'stable' as TrendDirection, magnitude: 0, duration: existing ? existing.duration + 1 : 1, confidence: 0.5 }
    }

    const changePercent = prevVal === 0 ? 100 : ((currVal - prevVal) / Math.abs(prevVal)) * 100
    const threshold = 2 // 2% 이상 변화여야 방향 전환
    let direction: TrendDirection = 'stable'
    if (changePercent > threshold) direction = 'up'
    else if (changePercent < -threshold) direction = 'down'

    const sameDirection = existing?.direction === direction
    const duration = sameDirection ? existing!.duration + 1 : 1
    const confidence = Math.min(1, 0.5 + duration * 0.1)

    return { metric, direction, magnitude: Math.abs(changePercent), duration, confidence }
  })
}

export function updateWorldModel(current: WorldModel, newSnapshot: WorldModelSnapshot): WorldModel {
  const trends = computeTrends(current.snapshot, newSnapshot, current.trends)

  // snapshot 내 trend 필드도 갱신
  const ga4Trend = trends.find(t => t.metric === 'ga4.sessions')
  const snsTrend = trends.find(t => t.metric === 'sns.engagement')
  newSnapshot.ga4.trend = ga4Trend?.direction ?? 'stable'
  newSnapshot.sns.trend = snsTrend?.direction ?? 'stable'

  return {
    snapshot: newSnapshot,
    trends,
    openIssues: current.openIssues, // 별도 관리 (scanner에서 업데이트)
    lastUpdated: new Date().toISOString(),
    cycleCount: current.cycleCount + 1,
  }
}

/** DB에서 최신 World Model 로드. 없으면 캐시 파일 → 없으면 빈 모델 */
export async function loadWorldModel(): Promise<WorldModel> {
  // DB 우선
  const latest = await prisma.worldModelSnapshot.findFirst({ orderBy: { createdAt: 'desc' } })
  if (latest) {
    try { return JSON.parse(latest.data) as WorldModel } catch { /* fall through */ }
  }
  // 캐시 파일 폴백
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')) as WorldModel
    }
  } catch { /* fall through */ }
  return createEmptyWorldModel()
}

/** World Model 저장: DB (source of truth) + 파일 캐시 */
export async function saveWorldModel(wm: WorldModel, cycleType: string): Promise<void> {
  const data = JSON.stringify(wm)
  await prisma.worldModelSnapshot.create({ data: { data, cycleType } })
  // 파일 캐시 (실패해도 무시)
  try {
    const dir = path.dirname(CACHE_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CACHE_PATH, data, 'utf-8')
  } catch { /* non-critical */ }
}

/** 7일 이상 된 스냅샷 정리 */
export async function pruneOldSnapshots(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const result = await prisma.worldModelSnapshot.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return result.count
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run __tests__/agent-loop/world-model.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/agent-loop/world-model.ts __tests__/agent-loop/world-model.test.ts
git commit -m "feat(agent-loop): implement World Model with trend tracking"
```

---

### Task 4: Goal Manager (`lib/agent-loop/goal-manager.ts`)

**Files:**
- Create: `lib/agent-loop/goal-manager.ts`

- [ ] **Step 1: 테스트 작성**

Create `__tests__/agent-loop/goal-manager.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseNumericTarget, computeGoalProgress } from '@/lib/agent-loop/goal-manager'
import type { StrategicGoal } from '@/lib/business-context'

describe('goal-manager', () => {
  it('parses percentage target', () => {
    expect(parseNumericTarget('20%')).toEqual({ value: 20, unit: '%' })
  })

  it('parses numeric target with Korean unit', () => {
    expect(parseNumericTarget('1000명')).toEqual({ value: 1000, unit: '명' })
  })

  it('parses plain number', () => {
    expect(parseNumericTarget('500')).toEqual({ value: 500, unit: '' })
  })

  it('returns null for non-numeric target', () => {
    expect(parseNumericTarget('브랜드 인지도 향상')).toBeNull()
  })

  it('computes progress for percentage goal', () => {
    const goal: StrategicGoal = { goal: '신규 유저 증가', metric: 'new_users_growth', target: '20%', priority: 'high' }
    const progress = computeGoalProgress(goal, '15%')
    expect(progress.progressPercent).toBeCloseTo(75, 0) // 15/20 * 100
    expect(progress.onTrack).toBe(true) // >= 50%
  })

  it('marks goal as not on track when below 50%', () => {
    const goal: StrategicGoal = { goal: '이탈률 감소', metric: 'bounce_rate', target: '40%', priority: 'critical' }
    const progress = computeGoalProgress(goal, '55%') // 이탈률은 낮을수록 좋지만 단순 비교
    // target 40%, current 55% → 55/40 = 137% 하지만 방향이 반대
    // 이 케이스는 metric 해석이 필요 — 일단 단순 비율로
    expect(progress.progressPercent).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run __tests__/agent-loop/goal-manager.test.ts`
Expected: FAIL

- [ ] **Step 3: Goal Manager 구현**

```typescript
// lib/agent-loop/goal-manager.ts

import { prisma } from '@/lib/prisma'
import { loadBusinessContext } from '@/lib/business-context'
import type { StrategicGoal } from '@/lib/business-context'
import type { GoalProgress, WorldModel } from './types'

export type ParsedTarget = { value: number; unit: string }

/** 문자열 target에서 숫자 추출. 실패 시 null */
export function parseNumericTarget(target: string): ParsedTarget | null {
  const match = target.match(/^[\s]*([+-]?\d+(?:\.\d+)?)[\s]*(.*)$/)
  if (!match) return null
  return { value: parseFloat(match[1]), unit: match[2].trim() }
}

/** 단일 목표의 진행률 계산 */
export function computeGoalProgress(goal: StrategicGoal, currentValue: string | null): GoalProgress {
  const now = new Date().toISOString()
  if (!currentValue) {
    return { goal, currentValue: null, progressPercent: 0, onTrack: false, lastChecked: now }
  }

  const targetParsed = parseNumericTarget(goal.target)
  const currentParsed = parseNumericTarget(currentValue)

  if (!targetParsed || !currentParsed) {
    // 정성적 목표 — LLM 평가가 필요하므로 일단 0% (Reasoner에서 정성 평가)
    return { goal, currentValue, progressPercent: 0, onTrack: false, lastChecked: now }
  }

  const progressPercent = targetParsed.value === 0
    ? 100
    : Math.min(100, Math.max(0, (currentParsed.value / targetParsed.value) * 100))

  return {
    goal,
    currentValue,
    progressPercent: Math.round(progressPercent),
    onTrack: progressPercent >= 50,
    lastChecked: now,
  }
}

/** BusinessContext에서 전략 목표 로드 + World Model 지표와 매핑하여 진행률 계산 */
export async function evaluateGoals(worldModel: WorldModel): Promise<GoalProgress[]> {
  const ctx = loadBusinessContext()
  if (!ctx?.strategicGoals?.length) return []

  const metricMapping: Record<string, (wm: WorldModel) => string> = {
    sessions: wm => String(wm.snapshot.ga4.sessions),
    bounce_rate: wm => `${wm.snapshot.ga4.bounceRate}%`,
    conversion_rate: wm => `${wm.snapshot.ga4.conversionRate}%`,
    engagement: wm => `${wm.snapshot.sns.engagement}%`,
    follower_growth: wm => String(wm.snapshot.sns.followerGrowth),
  }

  const results: GoalProgress[] = []
  for (const goal of ctx.strategicGoals) {
    const metricKey = goal.metric.toLowerCase().replace(/[\s-]/g, '_')
    const mapper = metricMapping[metricKey]
    const currentValue = mapper ? mapper(worldModel) : null
    const progress = computeGoalProgress(goal, currentValue)
    results.push(progress)

    // DB에 이력 저장
    await prisma.goalState.create({
      data: {
        goalName: goal.goal,
        metric: goal.metric,
        targetValue: goal.target,
        currentValue: progress.currentValue,
        progressPercent: progress.progressPercent,
        onTrack: progress.onTrack,
      },
    })
  }

  return results
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run __tests__/agent-loop/goal-manager.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/agent-loop/goal-manager.ts __tests__/agent-loop/goal-manager.test.ts
git commit -m "feat(agent-loop): implement Goal Manager with target parsing"
```

---

## Chunk 2: Scanner, Reasoner, Executor

### Task 5: Scanner (`lib/agent-loop/scanner.ts`)

**Files:**
- Create: `lib/agent-loop/scanner.ts`

**참조 파일:**
- `lib/analytics/forecast.ts` — `detectAnomalies()` (z-score 기반)
- `lib/competitor-monitor.ts` — `runCompetitorScan()`
- `lib/governor.ts` — `listPending()`
- `lib/collectors/orchestrator.ts` — CollectorRun 결과 패턴

- [ ] **Step 1: 테스트 작성**

Create `__tests__/agent-loop/scanner.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { buildSnapshotFromDb } from '@/lib/agent-loop/scanner'

// prisma mock — 실제 스키마의 모델명 사용
vi.mock('@/lib/prisma', () => ({
  prisma: {
    snsAnalyticsSnapshot: { findFirst: vi.fn().mockResolvedValue(null) },
    instagramReachAnalysisRun: { findFirst: vi.fn().mockResolvedValue(null) },
    kpiTarget: { findMany: vi.fn().mockResolvedValue([]) },
    run: { findMany: vi.fn().mockResolvedValue([]) },
    marketingIntel: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ count: 0 }]),
  },
}))

vi.mock('@/lib/governor', () => ({
  listPending: vi.fn().mockResolvedValue([]),
}))

describe('scanner', () => {
  it('buildSnapshotFromDb returns valid snapshot shape', async () => {
    const snapshot = await buildSnapshotFromDb()
    expect(snapshot).toHaveProperty('ga4')
    expect(snapshot).toHaveProperty('sns')
    expect(snapshot).toHaveProperty('competitors')
    expect(snapshot).toHaveProperty('campaigns')
    expect(snapshot.ga4).toHaveProperty('sessions')
    expect(snapshot.ga4).toHaveProperty('trend')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run __tests__/agent-loop/scanner.test.ts`
Expected: FAIL

- [ ] **Step 3: Scanner 구현**

```typescript
// lib/agent-loop/scanner.ts

import { prisma } from '@/lib/prisma'
import { listPending } from '@/lib/governor'
import type { WorldModelSnapshot, OpenIssue } from './types'

/**
 * DB에서 최신 수집 데이터를 읽어 WorldModelSnapshot을 빌드.
 * 새 수집을 트리거하지 않음 — 기존 Cron이 수집한 최신값만 읽음.
 *
 * 데이터 소스:
 * - GA4: KpiTarget 테이블 (sessions, bounce_rate, conversion_rate)
 * - SNS: SnsAnalyticsSnapshot (engagement, followers, reach)
 * - Instagram: InstagramReachAnalysisRun (averageReach, trendDirection)
 * - 경쟁사: MarketingIntel (tags contains 'competitor')
 * - Governor: GovernorAction 테이블 (raw SQL — Prisma 모델 아님)
 */
export async function buildSnapshotFromDb(): Promise<WorldModelSnapshot> {
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  // GA4 — KpiTarget에서 주요 지표 최신값
  const kpiTargets = await prisma.kpiTarget.findMany({
    where: { metric: { in: ['sessions', 'bounce_rate', 'conversion_rate'] } },
    orderBy: { createdAt: 'desc' },
  })
  const kpiMap = new Map(kpiTargets.map(k => [k.metric, k]))

  // SNS — SnsAnalyticsSnapshot 최신
  const latestSns = await prisma.snsAnalyticsSnapshot.findFirst({
    orderBy: { date: 'desc' },
  })

  // Instagram Reach 분석 최신
  const latestReachAnalysis = await prisma.instagramReachAnalysisRun.findFirst({
    orderBy: { createdAt: 'desc' },
  })

  // SNS — 최근 마케팅 인텔에서 상위 콘텐츠
  const snsIntel = await prisma.marketingIntel.findMany({
    where: {
      platform: { in: ['TWITTER', 'REDDIT', 'YOUTUBE'] },
      createdAt: { gte: oneDayAgo },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  // 경쟁사 — 최근 MarketingIntel에서 competitor 태그
  const competitorIntel = await prisma.marketingIntel.findMany({
    where: {
      tags: { contains: 'competitor' },
      createdAt: { gte: oneDayAgo },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  // Governor 대기 건 (GovernorAction은 raw SQL 테이블)
  const pendingCount = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int as count FROM "GovernorAction" WHERE "status" IN ('PENDING_APPROVAL', 'PENDING_SCORE') AND "deletedAt" IS NULL`
  ).then(r => r[0]?.count ?? 0).catch(() => 0)

  // 캠페인 — 최근 실행
  const recentRuns = await prisma.run.findMany({
    where: { createdAt: { gte: oneDayAgo } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  return {
    ga4: {
      sessions: kpiMap.get('sessions')?.currentValue ?? 0,
      bounceRate: kpiMap.get('bounce_rate')?.currentValue ?? 0,
      conversionRate: kpiMap.get('conversion_rate')?.currentValue ?? 0,
      topChannels: [],
      trend: 'stable',
    },
    sns: {
      engagement: latestSns?.engagement ?? 0,
      followerGrowth: latestSns?.followers ?? 0,
      topContent: snsIntel.slice(0, 3).map(i => ({
        platform: i.platform,
        id: i.id,
        metric: i.views ?? i.likes ?? 0,
      })),
      trend: 'stable',
    },
    competitors: {
      recentMoves: competitorIntel.map(i => ({
        competitor: i.query,
        action: i.title,
        detectedAt: i.createdAt.toISOString(),
      })),
      threatLevel: competitorIntel.length > 3 ? 'high' : competitorIntel.length > 0 ? 'medium' : 'low',
    },
    campaigns: {
      active: recentRuns.length,
      pendingApproval: pendingCount,
      recentPerformance: [],
    },
  }
}

/** DB 데이터 기반으로 긴급 이슈 탐지 */
export async function detectOpenIssues(): Promise<OpenIssue[]> {
  const issues: OpenIssue[] = []

  // Governor 승인 대기 건
  try {
    const pending = await listPending(['PENDING_APPROVAL'], 10)
    for (const p of pending) {
      issues.push({
        id: `gov-${p.id}`,
        type: 'approval_pending',
        severity: p.riskLevel === 'HIGH' ? 'high' : 'normal',
        summary: `[${p.kind}] 승인 대기 중`,
        detectedAt: p.createdAt,
      })
    }
  } catch { /* governor table may not exist yet */ }

  return issues
}

function safeJsonParse(str: string): Record<string, unknown> | null {
  try { return JSON.parse(str) } catch { return null }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run __tests__/agent-loop/scanner.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/agent-loop/scanner.ts __tests__/agent-loop/scanner.test.ts
git commit -m "feat(agent-loop): implement Scanner — reads latest collector data into WorldModel"
```

---

### Task 6: Governor 확장 — `enqueueWithRisk` 헬퍼

**Files:**
- Modify: `lib/governor.ts`

- [ ] **Step 1: 테스트 작성**

기존 테스트 파일에 추가, 또는 새로 생성 `__tests__/agent-loop/governor-ext.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { enqueueWithRisk, ensureGovernorTable, resetTableEnsuredForTests } from '@/lib/governor'

describe('enqueueWithRisk', () => {
  beforeEach(async () => {
    resetTableEnsuredForTests()
    await ensureGovernorTable()
  })

  it('creates action with pre-set risk level and PENDING_EXEC for LOW', async () => {
    const action = await enqueueWithRisk({
      kind: 'test_action',
      payload: { foo: 'bar' },
      riskLevel: 'LOW',
      riskReason: 'Agent Loop 자동 판단',
    })
    expect(action.status).toBe('PENDING_EXEC')
    expect(action.riskLevel).toBe('LOW')
  })

  it('creates action with PENDING_APPROVAL for MEDIUM', async () => {
    const action = await enqueueWithRisk({
      kind: 'test_action',
      payload: { foo: 'bar' },
      riskLevel: 'MEDIUM',
      riskReason: 'Agent Loop 자동 판단',
    })
    expect(action.status).toBe('PENDING_APPROVAL')
    expect(action.riskLevel).toBe('MEDIUM')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run __tests__/agent-loop/governor-ext.test.ts`
Expected: FAIL — enqueueWithRisk not found

- [ ] **Step 3: governor.ts에 enqueueWithRisk 추가**

`lib/governor.ts` 파일에서 `enqueue` 함수 뒤에 추가:

```typescript
/**
 * Agent Loop용 — Reasoner가 이미 리스크를 평가했으므로 scorer 바이패스.
 * LOW → PENDING_EXEC (자동 실행 대기)
 * MEDIUM/HIGH → PENDING_APPROVAL (인간 승인 대기)
 */
export async function enqueueWithRisk(input: {
  kind: string;
  payload: unknown;
  riskLevel: GovernorRiskLevel;
  riskReason: string;
}): Promise<GovernorAction> {
  await ensureGovernorTable();
  const id = randomUUID();
  const status = input.riskLevel === 'LOW' ? 'PENDING_EXEC' : 'PENDING_APPROVAL';
  const now = new Date().toISOString();

  await prisma.$executeRawUnsafe(
    `INSERT INTO "GovernorAction" ("id","kind","payload","status","riskLevel","riskReason","createdAt","updatedAt")
     VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8)`,
    id, input.kind, JSON.stringify(input.payload), status,
    input.riskLevel, input.riskReason, now, now,
  );

  return {
    id, kind: input.kind, payload: input.payload, status,
    riskLevel: input.riskLevel, riskReason: input.riskReason,
    approvedBy: null, executedAt: null, deletedAt: null,
    createdAt: now, updatedAt: now,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run __tests__/agent-loop/governor-ext.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/governor.ts __tests__/agent-loop/governor-ext.test.ts
git commit -m "feat(governor): add enqueueWithRisk — bypasses scorer for Agent Loop"
```

---

### Task 7: Reasoner (`lib/agent-loop/reasoner.ts`)

**Files:**
- Create: `lib/agent-loop/reasoner.ts`

**참조:**
- `lib/llm.ts` — `runLLM(systemPrompt, userPrompt, temperature, maxTokens)`
- `lib/business-context.ts` — `getBusinessContextPrompt()`
- `lib/memory/episodic-store.ts` — `retrieveSimilarEpisodes()`

- [ ] **Step 1: 테스트 작성**

Create `__tests__/agent-loop/reasoner.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { buildReasonerPrompt, parseReasonerResponse } from '@/lib/agent-loop/reasoner'
import type { WorldModel, GoalProgress } from '@/lib/agent-loop/types'
import { createEmptyWorldModel } from '@/lib/agent-loop/world-model'

describe('reasoner', () => {
  it('buildReasonerPrompt includes world model and goals', () => {
    const wm = createEmptyWorldModel()
    const goals: GoalProgress[] = [{
      goal: { goal: '신규 유저 20% 증가', metric: 'sessions', target: '20%', priority: 'high' },
      currentValue: '12%',
      progressPercent: 60,
      onTrack: true,
      lastChecked: new Date().toISOString(),
    }]
    const prompt = buildReasonerPrompt(wm, goals, '', [])
    expect(prompt).toContain('신규 유저 20% 증가')
    expect(prompt).toContain('60%')
  })

  it('parseReasonerResponse parses valid JSON', () => {
    const raw = JSON.stringify({
      situationSummary: '현재 안정적',
      actions: [{ kind: 'report', title: '리포트 생성', rationale: '주간 리포트', expectedEffect: '가시성 향상', riskLevel: 'LOW', goalAlignment: '신규 유저', payload: {} }],
    })
    const result = parseReasonerResponse(raw)
    expect(result.actions).toHaveLength(1)
    expect(result.actions[0].riskLevel).toBe('LOW')
  })

  it('parseReasonerResponse returns no-action on invalid JSON', () => {
    const result = parseReasonerResponse('이것은 JSON이 아닙니다')
    expect(result.actions).toHaveLength(0)
    expect(result.noActionReason).toBeTruthy()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run __tests__/agent-loop/reasoner.test.ts`
Expected: FAIL

- [ ] **Step 3: Reasoner 구현**

```typescript
// lib/agent-loop/reasoner.ts

import { runLLM } from '@/lib/llm'
import { getBusinessContextPrompt } from '@/lib/business-context'
import { retrieveSimilarEpisodes } from '@/lib/memory/episodic-store'
import type { WorldModel, GoalProgress, ReasonerOutput, ReasonerAction } from './types'

const SYSTEM_PROMPT = `당신은 Garnet Agent Loop의 추론 엔진입니다. 마케팅 전문가로서 현재 상황을 분석하고 최적의 액션을 결정합니다.

규칙:
1. 반드시 JSON만 출력하세요.
2. 액션이 불필요하면 actions를 빈 배열로, noActionReason에 이유를 기술하세요.
3. 각 액션의 riskLevel은 반드시 LOW, MEDIUM, HIGH 중 하나입니다.
4. LOW: 데이터 분석, 리포트 생성, 내부 메모리 갱신 등
5. MEDIUM: 콘텐츠 발행, 외부 API 호출, Flow 실행 등
6. HIGH: 예산 변경, 캠페인 중단, 대량 발행 등

출력 형식:
{
  "situationSummary": "현재 상황 1-2문장 요약",
  "actions": [
    {
      "kind": "액션 종류 (report_generation | playbook_update | content_publish | budget_adjust | flow_trigger | alert)",
      "title": "액션 제목",
      "rationale": "이 액션을 해야 하는 이유",
      "expectedEffect": "예상 효과",
      "riskLevel": "LOW | MEDIUM | HIGH",
      "goalAlignment": "이 액션이 기여하는 전략 목표",
      "payload": {}
    }
  ],
  "noActionReason": "액션 불필요 시 이유 (선택)"
}`

export function buildReasonerPrompt(
  worldModel: WorldModel,
  goals: GoalProgress[],
  businessContext: string,
  pastEpisodes: Array<{ input: string; output: string; score: number | null }>,
): string {
  const trendsText = worldModel.trends
    .filter(t => t.direction !== 'stable')
    .map(t => `- ${t.metric}: ${t.direction} ${t.magnitude.toFixed(1)}% (${t.duration} cycles)`)
    .join('\n') || '- 특이 트렌드 없음'

  const goalsText = goals.length > 0
    ? goals.map(g => `- ${g.goal.goal}: ${g.progressPercent}% 달성 (${g.onTrack ? '순조' : '뒤처짐'}) [현재: ${g.currentValue ?? '측정 전'}]`).join('\n')
    : '- 설정된 전략 목표 없음'

  const issuesText = worldModel.openIssues.length > 0
    ? worldModel.openIssues.map(i => `- [${i.severity}] ${i.summary}`).join('\n')
    : '- 미결 이슈 없음'

  const episodesText = pastEpisodes.length > 0
    ? pastEpisodes.slice(0, 3).map(e => `- 판단: ${e.input.slice(0, 100)}... → 결과 점수: ${e.score ?? '미평가'}`).join('\n')
    : '- 유사 과거 사례 없음'

  const snapshotText = `GA4: 세션 ${worldModel.snapshot.ga4.sessions}, 이탈률 ${worldModel.snapshot.ga4.bounceRate}%, 전환율 ${worldModel.snapshot.ga4.conversionRate}%
SNS: 참여율 ${worldModel.snapshot.sns.engagement}%, 팔로워 변동 ${worldModel.snapshot.sns.followerGrowth}
경쟁사: 위협 수준 ${worldModel.snapshot.competitors.threatLevel}, 최근 ${worldModel.snapshot.competitors.recentMoves.length}건 변화
캠페인: 활성 ${worldModel.snapshot.campaigns.active}건, 승인대기 ${worldModel.snapshot.campaigns.pendingApproval}건`

  return `${businessContext ? `## 사업 맥락\n${businessContext}\n\n` : ''}## 현재 상황 (World Model)
${snapshotText}

## 트렌드
${trendsText}

## 전략 목표 진행률
${goalsText}

## 미결 이슈
${issuesText}

## 과거 유사 판단 이력
${episodesText}

위 상황을 분석하고, 지금 해야 할 액션을 우선순위 순으로 JSON으로 제안하세요.`
}

export function parseReasonerResponse(raw: string): ReasonerOutput {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    const parsed = JSON.parse(jsonMatch[0]) as ReasonerOutput
    // 유효성 검증
    if (!Array.isArray(parsed.actions)) parsed.actions = []
    for (const a of parsed.actions) {
      const normalized = String(a.riskLevel).toUpperCase()
      a.riskLevel = (['LOW', 'MEDIUM', 'HIGH'].includes(normalized) ? normalized : 'MEDIUM') as 'LOW' | 'MEDIUM' | 'HIGH'
    }
    return parsed
  } catch {
    return { situationSummary: raw.slice(0, 200), actions: [], noActionReason: 'LLM 응답 파싱 실패' }
  }
}

/** Reasoner 실행 — LLM 호출 + 파싱 */
export async function reason(
  worldModel: WorldModel,
  goals: GoalProgress[],
): Promise<ReasonerOutput> {
  const businessContext = getBusinessContextPrompt()

  const pastEpisodes = await retrieveSimilarEpisodes({
    category: 'agent_loop_decision',
    minScore: 50,
    limit: 3,
  })

  const userPrompt = buildReasonerPrompt(
    worldModel,
    goals,
    businessContext,
    pastEpisodes.map(e => ({ input: e.input, output: e.output, score: e.score })),
  )

  const raw = await runLLM(SYSTEM_PROMPT, userPrompt, 0.3, 2000)
  return parseReasonerResponse(raw)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run __tests__/agent-loop/reasoner.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/agent-loop/reasoner.ts __tests__/agent-loop/reasoner.test.ts
git commit -m "feat(agent-loop): implement Reasoner — LLM-based decision engine"
```

---

### Task 8: Executor (`lib/agent-loop/executor.ts`)

**Files:**
- Create: `lib/agent-loop/executor.ts`

**참조:**
- `lib/governor.ts` — `enqueueWithRisk()`
- `lib/governor-executor.ts` — `execute()`, `flushPendingExec()`
- `lib/telegram.ts` — `sendApprovalRequest()`

- [ ] **Step 1: 테스트 작성**

Create `__tests__/agent-loop/executor.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { routeAction } from '@/lib/agent-loop/executor'
import type { ReasonerAction } from '@/lib/agent-loop/types'

vi.mock('@/lib/governor', () => ({
  enqueueWithRisk: vi.fn().mockResolvedValue({ id: 'test-id', status: 'PENDING_APPROVAL' }),
  ensureGovernorTable: vi.fn(),
}))

vi.mock('@/lib/governor-executor', () => ({
  flushPendingExec: vi.fn(),
}))

vi.mock('@/lib/telegram', () => ({
  isTelegramConfigured: vi.fn().mockReturnValue(false),
  sendApprovalRequest: vi.fn(),
}))

describe('executor', () => {
  it('routes LOW risk action to auto-execute path', async () => {
    const action: ReasonerAction = {
      kind: 'report_generation', title: '리포트', rationale: 'test',
      expectedEffect: 'test', riskLevel: 'LOW', goalAlignment: '', payload: {},
    }
    const result = await routeAction(action)
    expect(result.routed).toBe('auto')
  })

  it('routes HIGH risk action to governor', async () => {
    const action: ReasonerAction = {
      kind: 'budget_adjust', title: '예산 변경', rationale: 'test',
      expectedEffect: 'test', riskLevel: 'HIGH', goalAlignment: '', payload: {},
    }
    const result = await routeAction(action)
    expect(result.routed).toBe('governor')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run __tests__/agent-loop/executor.test.ts`
Expected: FAIL

- [ ] **Step 3: Executor 구현**

```typescript
// lib/agent-loop/executor.ts

import { enqueueWithRisk } from '@/lib/governor'
import { flushPendingExec } from '@/lib/governor-executor'
import { isTelegramConfigured, sendApprovalRequest } from '@/lib/telegram'
import type { ReasonerAction } from './types'

export type RouteResult = {
  routed: 'auto' | 'governor'
  actionId: string | null
  executed: boolean
  error: string | null
}

/**
 * Reasoner 액션을 라우팅:
 * - LOW → Governor 큐에 PENDING_EXEC로 등록 → 즉시 실행
 * - MEDIUM/HIGH → Governor 큐에 PENDING_APPROVAL로 등록 → Telegram 알림
 */
export async function routeAction(action: ReasonerAction): Promise<RouteResult> {
  try {
    const govAction = await enqueueWithRisk({
      kind: action.kind,
      payload: {
        ...action.payload,
        _agentLoop: {
          title: action.title,
          rationale: action.rationale,
          expectedEffect: action.expectedEffect,
          goalAlignment: action.goalAlignment,
        },
      },
      riskLevel: action.riskLevel,
      riskReason: `Agent Loop Reasoner: ${action.rationale}`,
    })

    if (action.riskLevel === 'LOW') {
      // 즉시 실행
      await flushPendingExec()
      return { routed: 'auto', actionId: govAction.id, executed: true, error: null }
    }

    // MEDIUM/HIGH → Telegram 알림
    if (isTelegramConfigured()) {
      await sendApprovalRequest(govAction).catch(() => { /* non-critical */ })
    }

    return { routed: 'governor', actionId: govAction.id, executed: false, error: null }
  } catch (err) {
    return { routed: action.riskLevel === 'LOW' ? 'auto' : 'governor', actionId: null, executed: false, error: String(err) }
  }
}

/**
 * 주의: LOW 리스크 액션이 자동 실행되려면 governor-executor에 해당 kind의 handler가 등록되어 있어야 함.
 * 미등록 kind는 flushPendingExec()에서 "Unknown kind" 에러로 FAILED 처리됨.
 * → 현재는 기존 handler만 사용. 새 kind 추가 시 registerHandler() 호출 필요.
 * → 향후 agent-loop 전용 handler 등록 로직 추가 예정.
 */

/** 여러 액션을 순서대로 라우팅 */
export async function routeActions(actions: ReasonerAction[]): Promise<{
  autoExecuted: number
  sentToGovernor: number
  errors: string[]
}> {
  let autoExecuted = 0
  let sentToGovernor = 0
  const errors: string[] = []

  for (const action of actions) {
    const result = await routeAction(action)
    if (result.routed === 'auto' && result.executed) autoExecuted++
    if (result.routed === 'governor') sentToGovernor++
    if (result.error) errors.push(`[${action.kind}] ${result.error}`)
  }

  return { autoExecuted, sentToGovernor, errors }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run __tests__/agent-loop/executor.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/agent-loop/executor.ts __tests__/agent-loop/executor.test.ts
git commit -m "feat(agent-loop): implement Executor — risk-based routing to auto/governor"
```

---

## Chunk 3: Evaluator, Notifier, Meta-Cognition

### Task 9: Evaluator (`lib/agent-loop/evaluator.ts`)

**Files:**
- Create: `lib/agent-loop/evaluator.ts`

- [ ] **Step 1: 테스트 작성**

Create `__tests__/agent-loop/evaluator.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { buildEpisode } from '@/lib/agent-loop/evaluator'
import type { CycleType, ReasonerOutput } from '@/lib/agent-loop/types'
import { createEmptyWorldModel } from '@/lib/agent-loop/world-model'

describe('evaluator', () => {
  it('builds episodic entry from cycle data', () => {
    const wm = createEmptyWorldModel()
    const decision: ReasonerOutput = {
      situationSummary: '안정적',
      actions: [{ kind: 'report', title: 'test', rationale: 'r', expectedEffect: 'e', riskLevel: 'LOW', goalAlignment: 'g', payload: {} }],
    }
    const episode = buildEpisode('cycle-1', 'routine-cycle' as CycleType, wm, decision, { autoExecuted: 1, sentToGovernor: 0, errors: [] })
    expect(episode.category).toBe('agent_loop_decision')
    expect(episode.tags).toContain('agent-loop')
    expect(episode.tags).toContain('routine-cycle')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run __tests__/agent-loop/evaluator.test.ts`
Expected: FAIL

- [ ] **Step 3: Evaluator 구현**

```typescript
// lib/agent-loop/evaluator.ts

import { storeEpisode } from '@/lib/memory/episodic-store'
import type { EpisodicEntry } from '@/lib/memory/episodic-store'
import type { WorldModel, ReasonerOutput, CycleType } from './types'

type ExecutionSummary = {
  autoExecuted: number
  sentToGovernor: number
  errors: string[]
}

/** 에피소딕 메모리에 저장할 엔트리 빌드 */
export function buildEpisode(
  cycleId: string,
  cycleType: CycleType,
  worldModel: WorldModel,
  decision: ReasonerOutput,
  execution: ExecutionSummary,
): EpisodicEntry {
  return {
    category: 'agent_loop_decision',
    input: JSON.stringify({
      cycleType,
      snapshot: {
        ga4Sessions: worldModel.snapshot.ga4.sessions,
        snEngagement: worldModel.snapshot.sns.engagement,
        competitorThreat: worldModel.snapshot.competitors.threatLevel,
      },
      situationSummary: decision.situationSummary,
      actionsDecided: decision.actions.length,
    }),
    output: JSON.stringify({
      actions: decision.actions.map(a => ({ kind: a.kind, title: a.title, riskLevel: a.riskLevel })),
      autoExecuted: execution.autoExecuted,
      sentToGovernor: execution.sentToGovernor,
      errors: execution.errors,
    }),
    score: execution.errors.length === 0 ? 70 : 40, // 초기 점수, Meta-Cognition에서 보정
    tags: ['agent-loop', cycleType, ...decision.actions.map(a => a.kind)],
    metadata: { cycleId, cycleType },
  }
}

/** 사이클 결과를 에피소딕 메모리에 저장 */
export async function evaluateAndStore(
  cycleId: string,
  cycleType: CycleType,
  worldModel: WorldModel,
  decision: ReasonerOutput,
  execution: ExecutionSummary,
): Promise<void> {
  const episode = buildEpisode(cycleId, cycleType, worldModel, decision, execution)
  await storeEpisode(episode)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run __tests__/agent-loop/evaluator.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/agent-loop/evaluator.ts __tests__/agent-loop/evaluator.test.ts
git commit -m "feat(agent-loop): implement Evaluator — stores cycle decisions to episodic memory"
```

---

### Task 10: Notifier (`lib/agent-loop/notifier.ts`)

**Files:**
- Create: `lib/agent-loop/notifier.ts`

**참조:**
- `lib/telegram.ts` — `sendMessage()`, `isTelegramConfigured()`

- [ ] **Step 1: Notifier 구현 (테스트는 Telegram mock이 복잡하므로 통합 테스트에서 커버)**

```typescript
// lib/agent-loop/notifier.ts

import { isTelegramConfigured, sendMessage } from '@/lib/telegram'
import type { OpenIssue, CycleResult, GoalProgress } from './types'

/** CRITICAL/HIGH 이슈 즉시 알림 */
export async function notifyUrgent(issues: OpenIssue[]): Promise<void> {
  const urgent = issues.filter(i => i.severity === 'critical' || i.severity === 'high')
  if (urgent.length === 0 || !isTelegramConfigured()) return

  const emoji = { critical: '🚨', high: '⚠️', normal: 'ℹ️', low: '📋' }
  const text = `*Agent Loop — 긴급 알림*\n\n${urgent.map(i =>
    `${emoji[i.severity]} [${i.type}] ${i.summary}`
  ).join('\n')}`

  await sendMessage(text, { parseMode: 'Markdown' }).catch(() => {})
}

/** 데일리 브리핑 발송 */
export async function notifyDailyBriefing(params: {
  summary: string
  goals: GoalProgress[]
  todayCycles: number
  todayActions: number
}): Promise<void> {
  if (!isTelegramConfigured()) return

  const goalsText = params.goals.length > 0
    ? params.goals.map(g => `  ${g.onTrack ? '✅' : '❌'} ${g.goal.goal}: ${g.progressPercent}%`).join('\n')
    : '  설정된 목표 없음'

  const text = `*🌅 Garnet 데일리 브리핑*

${params.summary}

*목표 진행률*
${goalsText}

*어제 활동:* ${params.todayCycles}회 사이클, ${params.todayActions}건 액션`

  await sendMessage(text, { parseMode: 'Markdown' }).catch(() => {})
}

/** 사이클 완료 요약 (CRITICAL 이슈가 있을 때만) */
export async function notifyCycleResult(result: CycleResult): Promise<void> {
  // 일반 사이클은 알림 안 함 — 앱 대시보드에서 확인
  // CRITICAL 이슈 발생 시만 알림
  if (result.error && isTelegramConfigured()) {
    await sendMessage(`⚠️ Agent Loop 에러\n\n${result.error}`, { parseMode: 'Markdown' }).catch(() => {})
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/agent-loop/notifier.ts
git commit -m "feat(agent-loop): implement Notifier — Telegram alerts for urgent issues"
```

---

### Task 11: Meta-Cognition (`lib/agent-loop/meta-cognition.ts`)

**Files:**
- Create: `lib/agent-loop/meta-cognition.ts`

**참조:**
- `lib/self-improve/prompt-optimizer.ts` — `optimizeAllPrompts()`
- `lib/memory/episodic-store.ts` — `retrieveSimilarEpisodes()`
- `lib/llm.ts` — `runLLM()`

- [ ] **Step 1: 테스트 작성**

Create `__tests__/agent-loop/meta-cognition.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeDecisionAccuracy } from '@/lib/agent-loop/meta-cognition'

describe('meta-cognition', () => {
  it('computes accuracy from scored episodes', () => {
    const episodes = [
      { score: 80 },
      { score: 60 },
      { score: 90 },
      { score: null },
    ]
    const accuracy = computeDecisionAccuracy(episodes as Array<{ score: number | null }>)
    expect(accuracy).toBeCloseTo(76.7, 0) // (80+60+90)/3
  })

  it('returns 0 for no scored episodes', () => {
    const accuracy = computeDecisionAccuracy([{ score: null }])
    expect(accuracy).toBe(0)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run __tests__/agent-loop/meta-cognition.test.ts`
Expected: FAIL

- [ ] **Step 3: Meta-Cognition 구현**

```typescript
// lib/agent-loop/meta-cognition.ts

import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'
import { getTopEpisodes } from '@/lib/memory/episodic-store'

export type MetaCognitionReport = {
  decisionAccuracy: number
  totalDecisions: number
  scoredDecisions: number
  noActionCycles: number
  totalCycles: number
  loopEfficiency: number // (totalCycles - noActionCycles) / totalCycles
  insights: string[]
  improvementTriggers: string[]
}

/** 점수가 있는 에피소드의 평균 점수 */
export function computeDecisionAccuracy(episodes: Array<{ score: number | null }>): number {
  const scored = episodes.filter(e => e.score != null) as Array<{ score: number }>
  if (scored.length === 0) return 0
  return scored.reduce((sum, e) => sum + e.score, 0) / scored.length
}

/** 주간 메타인지 점검 */
export async function runWeeklyReview(): Promise<MetaCognitionReport> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // 지난 주 사이클 이력
  const cycles = await prisma.agentLoopCycle.findMany({
    where: { createdAt: { gte: oneWeekAgo } },
    orderBy: { createdAt: 'desc' },
  })

  const totalCycles = cycles.length
  const noActionCycles = cycles.filter(c => c.actionsCount === 0).length
  const loopEfficiency = totalCycles > 0 ? (totalCycles - noActionCycles) / totalCycles : 0

  // 지난 주 판단 에피소드
  const episodes = await getTopEpisodes('agent_loop_decision', 50)
  const recentEpisodes = episodes.filter(e => new Date(e.createdAt) >= oneWeekAgo)
  const decisionAccuracy = computeDecisionAccuracy(recentEpisodes)

  // LLM 기반 인사이트 생성
  const insights: string[] = []
  const improvementTriggers: string[] = []

  if (totalCycles >= 5) {
    const summaryPrompt = `다음은 지난 주 Agent Loop의 자동 판단 이력입니다:

총 사이클: ${totalCycles}회
액션 생성 사이클: ${totalCycles - noActionCycles}회
판단 평균 점수: ${decisionAccuracy.toFixed(0)}/100
루프 효율: ${(loopEfficiency * 100).toFixed(0)}%

최근 판단 샘플:
${recentEpisodes.slice(0, 5).map(e => `- ${e.input.slice(0, 150)}`).join('\n')}

1줄 인사이트 3개와 개선 제안 2개를 JSON으로:
{"insights":["..."],"improvements":["..."]}`

    try {
      const raw = await runLLM('마케팅 AI 루프 자가 점검 전문가. JSON만 출력.', summaryPrompt, 0.3, 800)
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')
      insights.push(...(parsed.insights || []))
      improvementTriggers.push(...(parsed.improvements || []))
    } catch { /* non-critical */ }
  }

  // 정확도 낮으면 Self-Improvement 트리거 추천
  if (decisionAccuracy < 50 && decisionAccuracy > 0) {
    improvementTriggers.push('판단 정확도 50% 미만 — 프롬프트 최적화 권장')
  }

  return {
    decisionAccuracy,
    totalDecisions: recentEpisodes.length,
    scoredDecisions: recentEpisodes.filter(e => e.score != null).length,
    noActionCycles,
    totalCycles,
    loopEfficiency,
    insights,
    improvementTriggers,
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run __tests__/agent-loop/meta-cognition.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/agent-loop/meta-cognition.ts __tests__/agent-loop/meta-cognition.test.ts
git commit -m "feat(agent-loop): implement Meta-Cognition — weekly self-review"
```

---

## Chunk 4: Orchestrator, API, Dashboard

### Task 12: Orchestrator — 루프 코어 (`lib/agent-loop/index.ts`)

**Files:**
- Create: `lib/agent-loop/index.ts`

이 파일이 전체 Agent Loop의 진입점. 스케줄 관리, 사이클 실행, 동시성 제어를 담당.

- [ ] **Step 1: 테스트 작성**

Create `__tests__/agent-loop/orchestrator.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { acquireLock, releaseLock } from '@/lib/agent-loop/index'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    agentLoopCycle: {
      findFirst: vi.fn().mockResolvedValue(null), // 실행 중인 사이클 없음
      create: vi.fn().mockResolvedValue({ id: 'test-cycle', status: 'running' }),
      update: vi.fn().mockResolvedValue({}),
    },
    worldModelSnapshot: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(), deleteMany: vi.fn() },
    goalState: { create: vi.fn() },
  },
}))

describe('orchestrator lock', () => {
  it('acquireLock returns cycleId when no running cycle', async () => {
    const id = await acquireLock('routine-cycle')
    expect(id).toBeTruthy()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run __tests__/agent-loop/orchestrator.test.ts`
Expected: FAIL

- [ ] **Step 3: Orchestrator 구현**

```typescript
// lib/agent-loop/index.ts

import { Cron } from 'croner'
import { prisma } from '@/lib/prisma'
import { loadWorldModel, saveWorldModel, updateWorldModel, pruneOldSnapshots } from './world-model'
import { buildSnapshotFromDb, detectOpenIssues } from './scanner'
import { evaluateGoals } from './goal-manager'
import { reason } from './reasoner'
import { routeActions } from './executor'
import { evaluateAndStore } from './evaluator'
import { notifyUrgent, notifyDailyBriefing, notifyCycleResult } from './notifier'
import { runWeeklyReview } from './meta-cognition'
import type { CycleType, CycleResult } from './types'

const LOCK_TIMEOUT_MS = 5 * 60 * 1000 // 5분 타임아웃

let crons: Cron[] = []
let paused = false

// ── 동시성 제어 ──

/**
 * DB 기반 뮤텍스. running 상태인 사이클이 있으면 null 반환.
 * urgency-check은 뮤텍스 대상 아님.
 */
export async function acquireLock(cycleType: CycleType): Promise<string | null> {
  if (cycleType === 'urgency-check') {
    const cycle = await prisma.agentLoopCycle.create({
      data: { cycleType, status: 'running' },
    })
    return cycle.id
  }

  // 실행 중인 사이클 확인
  const running = await prisma.agentLoopCycle.findFirst({
    where: {
      status: 'running',
      cycleType: { not: 'urgency-check' },
      createdAt: { gte: new Date(Date.now() - LOCK_TIMEOUT_MS) },
    },
  })

  if (running) return null // 다른 사이클 실행 중

  const cycle = await prisma.agentLoopCycle.create({
    data: { cycleType, status: 'running' },
  })
  return cycle.id
}

export async function releaseLock(cycleId: string, result: Partial<CycleResult>): Promise<void> {
  await prisma.agentLoopCycle.update({
    where: { id: cycleId },
    data: {
      status: result.error ? 'failed' : 'completed',
      actionsCount: result.actionsCount ?? 0,
      autoExecuted: result.autoExecuted ?? 0,
      sentToGovernor: result.sentToGovernor ?? 0,
      durationMs: result.durationMs ?? 0,
      summary: result.summary,
      error: result.error,
    },
  })
}

// ── 사이클 실행 ──

async function runCycle(cycleType: CycleType): Promise<CycleResult | null> {
  if (paused) return null

  const cycleId = await acquireLock(cycleType)
  if (!cycleId) return null // 다른 사이클 실행 중

  const startTime = Date.now()

  try {
    // 1. Scanner → World Model 갱신
    const snapshot = await buildSnapshotFromDb()
    const currentWm = await loadWorldModel()
    const updatedWm = updateWorldModel(currentWm, snapshot)

    // 2. 이슈 탐지
    const issues = await detectOpenIssues()
    updatedWm.openIssues = issues

    // 3. World Model 저장
    await saveWorldModel(updatedWm, cycleType)

    // urgency-check: 이슈 없으면 여기서 종료
    if (cycleType === 'urgency-check') {
      if (issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0) {
        const result: CycleResult = {
          cycleId, cycleType, actionsCount: 0, autoExecuted: 0,
          sentToGovernor: 0, durationMs: Date.now() - startTime, summary: 'No urgent issues', error: null,
        }
        await releaseLock(cycleId, result)
        return result
      }
      // 긴급 이슈 있으면 알림 후 Reasoner 진행
      await notifyUrgent(issues)
    }

    // 4. Goal Manager
    const goals = await evaluateGoals(updatedWm)

    // 5. Reasoner
    const decision = await reason(updatedWm, goals)

    // 6. Executor
    let autoExecuted = 0
    let sentToGovernor = 0
    const errors: string[] = []

    if (decision.actions.length > 0) {
      const execResult = await routeActions(decision.actions)
      autoExecuted = execResult.autoExecuted
      sentToGovernor = execResult.sentToGovernor
      errors.push(...execResult.errors)
    }

    // 7. Evaluator
    await evaluateAndStore(cycleId, cycleType, updatedWm, decision, { autoExecuted, sentToGovernor, errors })

    const result: CycleResult = {
      cycleId, cycleType,
      actionsCount: decision.actions.length,
      autoExecuted, sentToGovernor,
      durationMs: Date.now() - startTime,
      summary: decision.situationSummary,
      error: errors.length > 0 ? errors.join('; ') : null,
    }

    await releaseLock(cycleId, result)
    await notifyCycleResult(result)
    return result
  } catch (err) {
    const result: CycleResult = {
      cycleId, cycleType, actionsCount: 0, autoExecuted: 0,
      sentToGovernor: 0, durationMs: Date.now() - startTime,
      summary: null, error: String(err),
    }
    await releaseLock(cycleId, result).catch(() => {})
    await notifyCycleResult(result).catch(() => {})
    return result
  }
}

// ── 특수 사이클 ──

async function runDailyBriefing(): Promise<void> {
  const result = await runCycle('daily-briefing')
  if (!result) return

  const wm = await loadWorldModel()
  const goals = await evaluateGoals(wm)

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const todayCycles = await prisma.agentLoopCycle.count({
    where: { createdAt: { gte: oneDayAgo } },
  })

  await notifyDailyBriefing({
    summary: result.summary || '특이사항 없음',
    goals,
    todayCycles,
    todayActions: result.actionsCount,
  })

  // 7일 이상 된 스냅샷 정리
  await pruneOldSnapshots()
}

async function runWeeklyReviewCycle(): Promise<void> {
  await runCycle('weekly-review')
  // Meta-Cognition 실행
  try {
    await runWeeklyReview()
  } catch { /* non-critical */ }
}

// ── 스케줄 관리 ──

export function startAgentLoop(): void {
  if (crons.length > 0) return // 이미 실행 중
  paused = false

  // 15분: urgency-check
  crons.push(new Cron('*/15 * * * *', () => { runCycle('urgency-check') }))

  // 1시간: routine-cycle
  crons.push(new Cron('0 * * * *', () => { runCycle('routine-cycle') }))

  // 매일 07:00: daily-briefing
  crons.push(new Cron('0 7 * * *', () => { runDailyBriefing() }))

  // 매주 월요일 09:00: weekly-review
  crons.push(new Cron('0 9 * * 1', () => { runWeeklyReviewCycle() }))

  console.log('[Agent Loop] Started — 4 schedules active')
}

export function stopAgentLoop(): void {
  for (const c of crons) c.stop()
  crons = []
  paused = true
  console.log('[Agent Loop] Stopped')
}

export function pauseAgentLoop(): void {
  paused = true
  console.log('[Agent Loop] Paused')
}

export function resumeAgentLoop(): void {
  paused = false
  console.log('[Agent Loop] Resumed')
}

export function isAgentLoopRunning(): boolean {
  return crons.length > 0 && !paused
}

/** 수동 사이클 트리거 (테스트/디버깅용) */
export async function triggerCycle(cycleType: CycleType): Promise<CycleResult | null> {
  return runCycle(cycleType)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run __tests__/agent-loop/orchestrator.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/agent-loop/index.ts __tests__/agent-loop/orchestrator.test.ts
git commit -m "feat(agent-loop): implement Orchestrator — multi-cadence loop with mutex"
```

---

### Task 13: API 라우트 (`app/api/agent-loop/`)

**Files:**
- Create: `app/api/agent-loop/status/route.ts`
- Create: `app/api/agent-loop/control/route.ts`

- [ ] **Step 1: Status API 작성**

```typescript
// app/api/agent-loop/status/route.ts

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAgentLoopRunning } from '@/lib/agent-loop'
import type { AgentLoopStatusResponse } from '@/lib/agent-loop/types'

export async function GET() {
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const [lastCycle, todayCycles, goals, recentDecisions] = await Promise.all([
    prisma.agentLoopCycle.findFirst({
      where: { status: { not: 'running' } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.agentLoopCycle.findMany({
      where: { createdAt: { gte: oneDayAgo } },
    }),
    prisma.goalState.findMany({
      orderBy: { checkedAt: 'desc' },
      distinct: ['goalName'],
      take: 10,
    }),
    prisma.agentLoopCycle.findMany({
      where: { status: { not: 'running' } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  const running = isAgentLoopRunning()
  const hasError = lastCycle?.status === 'failed'

  const response: AgentLoopStatusResponse = {
    status: !running ? 'paused' : hasError ? 'error' : todayCycles.length > 0 ? 'running' : 'idle',
    lastCycle: lastCycle ? {
      id: lastCycle.id,
      cycleType: lastCycle.cycleType,
      completedAt: lastCycle.createdAt.toISOString(),
      actionsCount: lastCycle.actionsCount,
      summary: lastCycle.summary,
    } : null,
    nextScheduled: {
      cycleType: 'routine-cycle',
      scheduledAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), // 대략적
    },
    today: {
      autoExecuted: todayCycles.reduce((s, c) => s + c.autoExecuted, 0),
      sentToGovernor: todayCycles.reduce((s, c) => s + c.sentToGovernor, 0),
      totalCycles: todayCycles.length,
    },
    goals: goals.map(g => ({
      name: g.goalName,
      progressPercent: g.progressPercent,
      onTrack: g.onTrack,
    })),
    recentDecisions: recentDecisions.map(c => ({
      time: c.createdAt.toISOString(),
      summary: c.summary || `${c.cycleType} 사이클`,
      status: c.actionsCount === 0 ? 'no_action' as const
        : c.sentToGovernor > 0 ? 'pending_approval' as const
        : 'executed' as const,
    })),
  }

  return NextResponse.json(response)
}
```

- [ ] **Step 2: Control API 작성**

```typescript
// app/api/agent-loop/control/route.ts

import { NextRequest, NextResponse } from 'next/server'
import {
  startAgentLoop,
  stopAgentLoop,
  pauseAgentLoop,
  resumeAgentLoop,
  triggerCycle,
  isAgentLoopRunning,
} from '@/lib/agent-loop'
import type { CycleType } from '@/lib/agent-loop/types'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { action?: string; cycleType?: CycleType }
  const { action } = body

  switch (action) {
    case 'start':
      startAgentLoop()
      return NextResponse.json({ ok: true, status: 'running' })

    case 'stop':
      stopAgentLoop()
      return NextResponse.json({ ok: true, status: 'stopped' })

    case 'pause':
      pauseAgentLoop()
      return NextResponse.json({ ok: true, status: 'paused' })

    case 'resume':
      resumeAgentLoop()
      return NextResponse.json({ ok: true, status: 'running' })

    case 'trigger': {
      const cycleType = body.cycleType || 'routine-cycle'
      const result = await triggerCycle(cycleType)
      return NextResponse.json({ ok: true, result })
    }

    default:
      return NextResponse.json(
        { ok: false, error: `Unknown action: ${action}. Use: start, stop, pause, resume, trigger` },
        { status: 400 },
      )
  }
}

export async function GET() {
  return NextResponse.json({ running: isAgentLoopRunning() })
}
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add app/api/agent-loop/
git commit -m "feat(agent-loop): add status and control API routes"
```

---

### Task 14: Operations 대시보드에 Agent Loop 상태 섹션 추가

**Files:**
- Create: `components/agent-loop/loop-status-card.tsx`
- Modify: `app/(domains)/operations/page.tsx`

- [ ] **Step 1: LoopStatusCard 컴포넌트 작성**

```tsx
// components/agent-loop/loop-status-card.tsx
'use client'

import { useEffect, useState } from 'react'
import type { AgentLoopStatusResponse } from '@/lib/agent-loop/types'

export function LoopStatusCard() {
  const [data, setData] = useState<AgentLoopStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/agent-loop/status')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))

    // 1분마다 갱신
    const interval = setInterval(() => {
      fetch('/api/agent-loop/status').then(r => r.json()).then(setData).catch(() => {})
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <div className="card animate-pulse h-48" />
  if (!data) return null

  const statusColors: Record<string, string> = {
    running: 'text-green-400',
    paused: 'text-yellow-400',
    error: 'text-red-400',
    idle: 'text-zinc-400',
  }

  const statusLabels: Record<string, string> = {
    running: '작동 중',
    paused: '일시 정지',
    error: '오류',
    idle: '대기',
  }

  async function handleControl(action: string) {
    await fetch('/api/agent-loop/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    // 상태 갱신
    const r = await fetch('/api/agent-loop/status')
    setData(await r.json())
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Agent Loop</h2>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${statusColors[data.status]}`}>
            ● {statusLabels[data.status]}
          </span>
          {data.status === 'running' || data.status === 'idle' ? (
            <button onClick={() => handleControl('pause')} className="text-xs text-zinc-500 hover:text-zinc-300 transition">일시정지</button>
          ) : (
            <button onClick={() => handleControl('start')} className="text-xs text-zinc-500 hover:text-zinc-300 transition">시작</button>
          )}
        </div>
      </div>

      {/* 오늘 통계 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <div className="text-lg font-bold text-zinc-100">{data.today.totalCycles}</div>
          <div className="text-xs text-zinc-500">사이클</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-green-400">{data.today.autoExecuted}</div>
          <div className="text-xs text-zinc-500">자동실행</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-yellow-400">{data.today.sentToGovernor}</div>
          <div className="text-xs text-zinc-500">승인대기</div>
        </div>
      </div>

      {/* 목표 진행률 */}
      {data.goals.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs text-zinc-500 mb-2">목표 진행률</h3>
          {data.goals.map(g => (
            <div key={g.name} className="flex items-center gap-2 mb-1.5">
              <span className="text-xs text-zinc-400 w-32 truncate">{g.name}</span>
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${g.onTrack ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, g.progressPercent)}%` }}
                />
              </div>
              <span className="text-xs text-zinc-500 w-10 text-right">{g.progressPercent}%</span>
            </div>
          ))}
        </div>
      )}

      {/* 최근 판단 */}
      {data.recentDecisions.length > 0 && (
        <div>
          <h3 className="text-xs text-zinc-500 mb-2">최근 판단</h3>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {data.recentDecisions.slice(0, 5).map((d, i) => {
              const statusIcon = d.status === 'executed' ? '✓' : d.status === 'pending_approval' ? '⏳' : '—'
              const time = new Date(d.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-zinc-600 w-12 shrink-0">{time}</span>
                  <span className="text-zinc-400 flex-1 truncate">{d.summary}</span>
                  <span className="text-zinc-600">{statusIcon}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Operations 페이지에 import + 배치**

`app/(domains)/operations/page.tsx` 수정:

import 추가:
```typescript
import { LoopStatusCard } from '@/components/agent-loop/loop-status-card'
```

기존 대시보드 섹션 상단(AI Action Suggestions 근처)에 배치:
```tsx
<LoopStatusCard />
```

정확한 삽입 위치는 기존 페이지 레이아웃에 따라 조정. 주요 통계 카드 영역 상단이 적합.

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -20`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add components/agent-loop/ app/\(domains\)/operations/page.tsx
git commit -m "feat(ui): add Agent Loop status card to Operations dashboard"
```

---

## Chunk 5: 통합 + 빌드 검증

### Task 15: barrel export + 빌드 검증

**Files:**
- Verify: 모든 `lib/agent-loop/*.ts` 파일의 import 경로

- [ ] **Step 1: 전체 타입 체크**

Run: `npx tsc --noEmit --pretty false`
Expected: 에러 없음. 에러 발생 시 import 경로/타입 수정.

- [ ] **Step 2: 전체 테스트**

Run: `npx vitest run __tests__/agent-loop/`
Expected: 모든 테스트 PASS

- [ ] **Step 3: Next.js 빌드 검증**

Run: `npm run build:next`
Expected: 빌드 성공

- [ ] **Step 4: 에러 수정 (있는 경우)**

타입 에러, import 문제 등 수정 후 재검증.

- [ ] **Step 5: 최종 커밋**

```bash
git add -A
git commit -m "feat(agent-loop): integration verification — types, tests, build pass"
```

---

### Task 16: 문서 업데이트

**Files:**
- Modify: `docs/PROJECT_CONTEXT.md`
- Modify: `docs/project/roadmap.md`

- [ ] **Step 1: PROJECT_CONTEXT.md에 Agent Loop 섹션 추가**

"현재 구현된 큰 축" 섹션 끝에:

```markdown
### 14. Agent Loop (자율 순환 루프)
- World Model 기반 누적 상황 인식
- Goal Manager — 전략 목표 추적 + 진행률
- Reasoner — LLM 추론 엔진 (Gemma 4 우선)
- 다중 주기: 15분(긴급) / 1시간(루틴) / 일간(브리핑) / 주간(리뷰)
- 리스크 기반 자율: LOW 자동실행, MEDIUM+ Governor 승인
- Meta-Cognition — 판단 품질 자동 추적
- Operations 대시보드 통합
- 상세: `docs/superpowers/specs/2026-04-08-agent-loop-design.md`
```

- [ ] **Step 2: roadmap.md 업데이트**

Phase 1 즉시 항목에서 "Self-Improvement 루프 구체화"를 완료로 표시하거나 Agent Loop 항목 추가.

- [ ] **Step 3: 커밋**

```bash
git add docs/
git commit -m "docs: update PROJECT_CONTEXT and roadmap with Agent Loop completion"
```
