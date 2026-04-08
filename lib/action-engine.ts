/**
 * AI Action Suggestion Engine
 * 데이터 분석 결과 → 구체적 실행 액션 자동 생성 → 승인 대기열
 */

import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'

export type ActionSuggestion = {
  id: string
  type: 'content' | 'campaign' | 'optimization' | 'alert'
  priority: 'urgent' | 'high' | 'medium' | 'low'
  title: string
  description: string
  expectedImpact: string
  suggestedDeadline: string
  status: 'pending' | 'approved' | 'dismissed'
  createdAt: string
  source: string // 어떤 데이터에서 도출되었는지
}

/**
 * GA4 + SNS 데이터를 분석하여 액션 제안 생성
 */
export async function generateActionSuggestions(): Promise<ActionSuggestion[]> {
  const suggestions: ActionSuggestion[] = []
  const now = new Date()

  // 1. SNS 스냅샷에서 최근 트렌드 확인
  try {
    const weekAgo = new Date(now)
    weekAgo.setDate(weekAgo.getDate() - 7)
    const twoWeeksAgo = new Date(now)
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

    const [recentSnaps, olderSnaps] = await Promise.all([
      prisma.snsAnalyticsSnapshot.findMany({ where: { date: { gte: weekAgo } } }),
      prisma.snsAnalyticsSnapshot.findMany({ where: { date: { gte: twoWeeksAgo, lt: weekAgo } } }),
    ])

    const recentReach = recentSnaps.reduce((s, r) => s + r.reach, 0)
    const olderReach = olderSnaps.reduce((s, r) => s + r.reach, 0)

    if (olderReach > 0 && recentReach < olderReach * 0.7) {
      suggestions.push({
        id: `action-reach-drop-${now.toISOString()}`,
        type: 'alert',
        priority: 'urgent',
        title: '도달 30% 이상 감소 감지',
        description: `최근 7일 도달(${recentReach})이 이전 7일(${olderReach}) 대비 ${Math.round((1 - recentReach / olderReach) * 100)}% 감소했습니다.`,
        expectedImpact: '즉시 대응 시 도달 회복 가능',
        suggestedDeadline: '오늘',
        status: 'pending',
        createdAt: now.toISOString(),
        source: 'SNS Analytics',
      })
    }

    // 저장/공유 높은 패턴 발견
    const recentSaved = recentSnaps.reduce((s, r) => s + ((r as any).saved || 0), 0)
    if (recentSaved > 20) {
      suggestions.push({
        id: `action-saves-high-${now.toISOString()}`,
        type: 'content',
        priority: 'medium',
        title: '저장 많은 콘텐츠 패턴 활용 제안',
        description: `최근 7일 저장 ${recentSaved}건 — 이 패턴의 콘텐츠를 더 제작하면 구매 전환이 개선됩니다.`,
        expectedImpact: '참여율 +15% 예상',
        suggestedDeadline: '이번 주',
        status: 'pending',
        createdAt: now.toISOString(),
        source: 'SNS Saves Pattern',
      })
    }
  } catch { /* skip */ }

  // 2. 플레이북 검토 대기
  try {
    const draftCount = await prisma.learningArchive.count({ where: { status: 'DRAFT' } })
    if (draftCount > 3) {
      suggestions.push({
        id: `action-playbook-review-${now.toISOString()}`,
        type: 'optimization',
        priority: 'medium',
        title: `플레이북 검토 대기 ${draftCount}건`,
        description: '드래프트 상태의 플레이북을 검토하고 확정하면 팀 응답 품질이 향상됩니다.',
        expectedImpact: '응답 일관성 개선',
        suggestedDeadline: '이번 주',
        status: 'pending',
        createdAt: now.toISOString(),
        source: 'Learning Archive',
      })
    }
  } catch { /* skip */ }

  // 3. AI로 추가 액션 생성
  if (suggestions.length > 0) {
    try {
      let bizContext = ''
      try { const { getBusinessContextPrompt } = await import('@/lib/business-context'); bizContext = getBusinessContextPrompt() } catch {}
      const context = suggestions.map(s => `[${s.priority}] ${s.title}: ${s.description}`).join('\n')
      const aiResult = await runLLM(
        `10년차 퍼포먼스 마케터입니다. ${bizContext ? bizContext + '\n' : ''}현재 상황을 보고 추가 액션 1-2개를 JSON 배열로 제안하세요: [{"title":"제목","description":"설명","priority":"high","expectedImpact":"효과"}]`,
        `현재 감지된 상황:\n${context}`,
        0.3, 1000
      )
      try {
        const parsed = JSON.parse(aiResult.match(/\[[\s\S]*\]/)?.[0] || '[]') as Array<{ title: string; description: string; priority: string; expectedImpact: string }>
        for (const item of parsed.slice(0, 2)) {
          suggestions.push({
            id: `action-ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'campaign',
            priority: (item.priority as ActionSuggestion['priority']) || 'medium',
            title: item.title,
            description: item.description,
            expectedImpact: item.expectedImpact || '',
            suggestedDeadline: '이번 주',
            status: 'pending',
            createdAt: now.toISOString(),
            source: 'AI Analysis',
          })
        }
      } catch { /* parse fail */ }
    } catch { /* skip */ }
  }

  return suggestions
}
