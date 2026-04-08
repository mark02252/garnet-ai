/**
 * Agent Loop — Evaluator
 * 사이클 판단 결과를 에피소딕 메모리에 저장
 */

import { storeEpisode } from '@/lib/memory/episodic-store'
import type { EpisodicEntry } from '@/lib/memory/episodic-store'
import type { WorldModel, ReasonerOutput, CycleType } from './types'

type ExecutionSummary = {
  autoExecuted: number
  sentToGovernor: number
  errors: string[]
}

export function buildEpisode(
  cycleId: string,
  cycleType: CycleType,
  worldModel: WorldModel,
  decision: ReasonerOutput,
  execution: ExecutionSummary,
): EpisodicEntry {
  return {
    category: 'agent_loop_decision',
    input: JSON.stringify({
      cycleType,
      snapshot: {
        ga4Sessions: worldModel.snapshot.ga4.sessions,
        snsEngagement: worldModel.snapshot.sns.engagement,
        competitorThreat: worldModel.snapshot.competitors.threatLevel,
      },
      situationSummary: decision.situationSummary,
      actionsDecided: decision.actions.length,
    }),
    output: JSON.stringify({
      actions: decision.actions.map(a => ({ kind: a.kind, title: a.title, riskLevel: a.riskLevel })),
      autoExecuted: execution.autoExecuted,
      sentToGovernor: execution.sentToGovernor,
      errors: execution.errors,
    }),
    score: execution.errors.length === 0 ? 70 : 40,
    tags: ['agent-loop', cycleType, ...decision.actions.map(a => a.kind)],
    metadata: { cycleId, cycleType },
  }
}

export async function evaluateAndStore(
  cycleId: string,
  cycleType: CycleType,
  worldModel: WorldModel,
  decision: ReasonerOutput,
  execution: ExecutionSummary,
): Promise<void> {
  const episode = buildEpisode(cycleId, cycleType, worldModel, decision, execution)
  await storeEpisode(episode)
}
