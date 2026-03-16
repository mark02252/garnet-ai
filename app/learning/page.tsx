'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Archive = {
  id: string;
  runId?: string | null;
  sourceType: string;
  situation: string;
  recommendedResponse: string;
  reasoning: string;
  signals: string[];
  tags: string[];
  status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';
  updatedAt: string;
  run?: { id: string; topic: string; createdAt: string } | null;
};

function formatDate(value: string) {
  try {
    const date = new Date(value);
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(date);
  } catch {
    return value;
  }
}

function statusTone(status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED') {
  if (status === 'CONFIRMED') return 'bg-emerald-100 text-emerald-700';
  if (status === 'ARCHIVED') return 'bg-slate-100 text-slate-600';
  return 'bg-amber-100 text-amber-700';
}

export default function LearningPage() {
  const [items, setItems] = useState<Archive[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    situation: '',
    recommendedResponse: '',
    reasoning: '',
    signals: '',
    tags: '',
    status: 'DRAFT' as 'DRAFT' | 'CONFIRMED' | 'ARCHIVED'
  });

  const selected = items.find((item) => item.id === selectedId) || null;

  async function refresh() {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);

    setLoading(true);
    const res = await fetch(`/api/learning-archives?${params.toString()}`);
    const data = (await res.json()) as Archive[];
    setItems(data);

    if (!selectedId && data.length) setSelectedId(data[0].id);
    if (selectedId && !data.some((item) => item.id === selectedId)) setSelectedId(data[0]?.id || '');
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, [q, status]);

  useEffect(() => {
    if (!selected) return;
    setForm({
      situation: selected.situation,
      recommendedResponse: selected.recommendedResponse,
      reasoning: selected.reasoning,
      signals: selected.signals.join(', '),
      tags: selected.tags.join(', '),
      status: selected.status
    });
  }, [selectedId, items]);

  const stats = useMemo(() => {
    const total = items.length;
    const confirmed = items.filter((item) => item.status === 'CONFIRMED').length;
    const draft = items.filter((item) => item.status === 'DRAFT').length;
    const archived = items.filter((item) => item.status === 'ARCHIVED').length;
    const linked = items.filter((item) => item.runId).length;
    return { total, confirmed, draft, archived, linked };
  }, [items]);

  const topTags = useMemo(() => {
    const counter = new Map<string, number>();
    for (const item of items) {
      for (const tagItem of item.tags) {
        counter.set(tagItem, (counter.get(tagItem) || 0) + 1);
      }
    }
    return [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [items]);

  const topSignals = useMemo(() => {
    const counter = new Map<string, number>();
    for (const item of items) {
      for (const signalItem of item.signals) {
        counter.set(signalItem, (counter.get(signalItem) || 0) + 1);
      }
    }
    return [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [items]);

  async function syncFromRuns() {
    setMessage('');
    const res = await fetch('/api/learning-archives/sync', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || '동기화 실패');
      return;
    }
    setMessage(`동기화 완료: ${data.created}개 신규 학습 카드 생성`);
    await refresh();
  }

  async function createManual() {
    setMessage('');
    const res = await fetch('/api/learning-archives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        situation: '수동 입력 상황',
        recommendedResponse: '권장 응답을 입력해 주세요.',
        reasoning: '근거를 입력해 주세요.',
        signals: [],
        tags: ['수동'],
        status: 'DRAFT'
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || '생성 실패');
      return;
    }
    await refresh();
    setSelectedId(data.id);
    setMessage('수동 학습 카드가 생성되었습니다.');
  }

  async function saveSelected() {
    if (!selected) return;
    setSaving(true);
    setMessage('');

    const res = await fetch(`/api/learning-archives/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        situation: form.situation,
        recommendedResponse: form.recommendedResponse,
        reasoning: form.reasoning,
        signals: form.signals
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        tags: form.tags
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        status: form.status
      })
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || '저장 실패');
      setSaving(false);
      return;
    }

    setMessage('저장되었습니다.');
    setSaving(false);
    await refresh();
    setSelectedId(data.id || selected.id);
  }

  return (
    <div className="space-y-5">
      <section className="dashboard-hero">
        <p className="dashboard-eyebrow">Learning Studio</p>
        <h1 className="dashboard-title">대화 학습 카드 스튜디오</h1>
        <p className="dashboard-copy">
          과거 실행에서 재사용 가능한 응답 패턴을 카드로 관리하고, 검토 상태와 신호를 운영 관점에서 정리합니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="button-primary" onClick={syncFromRuns}>
            실행기록 동기화
          </button>
          <button type="button" className="button-secondary" onClick={createManual}>
            수동 카드 추가
          </button>
          <Link href="/dashboard" className="button-secondary">
            운영 대시보드 보기
          </Link>
        </div>
        <div className="dashboard-chip-grid">
          <div className="dashboard-chip">
            <strong>재사용 가능</strong>
            <br />
            {stats.confirmed}개
          </div>
          <div className="dashboard-chip">
            <strong>검토 필요</strong>
            <br />
            {stats.draft}개
          </div>
          <div className="dashboard-chip">
            <strong>실행 연결</strong>
            <br />
            {stats.linked}개
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="status-tile">
          <p className="metric-label">누적 카드</p>
          <p className="mt-2 text-base font-semibold text-slate-950">{stats.total}</p>
          <p className="mt-1 text-xs text-slate-500">현재 워크스페이스의 전체 카드</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">확정</p>
          <p className="mt-2 text-base font-semibold text-emerald-700">{stats.confirmed}</p>
          <p className="mt-1 text-xs text-slate-500">바로 재사용 가능한 카드</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">보관</p>
          <p className="mt-2 text-base font-semibold text-slate-950">{stats.archived}</p>
          <p className="mt-1 text-xs text-slate-500">현재 운영에서 제외된 카드</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">연결 실행</p>
          <p className="mt-2 text-base font-semibold text-slate-950">{stats.linked}</p>
          <p className="mt-1 text-xs text-slate-500">원본 실행과 연결된 카드</p>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)_320px]">
        <section className="panel space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Library</p>
            <h2 className="section-title">학습 카드 목록</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">상황, 응답, 상태 기준으로 카드들을 검색하고 선택할 수 있습니다.</p>
          </div>

          <div className="grid gap-3">
            <div className="soft-panel">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">검색</label>
              <input className="input" placeholder="상황 / 응답 / 근거 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="soft-panel">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">상태</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">전체 상태</option>
                <option value="DRAFT">DRAFT</option>
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </div>
            {message && <p className="text-xs text-slate-500">{message}</p>}
          </div>

          <div className="max-h-[720px] space-y-3 overflow-auto pr-1">
            {loading && <div className="soft-panel text-sm text-slate-600">학습 카드를 불러오는 중입니다.</div>}
            {!loading && items.length === 0 && <div className="soft-panel text-sm text-slate-600">학습 카드가 없습니다.</div>}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-[22px] border p-4 text-left transition ${
                  selectedId === item.id ? 'border-sky-200 bg-sky-50/80' : 'border-slate-200 bg-white/90 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{item.sourceType}</p>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone(item.status)}`}>{item.status}</span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm font-semibold leading-6 text-slate-950">{item.situation}</p>
                <p className="mt-2 text-xs text-slate-500">{formatDate(item.updatedAt)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(item.tags.length ? item.tags : ['태그 없음']).slice(0, 5).map((tagItem) => (
                    <span key={`${item.id}-${tagItem}`} className="pill-option">
                      {tagItem}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          {!selected && <p className="text-sm text-slate-500">왼쪽에서 학습 카드를 선택하세요.</p>}
          {selected && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Editor</p>
                  <h2 className="section-title">이럴 때 이렇게 답변</h2>
                  <p className="mt-2 text-xs text-slate-500">마지막 수정: {formatDate(selected.updatedAt)}</p>
                  {selected.run?.id && (
                    <Link className="mt-2 inline-flex text-xs font-medium text-sky-700 underline" href={`/runs/${selected.run.id}`}>
                      원본 실행 보기: {selected.run.topic}
                    </Link>
                  )}
                </div>
                <button type="button" className="button-primary" onClick={saveSelected} disabled={saving}>
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>

              <div className="grid gap-4">
                <div className="soft-panel">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">상황 정의</label>
                  <textarea className="input min-h-[110px]" value={form.situation} onChange={(e) => setForm({ ...form, situation: e.target.value })} />
                </div>

                <div className="soft-panel">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">권장 응답 템플릿</label>
                  <textarea
                    className="input min-h-[220px]"
                    value={form.recommendedResponse}
                    onChange={(e) => setForm({ ...form, recommendedResponse: e.target.value })}
                  />
                </div>

                <div className="soft-panel">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">근거 / 맥락</label>
                  <textarea className="input min-h-[170px]" value={form.reasoning} onChange={(e) => setForm({ ...form, reasoning: e.target.value })} />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="soft-panel">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">신호</label>
                    <input className="input" value={form.signals} onChange={(e) => setForm({ ...form, signals: e.target.value })} />
                  </div>
                  <div className="soft-panel">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">태그</label>
                    <input className="input" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
                  </div>
                </div>

                <div className="soft-panel max-w-xs">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">상태</label>
                  <select
                    className="input"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as 'DRAFT' | 'CONFIRMED' | 'ARCHIVED' })}
                  >
                    <option value="DRAFT">DRAFT (검토 필요)</option>
                    <option value="CONFIRMED">CONFIRMED (재사용 추천)</option>
                    <option value="ARCHIVED">ARCHIVED (보관)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Status Rail</p>
              <h2 className="section-title">운영 상태</h2>
            </div>
            <div className="grid gap-3">
              <div className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">검토 대기</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{stats.draft}개</p>
              </div>
              <div className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">재사용 가능</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{stats.confirmed}개</p>
              </div>
              <div className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">실행 연결</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{stats.linked}개</p>
              </div>
            </div>
          </section>

          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Top Tags</p>
              <h2 className="section-title">반복 태그</h2>
            </div>
            {topTags.length === 0 ? (
              <div className="soft-panel text-sm text-slate-600">태그 데이터가 아직 없습니다.</div>
            ) : (
              <div className="space-y-3">
                {topTags.map(([tagItem, count]) => (
                  <div key={tagItem} className="soft-panel">
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                      <span>#{tagItem}</span>
                      <span>{count}회</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200">
                      <div className="h-2 rounded-full bg-sky-500" style={{ width: `${Math.max(10, Math.min(100, count * 12))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Signal Mix</p>
              <h2 className="section-title">반복 신호</h2>
            </div>
            {topSignals.length === 0 ? (
              <div className="soft-panel text-sm text-slate-600">신호 데이터가 아직 없습니다.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {topSignals.map(([signalItem, count]) => (
                  <span key={signalItem} className="pill-option">
                    {signalItem} · {count}
                  </span>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
