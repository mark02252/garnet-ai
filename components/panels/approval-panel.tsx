'use client';

import { useState } from 'react';
import type { ApprovalData } from '@/lib/canvas-store';

export function ApprovalPanel({ data }: { data: ApprovalData }) {
  const [approving, setApproving] = useState<string | null>(null);

  if (data.items.length === 0) {
    return <div className="p-1 text-[12px] text-[var(--shell-text-muted)]">대기 중인 승인 없음</div>;
  }

  const handleApprove = async (item: { id: string; label: string; type: string }) => {
    setApproving(item.id);
    try {
      await fetch('/api/approvals/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: item.type, targetId: item.id, label: item.label })
      });
    } finally {
      setApproving(null);
    }
  };

  return (
    <div className="p-1 flex flex-col gap-2">
      {data.items.slice(0, 5).map((item) => (
        <div key={item.id} className="flex items-center justify-between rounded"
          style={{ background: 'var(--shell-surface-hover)', padding: '8px 10px' }}>
          <span className="text-[12px] text-[var(--shell-text-primary)] truncate max-w-[180px]">{item.label}</span>
          <button onClick={() => handleApprove(item)} disabled={approving === item.id}
            className="text-[11px] px-2 py-1 rounded"
            style={{ background: approving === item.id ? 'var(--shell-border)' : 'var(--shell-accent)',
                     color: '#fff', border: 'none', cursor: approving === item.id ? 'not-allowed' : 'pointer' }}>
            {approving === item.id ? '처리 중\u2026' : '승인'}
          </button>
        </div>
      ))}
    </div>
  );
}
