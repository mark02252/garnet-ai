import { runLLM } from '@/lib/llm'
import { addKnowledge } from './knowledge-store'
import type { ReasonerAction, ReasonerOutput } from './types'

/**
 * MEDIUM/HIGH 리스크 액션에 자기비판 적용
 * LOW 리스크는 건너뜀 (비용 절약)
 */
export async function applyCritique(output: ReasonerOutput): Promise<ReasonerOutput> {
  const highRiskActions = output.actions.filter(a => a.riskLevel !== 'LOW')
  const lowRiskActions = output.actions.filter(a => a.riskLevel === 'LOW')

  if (highRiskActions.length === 0) return output

  const critiqued: ReasonerAction[] = []

  for (const action of highRiskActions) {
    const prompt = `다음 마케팅 액션에 대해 비판적으로 검토하세요:

액션: ${action.title}
근거: ${action.rationale}
예상 효과: ${action.expectedEffect}
리스크: ${action.riskLevel}

검토 항목:
1. 이 판단의 반례나 약점은?
2. 더 나은 대안이 있는가?
3. 숨겨진 리스크는?
4. 데이터 근거가 충분한가?

JSON: {"verdict":"approve|modify|reject","reason":"판단 이유","modification":"수정 시 수정안","insight":"이 검토에서 배운 범용 교훈"}`

    try {
      const raw = await runLLM('비판적 사고 전문가. 의사결정의 약점을 찾는다. JSON만 출력.', prompt, 0.3, 600)
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')

      if (parsed.verdict === 'reject') {
        // 액션 제거 + 이유를 Knowledge에 저장
        if (parsed.insight) {
          await addKnowledge({
            domain: 'marketing',
            level: 2,
            pattern: `자기비판으로 거절: ${action.title.slice(0, 50)}`,
            observation: parsed.reason || parsed.insight,
            source: 'reflective_critic',
          })
        }
        continue
      }

      if (parsed.verdict === 'modify' && parsed.modification) {
        critiqued.push({
          ...action,
          title: `[검토됨] ${action.title}`,
          rationale: `${action.rationale}\n[자기비판] ${parsed.modification}`,
        })
      } else {
        critiqued.push({
          ...action,
          title: `[검토됨] ${action.title}`,
        })
      }

      // 검토 과정에서 배운 교훈 저장
      if (parsed.insight) {
        await addKnowledge({
          domain: 'marketing',
          level: 3,
          pattern: `의사결정 검토 교훈`,
          observation: parsed.insight,
          source: 'reflective_critic',
        })
      }
    } catch {
      critiqued.push(action) // 비판 실패 시 원본 유지
    }
  }

  return {
    ...output,
    actions: [...lowRiskActions, ...critiqued],
  }
}
