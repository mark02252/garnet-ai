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
    const prompt = `다음 마케팅 액션에 대해 **iGRPO 방식 자기 비판**을 수행하세요.

[Draft (원안)]
액션: ${action.title}
근거: ${action.rationale}
예상 효과: ${action.expectedEffect}
리스크: ${action.riskLevel}

[검토 단계]
1. 약점 식별: 이 판단의 반례/약점은?
2. 숨겨진 리스크는?
3. 데이터 근거가 충분한가?

[개선 단계 - modify일 경우 필수]
위 약점을 해결한 **개선된 액션**을 제시하세요:
- 개선된 title (기존보다 구체적, 안전)
- 개선된 rationale (약점 해소 근거 포함)
- 개선된 expectedEffect (과장 없이)

JSON:
{
  "verdict": "approve|modify|reject",
  "weaknesses": ["약점1","약점2"],
  "improvedAction": { "title":"...", "rationale":"...", "expectedEffect":"..." },
  "reason": "판단 이유",
  "insight": "범용 교훈"
}`

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

      if (parsed.verdict === 'modify' && parsed.improvedAction) {
        // iGRPO: 실제로 액션 내용을 개선된 버전으로 교체
        const improved = parsed.improvedAction
        critiqued.push({
          ...action,
          title: improved.title || action.title,
          rationale: `${improved.rationale || action.rationale}\n[iGRPO 개선] 약점 ${(parsed.weaknesses || []).length}개 해소`,
          expectedEffect: improved.expectedEffect || action.expectedEffect,
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
