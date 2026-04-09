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

  // 자기비판 부분 분리
  const parts = params.rationale.split(/\[자기비판\]|\[자기비평\]/)
  const mainRationale = parts[0].replace(/^\[검토됨\]\s*/, '').trim()
  const selfCritique = parts[1]?.trim()

  // 핵심 근거만 150자로 요약
  const shortRationale = mainRationale.length > 150
    ? mainRationale.slice(0, 147) + '...'
    : mainRationale

  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${riskEmoji} 승인 요청`, emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${params.title.replace(/^\[검토됨\]\s*/, '')}*` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: shortRationale },
    },
  ]

  // 자기비판이 있으면 별도 블록
  if (selfCritique) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `🔍 _검토: ${selfCritique.slice(0, 120)}_` }],
    })
  }

  // 예상 효과 + 목표를 한 줄로
  const metaLine = [
    params.expectedEffect ? `📈 ${params.expectedEffect.slice(0, 80)}` : '',
    params.goalAlignment ? `🎯 ${params.goalAlignment}` : '',
  ].filter(Boolean).join('  |  ')

  if (metaLine) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: metaLine }] })
  }

  blocks.push(
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
  )

  await send({ blocks })
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

/** 데일리 브리핑 (매출 + 트래픽 + 목표 + 인사이트) */
export async function slackDailyBriefing(params: {
  summary: string
  goals: Array<{ name: string; percent: number; onTrack: boolean }>
  todayCycles: number
  todayActions: number
  ecommerce?: { revenue: number; purchasers: number; avgOrder: number; conversionRate: number }
  traffic?: { sessions: number; changePercent: number }
  newKnowledge?: number
  pendingApprovals?: number
  topInsight?: string
}): Promise<void> {
  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })

  const blocks: Array<Record<string, unknown>> = [
    { type: 'header', text: { type: 'plain_text', text: `🌅 Garnet 데일리 브리핑 — ${today}`, emoji: true } },
  ]

  // 매출
  if (params.ecommerce && params.ecommerce.revenue > 0) {
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*💰 매출*\n₩${params.ecommerce.revenue.toLocaleString()}` },
        { type: 'mrkdwn', text: `*👤 구매자*\n${params.ecommerce.purchasers}명 (인당 ₩${params.ecommerce.avgOrder.toLocaleString()})` },
      ],
    })
  }

  // 트래픽
  if (params.traffic) {
    const changeStr = params.traffic.changePercent > 0 ? `+${params.traffic.changePercent.toFixed(1)}%` : `${params.traffic.changePercent.toFixed(1)}%`
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*📊 세션*\n${params.traffic.sessions.toLocaleString()} (${changeStr})` },
        { type: 'mrkdwn', text: `*🛒 전환율*\n${params.ecommerce ? `${(params.ecommerce.conversionRate * 100).toFixed(1)}%` : 'N/A'}` },
      ],
    })
  }

  // 목표
  if (params.goals.length > 0) {
    const goalsText = params.goals.map(g => `${g.onTrack ? '✅' : '⚠️'} ${g.name}: ${g.percent}%`).join('\n')
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*🎯 목표*\n${goalsText}` } })
  }

  // 인사이트
  if (params.topInsight) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `💡 ${params.topInsight}` }],
    })
  }

  // Garnet 활동
  const activityParts = [`사이클 ${params.todayCycles}회`, `액션 ${params.todayActions}건`]
  if (params.newKnowledge) activityParts.push(`새 지식 +${params.newKnowledge}건`)
  if (params.pendingApprovals) activityParts.push(`승인 대기 ${params.pendingApprovals}건`)

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `🤖 ${activityParts.join(' | ')}` }],
  })

  if (params.pendingApprovals && params.pendingApprovals > 0) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: `승인 인박스 (${params.pendingApprovals}건)` },
        url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/approvals`,
      }],
    })
  }

  blocks.push({ type: 'divider' })
  await send({ blocks })
}

