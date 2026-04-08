'use client'

type FlowResultProps = {
  topic: string
  brand?: string | null
  region?: string | null
  goal?: string | null
  createdAt: Date | string
  formattedDate?: string
  rawOutputs: Record<string, string>
  nodeNames?: Record<string, string>
}

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: JSX.Element[] = []
  let tableRows: string[][] = []
  let tableHeaders: string[] = []

  function flushTable(key: string) {
    if (tableHeaders.length === 0) return
    elements.push(
      <div key={key} className="my-3 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {tableHeaders.map((h, i) => (
                <th key={i} className="border border-[var(--surface-border)] bg-[var(--surface-base)] px-3 py-1.5 text-left font-semibold text-[var(--text-secondary)]">
                  {formatInline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-[var(--surface-border)] px-3 py-1.5 text-[var(--text-primary)]">
                    {formatInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    tableHeaders = []
    tableRows = []
  }

  function formatInline(text: string) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '⟨b⟩$1⟨/b⟩')
      .split(/⟨\/?b⟩/)
      .map((part, i) => i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part)
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const key = `line-${i}`

    // Table row
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.slice(1, -1).split('|').map(c => c.trim())
      // Separator row (| --- | --- |)
      if (cells.every(c => /^:?-+:?$/.test(c))) continue
      if (tableHeaders.length === 0) {
        tableHeaders = cells
      } else {
        tableRows.push(cells)
      }
      continue
    } else {
      flushTable(key + '-table')
    }

    // Empty line
    if (!line) {
      elements.push(<div key={key} className="h-2" />)
      continue
    }

    // Headings
    if (line.startsWith('### ')) {
      elements.push(<h4 key={key} className="mt-4 mb-2 text-sm font-semibold text-[var(--text-primary)]">{formatInline(line.slice(4))}</h4>)
      continue
    }
    if (line.startsWith('## ')) {
      elements.push(<h3 key={key} className="mt-5 mb-2 text-base font-semibold text-[var(--text-primary)]">{formatInline(line.slice(3))}</h3>)
      continue
    }

    // Horizontal rule
    if (/^---+$/.test(line)) {
      elements.push(<hr key={key} className="my-3 border-[var(--surface-border)]" />)
      continue
    }

    // List items
    if (line.startsWith('* ') || line.startsWith('- ')) {
      elements.push(
        <div key={key} className="flex gap-2 pl-2">
          <span className="text-[var(--accent-text)] mt-0.5">•</span>
          <span>{formatInline(line.slice(2))}</span>
        </div>
      )
      continue
    }

    // Regular paragraph
    elements.push(<p key={key}>{formatInline(line)}</p>)
  }

  flushTable('final-table')

  return <>{elements}</>
}

export function FlowResultDashboard({ topic, brand, region, goal, formattedDate, rawOutputs, nodeNames }: FlowResultProps) {
  const entries = Object.entries(rawOutputs)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] p-6">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--accent-text)]">Flow 실행 결과</p>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">{topic}</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {[brand, region, goal].filter(Boolean).join(' · ')}
          {brand || region || goal ? ' · ' : ''}
          {formattedDate}
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
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-bold text-[var(--accent-text)]">
                {idx + 1}
              </span>
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {nodeNames?.[nodeId] ?? nodeId}
              </span>
            </div>
            <div className="text-sm leading-relaxed text-[var(--text-primary)]">
              <SimpleMarkdown text={output} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
