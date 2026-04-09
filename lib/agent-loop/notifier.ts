/**
 * Agent Loop — Notifier
 * 조용한 모드: 대부분 하루 2회 보고에 포함, 즉시 알림은 CRITICAL만
 */

import { isTelegramConfigured, sendMessage } from '@/lib/telegram'
import { isSlackConfigured, slackUrgentAlert, slackDailyBriefing, slackApprovalRequest } from './slack-notifier'
import type { OpenIssue, CycleResult, GoalProgress } from './types'
import * as fs from 'fs'
import * as path from 'path'

const ALERT_LOG_PATH = path.join(process.cwd(), '.garnet-config', 'last-alerts.json')

/** 이미 알린 이슈인지 확인 (같은 이슈 반복 알림 방지) */
function wasAlreadyAlerted(issueId: string): boolean {
  try {
    if (!fs.existsSync(ALERT_LOG_PATH)) return false
    const log = JSON.parse(fs.readFileSync(ALERT_LOG_PATH, 'utf-8')) as Record<string, string>
    const alertedAt = log[issueId]
    if (!alertedAt) return false
    // 24시간 내에 같은 이슈를 알렸으면 스킵
    return Date.now() - new Date(alertedAt).getTime() < 24 * 60 * 60 * 1000
  } catch { return false }
}

function markAlerted(issueId: string): void {
  try {
    const dir = path.dirname(ALERT_LOG_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    let log: Record<string, string> = {}
    try { log = JSON.parse(fs.readFileSync(ALERT_LOG_PATH, 'utf-8')) } catch { /* */ }
    log[issueId] = new Date().toISOString()
    // 오래된 항목 정리 (7일 이상)
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    for (const [k, v] of Object.entries(log)) {
      if (new Date(v).getTime() < cutoff) delete log[k]
    }
    fs.writeFileSync(ALERT_LOG_PATH, JSON.stringify(log))
  } catch { /* non-critical */ }
}

export async function notifyUrgent(issues: OpenIssue[]): Promise<void> {
  // CRITICAL만 즉시 알림, HIGH/NORMAL은 하루 2회 보고에 포함
  const critical = issues.filter(i => i.severity === 'critical')
  // 이미 알린 것 제외
  const newCritical = critical.filter(i => !wasAlreadyAlerted(i.id))

  if (newCritical.length === 0) return

  const emoji: Record<string, string> = { critical: '🚨', high: '⚠️' }

  if (isTelegramConfigured()) {
    const text = `*🚨 Garnet 긴급*\n\n${newCritical.map(i =>
      `${emoji[i.severity]} ${i.summary}`
    ).join('\n')}`
    await sendMessage(text, { parseMode: 'Markdown' }).catch(() => {})
  }

  if (isSlackConfigured()) {
    await slackUrgentAlert(newCritical.map(i => ({ severity: i.severity, summary: i.summary }))).catch(() => {})
  }

  // 알림 기록
  for (const i of newCritical) markAlerted(i.id)
}

export async function notifyDailyBriefing(params: {
  summary: string
  goals: GoalProgress[]
  todayCycles: number
  todayActions: number
}): Promise<void> {
  const goalsText = params.goals.length > 0
    ? params.goals.map(g => `  ${g.onTrack ? '✅' : '❌'} ${g.goal.goal}: ${g.progressPercent}%`).join('\n')
    : '  설정된 목표 없음'

  if (isTelegramConfigured()) {
    const text = `*🌅 Garnet 데일리 브리핑*\n\n${params.summary}\n\n*목표 진행률*\n${goalsText}\n\n*어제 활동:* ${params.todayCycles}회 사이클, ${params.todayActions}건 액션`
    await sendMessage(text, { parseMode: 'Markdown' }).catch(() => {})
  }

  if (isSlackConfigured()) {
    await slackDailyBriefing({
      summary: params.summary,
      goals: params.goals.map(g => ({ name: g.goal.goal, percent: g.progressPercent, onTrack: g.onTrack })),
      todayCycles: params.todayCycles,
      todayActions: params.todayActions,
    }).catch(() => {})
  }
}

export async function notifyCycleResult(result: CycleResult): Promise<void> {
  // 에러도 하루 2회 보고에 포함 — 즉시 알림 안 함
}

/** 승인 요청 알림 — HIGH만 즉시 */
export async function notifyApprovalRequest(params: {
  title: string
  rationale: string
  riskLevel: string
  expectedEffect?: string
  goalAlignment?: string
}): Promise<void> {
  if (isSlackConfigured()) {
    await slackApprovalRequest(params).catch(() => {})
  }
}
