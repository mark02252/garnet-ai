import { prisma } from '@/lib/prisma'

/** Outcome Observer 결과로 인과 링크 생성/갱신 */
export async function recordCausalLink(params: {
  actionKind: string
  context: string
  metricChanges: Record<string, number> // metric → change%
  lag: string // "0d", "1d", "3d", "7d"
  domain: string
}): Promise<void> {
  const cause = `${params.actionKind}:${params.context.slice(0, 50)}`

  for (const [metric, change] of Object.entries(params.metricChanges)) {
    if (Math.abs(change) < 1) continue // 1% 미만 변화는 무시

    const direction = change > 0 ? 'increase' : 'decrease'
    const effect = `${metric}_${direction}_${Math.abs(Math.round(change))}pct`

    const existing = await prisma.causalLink.findFirst({
      where: { cause, effect: { startsWith: `${metric}_${direction}` } },
    })

    if (existing) {
      const newCount = existing.observedCount + 1
      await prisma.causalLink.update({
        where: { id: existing.id },
        data: {
          observedCount: newCount,
          strength: Math.min(0.95, 0.3 + newCount * 0.1),
          effect, // 최신 수치로 업데이트
        },
      })
    } else {
      await prisma.causalLink.create({
        data: { cause, effect, lag: params.lag, domain: params.domain, strength: 0.4 },
      })
    }
  }
}

/** 특정 액션의 예상 효과 조회 */
export async function predictActionEffect(actionKind: string, context: string): Promise<Array<{
  effect: string
  strength: number
  lag: string
  observedCount: number
}>> {
  const cause = `${actionKind}:${context.slice(0, 50)}`

  // 정확한 매칭 + 부분 매칭
  const links = await prisma.causalLink.findMany({
    where: {
      OR: [
        { cause },
        { cause: { startsWith: `${actionKind}:` } },
      ],
    },
    orderBy: { strength: 'desc' },
    take: 5,
  })

  return links.map(l => ({
    effect: l.effect,
    strength: l.strength,
    lag: l.lag,
    observedCount: l.observedCount,
  }))
}

/** Reasoner 프롬프트용: 주요 인과 관계 요약 */
export async function getCausalSummary(): Promise<string> {
  const links = await prisma.causalLink.findMany({
    where: { strength: { gte: 0.5 }, observedCount: { gte: 2 } },
    orderBy: { strength: 'desc' },
    take: 10,
  })

  if (links.length === 0) return '아직 축적된 인과 관계 없음'

  return links.map(l =>
    `- ${l.cause} → ${l.effect} (강도 ${l.strength.toFixed(1)}, ${l.observedCount}회 관찰, ${l.lag} 후)`
  ).join('\n')
}

/** 반복 실패 패턴 감지 */
export async function detectRepeatedFailures(): Promise<Array<{
  cause: string
  failCount: number
  domain: string
}>> {
  const negativeLinks = await prisma.causalLink.findMany({
    where: { effect: { contains: 'decrease' }, observedCount: { gte: 3 } },
    orderBy: { observedCount: 'desc' },
    take: 5,
  })

  return negativeLinks.map(l => ({
    cause: l.cause,
    failCount: l.observedCount,
    domain: l.domain,
  }))
}
