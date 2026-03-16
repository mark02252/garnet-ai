'use client';

import Link from 'next/link';
import { startTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ApprovalActionKind } from '@/lib/approval-actions';

export type ApprovalActionItem = {
  id: string;
  roomTitle?: string;
  label: string;
  description: string;
  href: string;
  actionKind: ApprovalActionKind;
  targetId: string;
  actionLabel: string;
};

type ApprovalActionListProps = {
  items: ApprovalActionItem[];
  emptyMessage: string;
  compact?: boolean;
  showRoomTitle?: boolean;
};

export function ApprovalActionList({
  items,
  emptyMessage,
  compact = false,
  showRoomTitle = false
}: ApprovalActionListProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState('');
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  async function handleApprove(item: ApprovalActionItem) {
    setBusyId(item.id);
    setError('');

    try {
      const res = await fetch('/api/approvals/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: item.actionKind,
          targetId: item.targetId,
          label: item.label
        })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '승인 처리에 실패했습니다.');
      }

      setCompletedIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
      startTransition(() => {
        router.refresh();
      });
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : '승인 처리 중 문제가 발생했습니다.');
    } finally {
      setBusyId('');
    }
  }

  if (!items.length) {
    return <div className="surface-note">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const completed = completedIds.includes(item.id);
        return (
          <div key={item.id} className={compact ? 'list-card' : 'rounded-[18px] border border-slate-200/80 bg-white/84 px-4 py-3'}>
            {showRoomTitle && item.roomTitle && <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{item.roomTitle}</p>}
            <p className={`font-semibold text-slate-900 ${showRoomTitle && item.roomTitle ? 'mt-2 text-sm' : 'text-sm'}`}>{item.label}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={item.href} className="button-secondary px-3 py-2 text-xs">
                내용 보기
              </Link>
              <button
                type="button"
                onClick={() => handleApprove(item)}
                disabled={Boolean(busyId) || completed}
                className="button-primary px-3 py-2 text-xs"
              >
                {completed ? '처리 완료' : busyId === item.id ? '처리 중...' : item.actionLabel}
              </button>
            </div>
          </div>
        );
      })}
      {error && <div className="surface-note text-rose-700">{error}</div>}
    </div>
  );
}
