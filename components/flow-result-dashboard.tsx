'use client'

type FlowResultProps = {
  topic: string
  brand?: string | null
  region?: string | null
  goal?: string | null
  createdAt: Date | string
  rawOutputs: Record<string, string>
}

export function FlowResultDashboard({ topic, brand, region, goal, createdAt, rawOutputs }: FlowResultProps) {
  const entries = Object.entries(rawOutputs)
  const dateStr = new Date(createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] p-6">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]">Flow 실행 결과</p>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">{topic}</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {[brand, region, goal].filter(Boolean).join(' · ')}
          {brand || region || goal ? ' · ' : ''}
          {dateStr}
        </p>
      </div>

      {/* Agent outputs */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          에이전트 산출물 ({entries.length}개)
        </p>
        {entries.map(([nodeId, output], idx) => (
          <div
            key={nodeId}
            className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] p-5"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-bold text-[var(--accent)]">
                {idx + 1}
              </span>
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {nodeId}
              </span>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">
              {output}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
