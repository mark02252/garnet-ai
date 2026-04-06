'use client'

import { Handle, Position } from '@xyflow/react'
import type { ToolNode, NodeStatus } from '@/lib/flow/types'

const STATUS_BORDER: Record<NodeStatus, string> = {
  idle: 'border-[var(--surface-border)]',
  running: 'border-cyan-400 animate-pulse',
  done: 'border-green-400',
  error: 'border-red-400',
}

type NodeData = ToolNode['data'] & { _status?: NodeStatus }

export function ToolNodeComponent({ data }: { data: NodeData }) {
  const status = data._status ?? 'idle'
  return (
    <div className={`min-w-[130px] rounded-xl border-2 bg-[var(--surface-raised)] p-3 ${STATUS_BORDER[status]}`}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
        <span>🔍</span>
        <span className="font-medium">웹 검색</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