/** 종합 보고 (하루 2회 — 아침 + 저녁) */
export async function slackDailyReport(params: {
  period: 'morning' | 'evening'
  summary: string
  autoExecuted: Array<{ title: string; result: string }>
  pendingApprovals: Array<{ title: string; riskLevel: string; rationale: string }>
  knowledgeLearned: number
  goalsProgress: Array<{ name: string; percent: number; onTrack: boolean }>
}): Promise<void> {
  const icon = params.period === 'morning' ? '🌅' : '🌙'
  const label = params.period === 'morning' ? '오전 보고' : '저녁 보고'

  const blocks: Array<Record<string, unknown>> = [
    { type: 'header', text: { type: 'plain_text', text: `${icon} Garnet ${label}`, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: params.summary.slice(0, 300) } },
  ]

  // 자동 실행된 것
  if (params.autoExecuted.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*자동 처리 완료 (${params.autoExecuted.length}건)*\n${params.autoExecuted.map(a => `✅ ${a.title}`).join('\n')}`,
      },
    })
  }

  // 승인 대기
  if (params.pendingApprovals.length > 0) {
    const approvalLines = params.pendingApprovals.map(a => {
      const emoji = a.riskLevel === 'HIGH' ? '🔴' : '🟡'
      return `${emoji} *${a.title}*\n    ${a.rationale.slice(0, 100)}`
    }).join('\n\n')

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*승인이 필요한 제안 (${params.pendingApprovals.length}건)*\n\n${approvalLines}` },
    })
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: `승인 인박스에서 확인 (${params.pendingApprovals.length}건)` },
        url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/approvals`,
      }],
    })
  }

  // 목표
  if (params.goalsProgress.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*목표*\n${params.goalsProgress.map(g => `${g.onTrack ? '✅' : '⚠️'} ${g.name}: ${g.percent}%`).join('\n')}`,
      },
    })
  }

  // 학습
  if (params.knowledgeLearned > 0) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `📚 새로 학습한 지식: ${params.knowledgeLearned}건` }],
    })
  }

  blocks.push({ type: 'divider' })
  await send({ blocks })
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

/** 경쟁사 변화 감지 */
export async function slackCompetitorAlert(params: {
  competitor: string
  change: string
  suggestedAction?: string
}): Promise<void> {
  await send({
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🏢 경쟁사 변화 감지', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*${params.competitor}*\n${params.change.slice(0, 200)}` } },
      ...(params.suggestedAction ? [{
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `💡 대응 제안: ${params.suggestedAction.slice(0, 150)}` }],
      }] : []),
      { type: 'divider' },
    ],
  })
}

/** 목표 달성 위험 경고 */
export async function slackGoalRiskAlert(params: {
  goals: Array<{ name: string; percent: number; predicted: number; urgency: string }>
}): Promise<void> {
  const atRisk = params.goals.filter(g => g.urgency === 'will_miss' || g.urgency === 'at_risk')
  if (atRisk.length === 0) return

  const lines = atRisk.map(g => {
    const icon = g.urgency === 'will_miss' ? '🔴' : '🟡'
    return `${icon} *${g.name}*: 현재 ${g.percent}% → 예측 ${g.predicted}%`
  }).join('\n')

  await send({
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🎯 목표 달성 위험', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: lines } },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '현재 추세가 지속되면 목표 달성이 어렵습니다. 전략 조정이 필요합니다.' }],
      },
      { type: 'divider' },
    ],
  })
}

/** 중요 지식 발견 */
export async function slackKnowledgeDiscovery(params: {
  domain: string
  pattern: string
  observation: string
  confidence: number
}): Promise<void> {
  await send({
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '📚 새 비즈니스 인사이트', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*[${params.domain}]* ${params.pattern.slice(0, 100)}` } },
      { type: 'section', text: { type: 'mrkdwn', text: params.observation.split('\n')[0].slice(0, 200) } },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `신뢰도: ${(params.confidence * 100).toFixed(0)}%` }],
      },
      { type: 'divider' },
    ],
  })
}

/** 주간 성장 리포트 */
export async function slackWeeklyReport(params: {
  totalKnowledge: number
  newKnowledge: number
  growthRate: number
  strongDomains: string[]
  weakDomains: string[]
  decisionAccuracy: number
  cyclesRun: number
  actionsExecuted: number
  topInsight?: string
}): Promise<void> {
  await send({
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '📊 Garnet 주간 성장 리포트', emoji: true } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*총 지식*\n${params.totalKnowledge}건 (+${params.newKnowledge})` },
          { type: 'mrkdwn', text: `*성장률*\n${params.growthRate > 0 ? '+' : ''}${params.growthRate}%` },
          { type: 'mrkdwn', text: `*판단 정확도*\n${params.decisionAccuracy.toFixed(0)}%` },
          { type: 'mrkdwn', text: `*사이클*\n${params.cyclesRun}회 / ${params.actionsExecuted}건 실행` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*강한 영역:* ${params.strongDomains.join(', ') || '아직 없음'}\n*학습 필요:* ${params.weakDomains.join(', ') || '없음'}`,
        },
      },
      ...(params.topInsight ? [{
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `💡 이번 주 핵심 인사이트: ${params.topInsight.slice(0, 150)}` }],
      }] : []),
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
