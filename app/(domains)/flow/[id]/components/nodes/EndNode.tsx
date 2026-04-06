'use client'

import { Handle, Position } from '@xyflow/react'

export function EndNodeComponent() {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[var(--text-muted)] bg-[var(--surface-raised)] text-xs text-[var(--text-muted)]">
      산출물
      <Handle type="target" position={Position.Left} />
    </div>
  )
}
