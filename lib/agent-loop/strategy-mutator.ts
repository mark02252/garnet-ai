import { runLLM } from '@/lib/llm'
import type { ReasonerOutput } from './types'

/**
 * 10% 확률로 기존과 완전히 다른 전략 변이를 생성
 * routine-cycle에서 Reasoner 출력 후 호출
 */
export function shouldMutate(): boolean {
  return Math.random() < 0.1 // 10% 확률
}

/** 기존 Reasoner 출력에 변이 전략 추가 */
export async function generateMutation(
  currentOutput: ReasonerOutput,
  worldModelSummary: string,
): Promise<ReasonerOutput> {
  const existingActions = currentOutput.actions.map(a => a.title).join(', ')

  const prompt = `현재 AI가 제안한 액션: ${existingActions || '없음'}
현재 상황: ${currentOutput.situationSummary}
World Model: ${worldModelSummary}

위 제안과 **완전히 다른 관점**에서 1개의 대안 액션을 제안하세요.
기존 패턴을 벗어나는 혁신적 접근이어야 합니다.

예시:
- 기존이 "콘텐츠 늘리기"면 → "콘텐츠를 줄이고 품질에 집중"
- 기존이 "할인 프로모션"이면 → "프리미엄 가격 인상으로 포지셔닝"
- 기존이 "SNS 마케팅"이면 → "오프라인 이벤트 + 입소문 전략"

JSON:
{"kind":"mutation_experiment","title":"변이 전략 제목","rationale":"왜 이게 효과적일 수 있는지","expectedEffect":"예상 효과","riskLevel":"MEDIUM","goalAlignment":"관련 목표","payload":{}}`

  try {
    const raw = await runLLM(
      '혁신 전략가. 기존 관행을 뒤집는 대안을 제시하는 전문가. JSON만 출력.',
      prompt, 0.7, 800, // 높은 temperature로 창의성 증가
    )
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')

    if (!parsed.title) return currentOutput

    // 변이 액션 추가 (기존 액션은 유지)
    return {
      ...currentOutput,
      actions: [
        ...currentOutput.actions,
        {
          kind: 'mutation_experiment',
          title: `[변이] ${parsed.title}`,
          rationale: `[진화적 탐색] ${parsed.rationale}`,
          expectedEffect: parsed.expectedEffect || '',
          riskLevel: 'MEDIUM' as const, // 변이는 항상 MEDIUM (사람 승인 필요)
          goalAlignment: parsed.goalAlignment || '',
          payload: { ...parsed.payload, _mutation: true },
        },
      ],
    }
  } catch {
    return currentOutput
  }
}
