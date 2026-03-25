'use client';

import { useEffect, useState, useTransition } from 'react';

type KpiPeriod = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

type KpiGoal = {
  id: string;
  title: string;
  brand: string | null;
  region: string | null;
  metric: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  period: KpiPeriod;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

const PERIOD_LABELS: Record<KpiPeriod, string> = {
  WEEKLY: '주간',
  MONTHLY: '월간',
  QUARTERLY: '분기',
  ANNUAL: '연간'
};

function pct(current: number, target: number) {
  if (!target) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

function progressTone(p: number) {
  if (p >= 80) return 'bg-emerald-500';
  if (p >= 30) return 'bg-amber-400';
  return 'bg-rose-400';
}

function progressTextTone(p: number) {
  if (p >= 80) return 'text-emerald-700';
  if (p >= 30) return 'text-amber-600';
  return 'text-rose-600';
}

type FormState = {
  title: string;
  brand: string;
  region: string;
  metric: string;
  targetValue: string;
  currentValue: string;
  unit: string;
  period: KpiPeriod;
  notes: string;
};

const EMPTY_FORM: FormState = {
  title: '',
  brand: '',
  region: '',
  metric: '',
  targetValue: '',
  currentValue: '0',
  unit: '',
  period: 'MONTHLY',
  notes: ''
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<KpiGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [inputCurrent, setInputCurrent] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const res = await fetch('/api/goals');
    const data = await res.json();
    setGoals(data);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setMessage('');
    setShowForm(true);
  }

  function openEdit(goal: KpiGoal) {
    setEditId(goal.id);
    setForm({
      title: goal.title,
      brand: goal.brand ?? '',
      region: goal.region ?? '',
      metric: goal.metric,
      targetValue: String(goal.targetValue),
      currentValue: String(goal.currentValue),
      unit: goal.unit,
      period: goal.period,
      notes: goal.notes ?? ''
    });
    setMessage('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditId(null);
    setMessage('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      setMessage('');
      const body = {
        ...form,
        targetValue: Number(form.targetValue) || 0,
        currentValue: Number(form.currentValue) || 0
      };
      const url = editId ? `/api/goals/${editId}` : '/api/goals';
      const method = editId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) { setMessage(data.error || '저장 실패'); return; }
      closeForm();
      await load();
    });
  }

  async function deleteGoal(id: string) {
    if (!confirm('이 KPI 목표를 삭제할까요?')) return;
    await fetch(`/api/goals/${id}`, { method: 'DELETE' });
    await load();
  }

  async function updateCurrent(id: string) {
    const val = inputCurrent[id];
    if (val == null || val === '') return;
    setUpdatingId(id);
    await fetch(`/api/goals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentValue: Number(val) })
    });
    setInputCurrent((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setUpdatingId(null);
    await load();
  }

  const totalGoals = goals.length;
  const achieved = goals.filter((g) => pct(g.currentValue, g.targetValue) >= 100).length;
  const onTrack = goals.filter((g) => { const p = pct(g.currentValue, g.targetValue); return p >= 70 && p < 100; }).length;
  const behind = goals.filter((g) => pct(g.currentValue, g.targetValue) < 70).length;

  return (
    <div className="space-y-5">
      {/* ── Hero ── */}
      <section className="dashboard-hero">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            <p className="dashboard-eyebrow">KPI Goals</p>
            <h1 className="dashboard-title">KPI 목표 관리</h1>
            <p className="dashboard-copy">캠페인 단위로 목표를 설정하고 현재 달성률을 추적합니다.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="button-primary" onClick={openCreate}>+ 새 KPI 목표</button>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="accent-pill">목표 {totalGoals}개</span>
              <span className="pill-option">달성 {achieved}개</span>
              <span className="pill-option">진행 중 {onTrack}개</span>
              {behind > 0 && <span className="pill-option">주의 필요 {behind}개</span>}
            </div>
          </div>
          <div className="soft-card">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">달성 현황</p>
            <div className="mt-4 space-y-3">
              {[
                { label: '달성 완료', count: achieved, color: 'bg-emerald-500' },
                { label: '순조로운 진행', count: onTrack, color: 'bg-[var(--accent)]' },
                { label: '주의 필요', count: behind, color: 'bg-rose-400' }
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-base)]">
                    <span>{item.label}</span>
                    <span className="font-semibold">{item.count}개</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--surface-border)]">
                    <div
                      className={`h-1.5 rounded-full ${item.color}`}
                      style={{ width: totalGoals > 0 ? `${Math.max(4, Math.round((item.count / totalGoals) * 100))}%` : '4%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── KPI Summary Tiles ── */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="status-tile">
          <p className="metric-label">전체 목표</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{totalGoals}개</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">현재 설정된 KPI 목표</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">달성 완료</p>
          <p className="mt-2 text-base font-semibold text-emerald-700">{achieved}개</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">목표값 100% 이상 달성</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">순조로운 진행</p>
          <p className="mt-2 text-base font-semibold text-[var(--accent)]">{onTrack}개</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">70% 이상 달성 중</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">주의 필요</p>
          <p className="mt-2 text-base font-semibold text-rose-600">{behind}개</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">70% 미만, 관리 필요</p>
        </div>
      </section>

      {/* ── Goals List ── */}
      <section className="panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">KPI Board</p>
            <h2 className="section-title">목표 달성률 현황</h2>
          </div>
          <button type="button" className="button-primary" onClick={openCreate}>+ 새 목표</button>
        </div>

        {loading && <div className="soft-panel text-sm text-[var(--text-muted)]">목표를 불러오는 중...</div>}
        {!loading && goals.length === 0 && (
          <div className="surface-note">
            <strong>아직 KPI 목표가 없습니다.</strong> "새 KPI 목표" 버튼을 눌러 첫 번째 목표를 설정해 보세요.
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {goals.map((goal) => {
            const p = pct(goal.currentValue, goal.targetValue);
            return (
              <div key={goal.id} className="list-card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--surface-sub)] border border-[var(--surface-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
                        {PERIOD_LABELS[goal.period]}
                      </span>
                      {goal.brand && <span className="pill-option">{goal.brand}</span>}
                      {goal.region && <span className="pill-option">{goal.region}</span>}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{goal.title}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{goal.metric}</p>
                  </div>
                  <span className={`text-lg font-bold ${progressTextTone(p)}`}>{p}%</span>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="h-2 rounded-full bg-[var(--surface-border)]">
                    <div
                      className={`h-2 rounded-full transition-all ${progressTone(p)}`}
                      style={{ width: `${Math.max(4, p)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>현재: <strong className="text-[var(--text-strong)]">{goal.currentValue.toLocaleString()}{goal.unit}</strong></span>
                    <span>목표: <strong className="text-[var(--text-strong)]">{goal.targetValue.toLocaleString()}{goal.unit}</strong></span>
                  </div>
                </div>

                {/* Inline current value updater */}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="현재값 업데이트"
                    className="input flex-1 py-1.5 text-sm"
                    value={inputCurrent[goal.id] ?? ''}
                    onChange={(e) => setInputCurrent((prev) => ({ ...prev, [goal.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') void updateCurrent(goal.id); }}
                  />
                  <button
                    type="button"
                    className="button-secondary px-3 py-1.5 text-xs"
                    disabled={updatingId === goal.id || !inputCurrent[goal.id]}
                    onClick={() => void updateCurrent(goal.id)}
                  >
                    {updatingId === goal.id ? '...' : '업데이트'}
                  </button>
                  <button
                    type="button"
                    className="button-secondary px-3 py-1.5 text-xs"
                    onClick={() => openEdit(goal)}
                  >
                    편집
                  </button>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:bg-rose-50 hover:text-rose-600"
                    onClick={() => void deleteGoal(goal.id)}
                    title="삭제"
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                {goal.notes && <p className="text-xs leading-5 text-[var(--text-muted)]">{goal.notes}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Create / Edit Modal ── */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(25,31,40,0.4)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }}
        >
          <div
            className="w-full max-w-lg rounded-[16px] bg-[var(--surface)] shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
            style={{ border: '1px solid var(--surface-border)' }}
          >
            <div className="flex items-center justify-between border-b border-[var(--surface-border)] px-6 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">KPI Goals</p>
                <h2 className="mt-0.5 text-base font-semibold text-[var(--text-strong)]">
                  {editId ? 'KPI 목표 편집' : '새 KPI 목표'}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-muted)] hover:bg-[var(--surface-sub)]"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-[13px] font-semibold text-[var(--text-strong)]">
                    목표 제목 <span className="text-rose-500">*</span>
                  </label>
                  <input required className="input" placeholder="예: Q2 인스타그램 팔로워 확보" value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[var(--text-strong)]">
                    지표명 <span className="text-rose-500">*</span>
                  </label>
                  <input required className="input" placeholder="예: 팔로워 수, 리치, 전환율" value={form.metric}
                    onChange={(e) => setForm({ ...form, metric: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[var(--text-strong)]">기간</label>
                  <select className="input" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as KpiPeriod })}>
                    {(Object.entries(PERIOD_LABELS) as [KpiPeriod, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[var(--text-strong)]">
                    목표값 <span className="text-rose-500">*</span>
                  </label>
                  <input required type="number" className="input" placeholder="1000" value={form.targetValue}
                    onChange={(e) => setForm({ ...form, targetValue: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[var(--text-strong)]">현재값</label>
                  <input type="number" className="input" placeholder="0" value={form.currentValue}
                    onChange={(e) => setForm({ ...form, currentValue: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[var(--text-strong)]">단위</label>
                  <input className="input" placeholder="명, %, 건" value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[var(--text-strong)]">브랜드 (선택)</label>
                  <input className="input" placeholder="예: TechCo" value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[var(--text-strong)]">지역/채널 (선택)</label>
                  <input className="input" placeholder="예: 인스타그램, 글로벌" value={form.region}
                    onChange={(e) => setForm({ ...form, region: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-[13px] font-semibold text-[var(--text-strong)]">메모 (선택)</label>
                  <textarea className="input resize-none" rows={2} placeholder="목표 배경이나 달성 전략을 간략히 적어주세요." value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>

              {message && (
                <div className="rounded-[8px] bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{message}</div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={closeForm} className="button-secondary" disabled={pending}>취소</button>
                <button type="submit" className="button-primary" disabled={pending}>
                  {pending ? '저장 중...' : editId ? '수정 저장' : '목표 추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
