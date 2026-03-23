'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Recommendation = {
  priority: 'urgent' | 'high' | 'medium' | 'low';
  type: 'kpi' | 'campaign' | 'approval' | 'content' | 'seminar';
  title: string;
  reason: string;
  actionUrl: string;
};

const priorityStyles: Record<string, { bg: string; text: string; label: string }> = {
  urgent: { bg: 'var(--status-failed-bg)', text: 'var(--status-failed)', label: '긴급' },
  high: { bg: 'var(--status-paused-bg)', text: 'var(--status-paused)', label: '높음' },
  medium: { bg: 'var(--status-completed-bg)', text: 'var(--status-completed)', label: '참고' },
  low: { bg: 'var(--status-draft-bg)', text: 'var(--status-draft)', label: '낮음' }
};

const typeLabels: Record<string, string> = {
  kpi: 'KPI',
  campaign: '캠페인',
  approval: '승인',
  content: '콘텐츠',
  seminar: '세미나'
};

export function RecommendationsPanel() {
  const [items, setItems] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/recommendations')
      .then((r) => r.json())
      .then((data) => setItems(data.recommendations || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-sm text-[var(--text-disabled)] py-4">추천 액션을 분석 중...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-[var(--text-muted)]">
        현재 긴급한 추천 사항이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const style = priorityStyles[item.priority] || priorityStyles.medium;
        return (
          <Link
            key={i}
            href={item.actionUrl}
            className="block bg-[var(--surface)] rounded-lg p-3 border border-[var(--surface-border)] hover:border-[var(--accent)] transition-colors"
          >
            <div className="flex items-start gap-2">
              <span
                className="shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: style.bg, color: style.text }}
              >
                {style.label}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[var(--text-disabled)]">{typeLabels[item.type] || item.type}</span>
                </div>
                <p className="text-sm font-medium text-[var(--text-strong)] truncate">{item.title}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{item.reason}</p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
