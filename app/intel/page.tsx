'use client';

import { useEffect, useState } from 'react';

type IntelItem = {
  id: string;
  platform: string;
  urgency: string;
  title: string;
  snippet: string;
  tags: string[];
  published_at: string;
  url: string;
  relevance_score: number;
};

const PLATFORMS = [
  { label: '전체', value: '' },
  { label: '웹/뉴스', value: 'web' },
  { label: '네이버', value: 'naver' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Twitter', value: 'twitter' },
  { label: 'Reddit', value: 'reddit' },
];

const URGENCY_COLORS: Record<string, { bg: string; color: string }> = {
  high:   { bg: '#fef2f2', color: '#ef4444' },
  medium: { bg: '#fffbeb', color: '#f59e0b' },
  low:    { bg: '#f0fdf4', color: '#22c55e' },
};

const PLATFORM_COLORS: Record<string, string> = {
  web:     '#3182f6',
  naver:   '#03C75A',
  youtube: '#FF0000',
  twitter: '#1DA1F2',
  reddit:  '#FF4500',
};

function formatDate(isoString: string) {
  const d = new Date(isoString);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function IntelPage() {
  const [items, setItems] = useState<IntelItem[]>([]);
  const [platform, setPlatform] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = platform ? `?platform=${platform}` : '';
    fetch(`/api/intel${params}`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.items ?? [];
        setItems(list);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [platform]);

  const urgency = (u: string) => {
    const colors = URGENCY_COLORS[u?.toLowerCase()] ?? { bg: '#f3f4f6', color: '#6b7680' };
    return (
      <span
        className="status-badge"
        style={{ background: colors.bg, color: colors.color, fontSize: 11 }}
      >
        {u === 'high' ? '긴급' : u === 'medium' ? '중요' : '일반'}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <p className="dashboard-eyebrow">마케팅 인텔리전스</p>
        <h1 className="dashboard-title">마케팅 인텔</h1>
        <p className="dashboard-copy">수집된 마케팅 인텔리전스 피드를 확인하세요.</p>
      </div>

      {/* Platform filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PLATFORMS.map((p) => (
          <button
            key={p.value}
            className={platform === p.value ? 'accent-pill' : 'pill-option'}
            onClick={() => setPlatform(p.value)}
            style={{ cursor: 'pointer', border: 'none' }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>불러오는 중...</p>
      ) : items.length === 0 ? (
        <div className="soft-card" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>수집된 인텔리전스 항목이 없습니다.</p>
          <p style={{ color: 'var(--text-disabled)', fontSize: 13, marginTop: 6 }}>
            워치리스트 키워드를 설정하고 인텔 수집을 실행해 보세요.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="list-card"
              style={{ textDecoration: 'none', display: 'block' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    className="status-badge"
                    style={{
                      background: `${PLATFORM_COLORS[item.platform?.toLowerCase()] ?? '#6b7280'}18`,
                      color: PLATFORM_COLORS[item.platform?.toLowerCase()] ?? '#6b7280',
                      fontSize: 11,
                    }}
                  >
                    {item.platform}
                  </span>
                  {urgency(item.urgency)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {item.relevance_score != null && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      관련성 {Math.round(item.relevance_score * 100)}%
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {formatDate(item.published_at)}
                  </span>
                </div>
              </div>

              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 4, lineHeight: 1.4 }}>
                {item.title}
              </p>

              {item.snippet && (
                <p style={{ fontSize: 13, color: 'var(--text-base)', lineHeight: 1.55, marginBottom: 8 }}>
                  {item.snippet.slice(0, 200)}{item.snippet.length > 200 ? '...' : ''}
                </p>
              )}

              {item.tags && item.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {item.tags.map((tag) => (
                    <span key={tag} className="pill-option" style={{ fontSize: 11 }}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
