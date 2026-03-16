'use client';

import { useState, useTransition, useEffect } from 'react';

type ContentType = 'instagram_caption' | 'ad_copy' | 'email_copy' | 'blog_post' | 'press_release' | 'sms_push';

type ContentDraft = {
  id: string;
  contentType: string;
  brand: string;
  target: string;
  tone: string;
  keyMessage: string;
  result: string;
  createdAt: string;
};

const CONTENT_TYPES: { id: ContentType; label: string; desc: string; icon: string }[] = [
  { id: 'instagram_caption', label: '인스타그램 캡션', desc: '캡션 + 해시태그', icon: '📸' },
  { id: 'ad_copy', label: '광고 카피', desc: '헤드라인 · 서브카피 · CTA', icon: '🎯' },
  { id: 'email_copy', label: '이메일 카피', desc: '제목 · 본문 · CTA', icon: '✉️' },
  { id: 'blog_post', label: '블로그 포스트', desc: 'SEO 최적화 초안', icon: '📝' },
  { id: 'press_release', label: '보도자료', desc: '언론 배포용 형식', icon: '📰' },
  { id: 'sms_push', label: 'SMS / 푸시 알림', desc: '짧고 임팩트 있는 문구', icon: '📱' }
];

const TYPE_ICONS: Record<string, string> = {
  instagram_caption: '📸', ad_copy: '🎯', email_copy: '✉️',
  blog_post: '📝', press_release: '📰', sms_push: '📱'
};
const TYPE_LABELS: Record<string, string> = {
  instagram_caption: '인스타그램 캡션', ad_copy: '광고 카피', email_copy: '이메일 카피',
  blog_post: '블로그 포스트', press_release: '보도자료', sms_push: 'SMS/푸시'
};

const TONE_PRESETS = ['친근하고 유쾌한', '전문적이고 신뢰감 있는', '긴박감과 희소성 강조', '감성적이고 공감되는', '간결하고 직설적인'];

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date(iso));
  } catch { return iso; }
}

