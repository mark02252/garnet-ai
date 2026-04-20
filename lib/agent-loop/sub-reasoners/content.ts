import { runLLM } from '@/lib/llm'
import { runLLMWithTools } from '@/lib/llm'
import type { ToolHarness } from '../tool-harness'
import type { ToolCall } from '../tool-types'
import type { WorldModel } from '../types'

export type ContentResult = {
  contentIdeas: Array<{
    concept: string
    rationale: string
    format: 'post' | 'reel' | 'story' | 'carousel' | 'video'
  }>
  toolsUsed?: string[]
}

const SYSTEM = `10년차 콘텐츠 전략가. 브랜드 보이스와 시즌 트렌드를 연결하는 전문가.
Chain-of-Draft 방식: 각 아이디어는 한 문장 컨셉 + 한 문장 근거.
JSON만 출력. 한국어.
기존에 반복된 아이디어 금지, 구체적이고 실행 가능한 제안만.
도구 에러가 반환되면 해당 데이터 없이 기존 WorldModel 데이터로 분석을 진행하세요.`

export async function suggestContent(worldModel: WorldModel, harness?: ToolHarness): Promise<ContentResult> {
  const sns = worldModel.snapshot.sns
  const prompt = `## 현재 SNS 상황
참여율: ${sns.engagement}%
팔로워 변동: ${sns.followerGrowth}

현재 시점에 제안할 만한 콘텐츠 아이디어 **2개**를 도출하세요.
- 시즌/브랜드 보이스와 맞아야 함
- 기존 성공 패턴을 참고하되 반복은 금지
- 구체적 컨셉 (일반적 "콘텐츠 발행" 금지)

JSON으로 출력:
{"contentIdeas":[{"concept":"구체적 컨셉","rationale":"이 시점에 필요한 이유","format":"post|reel|story|carousel|video"}]}`

  // 2-pass: harness가 있으면 tool calling 사용
  if (harness) {
    const tools = harness.getToolDeclarations('content')
    try {
      // Pass 1: LLM with tools
      const pass1 = await runLLMWithTools(SYSTEM, prompt, tools, { temperature: 0.5, maxTokens: 1200 })

      if (pass1.toolCalls.length === 0) {
        return parseResult(pass1.text)
      }

      // Execute tool calls
      const toolResults = await Promise.all(
        pass1.toolCalls.map((call: ToolCall) => harness.execute('content', call))
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

      const raw = await runLLM(SYSTEM, augmentedPrompt, 0.5, 1200)
      const result = parseResult(raw)
      return { ...result, toolsUsed }
    } catch {
      // Fallback to 1-pass on error
    }
  }

  // 1-pass fallback (no harness or error)
  try {
    const raw = await runLLM(SYSTEM, prompt, 0.5, 1200)
    return parseResult(raw)
  } catch {
    return { contentIdeas: [] }
  }
}

function parseResult(raw: string): ContentResult {
  try {
    const cleaned = raw.replace(/```(?:json)?/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned
    const parsed = JSON.parse(match)
    return {
      contentIdeas: Array.isArray(parsed.contentIdeas) ? parsed.contentIdeas.slice(0, 2) : [],
    }
  } catch {
    return { contentIdeas: [] }
  }
}
