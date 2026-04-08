'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { NotionPublishButton } from '@/components/notion-publish-button';
import { SlackNotifyButton } from '@/components/slack-notify-button';

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
  if (status === 'CONFIRMED') return 'bg-[var(--status-active-bg)] text-[var(--status-active)]';
  if (status === 'ARCHIVED') return 'bg-[var(--status-draft-bg)] text-[var(--status-draft)]';
  return 'bg-[var(--status-paused-bg)] text-[var(--status-paused)]';
}

function statusLabel(status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED') {
  if (status === 'CONFIRMED') return '확정됨';
  if (status === 'ARCHIVED') return '보관됨';
  return '검토 필요';
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

  async function patchItem(id: string, patch: Partial<typeof form>) {
    setSaving(true);
    setMessage('');
    const res = await fetch(`/api/learning-archives/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...patch,
        signals: typeof patch.signals === 'string'
          ? patch.signals.split(',').map((v) => v.trim()).filter(Boolean)
          : patch.signals,
        tags: typeof patch.tags === 'string'
          ? patch.tags.split(',').map((v) => v.trim()).filter(Boolean)
          : patch.tags
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || '저장 실패');
      setSaving(false);
      return;
    }
    setSaving(false);
    await refresh();
    setSelectedId(data.id || id);
    return data;
  }

  async function saveSelected() {
    if (!selected) return;
    await patchItem(selected.id, form);
    setMessage('저장되었습니다.');
  }

  async function confirmSelected() {
    if (!selected) return;
    await patchItem(selected.id, { ...form, status: 'CONFIRMED' });
    setMessage('플레이북으로 확정되었습니다.');
  }

  async function quickConfirm(id: string) {
    setSaving(true);
    setMessage('');
    const res = await fetch(`/api/learning-archives/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CONFIRMED' })
    });
    if (res.ok) {
      setMessage('플레이북으로 확정되었습니다.');
      await refresh();
    }
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      <section className="dashboard-hero">
        <p className="dashboard-eyebrow">Archive</p>
        <h1 className="dashboard-title">플레이북</h1>
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
        <div className="metric-card" style={{ borderTop: '4px solid var(--accent)' }}>
          <p className="metric-label">누적 카드</p>
          <p className="metric-value">{stats.total}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">현재 워크스페이스의 전체 카드</p>
        </div>
        <div className="metric-card" style={{ borderTop: '4px solid #10b981' }}>
          <p className="metric-label">확정</p>
          <p className="metric-value" style={{ color: '#10b981' }}>{stats.confirmed}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">바로 재사용 가능한 카드</p>
        </div>
        <div className="metric-card" style={{ borderTop: '4px solid #94a3b8' }}>
          <p className="metric-label">보관</p>
          <p className="metric-value">{stats.archived}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">현재 운영에서 제외된 카드</p>
        </div>
        <div className="metric-card" style={{ borderTop: '4px solid #6366f1' }}>
          <p className="metric-label">연결 실행</p>
          <p className="metric-value">{stats.linked}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">원본 실행과 연결된 카드</p>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)_320px]">
        {/* ── Card List ── */}
        <section className="panel space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Library</p>
            <h2 className="section-title">학습 카드 목록</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">상황, 응답, 상태 기준으로 카드들을 검색하고 선택할 수 있습니다.</p>
          </div>

          <div className="grid gap-3">
            <div className="soft-panel">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">검색</label>
              <input className="input" placeholder="상황 / 응답 / 근거 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="soft-panel">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">상태 필터</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { value: '', label: '전체' },
                  { value: 'DRAFT', label: '검토 필요' },
                  { value: 'CONFIRMED', label: '확정됨' },
                  { value: 'ARCHIVED', label: '보관됨' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className={status === opt.value ? 'accent-pill text-xs' : 'pill-option text-xs'}
                    onClick={() => setStatus(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {message && (
              <p className={`text-xs font-medium ${message.includes('실패') ? 'text-rose-600' : 'text-emerald-700'}`}>
                {message}
              </p>
            )}
          </div>

          <div className="max-h-[720px] space-y-2 overflow-auto pr-1">
            {loading && <div className="soft-panel text-sm text-[var(--text-muted)]">학습 카드를 불러오는 중입니다.</div>}
            {!loading && items.length === 0 && <div className="soft-panel text-sm text-[var(--text-muted)]">학습 카드가 없습니다.</div>}
            {items.map((item) => (
              <div
                key={item.id}
                className={`list-card cursor-pointer ${selectedId === item.id ? 'list-card-active' : ''}`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{item.sourceType}</p>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-[var(--text-strong)]">{item.situation}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{formatDate(item.updatedAt)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {(item.tags.length ? item.tags : ['태그 없음']).slice(0, 4).map((tagItem) => (
                    <span key={`${item.id}-${tagItem}`} className="pill-option">{tagItem}</span>
                  ))}
                  {item.status === 'DRAFT' && (
                    <button
                      type="button"
                      className="ml-auto rounded-[6px] bg-[var(--accent-soft)] border border-[rgba(49,130,246,0.2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-text)] hover:bg-[rgba(49,130,246,0.15)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        void quickConfirm(item.id);
                      }}
                      disabled={saving}
                    >
                      확정
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Card Editor ── */}
        <section className="panel">
          {!selected && (
            <p className="text-sm text-[var(--text-muted)]">왼쪽에서 학습 카드를 선택하세요.</p>
          )}
          {selected && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Editor</p>
                  <h2 className="section-title">이럴 때 이렇게 답변</h2>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">마지막 수정: {formatDate(selected.updatedAt)}</p>
                  {selected.run?.id && (
                    <Link className="mt-1 inline-flex text-xs font-medium text-[var(--accent-text)] underline" href={`/runs/${selected.run.id}`}>
                      원본 실행 보기: {selected.run.topic}
                    </Link>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {form.status === 'DRAFT' && (
                    <button type="button" className="button-primary" onClick={confirmSelected} disabled={saving}>
                      {saving ? '처리 중...' : '확정하기'}
                    </button>
                  )}
                  <button type="button" className="button-secondary" onClick={saveSelected} disabled={saving}>
                    {saving ? '저장 중...' : '저장'}
                  </button>
                  {form.status === 'CONFIRMED' && (
                    <NotionPublishButton
                      title={form.situation.slice(0, 60) || '플레이북'}
                      content={`상황\n${form.situation}\n\n추천 대응\n${form.recommendedResponse}\n\n근거\n${form.reasoning}`}
                      contentType="playbook"
                    />
                  )}
                  {form.status === 'CONFIRMED' && (
                    <SlackNotifyButton
                      title={form.situation.slice(0, 60) || '플레이북'}
                      content={`상황\n${form.situation}\n\n추천 대응\n${form.recommendedResponse}\n\n근거\n${form.reasoning}`}
                      emoji="📖"
                    />
                  )}
                </div>
              </div>

              {form.status === 'DRAFT' && (
                <div className="surface-note">
                  <strong>검토 대기 중입니다.</strong> 내용을 확인한 뒤 "확정하기"를 눌러 재사용 가능한 플레이북으로 전환하세요.
                </div>
              )}

              <div className="grid gap-4">
                <div className="soft-panel">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">상황 정의</label>
                  <textarea
                    className="input min-h-[110px]"
                    value={form.situation}
                    onChange={(e) => setForm({ ...form, situation: e.target.value })}
                  />
                </div>

                <div className="soft-panel">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">권장 응답 템플릿</label>
                  <textarea
                    className="input min-h-[220px]"
                    value={form.recommendedResponse}
                    onChange={(e) => setForm({ ...form, recommendedResponse: e.target.value })}
                  />
                </div>

                <div className="soft-panel">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">근거 / 맥락</label>
                  <textarea
                    className="input min-h-[170px]"
                    value={form.reasoning}
                    onChange={(e) => setForm({ ...form, reasoning: e.target.value })}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="soft-panel">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">신호</label>
                    <input
                      className="input"
                      placeholder="쉼표로 구분"
                      value={form.signals}
                      onChange={(e) => setForm({ ...form, signals: e.target.value })}
                    />
                  </div>
                  <div className="soft-panel">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">태그</label>
                    <input
                      className="input"
                      placeholder="쉼표로 구분"
                      value={form.tags}
                      onChange={(e) => setForm({ ...form, tags: e.target.value })}
                    />
                  </div>
                </div>

                <div className="soft-panel max-w-xs">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">상태 변경</label>
                  <select
                    className="input"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as 'DRAFT' | 'CONFIRMED' | 'ARCHIVED' })}
                  >
                    <option value="DRAFT">검토 필요 (DRAFT)</option>
                    <option value="CONFIRMED">확정됨 (CONFIRMED)</option>
                    <option value="ARCHIVED">보관됨 (ARCHIVED)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── Right Sidebar ── */}
        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Status Rail</p>
              <h2 className="section-title">운영 상태</h2>
            </div>
            <div className="grid gap-3">
              <div className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">검토 대기</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{stats.draft}개</p>
              </div>
              <div className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">재사용 가능</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{stats.confirmed}개</p>
              </div>
              <div className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">실행 연결</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{stats.linked}개</p>
              </div>
            </div>
          </section>

          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Top Tags</p>
              <h2 className="section-title">반복 태그</h2>
            </div>
            {topTags.length === 0 ? (
              <div className="soft-panel text-sm text-[var(--text-muted)]">태그 데이터가 아직 없습니다.</div>
            ) : (
              <div className="space-y-3">
                {topTags.map(([tagItem, count]) => (
                  <div key={tagItem} className="soft-panel">
                    <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-base)]">
                      <span>#{tagItem}</span>
                      <span>{count}회</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--surface-border)]">
                      <div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(10, Math.min(100, count * 12))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Signal Mix</p>
              <h2 className="section-title">반복 신호</h2>
            </div>
            {topSignals.length === 0 ? (
              <div className="soft-panel text-sm text-[var(--text-muted)]">신호 데이터가 아직 없습니다.</div>
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
