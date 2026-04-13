import { runLLM } from '@/lib/llm'
import { prisma } from '@/lib/prisma'
import { loadReasonerPrompt, saveReasonerPrompt } from './prompt-manager'
import { enqueueWithRisk } from '@/lib/governor'

type EvolutionResult = {
  improved: boolean
  reason: string
  newPrompt?: string
  submittedToGovernor: boolean
}

/**
 * 최근 사이클 결과를 분석하여 Reasoner 프롬프트 개선안 생성
 * weekly-review에서 호출
 */
export async function evolveReasonerPrompt(): Promise<EvolutionResult> {
  // 1. 최근 7일 에피소딕 메모리에서 사이클 결과 수집
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const recentEpisodes = await prisma.episodicMemory.findMany({
    where: {
      category: 'agent_loop_decision',
      createdAt: { gte: sevenDaysAgo },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  if (recentEpisodes.length < 10) {
    return { improved: false, reason: '데이터 부족 (최소 10 사이클 필요)', submittedToGovernor: false }
  }

  // 2. 성과 요약 구성
  const scores = recentEpisodes.map(e => e.score ?? 0)
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
  const errorCount = recentEpisodes.filter(e => {
    try {
      const output = JSON.parse(e.output)
      return output.errors && output.errors.length > 0
    } catch { return false }
  }).length

  // 최근 cycle_reflector 교훈
  const lessons = await prisma.knowledgeEntry.findMany({
    where: { source: { contains: 'cycle_reflector' } },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  })
  const lessonsText = lessons.length > 0
    ? lessons.map(l => `- [${l.domain}] ${l.pattern}: ${l.observation.split('\n')[0]}`).join('\n')
    : '축적된 교훈 없음'

  // 3. 현재 프롬프트
  const currentPrompt = loadReasonerPrompt()

  // 4. LLM에게 개선 요청
  const prompt = `## Reasoner 시스템 프롬프트 개선

### 현재 프롬프트
${currentPrompt}

### 최근 7일 성과
- 총 사이클: ${recentEpisodes.length}회
- 평균 점수: ${avgScore.toFixed(1)}/100
- 에러 발생 사이클: ${errorCount}회
- 에러율: ${(errorCount / recentEpisodes.length * 100).toFixed(1)}%

### 축적된 교훈
${lessonsText}

### 요청
위 프롬프트를 개선하세요. 개선 방향:
1. 축적된 교훈을 프롬프트 규칙에 반영
2. 에러를 줄이는 방향으로 지시를 명확히
3. 불필요한 규칙 제거, 효과적인 규칙 강화
4. 출력 형식은 변경하지 마세요 (JSON 구조 유지 필수)

JSON으로 출력:
{"improved":true/false,"reason":"개선 이유 또는 불필요한 이유","newPrompt":"개선된 전체 프롬프트 (improved=true일 때만)"}`

  try {
    const raw = await runLLM(
      '프롬프트 엔지니어링 전문가. 시스템 프롬프트를 분석하고 개선한다. JSON만 출력.',
      prompt, 0.4, 2000,
    )
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')

    if (!parsed.improved || !parsed.newPrompt) {
      return { improved: false, reason: parsed.reason || '개선 불필요', submittedToGovernor: false }
    }

    // 5. Governor 승인 요청 (HIGH 리스크)
    await enqueueWithRisk({
      kind: 'prompt_optimization',
      payload: {
        title: 'Reasoner 프롬프트 자동 최적화',
        description: parsed.reason,
        newPrompt: parsed.newPrompt,
        currentPromptLength: currentPrompt.length,
        newPromptLength: parsed.newPrompt.length,
        weeklyAvgScore: avgScore.toFixed(1),
        weeklyErrorRate: `${(errorCount / recentEpisodes.length * 100).toFixed(1)}%`,
        _agentLoop: { action: 'prompt_optimization' },
      },
      riskLevel: 'HIGH',
      riskReason: `Reasoner 시스템 프롬프트 변경: ${parsed.reason}`,
    })

    return {
      improved: true,
      reason: parsed.reason,
      newPrompt: parsed.newPrompt,
      submittedToGovernor: true,
    }
  } catch {
    return { improved: false, reason: 'LLM 호출 실패', submittedToGovernor: false }
  }
}

/**
 * Governor 승인 후 실제 프롬프트 적용
 * executor에서 호출
 */
export function applyApprovedPrompt(newPrompt: string, reason: string): void {
  saveReasonerPrompt(newPrompt, `auto-optimized: ${reason}`)
}
