'use client';

import { useEffect, useState } from 'react';

type IntelItem = {
  id: string;
  platform: string;
  urgency: string;
  title: string;
  snippet: string;
  tags: string;
  url: string;
  relevance: number;
  createdAt: string;
};

const PLATFORMS = [
  { label: '전체', value: '' },
  { label: '웹/뉴스', value: 'SERPER' },
  { label: '네이버', value: 'NAVER' },
  { label: 'YouTube', value: 'YOUTUBE' },
  { label: 'Twitter', value: 'TWITTER' },
  { label: 'Reddit', value: 'REDDIT' },
];

const URGENCY_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  CRITICAL: { label: '긴급', bg: '#fef2f2', color: '#dc2626' },
  HIGH:     { label: '높음', bg: '#fff7ed', color: '#ea580c' },
  NORMAL:   { label: '일반', bg: '#f3f4f6', color: '#6b7280' },
  LOW:      { label: '낮음', bg: '#f0fdf4', color: '#16a34a' },
};

const PLATFORM_COLORS: Record<string, string> = {
  SERPER:  '#3182f6',
  NAVER:   '#03C75A',
  YOUTUBE: '#FF0000',
  TWITTER: '#1DA1F2',
  REDDIT:  '#FF4500',
};

const PLATFORM_LABELS: Record<string, string> = {
  SERPER: '웹/뉴스',
  NAVER: '네이버',
  YOUTUBE: 'YouTube',
  TWITTER: 'Twitter',
  REDDIT: 'Reddit',
};

function formatDate(isoString: string) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return '방금 전';
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function IntelPage() {
  const [items, setItems] = useState<IntelItem[]>([]);
  const [platform, setPlatform] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (platform) params.set('platform', platform);
    fetch(`/api/intel?${params}`)
      .then((r) => r.json())
      .then((data) => {
        const list: IntelItem[] = data?.items ?? [];
        // 최근 3일 + 관련도 0.1 이상만 표시
        const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
        const filtered = list.filter((item) => {
          const created = new Date(item.createdAt).getTime();
          return created >= threeDaysAgo && item.relevance >= 0.1;
        });
        // 관련도 높은 순 정렬
        filtered.sort((a, b) => b.relevance - a.relevance);
        setItems(filtered);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [platform]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <p className="dashboard-eyebrow">마케팅 인텔리전스</p>
        <h1 className="dashboard-title">마케팅 인텔</h1>
        <p className="dashboard-copy">최근 3일간 수집된 핵심 인텔리전스를 관련도순으로 확인하세요.</p>
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

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>불러오는 중...</p>
      ) : items.length === 0 ? (
        <div className="soft-card" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>수집된 인텔리전스가 없습니다.</p>
          <p style={{ color: 'var(--text-disabled)', fontSize: 13, marginTop: 6 }}>
            워치리스트 키워드를 설정하고 수집을 실행해보세요.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {items.length}건 표시 (최근 3일, 관련도 10% 이상)
          </p>
          {items.map((item) => {
            const urg = URGENCY_STYLES[item.urgency] || URGENCY_STYLES.NORMAL;
            const platColor = PLATFORM_COLORS[item.platform] || '#6b7280';
            const platLabel = PLATFORM_LABELS[item.platform] || item.platform;
            let parsedTags: string[] = [];
            try { parsedTags = typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags || []; } catch { /* */ }

            return (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="list-card"
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="status-badge" style={{ background: `${platColor}18`, color: platColor, fontSize: 11 }}>
                      {platLabel}
                    </span>
                    <span className="status-badge" style={{ background: urg.bg, color: urg.color, fontSize: 11 }}>
                      {urg.label}
                    </span>
                    {item.relevance > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                        관련도 {Math.round(item.relevance * 100)}%
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {formatDate(item.createdAt)}
                  </span>
                </div>

                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 4, lineHeight: 1.4 }}>
                  {item.title}
                </p>

                {item.snippet && (
                  <p style={{ fontSize: 13, color: 'var(--text-base)', lineHeight: 1.55, marginBottom: 8 }}>
                    {item.snippet.slice(0, 200)}{item.snippet.length > 200 ? '...' : ''}
                  </p>
                )}

                {parsedTags.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {parsedTags.slice(0, 5).map((tag) => (
                      <span key={tag} className="pill-option" style={{ fontSize: 11 }}>#{tag}</span>
                    ))}
                  </div>
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
