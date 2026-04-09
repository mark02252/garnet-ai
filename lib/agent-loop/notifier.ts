/**
 * Agent Loop — Notifier
 * Telegram + Slack 이중 알림
 */

import { isTelegramConfigured, sendMessage } from '@/lib/telegram'
import { isSlackConfigured, slackUrgentAlert, slackDailyBriefing, slackApprovalRequest } from './slack-notifier'
import type { OpenIssue, CycleResult, GoalProgress } from './types'

export async function notifyUrgent(issues: OpenIssue[]): Promise<void> {
  const urgent = issues.filter(i => i.severity === 'critical' || i.severity === 'high')
  if (urgent.length === 0) return

  const emoji: Record<string, string> = { critical: '🚨', high: '⚠️', normal: 'ℹ️', low: '📋' }

  // Telegram
  if (isTelegramConfigured()) {
    const text = `*Agent Loop — 긴급 알림*\n\n${urgent.map(i =>
      `${emoji[i.severity]} [${i.type}] ${i.summary}`
    ).join('\n')}`
    await sendMessage(text, { parseMode: 'Markdown' }).catch(() => {})
  }

  // Slack
  if (isSlackConfigured()) {
    await slackUrgentAlert(urgent.map(i => ({ severity: i.severity, summary: i.summary }))).catch(() => {})
  }
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

  // Telegram
  if (isTelegramConfigured()) {
    const text = `*🌅 Garnet 데일리 브리핑*\n\n${params.summary}\n\n*목표 진행률*\n${goalsText}\n\n*어제 활동:* ${params.todayCycles}회 사이클, ${params.todayActions}건 액션`
    await sendMessage(text, { parseMode: 'Markdown' }).catch(() => {})
  }

  // Slack
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
  if (!result.error) return

  if (isTelegramConfigured()) {
    await sendMessage(`⚠️ Agent Loop 에러\n\n${result.error}`, { parseMode: 'Markdown' }).catch(() => {})
  }
}

/** 승인 요청 알림 (Executor에서 호출) */
export async function notifyApprovalRequest(params: {
  title: string
  rationale: string
  riskLevel: string
  expectedEffect?: string
  goalAlignment?: string
}): Promise<void> {
  // Slack
  if (isSlackConfigured()) {
    await slackApprovalRequest(params).catch(() => {})
  }
}
