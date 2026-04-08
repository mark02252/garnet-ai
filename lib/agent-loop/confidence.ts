import { prisma } from '@/lib/prisma'
import type { ReasonerAction } from './types'
import type { GovernorRiskLevel } from '@/lib/governor'

type ConfidenceFactors = {
  knowledgeSupport: number    // 관련 지식 건수 기반 0-1
  causalEvidence: number      // 인과 관계 증거 0-1
  antiPatternRisk: number     // anti-pattern 매칭 위험 0-1
  dataCompleteness: number    // World Model 데이터 완전성 0-1
}

/** 액션의 신뢰도 계산 */
export async function calculateConfidence(action: ReasonerAction): Promise<{
  score: number // 0-1
  factors: ConfidenceFactors
  adjustedRiskLevel: GovernorRiskLevel
}> {
  // 1. Knowledge Support
  const relatedKnowledge = await prisma.knowledgeEntry.count({
    where: {
      isAntiPattern: false,
      OR: [
        { pattern: { contains: action.kind } },
        { domain: inferDomain(action.kind) },
      ],
    },
  })
  const knowledgeSupport = Math.min(1, relatedKnowledge / 10)

  // 2. Causal Evidence
  const causalLinks = await prisma.causalLink.count({
    where: { cause: { startsWith: `${action.kind}:` }, strength: { gte: 0.4 } },
  })
  const causalEvidence = Math.min(1, causalLinks / 3)

  // 3. Anti-Pattern Risk
  const antiMatches = await prisma.knowledgeEntry.count({
    where: {
      isAntiPattern: true,
      pattern: { contains: action.kind },
    },
  })
  const antiPatternRisk = Math.min(1, antiMatches / 3)

  // 4. Data Completeness (간단 — action kind에 따라)
  const dataCompleteness = action.payload && Object.keys(action.payload).length > 0 ? 0.7 : 0.3

  const factors: ConfidenceFactors = { knowledgeSupport, causalEvidence, antiPatternRisk, dataCompleteness }

  // 종합 신뢰도
  const score = Math.max(0, Math.min(1,
    (knowledgeSupport * 0.3 + causalEvidence * 0.3 + dataCompleteness * 0.2) - (antiPatternRisk * 0.3)
  ))

  // 리스크 레벨 조정
  let adjustedRiskLevel = action.riskLevel
  if (score < 0.3 && adjustedRiskLevel === 'LOW') {
    adjustedRiskLevel = 'MEDIUM' // 확신 낮으면 상향
  }
  if (score < 0.2 && adjustedRiskLevel === 'MEDIUM') {
    adjustedRiskLevel = 'HIGH'
  }

  return { score, factors, adjustedRiskLevel }
}

function inferDomain(actionKind: string): string {
  const map: Record<string, string> = {
    content_publish: 'content_strategy',
    budget_adjust: 'finance',
    flow_trigger: 'operations',
    report_generation: 'marketing',
    playbook_update: 'marketing',
    alert: 'operations',
  }
  return map[actionKind] || 'marketing'
}
