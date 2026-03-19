// Simple Slack webhook integration
// Users set SLACK_WEBHOOK_URL in env or settings

export async function sendSlackMessage(params: {
  text: string
  channel?: string
  blocks?: Array<Record<string, unknown>>
}): Promise<{ ok: boolean; error?: string }> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return { ok: false, error: 'SLACK_WEBHOOK_URL이 설정되지 않았습니다.' }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: params.text,
        ...(params.channel ? { channel: params.channel } : {}),
        ...(params.blocks ? { blocks: params.blocks } : {}),
      }),
    })
    if (!res.ok) return { ok: false, error: `Slack API 오류: ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Slack 전송 실패' }
  }
}

// Pre-built message templates
export function buildPublishNotification(postTitle: string, status: 'success' | 'failed') {
  return {
    text: status === 'success'
      ? `Instagram 게시 완료: "${postTitle}"`
      : `Instagram 게시 실패: "${postTitle}"`,
  }
}

export function buildPerformanceAlert(message: string, type: 'warning' | 'success' | 'info') {
  const emoji = type === 'warning' ? '[경고]' : type === 'success' ? '[성과]' : '[정보]'
  return { text: `${emoji} [Garnet 성과 알림] ${message}` }
}

export function buildDailyBriefing(params: {
  todayScheduled: number
  weekScheduled: number
  reachTrend: string
  recommendation: string
}) {
  return {
    text: `*오늘의 브리핑*\n• 오늘 예약: ${params.todayScheduled}건\n• 이번 주: ${params.weekScheduled}건\n• 도달 추세: ${params.reachTrend}\n• ${params.recommendation}`,
  }
}
