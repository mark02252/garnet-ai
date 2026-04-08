/**
 * Agent Loop — Reasoner
 * LLM 기반 의사결정 엔진: World Model + Goals + Episodic Memory → 액션 제안
 */

import { runLLM } from '@/lib/llm'
import { getBusinessContextPrompt } from '@/lib/business-context'
import { retrieveSimilarEpisodes } from '@/lib/memory/episodic-store'
import { getKnowledgeForReasoner } from './knowledge-store'
import type { WorldModel, GoalProgress, ReasonerOutput, ReasonerAction } from './types'

const SYSTEM_PROMPT = `당신은 Garnet Agent Loop의 추론 엔진입니다. 마케팅 전문가로서 현재 상황을 분석하고 최적의 액션을 결정합니다.

규칙:
1. 반드시 JSON만 출력하세요.
2. 액션이 불필요하면 actions를 빈 배열로, noActionReason에 이유를 기술하세요.
3. 각 액션의 riskLevel은 반드시 LOW, MEDIUM, HIGH 중 하나입니다.
4. LOW: 데이터 분석, 리포트 생성, 내부 메모리 갱신 등
5. MEDIUM: 콘텐츠 발행, 외부 API 호출, Flow 실행 등
6. HIGH: 예산 변경, 캠페인 중단, 대량 발행 등
7. 이전 사이클에서 이미 제안한 액션과 동일한 내용은 제안하지 마세요. 새로운 관점이나 구체적 실행안을 제시하세요.
8. 현재 데이터가 부족한 영역(예: GA4 세션 0)에 대해서는 "데이터 수집 필요" 류의 반복 제안 대신, 구체적인 수집 방법이나 대안 데이터 소스를 제안하세요.

출력 형식:
{
  "situationSummary": "현재 상황 1-2문장 요약",
  "actions": [
    {
      "kind": "report_generation | playbook_update | content_publish | budget_adjust | flow_trigger | alert",
      "title": "액션 제목",
      "rationale": "근거",
      "expectedEffect": "예상 효과",
      "riskLevel": "LOW | MEDIUM | HIGH",
      "goalAlignment": "기여하는 전략 목표",
      "payload": {}
    }
  ],
  "noActionReason": "액션 불필요 시 이유"
}`

export function buildReasonerPrompt(
  worldModel: WorldModel,
  goals: GoalProgress[],
  businessContext: string,
  pastEpisodes: Array<{ input: string; output: string; score: number | null }>,
  knowledge?: {
    effective: Array<{ domain: string; confidence: number; pattern: string; observation: string }>
    antiPatterns: Array<{ domain: string; pattern: string; observation: string }>
  },
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
  const userPrompt = buildReasonerPrompt(
    worldModel, goals, businessContext,
    pastEpisodes.map(e => ({ input: e.input, output: e.output, score: e.score })),
    knowledge,
  )
  const raw = await runLLM(SYSTEM_PROMPT, userPrompt, 0.3, 2000)
  return parseReasonerResponse(raw)
}
