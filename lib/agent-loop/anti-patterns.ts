import { prisma } from '@/lib/prisma'
import type { ReasonerAction } from './types'

/** Reasoner 액션 목록에서 anti-pattern과 유사한 것을 필터링 */
export async function filterAntiPatterns(actions: ReasonerAction[]): Promise<{
  passed: ReasonerAction[]
  filtered: Array<{ action: ReasonerAction; reason: string }>
}> {
  if (actions.length === 0) return { passed: [], filtered: [] }

  const antiPatterns = await prisma.knowledgeEntry.findMany({
    where: { isAntiPattern: true, confidence: { gte: 0.3 } },
    orderBy: { confidence: 'desc' },
    take: 30,
  })

  if (antiPatterns.length === 0) return { passed: actions, filtered: [] }

  const passed: ReasonerAction[] = []
  const filtered: Array<{ action: ReasonerAction; reason: string }> = []

  for (const action of actions) {
    const actionText = `${action.kind} ${action.title} ${action.rationale}`.toLowerCase()

    const matchingAnti = antiPatterns.find(ap => {
      const keywords = ap.pattern.toLowerCase().split(/\s+/).filter(w => w.length > 1)
      const matchCount = keywords.filter(k => actionText.includes(k)).length
      return matchCount >= Math.ceil(keywords.length * 0.4)
    })

    if (matchingAnti) {
      filtered.push({
        action,
        reason: `Anti-pattern 매칭: ${matchingAnti.observation.slice(0, 80)}`,
      })
    } else {
      passed.push(action)
    }
  }

  return { passed, filtered }
}
