/**
 * Agent Loop — Notifier
 * Telegram을 통한 긴급 알림, 데일리 브리핑, 사이클 에러 알림
 */

import { isTelegramConfigured, sendMessage } from '@/lib/telegram'
import type { OpenIssue, CycleResult, GoalProgress } from './types'

export async function notifyUrgent(issues: OpenIssue[]): Promise<void> {
  const urgent = issues.filter(i => i.severity === 'critical' || i.severity === 'high')
  if (urgent.length === 0 || !isTelegramConfigured()) return

  const emoji: Record<string, string> = { critical: '\u{1F6A8}', high: '\u26A0\uFE0F', normal: '\u2139\uFE0F', low: '\u{1F4CB}' }
  const text = `*Agent Loop \u2014 \uAE34\uAE09 \uC54C\uB9BC*\n\n${urgent.map(i =>
    `${emoji[i.severity]} [${i.type}] ${i.summary}`
  ).join('\n')}`

  await sendMessage(text, { parseMode: 'Markdown' }).catch(() => {})
}

export async function notifyDailyBriefing(params: {
  summary: string
  goals: GoalProgress[]
  todayCycles: number
  todayActions: number
}): Promise<void> {
  if (!isTelegramConfigured()) return

  const goalsText = params.goals.length > 0
    ? params.goals.map(g => `  ${g.onTrack ? '\u2705' : '\u274C'} ${g.goal.goal}: ${g.progressPercent}%`).join('\n')
    : '  \uC124\uC815\uB41C \uBAA9\uD45C \uC5C6\uC74C'

  const text = `*\u{1F305} Garnet \uB370\uC77C\uB9AC \uBE0C\uB9AC\uD551*\n\n${params.summary}\n\n*\uBAA9\uD45C \uC9C4\uD589\uB960*\n${goalsText}\n\n*\uC5B4\uC81C \uD65C\uB3D9:* ${params.todayCycles}\uD68C \uC0AC\uC774\uD074, ${params.todayActions}\uAC74 \uC561\uC158`

  await sendMessage(text, { parseMode: 'Markdown' }).catch(() => {})
}

export async function notifyCycleResult(result: CycleResult): Promise<void> {
  if (result.error && isTelegramConfigured()) {
    await sendMessage(`\u26A0\uFE0F Agent Loop \uC5D0\uB7EC\n\n${result.error}`, { parseMode: 'Markdown' }).catch(() => {})
  }
}
