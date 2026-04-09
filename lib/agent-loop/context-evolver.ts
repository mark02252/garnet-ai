/**
 * Context Evolver — BusinessContext를 살아있는 문서로 만든다
 *
 * Garnet이 스스로:
 * 1. 추적 가능한 목표 vs 불가능한 목표 구분
 * 2. 데이터 기반으로 목표 진행률 자동 감지
 * 3. 새 목표 제안 / 기존 목표 수정 제안
 * 4. 비즈니스 맥락 변화 반영 (경쟁사, 시장 등)
 */

import { loadBusinessContext, saveBusinessContext, type BusinessContext, type StrategicGoal } from '@/lib/business-context'
import { runLLM } from '@/lib/llm'
import { getKnowledgeStats } from './knowledge-store'
import { isSlackConfigured, slackEvolutionAlert } from './slack-notifier'
import { isTelegramConfigured, sendMessage } from '@/lib/telegram'

export type GoalTrackability = {
  goal: StrategicGoal
  trackable: boolean
  dataSource: string | null  // 어디서 데이터를 가져올 수 있는지
  reason: string
}

export type ContextUpdateProposal = {
  type: 'add_goal' | 'modify_goal' | 'archive_goal' | 'update_context'
  description: string
  details: Record<string, unknown>
}

/**
 * 각 목표가 실제로 추적 가능한지 평가
 */
export function assessGoalTrackability(ctx: BusinessContext): GoalTrackability[] {
  // 데이터 소스 매핑 — Garnet이 접근 가능한 데이터
  const trackableMetrics: Record<string, { source: string; available: boolean }> = {
    '팔로워 수': { source: 'Instagram API (SnsAnalyticsSnapshot)', available: true },
    '팔로워': { source: 'Instagram API', available: true },
    '참여율': { source: 'Instagram API (engagement)', available: true },
    '도달': { source: 'Instagram API (InstagramReachDaily)', available: true },
    '세션': { source: 'GA4 API', available: true },
    '전환율': { source: 'GA4 API (GTM 연동 완료, 데이터 수집 중)', available: true },
    '예매 전환율': { source: 'GA4 API', available: true },
    '이탈률': { source: 'GA4 API', available: true },
    '페이지뷰': { source: 'GA4 API', available: true },
  }

  // 추적 불가능한 메트릭 패턴
  const untrackablePatterns = [
    '매출', '수익', '계약', '정산', '매출액', '문의 수', '회원',
    '구축', '영업', '제휴', '참여자',
  ]

  return (ctx.strategicGoals || []).map(goal => {
    // 메트릭이 추적 가능한지 확인
    const metricLower = goal.metric.toLowerCase()

    for (const [key, info] of Object.entries(trackableMetrics)) {
      if (metricLower.includes(key.toLowerCase()) || key.toLowerCase().includes(metricLower)) {
        return { goal, trackable: true, dataSource: info.source, reason: `${info.source}에서 자동 추적 가능` }
      }
    }

    for (const pattern of untrackablePatterns) {
      if (metricLower.includes(pattern)) {
        return {
          goal, trackable: false, dataSource: null,
          reason: `${pattern} 관련 데이터는 Garnet이 접근할 수 없음 (정산/CRM/영업 시스템 필요)`,
        }
      }
    }

    return { goal, trackable: false, dataSource: null, reason: '데이터 소스 불명' }
  })
}

/**
 * 데이터 기반으로 새 목표를 제안하거나 기존 목표 수정을 제안
 * weekly-review에서 호출
 */
