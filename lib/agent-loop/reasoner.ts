/**
 * Agent Loop — Reasoner
 * LLM 기반 의사결정 엔진: World Model + Goals + Episodic Memory → 액션 제안
 */

import { runLLM } from '@/lib/llm'
import { prisma } from '@/lib/prisma'
import { getBusinessContextPrompt } from '@/lib/business-context'
import { retrieveSimilarEpisodes } from '@/lib/memory/episodic-store'
import { getKnowledgeForReasoner } from './knowledge-store'
import { loadReasonerPrompt } from './prompt-manager'
import type { WorldModel, GoalProgress, ReasonerOutput, ReasonerAction } from './types'

/** Reasoner 시스템 프롬프트 — prompt-manager에서 동적 로드 (자동 최적화 대상) */
function getSystemPrompt(): string {
  return loadReasonerPrompt()
}

export function buildReasonerPrompt(
  worldModel: WorldModel,
  goals: GoalProgress[],
  businessContext: string,
  pastEpisodes: Array<{ input: string; output: string; score: number | null }>,
  knowledge?: {
    effective: Array<{ domain: string; confidence: number; pattern: string; observation: string }>
    antiPatterns: Array<{ domain: string; pattern: string; observation: string }>
  },
  macroSummary?: string,
  causalSummary?: string,
  predictionSummary?: string,
  rolesSummary?: string,
  semanticContext?: string,
  reflectionContext?: string,
): string {
  const trendsText = worldModel.trends
    .filter(t => t.direction !== 'stable')
    .map(t => `- ${t.metric}: ${t.direction} ${t.magnitude.toFixed(1)}% (${t.duration} cycles)`)
    .join('\n') || '- 특이 트렌드 없음'

  const goalsText = goals.length > 0
    ? goals.map(g => `- ${g.goal.goal}: ${g.progressPercent}% 달성 (${g.onTrack ? '순조' : '뒤처짐'}) [현재: ${g.currentValue ?? '측정 전'}]`).join('\n')
    : '- 설정된 전략 목표 없음'

  const issuesText = worldModel.openIssues.length > 0
    ? worldModel.openIssues.map(i => `- [${i.severity}] ${i.summary}`).join('\n')
    : '- 미결 이슈 없음'

  const episodesText = pastEpisodes.length > 0
    ? pastEpisodes.slice(0, 3).map(e => `- 판단: ${e.input.slice(0, 100)}... → 결과 점수: ${e.score ?? '미평가'}`).join('\n')
    : '- 유사 과거 사례 없음'

  // 최근 제안된 액션 이력 (중복 방지)
  const recentActionKinds = pastEpisodes
    .flatMap(e => {
      try { return JSON.parse(e.output).actions?.map((a: {kind: string}) => a.kind) || [] }
      catch { return [] }
    })
  const recentActionsText = recentActionKinds.length > 0
    ? `최근 제안된 액션 종류: ${[...new Set(recentActionKinds)].join(', ')} — 동일한 제안 반복 금지`
    : ''

  const snapshotText = `GA4: 세션 ${worldModel.snapshot.ga4.sessions}, 이탈률 ${worldModel.snapshot.ga4.bounceRate}%, 전환율 ${worldModel.snapshot.ga4.conversionRate}%
SNS: 참여율 ${worldModel.snapshot.sns.engagement}%, 팔로워 변동 ${worldModel.snapshot.sns.followerGrowth}
경쟁사: 위협 수준 ${worldModel.snapshot.competitors.threatLevel}, 최근 ${worldModel.snapshot.competitors.recentMoves.length}건 변화
캠페인: 활성 ${worldModel.snapshot.campaigns.active}건, 승인대기 ${worldModel.snapshot.campaigns.pendingApproval}건`

  return `${businessContext ? `## 사업 맥락\n${businessContext}\n\n` : ''}## 현재 상황 (World Model)
${snapshotText}

## 트렌드
${trendsText}

## 전략 목표 진행률
${goalsText}

## 미결 이슈
${issuesText}

## 과거 유사 판단 이력
${episodesText}
${recentActionsText ? `\n## 중복 방지\n${recentActionsText}` : ''}
${knowledge ? `
## 축적된 비즈니스 지식
${knowledge.effective.length > 0
  ? knowledge.effective.map(k => `- [${k.domain}, 신뢰도 ${k.confidence.toFixed(1)}] ${k.pattern} → ${k.observation.split('\n')[0]}`).join('\n')
  : '- 아직 축적된 지식 없음'}

## 하지 말아야 할 것 (Anti-Patterns)
${knowledge.antiPatterns.length > 0
  ? knowledge.antiPatterns.map(k => `- [${k.domain}] ${k.pattern} → ${k.observation.split('\n')[0]}`).join('\n')
  : '- 없음'}` : ''}
${semanticContext ? `
## 현재 상황과 유사한 과거 지식
${semanticContext}` : ''}

## 축적된 인과 관계
${causalSummary || '아직 축적된 인과 관계 없음'}

## 목표 달성 예측
${predictionSummary || '예측 데이터 없음'}

## 거시 환경 (시즌/이벤트)
${macroSummary || '현재 특별한 시즌 없음'}

## Garnet의 활성 역할
${rolesSummary || '기본 비즈니스 분석가'}
${reflectionContext ? `\n${reflectionContext}` : ''}

위 상황을 분석하고, 지금 해야 할 액션을 우선순위 순으로 JSON으로 제안하세요.`
}

export function parseReasonerResponse(raw: string): ReasonerOutput {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    const parsed = JSON.parse(jsonMatch[0]) as ReasonerOutput
    if (!Array.isArray(parsed.actions)) parsed.actions = []
    for (const a of parsed.actions) {
      const normalized = String(a.riskLevel).toUpperCase()
      a.riskLevel = (['LOW', 'MEDIUM', 'HIGH'].includes(normalized) ? normalized : 'MEDIUM') as ReasonerAction['riskLevel']
    }
    return parsed
  } catch {
    return { situationSummary: raw.slice(0, 200), actions: [], noActionReason: 'LLM 응답 파싱 실패' }
  }
}

async function getReflectionContext(): Promise<string> {
  try {
    const recentLessons = await prisma.knowledgeEntry.findMany({
      where: { source: { contains: 'cycle_reflector' }, level: 2 },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    })
    const principles = await prisma.knowledgeEntry.findMany({
      where: { source: { contains: 'cycle_reflector' }, level: 3 },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    })

    // Failure Registry — 시간 감쇠 적용한 회피 규칙
    let avoidanceRules = ''
    try {
      const { buildAvoidanceRules } = await import('./failure-registry')
      avoidanceRules = await buildAvoidanceRules()
    } catch { /* non-critical */ }

    const parts: string[] = []
    if (recentLessons.length > 0) {
      parts.push('## 최근 사이클 교훈')
      parts.push(recentLessons.map(l => `- [${l.domain}] ${l.pattern}: ${l.observation.split('\n')[0]}`).join('\n'))
    }
    if (principles.length > 0) {
      parts.push('## 확립된 원칙 (3회 이상 검증)')
      parts.push(principles.map(p => `- [${p.domain}] ${p.pattern}: ${p.observation.split('\n')[0]}`).join('\n'))
    }
    if (avoidanceRules) {
      parts.push(avoidanceRules)
    }
    return parts.join('\n\n')
  } catch {
    return ''
  }
}

export async function reason(
  worldModel: WorldModel,
  goals: GoalProgress[],
): Promise<ReasonerOutput> {
  const businessContext = getBusinessContextPrompt()
  const pastEpisodes = await retrieveSimilarEpisodes({
    category: 'agent_loop_decision',
    minScore: 50,
    limit: 3,
  })
  // Knowledge Store에서 축적된 지식 조회
  const knowledge = await getKnowledgeForReasoner()
  // 거시 환경 정보 (macro-tracker가 존재할 때만)
  let macroSummary: string | undefined
  try {
    const { getMacroSummary } = await import('./macro-tracker')
    macroSummary = await getMacroSummary()
  } catch { /* macro-tracker not available yet */ }

  // 인과 관계 요약
  let causalSummary: string | undefined
  try {
    const { getCausalSummary } = await import('./causal-model')
    causalSummary = await getCausalSummary()
  } catch { /* causal-model not available yet */ }

  // 목표 달성 예측
  let predictionSummary: string | undefined
  try {
    const { getPredictionSummary } = await import('./goal-predictor')
    predictionSummary = await getPredictionSummary()
  } catch { /* goal-predictor not available yet */ }

  let rolesSummary = ''
  try {
    const { getActiveRolesSummary } = await import('./role-manager')
    rolesSummary = getActiveRolesSummary()
  } catch { /* */ }

  const snapshotText = `GA4: 세션 ${worldModel.snapshot.ga4.sessions}, 이탈률 ${worldModel.snapshot.ga4.bounceRate}%, 전환율 ${worldModel.snapshot.ga4.conversionRate}%
SNS: 참여율 ${worldModel.snapshot.sns.engagement}%, 팔로워 변동 ${worldModel.snapshot.sns.followerGrowth}
경쟁사: 위협 수준 ${worldModel.snapshot.competitors.threatLevel}, 최근 ${worldModel.snapshot.competitors.recentMoves.length}건 변화
캠페인: 활성 ${worldModel.snapshot.campaigns.active}건, 승인대기 ${worldModel.snapshot.campaigns.pendingApproval}건`

  // Semantic knowledge search for current situation
  let semanticContext = ''
  try {
    const { searchKnowledgeSemantic } = await import('./knowledge-store')
    const relevant = await searchKnowledgeSemantic(
      `${worldModel.snapshot.ga4.sessions} sessions, ${worldModel.snapshot.sns.engagement}% engagement, ${worldModel.snapshot.competitors.threatLevel} threat`,
      { limit: 5, minSimilarity: 0.4 },
    )
    if (relevant.length > 0) {
      semanticContext = relevant
        .map(
          (r) =>
            `- [${r.domain}, 유사도 ${(r.similarity * 100).toFixed(0)}%] ${r.pattern} → ${r.observation.split('\n')[0]}`,
        )
        .join('\n')
    }
  } catch {
    /* Ollama not running */
  }

  const reflectionContext = await getReflectionContext()

  const userPrompt = buildReasonerPrompt(
    worldModel, goals, businessContext,
    pastEpisodes.map(e => ({ input: e.input, output: e.output, score: e.score })),
    knowledge,
    macroSummary,
    causalSummary,
    predictionSummary,
    rolesSummary,
    semanticContext,
    reflectionContext,
  )
  const raw = await runLLM(getSystemPrompt(), userPrompt, 0.3, 2000)
  let output = parseReasonerResponse(raw)

  // 진화적 전략 변이 (10% 확률)
  const { shouldMutate, generateMutation } = await import('./strategy-mutator')
  if (shouldMutate()) {
    output = await generateMutation(output, snapshotText)
  }

  return output
}
