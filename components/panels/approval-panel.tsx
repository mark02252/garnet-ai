'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { ApprovalData } from '@/lib/canvas-store';

export function ApprovalPanel({ data }: { data: ApprovalData }) {
  const [approving, setApproving] = useState<string | null>(null);
  const [governorCount, setGovernorCount] = useState(0);
  const [governorLoaded, setGovernorLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchGovernorCount() {
      try {
        const res = await fetch('/api/governor/queue', { signal: controller.signal });
        if (!res.ok) return;
        const json = await res.json();
        setGovernorCount(Array.isArray(json?.items) ? json.items.length : 0);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // 조용히 실패
      } finally {
        if (!controller.signal.aborted) setGovernorLoaded(true);
      }
    }
    void fetchGovernorCount();
    const timer = setInterval(() => { void fetchGovernorCount(); }, 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  const totalPending = data.items.length + governorCount;
  // governorLoaded 전에는 기존 항목만 기준으로 판단 (Governor 카운트 로딩 flash 방지)
  const showEmpty = governorLoaded && totalPending === 0;

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

  if (showEmpty) {
    return <div className="p-1 text-[12px] text-[var(--shell-text-muted)]">대기 중인 승인 없음</div>;
  }

  return (
    <div className="p-1 flex flex-col gap-2">
      {governorCount > 0 && (
        <Link href="/approvals"
          className="flex items-center justify-between rounded px-[10px] py-2 text-[12px]"
          style={{ background: 'var(--shell-surface-hover)' }}>
          <span className="text-[var(--shell-text-primary)]">Governor 승인 대기</span>
          <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
            {governorCount}
          </span>
        </Link>
      )}
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
