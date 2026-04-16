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

    // urgency-check: 만기된 Outcome 측정 처리 + 이슈 없으면 종료
    if (cycleType === 'urgency-check') {
      try {
        const { processReadyOutcomes } = await import('./outcome-observer')
        await processReadyOutcomes()
      } catch { /* non-critical */ }

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
    let decision = await reason(updatedWm, goals)

    // 5.5. 복합 이슈 감지 시 자동 회의
    if (needsMeeting(updatedWm, goals) && cycleType === 'routine-cycle') {
      try {
        await triggerAutoMeeting(updatedWm, goals)
      } catch { /* non-critical — don't block the cycle */ }
    }

    // 5.7 자기비판 (MEDIUM/HIGH만)
    try {
      const { applyCritique } = await import('./reflective-critic')
      decision = await applyCritique(decision)
    } catch { /* non-critical */ }

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

    // 7.3 routine-cycle마다 기사 소량 학습 + 목표 달성 체크
    if (cycleType === 'routine-cycle') {
      try {
        const { learnFromArticles } = await import('./article-learner')
        await learnFromArticles(168)
      } catch { /* non-critical */ }

      // 목표 100% 달성 시 자동 상향
      try {
        const { checkAndEscalateGoals } = await import('./context-evolver')
        const escalation = await checkAndEscalateGoals()
        if (escalation.escalated.length > 0) {
          console.log(`[Agent Loop] Goals escalated: ${escalation.escalated.join(', ')}`)
        }
      } catch { /* non-critical */ }
    }

    // 7.3 사이클 리플렉션 — 교훈 추출 + Knowledge Store 저장
    if (cycleType === 'routine-cycle' && decision.actions.length > 0) {
      try {
        const { reflectOnCycle, storeLessons } = await import('./cycle-reflector')
        const { promoteRepeatedLessons } = await import('./knowledge-store')
        const reflection = await reflectOnCycle({
          cycleId,
          worldModelSummary: decision.situationSummary || '',
          reasonerSummary: decision.actions.map(a => `${a.title}: ${a.rationale}`).join('; ').slice(0, 300),
          actions: decision.actions.map(a => ({
            title: a.title,
            riskLevel: a.riskLevel,
            status: a.riskLevel === 'LOW' ? 'EXECUTED' : 'PENDING_APPROVAL',
            rationale: a.rationale || '',
          })),
          goalChanges: goals.map(g => ({
            goal: g.goal.goal,
            before: g.progressPercent,
            after: g.progressPercent,
          })),
        })
        if (reflection && reflection.lessons.length > 0) {
          await storeLessons(reflection.lessons)
          await promoteRepeatedLessons()
        }
      } catch { /* non-critical */ }
    }

    // 7.5 정보 부족 감지 → 질문
    if (cycleType === 'routine-cycle') {
      try {
        const { detectInformationGaps, sendInquiries } = await import('./proactive-inquiry')
        const gaps = await detectInformationGaps(updatedWm, goals)
        if (gaps.length > 0) await sendInquiries(gaps)
      } catch { /* non-critical */ }
    }

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

  // Curiosity Engine: 기사 학습 + 거시 환경 추적
  try {
    const { learnFromArticles } = await import('./article-learner')
    const { trackMacroContext } = await import('./macro-tracker')
    const [articleResult, macroResult] = await Promise.all([
      learnFromArticles(),
      trackMacroContext(),
    ])
    if (articleResult.extracted > 0 || macroResult.events.length > 0) {
      console.log(`[Agent Loop] Curiosity: ${articleResult.extracted} knowledge from articles, ${macroResult.events.length} macro events`)
    }
  } catch { /* non-critical */ }

  const wm = await loadWorldModel()
  const goals = await evaluateGoals(wm)

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const todayCycles = await prisma.agentLoopCycle.count({
    where: { createdAt: { gte: oneDayAgo } },
  })

  // 매출 + 트래픽 데이터 수집
  let ecommerce: { revenue: number; purchasers: number; avgOrder: number; conversionRate: number } | undefined
  let traffic: { sessions: number; changePercent: number; activeUsers?: number; newUsers?: number; returningUsers?: number; arpu?: number } | undefined
  let pendingApprovals = 0
  let newKnowledge = 0
  let topInsight = ''

  try {
    const ecomRes = await fetch('http://localhost:3000/api/ga4/ecommerce')
    if (ecomRes.ok) {
      const ecom = await ecomRes.json() as { totalTransactions?: number; totalRevenue?: number; avgOrderValue?: number; avgPurchaseRate?: number; dailyData?: Array<{ transactions: number; revenue: number }> }
      // 어제 하루 데이터 (마지막은 오늘이므로 뒤에서 두 번째)
      const yesterday = ecom.dailyData && ecom.dailyData.length >= 2
        ? ecom.dailyData[ecom.dailyData.length - 2]
        : undefined
      if (yesterday && yesterday.revenue > 0) {
        ecommerce = {
          revenue: yesterday.revenue,
          purchasers: yesterday.transactions,
          avgOrder: yesterday.transactions > 0 ? Math.round(yesterday.revenue / yesterday.transactions) : 0,
          conversionRate: ecom.avgPurchaseRate ?? 0,
        }
      }
    }
  } catch { /* non-critical */ }

  try {
    traffic = { sessions: wm.snapshot.ga4.sessions, changePercent: 0 }
    const sessionTrend = wm.trends.find(t => t.metric === 'ga4.sessions')
    if (sessionTrend) traffic.changePercent = sessionTrend.direction === 'up' ? sessionTrend.magnitude : -sessionTrend.magnitude

    // 활성 사용자 + 신규/재방문 + ARPU
    try {
      const stickyRes = await fetch('http://localhost:3000/api/ga4/stickiness')
      if (stickyRes.ok) {
        const sticky = await stickyRes.json() as { data?: Array<{ dau?: number }> }
        const latest = sticky.data?.[sticky.data.length - 1]
        if (latest?.dau) traffic.activeUsers = latest.dau
      }
    } catch { /* */ }

    try {
      const userRes = await fetch('http://localhost:3000/api/ga4/user-type')
      if (userRes.ok) {
        const users = await userRes.json() as { data?: Array<{ userType?: string; users?: number }> }
        if (users.data) {
          const newU = users.data.find(u => u.userType === 'New')
          const retU = users.data.find(u => u.userType === 'Returning')
          traffic.newUsers = newU?.users ?? 0
          traffic.returningUsers = retU?.users ?? 0
        }
      }
    } catch { /* */ }

    // ARPU
    if (ecommerce && traffic.activeUsers && traffic.activeUsers > 0) {
      traffic.arpu = Math.round(ecommerce.revenue / traffic.activeUsers)
    }
  } catch { /* */ }

  try {
    const pending = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COUNT(*)::int as count FROM "GovernorAction" WHERE status = 'PENDING_APPROVAL' AND "deletedAt" IS NULL`)
    pendingApprovals = pending[0]?.count ?? 0
  } catch { /* */ }

  try {
    newKnowledge = await prisma.knowledgeEntry.count({ where: { createdAt: { gte: oneDayAgo } } })
  } catch { /* */ }

  // 구매 여정 이탈 분석 + 영화별/지점별 매출 TOP (GA4)
  let funnel: Array<{ label: string; count: number; dropRate: number }> | undefined
  let movieRevenueTop: Array<{ itemName: string; revenue: number; purchased: number }> | undefined
  let theaterRevenueTop: Array<{ theaterCode: string; revenue: number; purchased: number }> | undefined
  try {
    const { fetchEcommerceFunnel, fetchMovieRevenueTop, fetchTheaterRevenueTop } = await import('@/lib/ga4-client')
    const [f, m, t] = await Promise.all([
      fetchEcommerceFunnel(7).catch(() => []),
      fetchMovieRevenueTop(7, 3).catch(() => []),
      fetchTheaterRevenueTop(7, 3).catch(() => []),
    ])
    if (f.length > 0 && f.some(s => s.count > 0)) {
      funnel = f.map(s => ({ label: s.label, count: s.count, dropRate: s.dropRate }))
    }
    if (m.length > 0) movieRevenueTop = m
    if (t.length > 0) theaterRevenueTop = t
  } catch { /* non-critical */ }

  // LLM으로 오늘의 핵심 인사이트 생성
  try {
    const { runLLM } = await import('@/lib/llm')
    const dataContext = [
      ecommerce ? `매출 ₩${ecommerce.revenue.toLocaleString()}, 구매자 ${ecommerce.purchasers}명, 인당 ₩${ecommerce.avgOrder.toLocaleString()}, 전환율 ${(ecommerce.conversionRate*100).toFixed(1)}%` : '',
      traffic ? `세션 ${traffic.sessions.toLocaleString()}, 활성사용자 ${traffic.activeUsers ?? '?'}, 신규 ${traffic.newUsers ?? '?'} / 재방문 ${traffic.returningUsers ?? '?'}, ARPU ₩${traffic.arpu ?? '?'}` : '',
      `목표: ${goals.map(g => `${g.goal.goal} ${g.progressPercent}%`).join(', ')}`,
    ].filter(Boolean).join('\n')

    const raw = await runLLM(
      '비즈니스 데이터 분석가. 핵심 인사이트를 한국어 1-2문장으로. 숫자의 의미와 다음 액션 방향을 포함.',
      `오늘의 비즈니스 데이터:\n${dataContext}\n\n이 데이터에서 가장 중요한 인사이트 1-2문장:`,
      0.3, 200,
    )
    topInsight = raw.replace(/```[^`]*```/g, '').replace(/\n/g, ' ').trim().slice(0, 200)
  } catch {
    // 폴백: Knowledge Store에서
    try {
      const topK = await prisma.knowledgeEntry.findFirst({
        where: { level: 3, createdAt: { gte: oneDayAgo }, isAntiPattern: false },
        orderBy: { confidence: 'desc' },
      })
      if (topK) topInsight = `${topK.pattern}: ${topK.observation.split('\n')[0].slice(0, 100)}`
    } catch { /* */ }
  }

  await notifyDailyBriefing({
    summary: [digestHeadline, result.summary].filter(Boolean).join('\n\n') || '특이사항 없음',
    goals,
    todayCycles,
    todayActions: result.actionsCount,
    ecommerce,
    traffic,
    funnel,
    movieRevenueTop,
    theaterRevenueTop,
    newKnowledge,
    pendingApprovals,
    topInsight,
  })

  // 목표 달성 위험 Slack 알림 (daily-briefing이므로 하루 1회)
  try {
    const { predictGoals } = await import('./goal-predictor')
    const predictions = await predictGoals()
    const atRisk = predictions.filter(p => p.urgency === 'will_miss' || p.urgency === 'at_risk')
    if (atRisk.length > 0) {
      const { isSlackConfigured, slackGoalRiskAlert } = await import('./slack-notifier')
      if (isSlackConfigured()) {
        await slackGoalRiskAlert({
          goals: atRisk.map(g => ({
            name: g.goalName, percent: g.currentPercent,
            predicted: g.predictedPercent, urgency: g.urgency,
          })),
        }).catch(() => {})
      }
    }
  } catch { /* non-critical */ }

  await pruneOldSnapshots()
}

