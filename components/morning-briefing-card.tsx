'use client';

import { useEffect, useState } from 'react';

type Digest = {
  id: string;
  headline: string;
  item_count: number;
  insights: string[];
  actions: string[];
  created_at: string;
};

function formatKoreanDate(isoString: string) {
  const d = new Date(isoString);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = weekdays[d.getDay()];
  return `${year}년 ${month}월 ${day}일 (${weekday})`;
}

export function MorningBriefingCard() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/intel/digests?type=daily&limit=1')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.digests ?? [];
        setDigest(list[0] ?? null);
      })
      .catch(() => setDigest(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="soft-card" style={{ padding: '20px 24px' }}>
        <p className="metric-label">오늘의 브리핑</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>불러오는 중...</p>
      </div>
    );
  }

  if (!digest) {
    return (
      <div className="soft-card" style={{ padding: '20px 24px' }}>
        <p className="metric-label">오늘의 브리핑</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          아직 생성된 브리핑이 없습니다. 브리핑을 실행해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="soft-card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p className="metric-label">오늘의 브리핑</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {formatKoreanDate(digest.created_at)} · 항목 {digest.item_count}개
          </p>
        </div>
      </div>

      {/* Headline */}
      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', lineHeight: 1.5 }}>
        {digest.headline}
      </p>

      {/* Insights */}
      {digest.insights && digest.insights.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>
            인사이트
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {digest.insights.map((insight, i) => (
              <span key={i} className="accent-pill" style={{ fontSize: 12 }}>
                {insight}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {digest.actions && digest.actions.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>
            권장 액션
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {digest.actions.map((action, i) => (
              <span key={i} className="status-badge" style={{ fontSize: 12 }}>
                {action}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
