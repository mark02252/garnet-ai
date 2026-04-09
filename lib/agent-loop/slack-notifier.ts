/**
 * Agent Loop Slack 알림
 * 승인 요청, 긴급 알림, 브리핑, 진화 로그를 Slack으로 전송
 */

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || ''

export function isSlackConfigured(): boolean {
  return WEBHOOK_URL.startsWith('https://hooks.slack.com/')
}

async function send(payload: Record<string, unknown>): Promise<boolean> {
  if (!isSlackConfigured()) return false
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch { return false }
}

/** 승인 요청 */
export async function slackApprovalRequest(params: {
  title: string
  rationale: string
  riskLevel: string
  expectedEffect?: string
  goalAlignment?: string
}): Promise<void> {
  const riskEmoji = params.riskLevel === 'HIGH' ? '🔴' : '🟡'
  await send({
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${riskEmoji} 승인 요청`, emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${params.title}*\n\n${params.rationale}`,
        },
      },
      ...(params.expectedEffect ? [{
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `📈 예상 효과: ${params.expectedEffect}` }],
      }] : []),
      ...(params.goalAlignment ? [{
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `🎯 관련 목표: ${params.goalAlignment}` }],
      }] : []),
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '승인 인박스에서 확인' },
            url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/approvals`,
          },
        ],
      },
      { type: 'divider' },
    ],
  })
}

/** 긴급 알림 */
export async function slackUrgentAlert(issues: Array<{
  severity: string
  summary: string
}>): Promise<void> {
  const emoji: Record<string, string> = { critical: '🚨', high: '⚠️' }
  const text = issues.map(i => `${emoji[i.severity] || 'ℹ️'} ${i.summary}`).join('\n')
  await send({
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🚨 Garnet 긴급 알림', emoji: true },
      },
      { type: 'section', text: { type: 'mrkdwn', text } },
      { type: 'divider' },
    ],
  })
}

/** 데일리 브리핑 */
export async function slackDailyBriefing(params: {
  summary: string
  goals: Array<{ name: string; percent: number; onTrack: boolean }>
  todayCycles: number
  todayActions: number
}): Promise<void> {
  const goalsText = params.goals.length > 0
    ? params.goals.map(g => `${g.onTrack ? '✅' : '❌'} ${g.name}: ${g.percent}%`).join('\n')
    : '설정된 목표 없음'

  await send({
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🌅 Garnet 데일리 브리핑', emoji: true },
      },
      { type: 'section', text: { type: 'mrkdwn', text: params.summary } },
      { type: 'section', text: { type: 'mrkdwn', text: `*목표 진행률*\n${goalsText}` } },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `사이클 ${params.todayCycles}회 | 액션 ${params.todayActions}건` }],
      },
      { type: 'divider' },
    ],
  })
}

/** 자동 회의 결과 */
export async function slackMeetingResult(params: {
  topic: string
  conclusion: string
  judgeScore?: number | null
  agents: string[]
}): Promise<void> {
  await send({
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🧠 Agent Loop 자동 회의 완료', emoji: true },
      },
      { type: 'section', text: { type: 'mrkdwn', text: `*${params.topic.slice(0, 100)}*` } },
      { type: 'section', text: { type: 'mrkdwn', text: params.conclusion.slice(0, 500) } },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `참여: ${params.agents.join(', ')}${params.judgeScore ? ` | 점수: ${params.judgeScore}/100` : ''}` },
        ],
      },
      { type: 'divider' },
    ],
  })
}

/** 진화 알림 (능력 창발, 패러다임 전환 등) */
export async function slackEvolutionAlert(params: {
  type: 'emergence' | 'paradigm_shift' | 'cross_insight' | 'self_improve'
  title: string
  description: string
}): Promise<void> {
  const typeEmoji: Record<string, string> = {
    emergence: '🧬', paradigm_shift: '🔄', cross_insight: '💡', self_improve: '🔧',
  }
  const typeLabel: Record<string, string> = {
    emergence: '새 능력 창발', paradigm_shift: '패러다임 전환', cross_insight: '교차 인사이트', self_improve: '자가 발전',
  }
  await send({
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${typeEmoji[params.type] || '📌'} ${typeLabel[params.type] || '진화'}`, emoji: true },
      },
      { type: 'section', text: { type: 'mrkdwn', text: `*${params.title}*\n${params.description.slice(0, 300)}` } },
      { type: 'divider' },
    ],
  })
}
