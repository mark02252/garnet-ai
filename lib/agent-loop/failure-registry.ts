/**
 * Failure Registry — 실패 사례를 구조화된 회피 규칙으로 변환
 *
 * 현재: Knowledge Store에 "거절됨"이라고만 저장됨 → Reasoner가 맥락 부족
 * 개선: 최근 실패를 "왜 실패했고 다음엔 뭘 해야 하는지" 형태로 Reasoner에 주입
 *
 * 시간 감쇠: 최근 실패일수록 가중치 ↑ (오래된 건 무시)
 */

import { prisma } from '@/lib/prisma'

type FailureEntry = {
  domain: string
  pattern: string
  observation: string
  source: string
  updatedAt: Date
  confidence: number
  weight: number        // 시간 감쇠 가중치 (0~1)
}

const FAILURE_SOURCES = [
  'human_feedback_rejected',    // 사용자 거절
  'human_feedback_deferred',    // 사용자 보류
  'human_feedback_context',     // 보류 이유 컨텍스트
  'reflective_critic',          // 자기 비판으로 거절
]

/**
 * 시간 가중치 계산
 * 7일 이내: 1.0, 8~14일: 0.6, 15~30일: 0.3, 30일+: 0
 */
function timeWeight(updatedAt: Date): number {
  const daysAgo = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)
  if (daysAgo <= 7) return 1.0
  if (daysAgo <= 14) return 0.6
  if (daysAgo <= 30) return 0.3
  return 0
}

/**
 * 최근 실패 사례 조회 + 시간 감쇠 적용
 */
export async function getRecentFailures(limit = 10): Promise<FailureEntry[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const entries = await prisma.knowledgeEntry.findMany({
    where: {
      OR: [
        { isAntiPattern: true },
        { source: { in: FAILURE_SOURCES } },
      ],
      updatedAt: { gte: thirtyDaysAgo },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  const weighted: FailureEntry[] = entries
    .map(e => ({
      domain: e.domain,
      pattern: e.pattern,
      observation: e.observation,
      source: e.source,
      updatedAt: e.updatedAt,
      confidence: e.confidence,
      weight: timeWeight(e.updatedAt) * e.confidence,
    }))
    .filter(e => e.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)

  return weighted
}

/**
 * Reasoner 프롬프트 주입용 회피 규칙 텍스트 생성
 */
export async function buildAvoidanceRules(): Promise<string> {
  const failures = await getRecentFailures(8)
  if (failures.length === 0) return ''

  const lines: string[] = []
  lines.push('## 회피 규칙 (최근 30일 실패 패턴)')

  for (const f of failures) {
    const daysAgo = Math.floor((Date.now() - f.updatedAt.getTime()) / (1000 * 60 * 60 * 24))
    const weightBadge = f.weight > 0.7 ? '🔴' : f.weight > 0.3 ? '🟡' : '⚪'
    const firstLine = f.observation.split('\n')[0].slice(0, 120)

    lines.push(`- ${weightBadge} [${f.domain}, ${daysAgo}일 전] ${f.pattern.slice(0, 60)}`)
    lines.push(`  → ${firstLine}`)
  }

  lines.push('\n**위 실패 패턴과 유사한 제안은 하지 말 것. 시간이 최근일수록 더 강하게 회피할 것.**')
  return lines.join('\n')
}
