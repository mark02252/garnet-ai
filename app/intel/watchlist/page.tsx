'use client';

import { useEffect, useState, useRef } from 'react';

type WatchKeyword = {
  id: string;
  keyword: string;
  category: string;
  created_at: string;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <p className="dashboard-eyebrow">마케팅 인텔리전스</p>
        <h1 className="dashboard-title">워치리스트</h1>
        <p className="dashboard-copy">모니터링할 키워드를 등록하고 관리하세요.</p>
      </div>

      {/* Add form */}
      <div className="soft-card" style={{ padding: '20px 24px' }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>
          키워드 추가
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px' }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>키워드</label>
            <input
              ref={inputRef}
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="키워드 입력..."
              required
              style={{
                padding: '8px 12px', fontSize: 14, border: '1px solid var(--surface-border)',
                borderRadius: 'var(--radius-sm)', background: 'var(--surface)',
                color: 'var(--text-strong)', outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>카테고리</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                padding: '8px 12px', fontSize: 14, border: '1px solid var(--surface-border)',
                borderRadius: 'var(--radius-sm)', background: 'var(--surface)',
                color: 'var(--text-strong)', cursor: 'pointer', outline: 'none',
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting || !keyword.trim()}
            className="accent-pill"
            style={{
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              border: 'none',
              padding: '8px 20px',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {submitting ? '등록 중...' : '추가'}
          </button>
        </form>
        {error && (
          <p style={{ fontSize: 13, color: '#ef4444', marginTop: 8 }}>{error}</p>
        )}
      </div>

      {/* Keyword list */}
      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>불러오는 중...</p>
      ) : keywords.length === 0 ? (
        <div className="soft-card" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>등록된 키워드가 없습니다.</p>
          <p style={{ color: 'var(--text-disabled)', fontSize: 13, marginTop: 6 }}>
            위 폼에서 첫 번째 키워드를 추가해 보세요.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {keywords.map((kw) => {
            const colors = CATEGORY_COLORS[kw.category] ?? CATEGORY_COLORS.GENERAL;
            const catLabel = CATEGORIES.find((c) => c.value === kw.category)?.label ?? kw.category;
            return (
              <div
                key={kw.id}
                className="list-card"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    className="status-badge"
                    style={{ background: colors.bg, color: colors.color, fontSize: 11 }}
                  >
                    {catLabel}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
                    {kw.keyword}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {formatDate(kw.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
