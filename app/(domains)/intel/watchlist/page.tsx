'use client';

import { useEffect, useState, useRef } from 'react';

type WatchKeyword = {
  id: string;
  keyword: string;
  category: string;
  createdAt: string;
};

const CATEGORIES = [
  { value: 'BRAND', label: '브랜드' },
  { value: 'COMPETITOR', label: '경쟁사' },
  { value: 'TREND', label: '트렌드' },
  { value: 'GENERAL', label: '일반' },
];

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  BRAND:      { bg: '#eff6ff', color: '#3182f6' },
  COMPETITOR: { bg: '#fef2f2', color: '#ef4444' },
  TREND:      { bg: '#fffbeb', color: '#f59e0b' },
  GENERAL:    { bg: '#f3f4f6', color: '#6b7280' },
};

function formatDate(isoString: string) {
  const d = new Date(isoString);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function WatchlistPage() {
  const [keywords, setKeywords] = useState<WatchKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchKeywords = () => {
    setLoading(true);
    fetch('/api/watch-keywords')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.keywords ?? [];
        setKeywords(list);
      })
      .catch(() => setKeywords([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchKeywords(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/watch-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim(), category }),
      });
      if (!res.ok) throw new Error('등록 실패');
      setKeyword('');
      fetchKeywords();
      inputRef.current?.focus();
    } catch {
      setError('키워드 등록에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/watch-keywords/${id}`, { method: 'DELETE' });
      setKeywords((prev) => prev.filter((kw) => kw.id !== id));
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 32px', maxWidth: 860 }}>
      {/* Header */}
      <div>
        <p className="dashboard-eyebrow">Marketing Intelligence</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 className="dashboard-title" style={{ margin: 0 }}>워치리스트</h1>
          {keywords.length > 0 && (
            <span className="accent-pill" style={{ fontSize: 12, fontWeight: 700 }}>
              {keywords.length}개 키워드
            </span>
          )}
        </div>
        <p className="dashboard-copy" style={{ marginTop: 8 }}>모니터링할 키워드를 등록하고 관리하세요.</p>
      </div>

      {/* Add form */}
      <div className="panel" style={{ padding: '20px 24px' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          키워드 추가
        </p>
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}
        >
          <input
            ref={inputRef}
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="키워드 입력... (예: 경쟁사A, 트렌드키워드)"
            required
            style={{
              flex: '1 1 220px',
              padding: '10px 14px', fontSize: 14,
              border: '1px solid var(--surface-border)',
              borderRadius: 'var(--radius-sm, 8px)',
              background: 'var(--surface)',
              color: 'var(--text-strong)',
              outline: 'none',
              minWidth: 0,
            }}
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              padding: '10px 14px', fontSize: 14,
              border: '1px solid var(--surface-border)',
              borderRadius: 'var(--radius-sm, 8px)',
              background: 'var(--surface)',
              color: 'var(--text-strong)',
              cursor: 'pointer', outline: 'none',
              flexShrink: 0,
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <button
            type="submit"
            disabled={submitting || !keyword.trim()}
            className="button-primary"
            style={{
              padding: '10px 22px',
              fontSize: 14,
              fontWeight: 600,
              flexShrink: 0,
              opacity: submitting || !keyword.trim() ? 0.6 : 1,
              cursor: submitting || !keyword.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? '등록 중...' : '+ 추가'}
          </button>
        </form>
        {error && (
          <p style={{ fontSize: 13, color: '#ef4444', marginTop: 10, padding: '8px 12px', background: '#fef2f2', borderRadius: 8 }}>
            {error}
          </p>
        )}
      </div>

      {/* Keyword list */}
      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>불러오는 중...</p>
      ) : keywords.length === 0 ? (
        <div className="soft-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <p style={{ color: 'var(--text-strong)', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            등록된 키워드가 없습니다
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            위 폼에서 첫 번째 키워드를 추가해 보세요.
          </p>
          <button
            className="button-primary"
            onClick={() => inputRef.current?.focus()}
            style={{ padding: '10px 24px', fontSize: 14 }}
          >
            키워드 추가하기
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {keywords.map((kw) => {
            const colors = CATEGORY_COLORS[kw.category] ?? CATEGORY_COLORS.GENERAL;
            const catLabel = CATEGORIES.find((c) => c.value === kw.category)?.label ?? kw.category;
            const isDeleting = deletingId === kw.id;
            return (
              <div
                key={kw.id}
                className="list-card"
                style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', gap: 12,
                  opacity: isDeleting ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <span
                    className="status-badge"
                    style={{
                      background: colors.bg, color: colors.color,
                      fontSize: 11, fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {catLabel}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {kw.keyword}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {kw.keyword.startsWith('http') && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/playwright', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'capture', url: kw.keyword }),
                          })
                          if (res.ok) alert('스크린샷 캡처 완료')
                          else alert('캡처 실패')
                        } catch { alert('캡처 실패') }
                      }}
                      title="경쟁사 스크린샷 캡처"
                      style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 4,
                        border: '1px solid rgba(201,53,69,0.2)', background: 'rgba(201,53,69,0.06)',
                        color: '#E8707E', cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      스캔
                    </button>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {formatDate(kw.createdAt)}
                  </span>
                  <button
                    onClick={() => handleDelete(kw.id)}
                    disabled={isDeleting}
                    title="삭제"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: 6,
                      border: '1px solid var(--surface-border)',
                      background: 'transparent', cursor: isDeleting ? 'not-allowed' : 'pointer',
                      color: 'var(--text-muted)',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2';
                      (e.currentTarget as HTMLButtonElement).style.color = '#ef4444';
                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#fecaca';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--surface-border)';
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
