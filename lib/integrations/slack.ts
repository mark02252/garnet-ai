import { sendMessage } from '@/lib/telegram';

export async function sendSlackMessage(params: {
  text: string;
  channel?: string;
  blocks?: Array<Record<string, unknown>>;
}): Promise<{ ok: boolean; error?: string }> {
  // blocks는 Telegram에서 지원하지 않음 — text만 사용
  return sendMessage(params.text);
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

export function buildApprovalNotification(params: {
  itemType: string
  itemId: string
  label: string
  pendingCount: number
}) {
  return {
    text: `*[승인 요청]* ${params.label}\n항목: ${params.itemType} (${params.itemId.slice(0, 8)})\n현재 대기: ${params.pendingCount}건`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*승인 요청이 도착했습니다*\n\n*${params.label}*\n항목 유형: \`${params.itemType}\`\n대기 중: ${params.pendingCount}건`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '운영 센터에서 확인' },
            url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/operations`
          }
        ]
      }
    ]
  }
}

export function buildRecommendationAlert(title: string, reason: string, priority: string) {
  const emoji = priority === 'urgent' ? '[긴급]' : priority === 'high' ? '[높음]' : '[참고]'
  return {
    text: `${emoji} *${title}*\n${reason}`
  }
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
