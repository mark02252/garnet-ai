'use client';

import { useEffect, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Constants ────────────────────────────────────────────────────────────────

const PLATFORMS = [
  { label: '전체', value: '' },
  { label: '웹/뉴스', value: 'SERPER' },
  { label: '네이버', value: 'NAVER' },
  { label: 'YouTube', value: 'YOUTUBE' },
  { label: 'Twitter', value: 'TWITTER' },
  { label: 'Reddit', value: 'REDDIT' },
];

const URGENCY_FILTERS = [
  { label: '전체', value: '' },
  { label: '긴급', value: 'CRITICAL' },
  { label: '높음', value: 'HIGH' },
  { label: '일반', value: 'NORMAL' },
];

const SORT_OPTIONS = [
  { label: '관련도순', value: 'relevance' },
  { label: '최신순', value: 'createdAt' },
];

const URGENCY_MAP: Record<string, { label: string; bg: string; color: string }> = {
  CRITICAL: { label: '긴급',   bg: '#fef2f2', color: '#dc2626' },
  HIGH:     { label: '높음',   bg: '#fff7ed', color: '#ea580c' },
  NORMAL:   { label: '일반',   bg: '#f3f4f6', color: '#6b7280' },
  LOW:      { label: '낮음',   bg: '#f0fdf4', color: '#16a34a' },
};

const PLATFORM_COLORS: Record<string, string> = {
  SERPER:  '#3182f6',
  NAVER:   '#03C75A',
  YOUTUBE: '#FF0000',
  TWITTER: '#1DA1F2',
  REDDIT:  '#FF4500',
};

const PLATFORM_LABELS: Record<string, string> = {
  SERPER:  '웹/뉴스',
  NAVER:   '네이버',
  YOUTUBE: 'YouTube',
  TWITTER: 'Twitter',
  REDDIT:  'Reddit',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return '방금';
  if (hours < 1)  return `${mins}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7)   return `${days}일 전`;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function parseTags(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function relevanceColor(r: number): string {
  const pct = r * 100;
  if (pct >= 70) return '#16a34a';
  if (pct >= 40) return '#ea580c';
  return '#9ca3af';
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  badge,
}: {
  label: string;
  value: string | number;
  badge?: { text: string; bg: string; color: string };
}) {
  return (
    <div
      className="metric-card"
      style={{
        flex: '1 1 120px',
        minWidth: 110,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1 }}>
          {value}
        </span>
        {badge && (
          <span
            className="status-badge"
            style={{ background: badge.bg, color: badge.color, fontSize: 10, fontWeight: 700 }}
          >
            {badge.text}
          </span>
        )}
      </div>
    </div>
  );
}

function PillBar<T extends string>({
  options,
  active,
  onChange,
}: {
  options: { label: string; value: T }[];
  active: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button
          key={o.value}
          className={active === o.value ? 'accent-pill' : 'pill-option'}
          onClick={() => onChange(o.value)}
          style={{ cursor: 'pointer', border: 'none' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function IntelCard({ item }: { item: IntelItem }) {
  const urg      = URGENCY_MAP[item.urgency] ?? URGENCY_MAP.NORMAL;
  const platColor = PLATFORM_COLORS[item.platform] ?? '#6b7280';
  const platLabel = PLATFORM_LABELS[item.platform] ?? item.platform;
  const tags      = parseTags(item.tags);
  const relPct    = Math.round(item.relevance * 100);
  const relColor  = relevanceColor(item.relevance);

  return (
    <div
      className="soft-card"
      style={{
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'box-shadow 0.15s',
      }}
    >
      {/* Top row: badges + relevance + date */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* Platform badge */}
          <span
            className="status-badge"
            style={{
              background: `${platColor}18`,
              color: platColor,
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              padding: '2px 8px',
            }}
          >
            {platLabel}
          </span>
          {/* Urgency badge */}
          <span
            className="status-badge"
            style={{
              background: urg.bg,
              color: urg.color,
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 6,
              padding: '2px 8px',
            }}
          >
            {urg.label}
          </span>
          {/* Relevance */}
          {relPct > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: relColor,
                background: `${relColor}14`,
                borderRadius: 6,
                padding: '2px 8px',
              }}
            >
              관련도 {relPct}%
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
          {formatRelativeTime(item.createdAt)}
        </span>
      </div>

      {/* Title */}
      <p
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--text-strong)',
          lineHeight: 1.45,
          margin: 0,
        }}
      >
        {item.title}
      </p>

      {/* Snippet */}
      {item.snippet && (
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-base)',
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {item.snippet.length > 200 ? `${item.snippet.slice(0, 200)}…` : item.snippet}
        </p>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="pill-option"
              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99 }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer: 원문 보기 */}
      {item.url && (
        <div style={{ marginTop: 2 }}>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--accent)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 13 }}>🔗</span> 원문 보기
          </a>
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasSearchKey }: { hasSearchKey: boolean | null }) {
  const noKey = hasSearchKey === false;
  return (
    <div
      className="soft-card"
      style={{
        padding: '64px 32px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'var(--surface-raised)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
        }}
      >
        {noKey ? '🔑' : '📡'}
      </div>
      <div>
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 6px' }}>
          {noKey ? 'API 키가 설정되지 않았습니다' : '수집된 인텔리전스가 없습니다'}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
          {noKey ? (
            <>
              검색 API 키(<code style={{ background: 'var(--surface-raised)', padding: '1px 6px', borderRadius: 4 }}>SEARCH_API_KEY</code>)가 없으면<br />
              웹/뉴스 수집이 실행되지 않습니다. .env에 키를 추가해 주세요.
            </>
          ) : (
            <>
              워치리스트에 키워드를 추가하고 수집을 실행해보세요.
              <br />
              크론 스케줄러가 자동으로 인사이트를 수집합니다.
            </>
          )}
        </p>
      </div>
      <a
        href={noKey ? '/settings' : '/watchlist'}
        style={{
          marginTop: 4,
          padding: '10px 24px',
          borderRadius: 8,
          background: 'var(--accent)',
          color: '#fff',
          fontWeight: 600,
          fontSize: 13,
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        {noKey ? '설정으로 이동' : '워치리스트 설정하기'}
      </a>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function IntelPage() {
  const [allItems, setAllItems]     = useState<IntelItem[]>([]);
  const [platform, setPlatform]     = useState('');
  const [urgency, setUrgency]       = useState('');
  const [sort, setSort]             = useState<'relevance' | 'createdAt'>('relevance');
  const [loading, setLoading]       = useState(true);
  const [fetchedAt, setFetchedAt]   = useState<Date | null>(null);
  const [hasSearchKey, setHasSearchKey] = useState<boolean | null>(null);

  // 최초 1회: 검색 API 키 설정 여부 확인
  useEffect(() => {
    fetch('/api/env-status')
      .then((r) => r.json())
      .then((d) => setHasSearchKey(Boolean(d?.keyStatus?.searchApiKey)))
      .catch(() => setHasSearchKey(null));
  }, []);

  // Fetch on platform change (server-side filter)
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (platform) params.set('platform', platform);
    fetch(`/api/intel?${params}`)
      .then((r) => r.json())
      .then((data) => {
        const list: IntelItem[] = data?.items ?? [];
        // 최근 3일 + 관련도 0.1 이상
        const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
        const filtered = list.filter(
          (item) => new Date(item.createdAt).getTime() >= threeDaysAgo && item.relevance >= 0.1,
        );
        setAllItems(filtered);
        setFetchedAt(new Date());
      })
      .catch(() => setAllItems([]))
      .finally(() => setLoading(false));
  }, [platform]);

  // Client-side urgency filter + sort
  const displayItems = [...allItems]
    .filter((item) => !urgency || item.urgency === urgency)
    .sort((a, b) =>
      sort === 'relevance'
        ? b.relevance - a.relevance
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  // Stats
  const criticalCount  = allItems.filter((i) => i.urgency === 'CRITICAL').length;
  const highCount      = allItems.filter((i) => i.urgency === 'HIGH').length;
  const platformCount  = new Set(allItems.map((i) => i.platform)).size;

  const hoursAgo = fetchedAt
    ? Math.round((Date.now() - fetchedAt.getTime()) / 3600000)
    : null;
  const fetchedLabel = hoursAgo === null
    ? '—'
    : hoursAgo < 1
    ? '방금'
    : `${hoursAgo}시간 전`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <p className="dashboard-eyebrow">Marketing Intelligence</p>
          <h1 className="dashboard-title">마케팅 인텔</h1>
          <p className="dashboard-copy">AI가 자동 수집하고 분석한 마케팅 인사이트</p>
        </div>

        {/* 수집 현황 */}
        {!loading && fetchedAt && (
          <div
            className="soft-card"
            style={{
              padding: '12px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              minWidth: 160,
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>수집 현황</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>
              총 {allItems.length}건
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              최근 수집: {fetchedLabel}
            </span>
          </div>
        )}
      </div>

      {/* ── Stats Row ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="전체 수집" value={`${allItems.length}건`} />
        <StatCard
          label="긴급"
          value={`${criticalCount}건`}
          badge={criticalCount > 0 ? { text: 'CRITICAL', bg: '#fef2f2', color: '#dc2626' } : undefined}
        />
        <StatCard
          label="높음"
          value={`${highCount}건`}
          badge={highCount > 0 ? { text: 'HIGH', bg: '#fff7ed', color: '#ea580c' } : undefined}
        />
        <StatCard label="플랫폼" value={`${platformCount}개`} />
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────────── */}
      <div className="panel" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Platform */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, minWidth: 42 }}>플랫폼</span>
          <PillBar
            options={PLATFORMS as { label: string; value: string }[]}
            active={platform}
            onChange={setPlatform}
          />
        </div>

        {/* Urgency */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, minWidth: 42 }}>중요도</span>
          <PillBar
            options={URGENCY_FILTERS as { label: string; value: string }[]}
            active={urgency}
            onChange={setUrgency}
          />
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, minWidth: 42 }}>정렬</span>
          <PillBar
            options={SORT_OPTIONS as { label: string; value: string }[]}
            active={sort}
            onChange={(v) => setSort(v as 'relevance' | 'createdAt')}
          />
        </div>
      </div>

      {/* ── Feed ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="soft-card"
              style={{
                padding: '16px 20px',
                height: 120,
                background: 'var(--surface-raised)',
                opacity: 0.5,
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
            인텔리전스 불러오는 중...
          </p>
        </div>
      ) : displayItems.length === 0 ? (
        <EmptyState hasSearchKey={hasSearchKey} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Count label */}
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            {displayItems.length}건 표시 (최근 3일)
          </p>

          {/* Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayItems.map((item) => (
              <IntelCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
