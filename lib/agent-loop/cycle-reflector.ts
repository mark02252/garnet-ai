import { runLLM } from '@/lib/llm'
import { addKnowledge } from './knowledge-store'

export type CycleReflectionInput = {
  cycleId: string
  worldModelSummary: string
  reasonerSummary: string
  actions: Array<{
    title: string
    riskLevel: string
    status: string
    rationale: string
  }>
  goalChanges: Array<{
    goal: string
    before: number
    after: number
  }>
}

type Lesson = {
  pattern: string
  observation: string
  domain: string
}

export type CycleReflectionResult = {
  summary: string
  lessons: Lesson[]
  reasonerFeedback: string
}

const REFLECTION_SYSTEM = '사이클 리플렉션 전문가. 판단 과정을 객관적으로 분석하고 재사용 가능한 교훈을 추출한다. 한국어. JSON만 출력.'

export async function reflectOnCycle(input: CycleReflectionInput): Promise<CycleReflectionResult | null> {
  if (input.actions.length === 0) return null

  const actionsText = input.actions
    .map(a => `- [${a.riskLevel}/${a.status}] ${a.title}: ${a.rationale.slice(0, 100)}`)
    .join('\n')

  const goalText = input.goalChanges.length > 0
    ? input.goalChanges.map(g => `- ${g.goal}: ${g.before}% → ${g.after}%`).join('\n')
    : '목표 변화 없음'

  const prompt = `## 사이클 리플렉션

### 환경
${input.worldModelSummary.slice(0, 300)}

### 판단
${input.reasonerSummary.slice(0, 300)}

### 실행된 액션
${actionsText}

### 목표 변화
${goalText}

위 사이클을 리뷰하고 교훈을 추출하세요. JSON만 출력:
{"summary":"1-2문장 요약","lessons":[{"pattern":"반복 가능한 상황 패턴","observation":"이 패턴에서의 교훈","domain":"marketing|operations|content_strategy|consumer|b2b|pricing_strategy|finance|competitive|self_improvement"}],"reasonerFeedback":"다음 사이클에 반영할 한 줄 피드백"}

교훈이 없으면 lessons를 빈 배열로. 억지로 만들지 마세요.`

  try {
    const raw = await runLLM(REFLECTION_SYSTEM, prompt, 0.3, 800)
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}') as CycleReflectionResult
    if (!parsed.summary) parsed.summary = ''
    if (!Array.isArray(parsed.lessons)) parsed.lessons = []
    if (!parsed.reasonerFeedback) parsed.reasonerFeedback = ''
    return parsed
  } catch {
    return null
  }
}

/**
 * 교훈을 Knowledge Store에 저장
 */
export async function storeLessons(lessons: Lesson[]): Promise<number> {
  let stored = 0
  for (const lesson of lessons) {
    if (!lesson.pattern || !lesson.observation) continue
    await addKnowledge({
      domain: lesson.domain || 'operations',
      level: 2,
      pattern: lesson.pattern,
      observation: lesson.observation,
      source: 'cycle_reflector',
    })
    stored++
  }
  return stored
}
