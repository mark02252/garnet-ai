/**
 * Agent Loop — Shared Types
 * World Model, Goal Progress, Reasoner, Cycle 관련 타입 정의
 */

import type { GovernorRiskLevel } from '@/lib/governor'
import type { StrategicGoal } from '@/lib/business-context'

export type TrendDirection = 'up' | 'down' | 'stable'

export type TrendVector = {
  metric: string
  direction: TrendDirection
  magnitude: number
  duration: number
  confidence: number
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

export type GoalProgress = {
  goal: StrategicGoal
  currentValue: string | null
  progressPercent: number
  onTrack: boolean
  lastChecked: string
}

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
