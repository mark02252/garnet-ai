'use client'

import type { FlowNode, AgentNode } from '@/lib/flow/types'

type RecentRun = { id: string; topic: string; createdAt: string }

type Props = {
  node: FlowNode | null
  onUpdate: (nodeId: string, data: Partial<FlowNode['data']>) => void
  recentRuns?: RecentRun[]
}

const MODEL_OPTIONS: AgentNode['data']['model'][] = ['gemma4', 'claude', 'gemini', 'gpt', 'groq']

function formatRunDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function NodeConfigPanel({ node, onUpdate, recentRuns = [] }: Props) {
  if (!node) {
    return (
      <div className="flex w-56 flex-col border-l border-[var(--surface-border)] bg-[var(--surface-base)] overflow-y-auto">
        {recentRuns.length > 0 ? (
          <div className="p-3">
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">최근 실행</p>
            <div className="flex flex-col gap-1.5">
              {recentRuns.map(run => (
                <a
                  key={run.id}
                  href={`/runs/${run.id}/report`}
                  className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2.5 py-2 hover:border-[var(--accent)] transition-colors block"
                >
                  <p className="text-xs text-[var(--text-primary)] truncate">{run.topic}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{formatRunDate(run.createdAt)}</p>
                </a>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-[var(--text-muted)]">
            노드를 선택하세요
          </div>
        )}
      </div>
    )
  }

  if (node.type !== 'agent') {
    return (
      <div className="flex w-56 flex-col gap-2 border-l border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
        <p className="text-xs font-medium text-[var(--text-primary)]">
          {node.type === 'start' ? '시작 노드' : node.type === 'end' ? '종료 노드' : '도구 노드'}
        </p>
        {node.type === 'start' && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--text-muted)]">기본 토픽</label>
            <input
              value={node.data.topic}
              onChange={e => onUpdate(node.id, { topic: e.target.value })}
              className="rounded border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
        )}
      </div>
    )
  }

  const agentData = node.data as AgentNode['data']

  return (
    <div className="flex w-56 flex-col gap-3 overflow-y-auto border-l border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
      <p className="text-xs font-semibold text-[var(--text-primary)]">에이전트 설정</p>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-[var(--text-muted)]">역할명</label>
        <input
          value={agentData.role}
          onChange={e => onUpdate(node.id, { role: e.target.value })}
          className="rounded border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-[var(--text-muted)]">모델</label>
        <select
          value={agentData.model}
          onChange={e => onUpdate(node.id, { model: e.target.value as AgentNode['data']['model'] })}
          className="rounded border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        >
          {MODEL_OPTIONS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-[var(--text-muted)]">시스템 프롬프트</label>
        <textarea
          value={agentData.systemPrompt}
          onChange={e => onUpdate(node.id, { systemPrompt: e.target.value })}
          rows={8}
          className="rounded border border-[var(--surface-border)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none"
        />
      </div>
    </div>
  )
}
