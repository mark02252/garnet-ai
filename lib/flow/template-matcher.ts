import { runLLM } from '@/lib/llm'
import type { RuntimeConfig } from '@/lib/types'

export type MatchResult = {
  templateId: string
  templateName: string
  confidence: number
  reason: string
} | null

type TemplateInfo = { id: string; name: string; nodes: string }

export async function matchFlowTemplate(
  userInput: string,
  templates: TemplateInfo[]
): Promise<MatchResult> {
  if (templates.length === 0) return null

  const templateList = templates.map(t => {
    let roles: string[] = []
    try {
      const nodes = JSON.parse(t.nodes) as Array<{ type: string; data?: { role?: string } }>
      roles = nodes.filter(n => n.type === 'agent').map(n => n.data?.role ?? '').filter(Boolean)
    } catch { /* ignore */ }
    return `- id: "${t.id}" | name: "${t.name}" | agents: ${roles.join(', ') || '(없음)'}`
  }).join('\n')

  const systemPrompt = `저장된 플로우 템플릿 목록에서 사용자 요청에 가장 적합한 템플릿을 선택하세요.
매칭되는 것이 없으면 confidence를 0으로 설정하세요.

템플릿 목록:
${templateList}

JSON 형식으로만 응답:
{ "templateId": "string", "templateName": "string", "confidence": 0.0-1.0, "reason": "string" }`

  const runtime: RuntimeConfig = { llmProvider: 'gemma4' }

  try {
    const raw = await runLLM(systemPrompt, userInput, 0.2, 300, runtime)
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      templateId?: string; templateName?: string; confidence?: number; reason?: string
    }
    if (!parsed.templateId || (parsed.confidence ?? 0) < 0.6) return null
    return {
      templateId: parsed.templateId,
      templateName: parsed.templateName ?? '',
      confidence: parsed.confidence ?? 0,
      reason: parsed.reason ?? '',
    }
  } catch {
    return null
  }
}