export default function ContentPage() {
  const [contentType, setContentType] = useState<ContentType>('instagram_caption');
  const [form, setForm] = useState({ brand: '', target: '', tone: '', keyMessage: '', additionalContext: '' });
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ContentDraft[]>([]);
  const [selectedDraft, setSelectedDraft] = useState<ContentDraft | null>(null);

  useEffect(() => {
    fetch('/api/content').then(r => r.json()).then(setHistory).catch(() => {});
  }, []);

  function handleGenerate() {
    startTransition(async () => {
      setError('');
      setResult('');
      setSelectedDraft(null);
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType, ...form })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '생성 실패'); return; }
      setResult(data.content);
      // 이력 갱신
      const updated = await fetch('/api/content').then(r => r.json()).catch(() => history);
      setHistory(updated);
    });
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function loadDraft(draft: ContentDraft) {
    setSelectedDraft(draft);
    setResult(draft.result);
    setContentType(draft.contentType as ContentType);
    setForm({
      brand: draft.brand,
      target: draft.target,
      tone: draft.tone,
      keyMessage: draft.keyMessage,
      additionalContext: ''
    });
  }

  async function deleteDraft(id: string) {
    await fetch(`/api/content?id=${id}`, { method: 'DELETE' });
    setHistory(prev => prev.filter(d => d.id !== id));
    if (selectedDraft?.id === id) { setSelectedDraft(null); setResult(''); }
  }

  const activeResult = result;
  const selectedType = CONTENT_TYPES.find((t) => t.id === contentType)!;

  return (
    <div className="space-y-5">
      {/* ── Hero ── */}
      <section className="dashboard-hero">
        <p className="dashboard-eyebrow">Content Studio</p>
        <h1 className="dashboard-title">콘텐츠 생성 스튜디오</h1>
        <p className="dashboard-copy">브랜드 정보와 메시지를 입력하면 AI가 목적에 맞는 콘텐츠를 즉시 생성합니다.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="accent-pill">생성 이력 {history.length}개</span>
          <span className="pill-option">6가지 콘텐츠 타입</span>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* ── Left: Input Panel ── */}
        <div className="space-y-4">
          <section className="panel space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Content Type</p>
              <h2 className="section-title">콘텐츠 종류 선택</h2>
            </div>
            <div className="grid gap-2">
              {CONTENT_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setContentType(type.id)}
                  className={`list-card flex items-center gap-3 text-left ${contentType === type.id ? 'list-card-active' : ''}`}
                >
                  <span className="text-xl">{type.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-strong)]">{type.label}</p>
                    <p className="text-xs text-[var(--text-muted)]">{type.desc}</p>
                  </div>
                  {contentType === type.id && (
                    <svg className="ml-auto shrink-0 text-[var(--accent)]" width="16" height="16" fill="none" viewBox="0 0 24 24">
                      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </section>

          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Brief</p>
              <h2 className="section-title">브리프 입력</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[var(--text-strong)]">브랜드 / 제품명</label>
                <input className="input" placeholder="예: Garnet" value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[var(--text-strong)]">타겟 오디언스</label>
                <input className="input" placeholder="예: 20-35세 마케터, 스타트업 대표" value={form.target}
                  onChange={(e) => setForm({ ...form, target: e.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[var(--text-strong)]">톤앤매너</label>
                <input className="input" placeholder="예: 친근하고 전문적인" value={form.tone}
                  onChange={(e) => setForm({ ...form, tone: e.target.value })} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {TONE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setForm({ ...form, tone: preset })}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        form.tone === preset
                          ? 'border-[rgba(49,130,246,0.3)] bg-[var(--accent-soft)] text-[var(--accent)]'
                          : 'border-[var(--surface-border)] bg-[var(--surface-sub)] text-[var(--text-muted)] hover:text-[var(--text-base)]'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[var(--text-strong)]">핵심 메시지 <span className="text-rose-500">*</span></label>
                <textarea className="input min-h-[90px] resize-none" placeholder="전달하고 싶은 핵심 내용, 혜택, 프로모션 등을 입력해 주세요." value={form.keyMessage}
                  onChange={(e) => setForm({ ...form, keyMessage: e.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[var(--text-strong)]">추가 맥락 (선택)</label>
                <textarea className="input min-h-[60px] resize-none" placeholder="캠페인 배경, 특별 조건, 참고할 정보 등" value={form.additionalContext}
                  onChange={(e) => setForm({ ...form, additionalContext: e.target.value })} />
              </div>
            </div>

            <button
              type="button"
              className="button-primary w-full"
              onClick={handleGenerate}
              disabled={pending || !form.keyMessage.trim()}
            >
              {pending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  생성 중...
                </span>
              ) : `${selectedType.icon} ${selectedType.label} 생성하기`}
            </button>
          </section>
        </div>

        {/* ── Right: Output + History ── */}
        <div className="space-y-4">
          {/* Output */}
          <section className="panel min-h-[300px] space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Generated Output</p>
                <h2 className="section-title">
                  {selectedDraft ? `저장된 콘텐츠 · ${formatDate(selectedDraft.createdAt)}` : '생성된 콘텐츠'}
                </h2>
              </div>
              {activeResult && (
                <button type="button" onClick={() => handleCopy(activeResult)} className="button-secondary flex items-center gap-1.5">
                  {copied ? (
                    <><svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>복사됨</>
                  ) : (
                    <><svg width="14" height="14" fill="none" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>복사</>
                  )}
                </button>
              )}
            </div>

            {error && <div className="rounded-[8px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

            {!activeResult && !pending && !error && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[14px] bg-[var(--accent-soft)] text-2xl">{selectedType.icon}</div>
                <p className="text-sm font-semibold text-[var(--text-strong)]">{selectedType.label}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">왼쪽에 브리프를 입력하고 생성 버튼을 눌러보세요.</p>
              </div>
            )}

            {pending && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <svg className="mb-4 h-8 w-8 animate-spin text-[var(--accent)]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <p className="text-sm font-semibold text-[var(--text-strong)]">콘텐츠를 생성하고 있습니다...</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">AI가 최적의 문구를 만들고 있어요.</p>
              </div>
            )}

            {activeResult && !pending && (
              <div className="rounded-[10px] border border-[var(--surface-border)] bg-[var(--surface-sub)] p-4">
                <pre className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-base)]">{activeResult}</pre>
              </div>
            )}
          </section>

          {/* History */}
          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">History</p>
              <h2 className="section-title">생성 이력</h2>
            </div>
            {history.length === 0 ? (
              <div className="surface-note text-sm text-[var(--text-muted)]">아직 생성된 콘텐츠가 없습니다. 첫 번째 콘텐츠를 만들어보세요.</div>
            ) : (
              <div className="space-y-2">
                {history.map((draft) => (
                  <div
                    key={draft.id}
                    className={`list-card ${selectedDraft?.id === draft.id ? 'list-card-active' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => loadDraft(draft)}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base">{TYPE_ICONS[draft.contentType] || '📄'}</span>
                          <span className="pill-option">{TYPE_LABELS[draft.contentType] || draft.contentType}</span>
                          {draft.brand && <span className="pill-option">{draft.brand}</span>}
                          <span className="text-xs text-[var(--text-muted)]">{formatDate(draft.createdAt)}</span>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--text-base)]">{draft.keyMessage}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteDraft(draft.id)}
                        className="shrink-0 rounded-[6px] p-1 text-[var(--text-muted)] hover:bg-rose-50 hover:text-rose-600"
                        title="삭제"
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
