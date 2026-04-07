'use client'

import { DEFAULT_DOMAIN_AGENT_POOL } from '@/lib/agent-config'
import type { DomainAgentProfile } from '@/lib/types'
import type { FlowNode, AgentNode, ToolNode } from '@/lib/flow/types'

const PRESET_AGENTS: DomainAgentProfile[] = Object.entries(DEFAULT_DOMAIN_AGENT_POOL)
  .filter(([key]) => key !== '_GLOBAL_AGENT_POLICY')
  .flatMap(([, v]) => v as DomainAgentProfile[])
  .slice(0, 8) // Show top 8 presets in palette

type Props = {
  onAddNode: (node: FlowNode) => void
}

function makeSystemPrompt(profile: DomainAgentProfile): string {
  return [
    profile.roleSummary ?? '',
    '',
    '지침:',
    ...(profile.instructions ?? []),
    '',
    '금지:',
    ...(profile.antiPatterns ?? []),
  ].join('\n')
}

export default function NodePalette({ onAddNode }: Props) {
  function addAgent(role: string, systemPrompt: string, agentKey?: string) {
    const node: AgentNode = {
      type: 'agent',
      id: `agent-${Date.now()}`,
      position: { x: 300, y: 150 + Math.random() * 100 },
      data: { role, agentKey, model: 'gemma4', systemPrompt },
    }
    onAddNode(node)
  }

  function addCustomAgent() {
    addAgent('커스텀 에이전트', '당신의 역할을 여기에 입력하세요.')
  }

  function addWebSearch() {
    const node: ToolNode = {
      type: 'tool',
      id: `tool-${Date.now()}`,
      position: { x: 300, y: 150 + Math.random() * 100 },
      data: { toolType: 'web-search' },
    }
    onAddNode(node)
  }

  return (
    <div className="flex w-40 flex-col gap-1 overflow-y-auto border-r border-[var(--surface-border)] bg-[var(--surface-base)] p-3">
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">에이전트</p>
      {PRESET_AGENTS.map(profile => (
        <button
          key={profile.id}
          onClick={() => addAgent(profile.name, makeSystemPrompt(profile), profile.id)}
          className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2 py-1.5 text-left text-xs text-[var(--text-primary)] hover:border-[var(--accent)] truncate"
          title={profile.name}
        >
          {profile.name}
        </button>
      ))}
      <button
        onClick={addCustomAgent}
        className="rounded-lg border border-dashed border-[var(--surface-border)] px-2 py-1.5 text-left text-xs text-[var(--text-muted)] hover:border-[var(--accent)]"
      >
        커스텀 +
      </button>
      <p className="mb-1 mt-3 text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">도구</p>
      <button
        onClick={addWebSearch}
        className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2 py-1.5 text-left text-xs text-[var(--text-primary)] hover:border-[var(--accent)]"
      >
        🔍 웹 검색
      </button>
    </div>
  )
}
