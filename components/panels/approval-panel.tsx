import type { ApprovalData } from '@/lib/canvas-store';

export function ApprovalPanel({ data }: { data: ApprovalData }) {
  return (
    <div className="p-1 flex flex-col gap-2">
      {data.items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between rounded"
          style={{ background: 'var(--shell-surface-hover)', padding: '8px 10px' }}
        >
          <span className="text-[12px] text-[var(--shell-text-primary)]">{item.label}</span>
          <div className="flex gap-1">
            <button
              className="text-[11px] px-2 py-1 rounded"
              style={{ background: 'var(--shell-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              승인
            </button>
            <button
              className="text-[11px] px-2 py-1 rounded"
              style={{ background: 'var(--shell-border)', color: 'var(--shell-text-muted)',
                       border: 'none', cursor: 'pointer' }}
            >
              거절
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
