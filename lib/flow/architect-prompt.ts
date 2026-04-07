import { DEFAULT_DOMAIN_AGENT_POOL } from '@/lib/agent-config'
import type { DomainAgentProfile } from '@/lib/types'

function buildPresetList(): string {
  const profiles: DomainAgentProfile[] = Object.entries(DEFAULT_DOMAIN_AGENT_POOL)
    .filter(([key]) => key !== '_GLOBAL_AGENT_POLICY')
    .flatMap(([, v]) => v as DomainAgentProfile[])

  return profiles
    .map(p => `- id: "${p.id}" | name: "${p.name}" | specialty: ${(p.specialty ?? []).join(', ')}`)
    .join('\n')
}

export const ARCHITECT_JSON_SCHEMA = `{
  "agents": [
    {
      "id": "string (unique, e.g. agent-1)",
      "role": "string (한국어 역할명)",
      "agentKey": "string | null (프리셋 id 또는 null)",
      "model": "gemma4",
      "systemPrompt": "string (역할 설명 + 지침. 반드시 '한국어로 응답하세요' 포함)",
      "dependsOn": ["string[] (이 에이전트가 의존하는 다른 에이전트 id 목록, 빈 배열이면 시작 직후 병렬 실행)"],
      "needsWebSearch": "boolean (이 에이전트 실행 전 웹검색이 필요한지)"
    }
  ],
  "summary": "string (에이전트 N개, 웹검색 N개, 병렬 N개 등 요약)",
  "reasoning": "string (왜 이 구성을 선택했는지)"
}`

export function buildArchitectSystemPrompt(): string {
  return `당신은 Garnet의 Flow Architect입니다. 사용자의 프로젝트 설명을 분석하여 최적의 에이전트 파이프라인을 설계합니다.

사용 가능한 프리셋 에이전트:
${buildPresetList()}

규칙:
- 프리셋에 적합한 에이전트가 있으면 반드시 사용 (agentKey에 프리셋 id 입력)
- 프리셋에 없는 역할이 필요하면 커스텀 에이전트 생성 (agentKey: null, role과 systemPrompt 직접 작성)
- 병렬 실행이 가능한 독립적 역할은 dependsOn을 빈 배열로 설정하여 병렬 배치
- 리서치/데이터 수집이 필요한 에이전트는 needsWebSearch: true로 설정
- 최종 종합/의사결정 역할은 모든 분석 에이전트의 id를 dependsOn에 포함
- 에이전트는 3~8개 범위로 구성
- 모든 systemPrompt에 "한국어로 응답하세요" 포함
- 각 에이전트 id는 고유해야 하며 agent-1, agent-2, ... 형식 사용

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트를 포함하지 마세요:
${ARCHITECT_JSON_SCHEMA}`
}

export function buildArchitectUserPrompt(
  projectDescription: string,
  conversationContext?: string[]
): string {
  const parts = [`프로젝트: ${projectDescription}`]
  if (conversationContext?.length) {
    parts.push(`\n이전 대화:\n${conversationContext.join('\n')}`)
  }
  parts.push('\n위 프로젝트에 최적화된 에이전트 파이프라인을 JSON으로 설계하세요.')
  return parts.join('\n')
}
