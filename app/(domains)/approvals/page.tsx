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

const DEFER_REASONS = [
  { key: 'no_budget', label: '예산 부족' },
  { key: 'prerequisite', label: '선행 작업 필요' },
  { key: 'too_early', label: '시기상조' },
  { key: 'external_dependency', label: '외부 의존' },
  { key: 'good_idea_later', label: '나중에 참고' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function extractMeta(payload: unknown): { title: string; rationale: string; expectedEffect: string; goalAlignment: string } | null {
  try {
    const p = payload as Record<string, unknown>;
    const meta = p?._agentLoop as Record<string, string> | undefined;
    if (!meta) return null;
    return {
      title: meta.title || '',
      rationale: meta.rationale || '',
      expectedEffect: meta.expectedEffect || '',
      goalAlignment: meta.goalAlignment || '',
    };
  } catch { return null; }
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<GovernorAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [deferringId, setDeferringId] = useState<string | null>(null);

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

  async function handleDecide(id: string, decision: 'APPROVED' | 'REJECTED' | 'DEFERRED', reason?: string) {
    setDeciding(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
    try {
      const res = await fetch(`/api/governor/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason }),
      });
      if (!res.ok) void fetchItems();
    } catch {
      void fetchItems();
    } finally {
      setDeciding(null);
      setDeferringId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <p className="text-[9px] font-semibold uppercase tracking-[2px] text-[var(--text-muted)]">Governor</p>
        <h1 className="mt-1 text-xl font-semibold text-[var(--text-strong)]">승인 인박스</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          에이전트가 요청한 액션을 검토하고 승인, 보류 또는 거절합니다.
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
        {items.map((item) => {
          const meta = extractMeta(item.payload);

          return (
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
                    {meta?.title || item.kind}
                  </span>
                </div>
                <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
                  {formatDate(item.createdAt)}
                </span>
              </div>

              {/* Agent Loop 메타: 근거 + 예상 효과 */}
              {meta?.rationale && (
                <p className="mt-2 text-xs text-[var(--text-muted)] leading-5">{meta.rationale}</p>
              )}
              {meta?.expectedEffect && (
                <p className="mt-1 text-xs text-emerald-400/70 leading-5">예상 효과: {meta.expectedEffect}</p>
              )}
              {meta?.goalAlignment && (
                <p className="mt-1 text-[10px] text-blue-400/60">관련 목표: {meta.goalAlignment}</p>
              )}

              {/* 메타 없으면 기존 riskReason */}
              {!meta && item.riskReason && (
                <p className="mt-2 text-xs text-[var(--text-muted)] leading-5">{item.riskReason}</p>
              )}

              {item.status !== 'PENDING_SCORE' && (
                <>
                  {deferringId === item.id ? (
                    <div className="mt-3 rounded-lg border border-blue-900/40 bg-blue-950/20 p-3">
                      <p className="text-[11px] text-blue-400 mb-2">보류 이유를 선택하세요:</p>
                      <div className="flex flex-wrap gap-2">
                        {DEFER_REASONS.map(r => (
                          <button
                            key={r.key}
                            onClick={() => handleDecide(item.id, 'DEFERRED', r.key)}
                            disabled={deciding !== null}
                            className="rounded-md border border-blue-500/30 bg-blue-900/30 px-2.5 py-1.5 text-[11px] text-blue-300 hover:bg-blue-900/50 disabled:opacity-50 transition"
                          >{r.label}</button>
                        ))}
                      </div>
                      <button
                        onClick={() => setDeferringId(null)}
                        className="mt-2 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-strong)] transition"
                      >취소</button>
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2 justify-end">
                      <button
                        onClick={() => handleDecide(item.id, 'REJECTED')}
                        disabled={deciding !== null}
                        className="rounded-md border border-[var(--surface-border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-rose-400 hover:border-rose-500/40 disabled:opacity-50 transition">
                        거절
                      </button>
                      <button
                        onClick={() => setDeferringId(item.id)}
                        disabled={deciding !== null}
                        className="rounded-md border border-blue-500/30 bg-blue-900/20 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-900/40 disabled:opacity-50 transition">
                        보류
                      </button>
                      <button
                        onClick={() => handleDecide(item.id, 'APPROVED')}
                        disabled={deciding !== null}
                        className="rounded-md bg-[#C93545] px-3 py-1.5 text-xs font-semibold text-[#ffffff] hover:bg-[#B02D3C] disabled:opacity-50 transition">
                        {deciding === item.id ? '처리 중…' : '승인'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
