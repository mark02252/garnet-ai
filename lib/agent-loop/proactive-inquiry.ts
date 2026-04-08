import { prisma } from '@/lib/prisma'
import { isTelegramConfigured, sendMessage } from '@/lib/telegram'
import type { WorldModel, GoalProgress } from './types'

type InquiryQuestion = {
  topic: string
  question: string
  reason: string
  priority: 'high' | 'normal'
}

/**
 * 정보 부족을 감지하고 사용자에게 질문 생성
 * routine-cycle에서 confidence 낮은 판단이 나올 때 호출
 */
export async function detectInformationGaps(
  worldModel: WorldModel,
  goals: GoalProgress[],
): Promise<InquiryQuestion[]> {
  const gaps: InquiryQuestion[] = []

  // 1. World Model에 0인 지표가 3개 이상
  const zeroMetrics: string[] = []
  if (worldModel.snapshot.ga4.sessions === 0) zeroMetrics.push('GA4 세션')
  if (worldModel.snapshot.ga4.bounceRate === 0) zeroMetrics.push('이탈률')
  if (worldModel.snapshot.ga4.conversionRate === 0) zeroMetrics.push('전환율')
  if (worldModel.snapshot.sns.engagement === 0) zeroMetrics.push('SNS 참여율')

  if (zeroMetrics.length >= 2) {
    gaps.push({
      topic: 'data_collection',
      question: `${zeroMetrics.join(', ')} 데이터가 수집되지 않고 있습니다. GA4/SNS 연동 상태를 확인해주시겠어요?`,
      reason: '데이터 없이는 정확한 판단이 불가합니다.',
      priority: 'high',
    })
  }

  // 2. 목표가 0%이고 관련 데이터가 없는 경우
  const stuckGoals = goals.filter(g => g.progressPercent === 0 && !g.onTrack)
  for (const g of stuckGoals.slice(0, 2)) {
    gaps.push({
      topic: 'goal_context',
      question: `"${g.goal.goal}" 목표가 0%입니다. 현재 이 목표와 관련하여 진행 중인 활동이 있나요? (예: 가격, 채널, 담당자 등)`,
      reason: '목표 관련 맥락이 있으면 더 구체적인 전략을 제안할 수 있습니다.',
      priority: 'high',
    })
  }

  // 3. Knowledge Store에 특정 도메인 지식이 거의 없는 경우
  const knowledgeGaps = await prisma.knowledgeEntry.groupBy({
    by: ['domain'],
    _count: true,
  })

  const importantDomains = ['competitive', 'consumer', 'b2b']
  for (const domain of importantDomains) {
    const count = knowledgeGaps.find(k => k.domain === domain)?._count || 0
    if (count < 3) {
      const domainLabel: Record<string, string> = {
        competitive: '경쟁사',
        consumer: '고객/소비자',
        b2b: 'B2B 영업',
      }
      gaps.push({
        topic: 'domain_knowledge',
        question: `${domainLabel[domain] || domain} 관련 지식이 부족합니다. 이 분야에 대해 알려주실 수 있는 정보가 있나요?`,
        reason: `${domain} 도메인 지식이 ${count}건뿐이라 정확한 판단이 어렵습니다.`,
        priority: 'normal',
      })
    }
  }

  return gaps
}

/** 질문을 Telegram으로 발송 */
export async function sendInquiries(questions: InquiryQuestion[]): Promise<number> {
  if (!isTelegramConfigured() || questions.length === 0) return 0

  const highPriority = questions.filter(q => q.priority === 'high')
  const toSend = highPriority.length > 0 ? highPriority : questions.slice(0, 1)

  for (const q of toSend) {
    const text = `❓ *Garnet 질문*\n\n${q.question}\n\n_이유: ${q.reason}_`
    await sendMessage(text, { parseMode: 'Markdown' }).catch(() => {})
  }

  return toSend.length
}
