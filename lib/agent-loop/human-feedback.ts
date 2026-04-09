import { prisma } from '@/lib/prisma'
import { addKnowledge } from './knowledge-store'

// ── 피드백 타입 ──

export type DeferReason = 'no_budget' | 'prerequisite' | 'too_early' | 'external_dependency' | 'good_idea_later'

export type RejectReason = 'wrong_direction' | 'already_doing' | 'not_relevant' | 'other'

const DEFER_LABELS: Record<DeferReason, string> = {
  no_budget: '예산 부족 (다음 분기에)',
  prerequisite: '선행 작업 필요 (다른 게 먼저)',
  too_early: '시기상조 (아직 때가 아님)',
  external_dependency: '외부 의존 (다른 팀/파트너 필요)',
  good_idea_later: '좋은 아이디어, 나중에 참고',
}

const REJECT_LABELS: Record<RejectReason, string> = {
  wrong_direction: '방향이 틀렸다',
  already_doing: '이미 진행 중',
  not_relevant: '우리 상황과 안 맞음',
  other: '기타',
}

// ── 승인 ──

/** 승인 시 — positive signal + 실행 계획 생성 요청 */
export async function onActionApproved(params: {
  actionKind: string
  title: string
  rationale: string
}): Promise<void> {
  // 관련 지식의 confidence 상승
  const entries = await prisma.knowledgeEntry.findMany({
    where: {
      isAntiPattern: false,
      OR: [
        { pattern: { contains: params.actionKind } },
        { pattern: { contains: params.title.slice(0, 20) } },
      ],
    },
    take: 5,
  })

  for (const entry of entries) {
    await prisma.knowledgeEntry.update({
      where: { id: entry.id },
      data: { confidence: Math.min(0.95, entry.confidence + 0.05) },
    }).catch(() => {})
  }

  // "이런 방향의 제안이 승인됨" 지식 저장
  await addKnowledge({
    domain: inferDomain(params.actionKind),
    level: 1,
    pattern: `${params.actionKind}: ${params.title.slice(0, 60)}`,
    observation: `승인됨 — 이 방향의 제안이 사용자에게 수용됨`,
    source: 'human_feedback_approved',
  })
}

// ── 보류 ──

/** 보류 시 — 좋은 아이디어지만 지금은 안 됨 (anti-pattern 아님) */
export async function onActionDeferred(params: {
  actionKind: string
  title: string
  rationale: string
  reason: DeferReason
}): Promise<void> {
  const label = DEFER_LABELS[params.reason]

  // 긍정적 지식으로 저장 (anti-pattern이 아님!)
  await addKnowledge({
    domain: inferDomain(params.actionKind),
    level: 2,
    pattern: `${params.actionKind}: ${params.title.slice(0, 60)}`,
    observation: `보류됨 — ${label}. 아이디어 자체는 유효. 상황 변화 시 재제안 가능.`,
    source: 'human_feedback_deferred',
    isAntiPattern: false, // 보류 ≠ 거절
  })

  // 보류 이유별 컨텍스트 학습
  const contextKnowledge: Record<DeferReason, { pattern: string; observation: string }> = {
    no_budget: {
      pattern: '예산 제약 상황에서의 제안',
      observation: '현재 예산이 제한적. 비용이 큰 제안보다 무비용/저비용 액션을 우선 제안해야 함.',
    },
    prerequisite: {
      pattern: `선행 작업 필요: ${params.title.slice(0, 40)}`,
      observation: `이 액션 전에 다른 작업이 먼저 완료되어야 함. 의존 관계를 파악하고 순서를 맞춰 제안.`,
    },
    too_early: {
      pattern: '시기상조 판단',
      observation: '아이디어는 유효하나 시기가 아님. 관련 지표/상황이 변할 때 다시 제안.',
    },
    external_dependency: {
      pattern: '외부 의존성이 있는 제안',
      observation: '다른 팀이나 외부 파트너의 협조가 필요한 제안. 자체적으로 실행 가능한 대안을 먼저 제안.',
    },
    good_idea_later: {
      pattern: `나중에 참고할 아이디어: ${params.title.slice(0, 40)}`,
      observation: '좋은 아이디어로 평가됨. 상황이 바뀌면 재제안.',
    },
  }

  const ctx = contextKnowledge[params.reason]
  if (ctx) {
    await addKnowledge({
      domain: 'operations',
      level: 2,
      pattern: ctx.pattern,
      observation: ctx.observation,
      source: 'human_feedback_context',
    })
  }
}

// ── 거절 ──

/** 거절 시 — 방향이 틀렸다 (anti-pattern) */
export async function onActionRejected(params: {
  actionKind: string
  title: string
  rationale: string
  reason?: RejectReason | string
}): Promise<void> {
  const reason = params.reason || 'other'
  const label = REJECT_LABELS[reason as RejectReason] || reason

  await addKnowledge({
    domain: inferDomain(params.actionKind),
    level: 2,
    pattern: `${params.actionKind}: ${params.title.slice(0, 60)}`,
    observation: `거절됨 — ${label}. 이 방향의 제안은 하지 않는다.`,
    source: 'human_feedback_rejected',
    isAntiPattern: true,
  })
}

// ── 유틸 ──

function inferDomain(actionKind: string): string {
  const map: Record<string, string> = {
    content_publish: 'content_strategy',
    budget_adjust: 'finance',
    flow_trigger: 'operations',
    report_generation: 'marketing',
    playbook_update: 'marketing',
    alert: 'operations',
    competitor_discovery: 'competitive',
    mutation_experiment: 'marketing',
  }
  return map[actionKind] || 'marketing'
}
