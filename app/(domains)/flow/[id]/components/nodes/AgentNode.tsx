'use client'

import { Handle, Position } from '@xyflow/react'
import type { AgentNode, NodeStatus } from '@/lib/flow/types'

const MODEL_COLOR: Record<AgentNode['data']['model'], string> = {
  claude: 'bg-purple-500',
  gemini: 'bg-blue-500',
  gpt: 'bg-green-500',
  groq: 'bg-orange-500',
  gemma4: 'bg-red-500',
}

const STATUS_BORDER: Record<NodeStatus, string> = {
  idle: 'border-[var(--surface-border)]',
  running: 'border-cyan-400 animate-pulse',
  done: 'border-green-400',
  error: 'border-red-400',
}

type NodeData = AgentNode['data'] & { _status?: NodeStatus }

export function AgentNodeComponent({ data }: { data: NodeData }) {
  const status = data._status ?? 'idle'
  return (
    <div className={`min-w-[160px] rounded-xl border-2 bg-[var(--surface-raised)] p-3 ${STATUS_BORDER[status]}`}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--text-primary)]">{data.role}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${MODEL_COLOR[data.model]}`}>
          {data.model}
        </span>
      </div>
      <div className="mt-1 text-xs text-[var(--text-muted)]">
        {status === 'running' && <span className="animate-spin inline-block mr-1">⟳</span>}
        {status === 'done' && <span className="text-green-400 mr-1">✓</span>}
        {status === 'error' && <span className="text-red-400 mr-1">✗</span>}
        {status === 'idle' ? '대기 중' : status === 'running' ? '실행 중' : status === 'done' ? '완료' : '오류'}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