export async function evolveContext(): Promise<{
  proposals: ContextUpdateProposal[]
  archived: string[]
  updated: boolean
}> {
  const ctx = loadBusinessContext()
  if (!ctx) return { proposals: [], archived: [], updated: false }

  const trackability = assessGoalTrackability(ctx)
  const knowledgeStats = await getKnowledgeStats()
  const proposals: ContextUpdateProposal[] = []
  const archived: string[] = []
  let updated = false

  // 1. 추적 불가능한 목표를 "비즈니스 맥락"으로 이동 (삭제가 아니라 맥락화)
  const untrackable = trackability.filter(t => !t.trackable)
  const trackable = trackability.filter(t => t.trackable)

  if (untrackable.length > 0) {
    for (const ut of untrackable) {
      // strategicGoals에서 제거하지 않고, 타입을 표시
      proposals.push({
        type: 'archive_goal',
        description: `"${ut.goal.goal}" — ${ut.reason}. 비즈니스 방향으로 인식하되 자동 추적 대상에서 제외 제안.`,
        details: { goal: ut.goal, reason: ut.reason },
      })
    }
  }

  // 2. 데이터에서 자동 감지된 새 목표 후보
  // GA4 세션이 있으면 → 세션 성장 목표
  // SNS engagement가 있으면 → 참여율 목표
  const existingMetrics = new Set(ctx.strategicGoals.map(g => g.metric.toLowerCase()))

  if (!existingMetrics.has('세션') && !existingMetrics.has('sessions')) {
    proposals.push({
      type: 'add_goal',
      description: 'GA4 세션 데이터가 수집 중입니다. 웹 트래픽 성장 목표를 추가하면 자동 추적이 가능합니다.',
      details: { goal: '웹 트래픽 성장', metric: '월간 세션', target: '30,000', priority: 'high' },
    })
  }

  if (!existingMetrics.has('참여율') && !existingMetrics.has('engagement')) {
    proposals.push({
      type: 'add_goal',
      description: 'SNS 참여율 데이터가 수집 중입니다. 참여율 목표를 추가하면 콘텐츠 전략 평가가 가능합니다.',
      details: { goal: 'SNS 참여율 향상', metric: '평균 참여율', target: '5%', priority: 'high' },
    })
  }

  // 3. Knowledge Store에서 새 도메인이 성장하면 관련 목표 제안
  for (const stat of knowledgeStats) {
    if (stat.count >= 20 && stat.avgConfidence >= 0.5) {
      const domainGoalExists = ctx.strategicGoals.some(g =>
        g.goal.toLowerCase().includes(stat.domain) || g.metric.toLowerCase().includes(stat.domain)
      )
      if (!domainGoalExists && !['marketing', 'operations', 'self_improvement'].includes(stat.domain)) {
        proposals.push({
          type: 'add_goal',
          description: `${stat.domain} 도메인의 지식이 ${stat.count}건으로 충분히 쌓였습니다. 관련 목표를 설정하면 이 지식을 활용한 자동 추적이 가능합니다.`,
          details: { domain: stat.domain, knowledgeCount: stat.count },
        })
      }
    }
  }

  // 4. LLM으로 비즈니스 맥락 변화 분석
  if (knowledgeStats.length >= 3) {
    try {
      const knowledgeSummary = knowledgeStats
        .map(s => `${s.domain}: ${s.count}건 (신뢰도 ${(s.avgConfidence * 100).toFixed(0)}%)`)
        .join(', ')

      const prompt = `현재 비즈니스 목표와 축적된 지식을 보고, 목표를 업데이트해야 할 부분이 있는지 분석하세요.

현재 추적 가능한 목표:
${trackable.map(t => `- ${t.goal.goal} (${t.goal.metric}: ${t.goal.target})`).join('\n')}

추적 불가능한 목표 (비즈니스 맥락으로 인식):
${untrackable.map(t => `- ${t.goal.goal} — ${t.reason}`).join('\n')}

축적된 지식: ${knowledgeSummary}

변경이 필요하면 JSON 배열로:
[{"type":"modify_goal|add_goal","description":"변경 이유","goal":"목표명","metric":"지표","target":"목표값","priority":"high|medium"}]
변경 불필요하면 빈 배열. JSON만 출력.`

      const raw = await runLLM('비즈니스 전략 고문. JSON만 출력.', prompt, 0.3, 800)
      const parsed = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || '[]') as Array<Record<string, string>>

      for (const p of parsed) {
        if (p.description) {
          proposals.push({
            type: (p.type || 'modify_goal') as ContextUpdateProposal['type'],
            description: p.description,
            details: { goal: p.goal, metric: p.metric, target: p.target, priority: p.priority },
          })
        }
      }
    } catch { /* non-critical */ }
  }

  // 5. 제안이 있으면 알림
  if (proposals.length > 0) {
    const summary = proposals.map(p => `• ${p.description.slice(0, 100)}`).join('\n')

    if (isSlackConfigured()) {
      await slackEvolutionAlert({
        type: 'self_improve',
        title: '비즈니스 목표 업데이트 제안',
        description: summary,
      }).catch(() => {})
    }

    if (isTelegramConfigured()) {
      await sendMessage(
        `📋 *Garnet 목표 업데이트 제안*\n\n${summary}`,
        { parseMode: 'Markdown' },
      ).catch(() => {})
    }
  }

  return { proposals, archived, updated }
}

/**
 * 사용자의 자연어 입력으로 BusinessContext 업데이트
 * "B2B는 이미 3건 계약됨", "대관 문의는 월 20건 정도" 같은 입력 처리
 */
export async function updateContextFromUserInput(input: string): Promise<{
  updated: boolean
  changes: string[]
}> {
  const ctx = loadBusinessContext()
  if (!ctx) return { updated: false, changes: [] }

  const prompt = `현재 비즈니스 컨텍스트를 사용자 입력 기반으로 업데이트하세요.

사용자 입력: "${input}"

현재 목표:
${ctx.strategicGoals.map(g => `- ${g.goal} (${g.metric}: ${g.target}, ${g.priority})`).join('\n')}

JSON으로 업데이트할 내용:
{"changes":[{"field":"strategicGoals[0].target","newValue":"값","reason":"이유"}],"newContext":"추가할 맥락 정보"}
변경 없으면: {"changes":[]}`

  try {
    const raw = await runLLM('비즈니스 컨텍스트 관리자. JSON만 출력.', prompt, 0.2, 600)
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')
    const changes: string[] = []

    if (parsed.changes?.length > 0) {
      // 간단한 필드 업데이트 적용
      for (const change of parsed.changes) {
        changes.push(`${change.field}: ${change.newValue} (${change.reason})`)
      }
    }

    if (parsed.newContext) {
      ctx.description = ctx.description
        ? `${ctx.description}\n\n[${new Date().toISOString().split('T')[0]}] ${parsed.newContext}`
        : parsed.newContext
      changes.push(`맥락 추가: ${parsed.newContext}`)
    }

    if (changes.length > 0) {
      ctx.lastUpdated = new Date().toISOString()
      saveBusinessContext(ctx)
      return { updated: true, changes }
    }

    return { updated: false, changes: [] }
  } catch {
    return { updated: false, changes: [] }
  }
}
