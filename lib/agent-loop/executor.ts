/**
 * Agent Loop — Executor
 * Reasoner 액션을 자동 실행(LOW) 또는 Governor 승인 큐(MEDIUM+)로 라우팅
 */

import { enqueueWithRisk } from '@/lib/governor'
import { flushPendingExec } from '@/lib/governor-executor'
import { isTelegramConfigured, sendApprovalRequest } from '@/lib/telegram'
import { scheduleMeasurement } from './outcome-observer'
import type { ReasonerAction } from './types'

export type RouteResult = {
  routed: 'auto' | 'governor'
  actionId: string | null
  executed: boolean
  error: string | null
}

export async function routeAction(action: ReasonerAction): Promise<RouteResult> {
  try {
    // 같은 kind가 이미 PENDING_APPROVAL이면 중복 생성 안 함
    try {
      const { prisma } = await import('@/lib/prisma')
      const existing = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
        `SELECT COUNT(*)::int as count FROM "GovernorAction" WHERE kind = $1 AND status = 'PENDING_APPROVAL' AND "deletedAt" IS NULL`,
        action.kind,
      )
      if ((existing[0]?.count ?? 0) > 0) {
        return { routed: 'governor', actionId: null, executed: false, error: null }
      }
    } catch { /* proceed anyway */ }

    // Confidence 기반 리스크 조정
    let effectiveRiskLevel = action.riskLevel
    try {
      const { calculateConfidence } = await import('./confidence')
      const conf = await calculateConfidence(action)
      effectiveRiskLevel = conf.adjustedRiskLevel
    } catch { /* use original */ }

    const govAction = await enqueueWithRisk({
      kind: action.kind,
      payload: {
        ...action.payload,
        _agentLoop: {
          title: action.title,
          rationale: action.rationale,
          expectedEffect: action.expectedEffect,
          goalAlignment: action.goalAlignment,
        },
      },
      riskLevel: effectiveRiskLevel,
      riskReason: `Agent Loop Reasoner: ${action.rationale}`,
    })

    if (effectiveRiskLevel === 'LOW') {
      await flushPendingExec()
      // 실행 결과 확인 — EXECUTED이면 성공, FAILED이면 실패
      try {
        const { getById } = await import('@/lib/governor')
        const updated = await getById(govAction.id)
        const wasExecuted = updated?.status === 'EXECUTED'

        // Outcome 측정 예약
        if (wasExecuted) {
          try {
            const { buildSnapshotFromDb } = await import('./scanner')
            const snapshot = await buildSnapshotFromDb()
            await scheduleMeasurement({
              governorActionId: govAction.id,
              actionKind: action.kind,
              metricsBefore: {
                engagement: snapshot.sns.engagement,
                followers: snapshot.sns.followerGrowth,
                reach: 0,
              },
            })
          } catch { /* non-critical */ }
        }

        return {
          routed: 'auto',
          actionId: govAction.id,
          executed: wasExecuted,
          error: wasExecuted ? null : `실행 실패: ${updated?.status ?? 'unknown'}`,
        }
      } catch {
        return { routed: 'auto', actionId: govAction.id, executed: true, error: null }
      }
    }

    // MEDIUM/HIGH → Governor 승인 대기, 텔레그램 알림 시도
    if (isTelegramConfigured()) {
      await sendApprovalRequest(govAction).catch(() => {})
    }

    return { routed: 'governor', actionId: govAction.id, executed: false, error: null }
  } catch (err) {
    return {
      routed: action.riskLevel === 'LOW' ? 'auto' : 'governor',
      actionId: null,
      executed: false,
      error: String(err),
    }
  }
}

// Note: LOW risk actions auto-execute via flushPendingExec() which uses governor-executor's handler registry.
// New action kinds need handlers registered via registerHandler() in governor-executor.ts.

export async function routeActions(actions: ReasonerAction[]): Promise<{
  autoExecuted: number
  sentToGovernor: number
  errors: string[]
}> {
  let autoExecuted = 0
  let sentToGovernor = 0
  const errors: string[] = []

  for (const action of actions) {
    const result = await routeAction(action)
    if (result.routed === 'auto' && result.executed) autoExecuted++
    if (result.routed === 'governor') sentToGovernor++
    if (result.error) errors.push(`[${action.kind}] ${result.error}`)
  }

  return { autoExecuted, sentToGovernor, errors }
}
