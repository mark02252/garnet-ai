'use client';

import { useStreamStore, type StreamEntry } from '@/lib/agent-stream-store';

function EntryRow({ entry }: { entry: StreamEntry }) {
  const statusColor = entry.status === 'running' ? 'var(--shell-status-running)'
    : entry.status === 'error' ? 'var(--shell-status-error)'
    : 'var(--shell-status-success)';

  return (
    <div
      className="stream-entry px-3 py-2 cursor-pointer hover:bg-[var(--shell-surface-hover)] rounded transition-colors"
    >
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color: statusColor, fontSize: 10 }}>
          {entry.status === 'running' ? '▸' : entry.status === 'error' ? '✗' : '✓'}
        </span>
        <span className="text-[var(--shell-text-primary)] text-[12px] font-medium truncate">
          {entry.label}
        </span>
      </div>
      {entry.steps.slice(-3).map((step, i) => (
        <div key={i} className="pl-4 text-[11px] text-[var(--shell-text-muted)] truncate">
          {step.status === 'running' && <span className="text-[var(--shell-accent)]">↳ </span>}
          {step.status === 'done'    && <span className="text-[var(--shell-status-success)]">✓ </span>}
          {step.status === 'error'   && <span className="text-[var(--shell-status-error)]">✗ </span>}
          {step.text}
        </div>
      ))}
    </div>
  );
}

export function AgentStream() {
  const entries = useStreamStore((s) => s.entries);

  return (
    <aside
      className="flex flex-col overflow-hidden"
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: '1px solid var(--shell-border)',
        background: 'rgba(0,0,0,0.3)',
      }}
    >
      <div className="px-3 py-2 border-b border-[var(--shell-border)]">
        <span className="text-[10px] font-semibold tracking-widest text-[var(--shell-text-muted)] uppercase">
          Agent Stream
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {entries.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-[var(--shell-text-muted)] text-center">
            대기 중...
          </div>
        ) : (
          entries.map((e) => <EntryRow key={e.id} entry={e} />)
        )}
      </div>
    </aside>
  );
}
