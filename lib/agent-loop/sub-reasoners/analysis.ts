import { runLLM } from '@/lib/llm'
import { runLLMWithTools } from '@/lib/llm'
import type { ToolHarness } from '../tool-harness'
import type { ToolCall } from '../tool-types'
import type { WorldModel, GoalProgress } from '../types'
import { formatSnapshotForPrompt } from '../snapshot-formatter'

export type AnalysisResult = {
  insights: Array<{
    finding: string
    significance: 'high' | 'medium' | 'low'
    dataEvidence: string
  }>
  toolsUsed?: string[]
}

const SYSTEM = `10년차 데이터 분석가. 숫자 뒤의 의미를 찾는 전문가.
Chain-of-Draft 방식: 짧고 밀도 높게 추론. 장황한 설명 금지.
JSON만 출력. 한국어.
각 finding은 1문장, dataEvidence는 수치만.
도구 에러가 반환되면 해당 데이터 없이 기존 WorldModel 데이터로 분석을 진행하세요.`

export async function analyzeCurrentData(
  worldModel: WorldModel,
  goals: GoalProgress[],
  harness?: ToolHarness,
): Promise<AnalysisResult> {
  const metricsText = formatSnapshotForPrompt(worldModel)
  const trends = worldModel.trends
    .filter(t => t.direction !== 'stable')
    .map(t => `${t.metric}: ${t.direction} ${t.magnitude.toFixed(1)}% (${t.duration}회)`)
    .join(', ') || '특이 트렌드 없음'

  const goalsText = goals
    .map(g => `${g.goal.goal}: ${g.progressPercent}% (${g.onTrack ? '순조' : '뒤처짐'})`)
    .join(' | ')

  const prompt = `## 현재 데이터

${metricsText}
트렌드: ${trends}
목표: ${goalsText}

이 데이터에서 **숫자 너머의 의미**가 있는 인사이트 2-3개를 도출하세요.
"매출이 증가했다"는 관찰이 아니라, "왜 그런지, 어떤 의미인지"의 인사이트.

JSON으로 출력:
{"insights":[{"finding":"발견한 사실 1문장","significance":"high|medium|low","dataEvidence":"구체적 수치"}]}`

  // 2-pass: harness가 있으면 tool calling 사용
  if (harness) {
    const tools = harness.getToolDeclarations('analysis')
    try {
      // Pass 1: LLM with tools
      const pass1 = await runLLMWithTools(SYSTEM, prompt, tools, { temperature: 0.3, maxTokens: 1200 })

      if (pass1.toolCalls.length === 0) {
        return parseResult(pass1.text)
      }

      // Execute tool calls
      const toolResults = await Promise.all(
        pass1.toolCalls.map((call: ToolCall) => harness.execute('analysis', call))
      )
      const toolsUsed = toolResults.map(r => r.tool)

      // Build tool context string
      const toolContext = toolResults
        .map(r => {
          if (r.status === 'ok') {
            return `### ${r.tool} 결과\n${JSON.stringify(r.data, null, 2)}`
          }
          return `### ${r.tool} 에러\n${r.error}: ${r.message || ''}`
        })
        .join('\n\n')

      // Pass 2: LLM with tool results appended
      const augmentedPrompt = `${prompt}

## 도구 조회 결과
${toolContext}

위 도구 결과를 참고하여 분석하세요. 에러가 있으면 무시하고 WorldModel 데이터로 진행하세요.`

      const raw = await runLLM(SYSTEM, augmentedPrompt, 0.3, 1200)
      const result = parseResult(raw)
      return { ...result, toolsUsed }
    } catch {
      // Fallback to 1-pass on error
    }
  }

  // 1-pass fallback (no harness or error)
  try {
    const raw = await runLLM(SYSTEM, prompt, 0.3, 1200)
    return parseResult(raw)
  } catch {
    return { insights: [] }
  }
}

function parseResult(raw: string): AnalysisResult {
  try {
    const cleaned = raw.replace(/```(?:json)?/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned
    const parsed = JSON.parse(match)
    return {
      insights: Array.isArray(parsed.insights) ? parsed.insights.slice(0, 3) : [],
    }
  } catch {
    return { insights: [] }
  }
}
