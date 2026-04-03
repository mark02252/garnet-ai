'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GovernorAction } from '@/lib/governor';

const RISK_BADGE: Record<string, string> = {
  HIGH: 'bg-rose-900/50 text-rose-300 border border-rose-500/40',
  MEDIUM: 'bg-amber-900/50 text-amber-300 border border-amber-500/40',
};

const RISK_LABEL: Record<string, string> = {
  HIGH: '고위험',
  MEDIUM: '중위험',
};

const KIND_LABEL: Record<string, string> = {
  SNS_PUBLISH: 'SNS 발행',
  SLACK_SEND: 'Slack 전송',
  CAMPAIGN_EXEC: '캠페인 실행',
  RUN_REPORT: '보고서 확정',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<GovernorAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/governor/queue');
      if (!res.ok) return;
      const json = await res.json() as { items: GovernorAction[] };
      setItems(json.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
    const timer = setInterval(() => { void fetchItems(); }, 15_000);
    return () => clearInterval(timer);
  }, [fetchItems]);

  async function handleDecide(id: string, decision: 'APPROVED' | 'REJECTED') {
    setDeciding(id);
    // 낙관적 업데이트
    setItems((prev) => prev.filter((item) => item.id !== id));
    try {
      const res = await fetch(`/api/governor/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) void fetchItems(); // 낙관적 제거 롤백
    } catch {
      // 네트워크 오류 시 목록 재로드
      void fetchItems();
    } finally {
      setDeciding(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <p className="text-[9px] font-semibold uppercase tracking-[2px] text-[var(--text-muted)]">Governor</p>
        <h1 className="mt-1 text-xl font-semibold text-[var(--text-strong)]">승인 인박스</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          에이전트가 요청한 외부 액션을 검토하고 승인 또는 거절합니다.
        </p>
      </div>

      {loading && (
        <div className="text-sm text-[var(--text-muted)]">불러오는 중…</div>
      )}

      {!loading && items.length === 0 && (
        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-sub)] p-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">대기 중인 승인 없음</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <div key={item.id}
            className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-sub)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {item.status === 'PENDING_SCORE' ? (
                  <span className="rounded-full bg-[var(--surface-border)] px-2.5 py-0.5 text-[11px] text-[var(--text-muted)]">
                    평가 중…
                  </span>
                ) : item.riskLevel && RISK_BADGE[item.riskLevel] ? (
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${RISK_BADGE[item.riskLevel]}`}>
                    {RISK_LABEL[item.riskLevel]}
                  </span>
                ) : null}
                <span className="text-sm font-semibold text-[var(--text-strong)]">
                  {KIND_LABEL[item.kind] ?? item.kind}
                </span>
              </div>
              <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
                {formatDate(item.createdAt)}
              </span>
            </div>

            {item.riskReason && (
              <p className="mt-2 text-xs text-[var(--text-muted)] leading-5">{item.riskReason}</p>
            )}

            <div className="mt-3 text-xs text-[var(--text-muted)] font-mono bg-[rgba(0,0,0,0.2)] rounded p-2 truncate">
              {JSON.stringify(item.payload).slice(0, 120)}
            </div>

            {item.status !== 'PENDING_SCORE' && (
              <div className="mt-3 flex gap-2 justify-end">
                <button
                  onClick={() => handleDecide(item.id, 'REJECTED')}
                  disabled={deciding === item.id}
                  className="rounded-md border border-[var(--surface-border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-rose-400 hover:border-rose-500/40 disabled:opacity-50">
                  거절
                </button>
                <button
                  onClick={() => handleDecide(item.id, 'APPROVED')}
                  disabled={deciding === item.id}
                  className="rounded-md bg-[#00d4ff] px-3 py-1.5 text-xs font-semibold text-[#050810] hover:bg-[#00b8d9] disabled:opacity-50">
                  {deciding === item.id ? '처리 중…' : '승인'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
