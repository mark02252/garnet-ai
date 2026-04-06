'use client'

import { Handle, Position } from '@xyflow/react'
import type { StartNode } from '@/lib/flow/types'

export function StartNodeComponent({ data }: { data: StartNode['data'] }) {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-cyan-400 bg-[var(--surface-raised)] text-xs text-[var(--text-muted)] text-center">
      <span className="px-1 truncate max-w-[60px]">{data.topic || '시작'}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
