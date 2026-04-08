/**
 * Prompt Auto-Optimizer (DSPy-inspired)
 *
 * 각 AgentNode의 systemPrompt를 자동으로 개선:
 * 1. 최근 실행 결과 + Judge 점수 분석
 * 2. LLM에게 프롬프트 변형 생성 요청
 * 3. 테스트 데이터로 각 변형 평가
 * 4. 최고 점수 변형으로 자동 교체
 */

import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'
import { getTopEpisodes } from '@/lib/memory/episodic-store'

export type PromptVersion = {
  prompt: string
  score: number
  generation: number
  createdAt: string
}

/**
 * Flow Template의 Agent 노드 프롬프트를 최적화
 */
export async function optimizeFlowPrompts(templateId: string): Promise<{
  optimized: number
  improvements: Array<{ nodeRole: string; oldScore: number; newScore: number }>
}> {
  const template = await prisma.flowTemplate.findUnique({ where: { id: templateId } })
  if (!template) throw new Error('Template not found')

  const nodes = JSON.parse(template.nodes) as Array<{ type: string; id: string; data: { role?: string; systemPrompt?: string; model?: string } }>
  const agentNodes = nodes.filter(n => n.type === 'agent' && n.data.systemPrompt)

  // 최근 성공적 실행의 에피소딕 메모리
  const topEpisodes = await getTopEpisodes('flow_run', 5)

  const improvements: Array<{ nodeRole: string; oldScore: number; newScore: number }> = []
  let optimized = 0

  for (const node of agentNodes) {
    const currentPrompt = node.data.systemPrompt!
    const role = node.data.role || node.id

    // 현재 프롬프트의 평균 점수 (에피소딕 메모리에서)
    const relevantEpisodes = topEpisodes.filter(ep => {
      const input = ep.input || ''
      return input.includes(role) || input.includes(node.id)
    })
    const currentAvgScore = relevantEpisodes.length > 0
      ? relevantEpisodes.reduce((s, e) => s + (e.score || 0), 0) / relevantEpisodes.length
      : 50

    // 프롬프트 변형 5개 생성
    const mutationPrompt = `현재 시스템 프롬프트:
"""
${currentPrompt}
"""

이 프롬프트의 현재 평균 점수: ${currentAvgScore.toFixed(0)}/100

${relevantEpisodes.length > 0 ? `최근 좋은 결과 예시:\n${relevantEpisodes.slice(0, 2).map(e => `- Input: ${e.input?.slice(0, 80)}\n  Output: ${e.output?.slice(0, 80)}\n  Score: ${e.score}`).join('\n')}` : ''}

이 프롬프트를 개선하여 더 좋은 결과를 생성하도록 3가지 변형을 제안하세요.
각 변형은 기존 의도를 유지하면서 품질/구체성/정확성을 개선해야 합니다.

JSON 배열로 출력: [{"prompt": "개선된 프롬프트 1"}, {"prompt": "개선된 프롬프트 2"}, {"prompt": "개선된 프롬프트 3"}]`

    try {
      const mutationResult = await runLLM(
        '프롬프트 엔지니어링 전문가입니다. 기존 의도를 유지하면서 품질을 개선하는 프롬프트 변형을 생성합니다.',
        mutationPrompt, 0.5, 3000,
      )

      const variants = JSON.parse(mutationResult.match(/\[[\s\S]*\]/)?.[0] || '[]') as Array<{ prompt: string }>
      if (variants.length === 0) continue

      // 각 변형을 간단한 테스트로 평가
      let bestPrompt = currentPrompt
      let bestScore = currentAvgScore

      for (const variant of variants.slice(0, 3)) {
        if (!variant.prompt || variant.prompt.length < 10) continue

        // 테스트: 간단한 질문으로 변형 프롬프트 평가
        const testOutput = await runLLM(variant.prompt, '테스트 주제로 간결하게 응답하세요.', 0.5, 500)

        // Judge: 품질 평가
        const judgeResult = await runLLM(
          '콘텐츠 품질 평가자입니다. 0-100점으로 평가하세요. JSON: {"score": N}',
          `평가 대상:\n${testOutput}\n\n기준: 한국어 품질, 구체성, 실행 가능성`,
          0.2, 200,
        )

        try {
          const { score } = JSON.parse(judgeResult.match(/\{[\s\S]*\}/)?.[0] || '{"score":50}')
          if (score > bestScore) {
            bestScore = score
            bestPrompt = variant.prompt
          }
        } catch { /* skip */ }
      }

      if (bestPrompt !== currentPrompt && bestScore > currentAvgScore) {
        // 프롬프트 업데이트
        node.data.systemPrompt = bestPrompt
        optimized++
        improvements.push({
          nodeRole: role,
          oldScore: Math.round(currentAvgScore),
          newScore: Math.round(bestScore),
        })
      }
    } catch { /* skip node */ }
  }

  // 업데이트된 노드 저장
  if (optimized > 0) {
    await prisma.flowTemplate.update({
      where: { id: templateId },
      data: { nodes: JSON.stringify(nodes) },
    })
  }

  return { optimized, improvements }
}

/**
 * 모든 Flow Template의 프롬프트를 최적화 (주간 배치)
 */
export async function optimizeAllPrompts(): Promise<{
  templatesProcessed: number
  totalOptimized: number
}> {
  const templates = await prisma.flowTemplate.findMany()
  let totalOptimized = 0

  for (const template of templates) {
    try {
      const result = await optimizeFlowPrompts(template.id)
      totalOptimized += result.optimized
    } catch { /* skip */ }
  }

  return { templatesProcessed: templates.length, totalOptimized }
}
