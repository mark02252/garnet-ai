// lib/agent-loop/index.ts

import { Cron } from 'croner'
import { prisma } from '@/lib/prisma'
import { loadWorldModel, saveWorldModel, updateWorldModel, pruneOldSnapshots } from './world-model'
import { buildSnapshotFromDb, detectOpenIssues } from './scanner'
import { evaluateGoals } from './goal-manager'
import { reason } from './reasoner'
import { routeActions } from './executor'
import { needsMeeting, triggerAutoMeeting } from './auto-meeting'
import { evaluateAndStore } from './evaluator'
import { notifyUrgent, notifyDailyBriefing, notifyCycleResult } from './notifier'
import { runWeeklyReview } from './meta-cognition'
import { discoverNewCompetitors } from './competitor-discovery'
import { buildDailyDigest } from '@/lib/intel/digest-builder'
import { registerAgentLoopHandlers } from './handlers'
import type { CycleType, CycleResult } from './types'
import * as fs from 'fs'
import * as path from 'path'

const LOCK_TIMEOUT_MS = 5 * 60 * 1000 // 5분 타임아웃
const STATE_PATH = path.join(process.cwd(), '.garnet-config', 'agent-loop-state.json')

let crons: Cron[] = []
let paused = false

// ── 상태 영속화 (Next.js 멀티 Worker 대응) ──

function persistState(running: boolean): void {
  try {
    const dir = path.dirname(STATE_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(STATE_PATH, JSON.stringify({ running, updatedAt: new Date().toISOString() }))
  } catch { /* non-critical */ }
}

function readPersistedState(): boolean {
  try {
    if (!fs.existsSync(STATE_PATH)) return false
    const data = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'))
    return data.running === true
  } catch { return false }
}

// ── 동시성 제어 ──

export async function acquireLock(cycleType: CycleType): Promise<string | null> {
  if (cycleType === 'urgency-check') {
    const cycle = await prisma.agentLoopCycle.create({
      data: { cycleType, status: 'running' },
    })
    return cycle.id
  }

  const running = await prisma.agentLoopCycle.findFirst({
    where: {
      status: 'running',
      cycleType: { not: 'urgency-check' },
      createdAt: { gte: new Date(Date.now() - LOCK_TIMEOUT_MS) },
    },
  })

  if (running) return null

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
  if (!cycleId) return null

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

    // urgency-check: 이슈 없으면 종료
    if (cycleType === 'urgency-check') {
      if (issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0) {
        const result: CycleResult = {
          cycleId, cycleType, actionsCount: 0, autoExecuted: 0,
          sentToGovernor: 0, durationMs: Date.now() - startTime, summary: 'No urgent issues', error: null,
        }
        await releaseLock(cycleId, result)
        return result
      }
      await notifyUrgent(issues)
    }

    // 4. Goal Manager
    const goals = await evaluateGoals(updatedWm)

    // 5. Reasoner
    const decision = await reason(updatedWm, goals)

    // 5.5. 복합 이슈 감지 시 자동 회의
    if (needsMeeting(updatedWm, goals) && cycleType === 'routine-cycle') {
      try {
        await triggerAutoMeeting(updatedWm, goals)
      } catch { /* non-critical — don't block the cycle */ }
    }

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

  // 마케팅 인텔 다이제스트 생성
  let digestHeadline = ''
  try {
    const digest = await buildDailyDigest()
    if (digest.ok && typeof digest.message === 'string') {
      digestHeadline = digest.message
    }
  } catch { /* non-critical */ }

  const wm = await loadWorldModel()
  const goals = await evaluateGoals(wm)

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const todayCycles = await prisma.agentLoopCycle.count({
    where: { createdAt: { gte: oneDayAgo } },
  })

  await notifyDailyBriefing({
    summary: [digestHeadline, result.summary].filter(Boolean).join('\n\n') || '특이사항 없음',
    goals,
    todayCycles,
    todayActions: result.actionsCount,
  })

  await pruneOldSnapshots()
}

async function runWeeklyReviewCycle(): Promise<void> {
  await runCycle('weekly-review')
  try {
    await runWeeklyReview()
  } catch { /* non-critical */ }
  // 경쟁사 자동 발견
  try {
    const discovery = await discoverNewCompetitors()
    if (discovery.newCompetitors.length > 0) {
      console.log(`[Agent Loop] Discovered ${discovery.newCompetitors.length} new competitors`)
    }
  } catch { /* non-critical */ }
}

// ── 스케줄 관리 ──

export function startAgentLoop(): void {
  if (crons.length > 0) return
  registerAgentLoopHandlers()
  paused = false

  crons.push(new Cron('*/15 * * * *', () => { runCycle('urgency-check') }))
  crons.push(new Cron('0 * * * *', () => { runCycle('routine-cycle') }))
  crons.push(new Cron('0 7 * * *', () => { runDailyBriefing() }))
  crons.push(new Cron('0 9 * * 1', () => { runWeeklyReviewCycle() }))

  persistState(true)
  console.log('[Agent Loop] Started — 4 schedules active')
}

export function stopAgentLoop(): void {
  for (const c of crons) c.stop()
  crons = []
  paused = true
  persistState(false)
  console.log('[Agent Loop] Stopped')
}

export function pauseAgentLoop(): void {
  paused = true
  persistState(false)
  console.log('[Agent Loop] Paused')
}

export function resumeAgentLoop(): void {
  paused = false
  persistState(true)
  console.log('[Agent Loop] Resumed')
}

export function isAgentLoopRunning(): boolean {
  // in-memory 상태 우선, 없으면 파일에서 읽기 (다른 Worker에서 시작한 경우)
  if (crons.length > 0 && !paused) return true
  return readPersistedState()
}

export async function triggerCycle(cycleType: CycleType): Promise<CycleResult | null> {
  registerAgentLoopHandlers() // 수동 트리거 시에도 handler 보장
  return runCycle(cycleType)
}
