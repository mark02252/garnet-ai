import { prisma } from '@/lib/prisma'
import { addKnowledge } from './knowledge-store'
import { isTelegramConfigured, sendMessage } from '@/lib/telegram'

type FeedbackReason = 'bad_timing' | 'wrong_direction' | 'no_budget' | 'already_doing' | 'other' | 'unknown'

const REASON_LABELS: Record<FeedbackReason, string> = {
  bad_timing: '타이밍 아님',
  wrong_direction: '방향이 다름',
  no_budget: '예산/리소스 부족',
  already_doing: '이미 진행 중',
  other: '기타',
  unknown: '이유 미제공',
}

/** Governor 승인 시 호출 — positive signal */
export async function onActionApproved(params: {
  actionKind: string
  title: string
  rationale: string
}): Promise<void> {
  // 관련 지식의 confidence 소폭 상승
  const entries = await prisma.knowledgeEntry.findMany({
    where: {
      isAntiPattern: false,
      pattern: { contains: params.actionKind },
    },
    take: 3,
  })

  for (const entry of entries) {
    await prisma.knowledgeEntry.update({
      where: { id: entry.id },
      data: { confidence: Math.min(0.95, entry.confidence + 0.05) },
    }).catch(() => {})
  }
}

/** Governor 거절 시 호출 — anti-pattern 학습 */
export async function onActionRejected(params: {
  actionKind: string
  title: string
  rationale: string
  reason?: FeedbackReason
}): Promise<void> {
  const reason = params.reason || 'unknown'

  // Anti-pattern으로 저장
  await addKnowledge({
    domain: inferDomain(params.actionKind),
    level: 2,
    pattern: `${params.actionKind}: ${params.title}`,
    observation: `거절됨 — ${REASON_LABELS[reason]}. 원래 근거: ${params.rationale.slice(0, 100)}`,
    source: 'human_feedback',
    isAntiPattern: true,
  })
}

/** 거절 후 이유 질문 (Telegram) */
export async function askRejectionReason(actionId: string, title: string): Promise<void> {
  if (!isTelegramConfigured()) return

  const text = `📝 거절하신 이유를 알려주시면 학습에 활용됩니다:

*${title}*

1️⃣ 타이밍 아님
2️⃣ 방향이 다름
3️⃣ 예산/리소스 부족
4️⃣ 이미 진행 중
5️⃣ 기타`

  await sendMessage(text, { parseMode: 'Markdown' }).catch(() => {})
}

function inferDomain(actionKind: string): string {
  const map: Record<string, string> = {
    content_publish: 'content_strategy',
    budget_adjust: 'finance',
    flow_trigger: 'operations',
    report_generation: 'marketing',
    playbook_update: 'marketing',
    alert: 'operations',
    competitor_discovery: 'competitive',
  }
  return map[actionKind] || 'marketing'
}