async function runEveningReport(): Promise<void> {
  try {
    const oneDayAgo = new Date(Date.now() - 12 * 60 * 60 * 1000) // 오늘 오전부터

    // 오늘 자동실행된 것
    const executed = await prisma.$queryRawUnsafe<Array<{ kind: string; payload: string }>>(
      `SELECT kind, payload FROM "GovernorAction" WHERE status = 'EXECUTED' AND "createdAt" >= $1 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 10`,
      oneDayAgo.toISOString(),
    ).catch(() => [])

    // 승인 대기 중인 것
    const pending = await prisma.$queryRawUnsafe<Array<{ kind: string; payload: string; riskLevel: string }>>(
      `SELECT kind, payload, "riskLevel" FROM "GovernorAction" WHERE status = 'PENDING_APPROVAL' AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 10`,
    ).catch(() => [])

    // 오늘 학습한 지식
    const newKnowledge = await prisma.knowledgeEntry.count({
      where: { createdAt: { gte: oneDayAgo } },
    })

    // 목표
    const goals = await prisma.goalState.findMany({
      orderBy: { checkedAt: 'desc' },
      distinct: ['goalName'],
      take: 10,
    })

    const extractTitle = (payload: string | Record<string, unknown>): string => {
      try {
        const p = typeof payload === 'string' ? JSON.parse(payload) : payload
        return (p as Record<string, unknown>)?._agentLoop
          ? ((p as Record<string, unknown>)._agentLoop as Record<string, string>).title
          : String((p as Record<string, unknown>).kind || '액션')
      } catch { return '액션' }
    }

    const { isSlackConfigured, slackDailyReport } = await import('./slack-notifier')
    if (isSlackConfigured()) {
      await slackDailyReport({
        period: 'evening',
        summary: `오늘 Garnet은 ${executed.length}건을 자동 처리하고, ${newKnowledge}건의 새 지식을 학습했습니다.${pending.length > 0 ? ` ${pending.length}건의 제안이 승인을 기다리고 있습니다.` : ''}`,
        autoExecuted: executed.map(e => ({ title: extractTitle(e.payload), result: '완료' })),
        pendingApprovals: pending.map(p => ({
          title: extractTitle(p.payload),
          riskLevel: p.riskLevel || 'MEDIUM',
          rationale: '',
        })),
        knowledgeLearned: newKnowledge,
        goalsProgress: goals.map(g => ({ name: g.goalName, percent: g.progressPercent, onTrack: g.onTrack })),
      }).catch(() => {})
    }

    // Telegram도
    const { isTelegramConfigured, sendMessage } = await import('@/lib/telegram')
    if (isTelegramConfigured()) {
      const text = `🌙 *Garnet 저녁 보고*\n\n자동 처리: ${executed.length}건\n승인 대기: ${pending.length}건\n새 지식: ${newKnowledge}건\n\n${pending.length > 0 ? '승인이 필요한 제안이 있습니다.' : '특별한 조치 필요 없음.'}`
      await sendMessage(text, { parseMode: 'Markdown' }).catch(() => {})
    }
  } catch { /* non-critical */ }
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
  // Curiosity Engine: 교차 인사이트 + 능력 창발 + 자가 발전 탐색
  let capabilities: Array<{ name: string; description: string; readiness: number; requiredDomains: string[] }> = []
  try {
    const { synthesizeCrossDomain } = await import('./cross-pollinator')
    const { detectEmergentCapabilities } = await import('./emergence-detector')
    const { scoutSelfImprovements } = await import('./self-improvement-scout')

    const [synthesis, caps, selfImprove] = await Promise.all([
      synthesizeCrossDomain(),
      detectEmergentCapabilities(),
      scoutSelfImprovements(),
    ])
    capabilities = caps

    console.log(`[Agent Loop] Evolution: ${synthesis.newInsights} cross-insights, ${capabilities.length} capabilities detected, ${selfImprove.opportunities.length} self-improvements`)
  } catch { /* non-critical */ }
  // 진화: 패러다임 전환 체크
  try {
    const { checkParadigmShift } = await import('./paradigm-shift')
    const shift = await checkParadigmShift()
    if (shift.shiftsTriggered > 0) {
      console.log(`[Agent Loop] Paradigm shift in: ${shift.domains.join(', ')}`)
    }
  } catch { /* non-critical */ }
  // 프롬프트 자동 최적화 (주간)
  try {
    const { evolveReasonerPrompt } = await import('./prompt-evolver')
    const evolution = await evolveReasonerPrompt()
    if (evolution.improved) {
      console.log(`[Agent Loop] Prompt evolution: ${evolution.reason} (submitted to Governor: ${evolution.submittedToGovernor})`)
    }
  } catch { /* non-critical */ }

  // Self Benchmark + Role Expansion
  try {
    const { computeBenchmark } = await import('./self-benchmark')
    const benchmark = await computeBenchmark()
    console.log(`[Agent Loop] Benchmark: ${benchmark.totalKnowledge} knowledge, strong: ${benchmark.strongDomains.join(',')}`)

    // Emergence 결과가 있으면 역할 제안
    const { proposeNewRoles } = await import('./role-manager')
    if (capabilities.length > 0) {
      await proposeNewRoles(capabilities)
    }
  } catch { /* non-critical */ }

  // 주간 Slack 리포트
  try {
    const { isSlackConfigured, slackWeeklyReport } = await import('./slack-notifier')
    if (isSlackConfigured()) {
      const { computeBenchmark } = await import('./self-benchmark')
      const bm = await computeBenchmark()

      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const weekCycles = await prisma.agentLoopCycle.count({ where: { createdAt: { gte: oneWeekAgo } } })
      const weekActions = await prisma.agentLoopCycle.aggregate({
        where: { createdAt: { gte: oneWeekAgo } },
        _sum: { autoExecuted: true },
      })
      const oldKnowledge = await prisma.knowledgeEntry.count({ where: { createdAt: { lt: oneWeekAgo } } })

      await slackWeeklyReport({
        totalKnowledge: bm.totalKnowledge,
        newKnowledge: bm.totalKnowledge - oldKnowledge,
        growthRate: bm.growthRate,
        strongDomains: bm.strongDomains,
        weakDomains: bm.weakDomains,
        decisionAccuracy: 0,
        cyclesRun: weekCycles,
        actionsExecuted: weekActions._sum?.autoExecuted || 0,
      }).catch(() => {})
    }
  } catch { /* non-critical */ }

  // Context Evolution — 비즈니스 목표 자동 진화
  try {
    const { evolveContext } = await import('./context-evolver')
    const evolution = await evolveContext()
    if (evolution.proposals.length > 0) {
      console.log(`[Agent Loop] Context evolution: ${evolution.proposals.length} proposals`)
    }
  } catch { /* non-critical */ }

  // Goal Planner — 데이터 기반 단기/중기/장기 목표 자동 산출
  try {
    const { updateGoalsFromPlan } = await import('./goal-planner')
    const plan = await updateGoalsFromPlan()
    if (plan.updated) {
      console.log(`[Agent Loop] Goal plans: ${plan.plans.length} timeframes`)
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
  crons.push(new Cron('0 18 * * *', () => { runEveningReport() }))
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
  // daily-briefing은 Slack 알림까지 포함된 wrapper 사용
  if (cycleType === 'daily-briefing') {
    await runDailyBriefing()
    const last = await prisma.agentLoopCycle.findFirst({
      where: { cycleType: 'daily-briefing' },
      orderBy: { createdAt: 'desc' },
    })
    return last ? {
      cycleId: last.id,
      cycleType: 'daily-briefing',
      actionsCount: last.actionsCount,
      autoExecuted: last.autoExecuted,
      sentToGovernor: last.sentToGovernor,
      durationMs: last.durationMs,
      summary: last.summary,
      error: last.error,
    } : null
  }
  return runCycle(cycleType)
}
