/**
 * Agent Loop — Meta-Cognition
 * 주간 자가 점검: 루프 효율, 판단 정확도, LLM 인사이트 생성
 */

import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'
import { getTopEpisodes } from '@/lib/memory/episodic-store'

export type MetaCognitionReport = {
  decisionAccuracy: number
  totalDecisions: number
  scoredDecisions: number
  noActionCycles: number
  totalCycles: number
  loopEfficiency: number
  insights: string[]
  improvementTriggers: string[]
}

export function computeDecisionAccuracy(episodes: Array<{ score: number | null }>): number {
  const scored = episodes.filter(e => e.score != null) as Array<{ score: number }>
  if (scored.length === 0) return 0
  return scored.reduce((sum, e) => sum + e.score, 0) / scored.length
}

export async function runWeeklyReview(): Promise<MetaCognitionReport> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const cycles = await prisma.agentLoopCycle.findMany({
    where: { createdAt: { gte: oneWeekAgo } },
    orderBy: { createdAt: 'desc' },
  })

  const totalCycles = cycles.length
  const noActionCycles = cycles.filter(c => c.actionsCount === 0).length
  const loopEfficiency = totalCycles > 0 ? (totalCycles - noActionCycles) / totalCycles : 0

  const episodes = await getTopEpisodes('agent_loop_decision', 50)
  const recentEpisodes = episodes.filter(e => new Date(e.createdAt) >= oneWeekAgo)
  const decisionAccuracy = computeDecisionAccuracy(recentEpisodes)

  const insights: string[] = []
  const improvementTriggers: string[] = []

  if (totalCycles >= 5) {
    const summaryPrompt = `\uB2E4\uC74C\uC740 \uC9C0\uB09C \uC8FC Agent Loop\uC758 \uC790\uB3D9 \uD310\uB2E8 \uC774\uB825\uC785\uB2C8\uB2E4:

\uCD1D \uC0AC\uC774\uD074: ${totalCycles}\uD68C
\uC561\uC158 \uC0DD\uC131 \uC0AC\uC774\uD074: ${totalCycles - noActionCycles}\uD68C
\uD310\uB2E8 \uD3C9\uADE0 \uC810\uC218: ${decisionAccuracy.toFixed(0)}/100
\uB8E8\uD504 \uD6A8\uC728: ${(loopEfficiency * 100).toFixed(0)}%

\uCD5C\uADFC \uD310\uB2E8 \uC0D8\uD50C:
${recentEpisodes.slice(0, 5).map(e => `- ${e.input.slice(0, 150)}`).join('\n')}

1\uC904 \uC778\uC0AC\uC774\uD2B8 3\uAC1C\uC640 \uAC1C\uC120 \uC81C\uC548 2\uAC1C\uB97C JSON\uC73C\uB85C:
{"insights":["..."],"improvements":["..."]}`

    try {
      const raw = await runLLM('\uB9C8\uCF00\uD305 AI \uB8E8\uD504 \uC790\uAC00 \uC810\uAC80 \uC804\uBB38\uAC00. JSON\uB9CC \uCD9C\uB825.', summaryPrompt, 0.3, 800)
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')
      insights.push(...(parsed.insights || []))
      improvementTriggers.push(...(parsed.improvements || []))
    } catch { /* non-critical */ }
  }

  if (decisionAccuracy < 50 && decisionAccuracy > 0) {
    improvementTriggers.push('\uD310\uB2E8 \uC815\uD655\uB3C4 50% \uBBF8\uB9CC \u2014 \uD504\uB86C\uD504\uD2B8 \uCD5C\uC801\uD654 \uAD8C\uC7A5')
  }

  return {
    decisionAccuracy,
    totalDecisions: recentEpisodes.length,
    scoredDecisions: recentEpisodes.filter(e => e.score != null).length,
    noActionCycles,
    totalCycles,
    loopEfficiency,
    insights,
    improvementTriggers,
  }
}
