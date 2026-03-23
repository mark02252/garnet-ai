'use client';

import { useEffect, useState } from 'react';

type DailyTraffic = {
  date: string;
  activeUsers: number;
  sessions: number;
  screenPageViews: number;
  eventCount: number;
  conversions: number;
};

type ChannelBreakdown = {
  source: string;
  medium: string;
  sessions: number;
  activeUsers: number;
  conversions: number;
};

type PagePerformance = {
  pagePath: string;
  screenPageViews: number;
  activeUsers: number;
  averageSessionDuration: number;
};

type AiInsight = {
  summary: string;
  highlights: string[];
  recommendations: string[];
  anomalies: string[];
  generatedAt: string;
};

type DateRange = '7daysAgo' | '14daysAgo' | '30daysAgo';

export default function AnalyticsPage() {
  const [traffic, setTraffic] = useState<DailyTraffic[]>([]);
  const [channels, setChannels] = useState<ChannelBreakdown[]>([]);
  const [pages, setPages] = useState<PagePerformance[]>([]);
  const [insight, setInsight] = useState<AiInsight | null>(null);
  const [realtimeUsers, setRealtimeUsers] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('30daysAgo');

  useEffect(() => {
    fetchData();
    fetchRealtime();
    const interval = setInterval(fetchRealtime, 60_000);
    return () => clearInterval(interval);
  }, [dateRange]);

  async function fetchData() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/ga4/report?startDate=${dateRange}&endDate=today&type=all`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setTraffic(data.traffic || []);
      setChannels(data.channels || []);
      setPages(data.pages || []);
    } catch {
      setError('GA4 데이터를 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchRealtime() {
    try {
      const res = await fetch('/api/ga4/realtime');
      const data = await res.json();
      if (!data.error) setRealtimeUsers(data.activeUsers);
    } catch { /* silent */ }
  }

  async function runAiAnalysis() {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/ga4/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: dateRange, endDate: 'today' })
      });
      const data = await res.json();
      if (data.insight) setInsight(data.insight);
    } catch { /* silent */ }
    finally { setAnalyzing(false); }
  }

  const totalUsers = traffic.reduce((s, d) => s + d.activeUsers, 0);
  const totalSessions = traffic.reduce((s, d) => s + d.sessions, 0);
  const totalPageViews = traffic.reduce((s, d) => s + d.screenPageViews, 0);
  const totalConversions = traffic.reduce((s, d) => s + d.conversions, 0);

  if (error) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-xl font-bold text-[var(--text-strong)] mb-4">GA4 Analytics</h1>
        <div className="bg-[var(--surface)] rounded-xl p-8 text-center border border-[var(--surface-border)]">
          <p className="text-[var(--text-muted)] mb-2">GA4 연결이 필요합니다</p>
          <p className="text-sm text-[var(--text-disabled)]">{error}</p>
          <p className="text-sm text-[var(--text-disabled)] mt-4">
            설정 &gt; .env 파일에서 <code className="bg-[var(--surface-sub)] px-1.5 py-0.5 rounded text-xs">GA4_PROPERTY_ID</code>,{' '}
            <code className="bg-[var(--surface-sub)] px-1.5 py-0.5 rounded text-xs">GA4_CLIENT_EMAIL</code>,{' '}
            <code className="bg-[var(--surface-sub)] px-1.5 py-0.5 rounded text-xs">GA4_PRIVATE_KEY</code>를 설정하세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-strong)]">GA4 Analytics</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Google Analytics 4 성과 대시보드</p>
        </div>
        <div className="flex items-center gap-3">
          {realtimeUsers !== null && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--status-active-bg)] rounded-lg">
              <span className="w-2 h-2 rounded-full bg-[var(--status-active)] animate-pulse" />
              <span className="text-sm font-medium text-[var(--status-active)]">실시간 {realtimeUsers}명</span>
            </div>
          )}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="text-sm border border-[var(--surface-border)] rounded-lg px-3 py-1.5 bg-[var(--surface)]"
          >
            <option value="7daysAgo">최근 7일</option>
            <option value="14daysAgo">최근 14일</option>
            <option value="30daysAgo">최근 30일</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-[var(--text-muted)]">데이터를 불러오는 중...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: '활성 사용자', value: totalUsers.toLocaleString(), color: 'var(--accent)' },
              { label: '세션', value: totalSessions.toLocaleString(), color: 'var(--status-active)' },
              { label: '페이지뷰', value: totalPageViews.toLocaleString(), color: 'var(--status-paused)' },
              { label: '전환', value: totalConversions.toLocaleString(), color: 'var(--status-completed)' }
            ].map((kpi) => (
              <div key={kpi.label} className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--surface-border)]">
                <p className="text-xs text-[var(--text-muted)] mb-1">{kpi.label}</p>
                <p className="text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Traffic Chart (simple bar) */}
          <div className="bg-[var(--surface)] rounded-xl p-5 border border-[var(--surface-border)]">
            <h2 className="text-sm font-semibold text-[var(--text-strong)] mb-4">일별 활성 사용자</h2>
            <div className="flex items-end gap-1 h-32">
              {traffic.map((d) => {
                const max = Math.max(...traffic.map((t) => t.activeUsers), 1);
                const height = Math.max(4, (d.activeUsers / max) * 100);
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-[var(--accent)] min-w-[4px] transition-all"
                      style={{ height: `${height}%`, opacity: 0.7 + (d.activeUsers / max) * 0.3 }}
                      title={`${d.date}: ${d.activeUsers}명`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-[var(--text-disabled)]">
                {traffic[0]?.date || ''}
              </span>
              <span className="text-[10px] text-[var(--text-disabled)]">
                {traffic[traffic.length - 1]?.date || ''}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Channels */}
            <div className="bg-[var(--surface)] rounded-xl p-5 border border-[var(--surface-border)]">
              <h2 className="text-sm font-semibold text-[var(--text-strong)] mb-3">유입 채널 Top 10</h2>
              <div className="space-y-2">
                {channels.slice(0, 10).map((ch, i) => {
                  const maxSessions = Math.max(...channels.slice(0, 10).map((c) => c.sessions), 1);
                  const width = Math.max(8, (ch.sessions / maxSessions) * 100);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)] w-32 truncate">{ch.source}/{ch.medium}</span>
                      <div className="flex-1 h-5 bg-[var(--surface-sub)] rounded overflow-hidden">
                        <div className="h-full bg-[var(--accent)] rounded" style={{ width: `${width}%`, opacity: 0.7 }} />
                      </div>
                      <span className="text-xs font-medium text-[var(--text-base)] w-12 text-right">{ch.sessions}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Pages */}
            <div className="bg-[var(--surface)] rounded-xl p-5 border border-[var(--surface-border)]">
              <h2 className="text-sm font-semibold text-[var(--text-strong)] mb-3">상위 페이지</h2>
              <div className="space-y-2">
                {pages.slice(0, 10).map((pg, i) => (
                  <div key={i} className="flex items-center justify-between py-1">
                    <span className="text-xs text-[var(--text-base)] truncate max-w-[60%]">{pg.pagePath}</span>
                    <div className="flex gap-3">
                      <span className="text-xs text-[var(--text-muted)]">{pg.screenPageViews} views</span>
                      <span className="text-xs text-[var(--text-muted)]">{pg.activeUsers} users</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AI Insight */}
          <div className="bg-[var(--surface)] rounded-xl p-5 border border-[var(--surface-border)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[var(--text-strong)]">AI 성과 분석</h2>
              <button
                onClick={runAiAnalysis}
                disabled={analyzing}
                className="px-4 py-1.5 text-sm bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
              >
                {analyzing ? '분석 중...' : 'AI 분석 실행'}
              </button>
            </div>

            {insight ? (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-base)]">{insight.summary}</p>

                {insight.highlights.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-muted)] mb-1.5">주요 발견</p>
                    <ul className="space-y-1">
                      {insight.highlights.map((h, i) => (
                        <li key={i} className="text-sm text-[var(--text-base)] flex gap-2">
                          <span className="text-[var(--accent)]">-</span> {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {insight.recommendations.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-muted)] mb-1.5">개선 권고</p>
                    <ul className="space-y-1">
                      {insight.recommendations.map((r, i) => (
                        <li key={i} className="text-sm text-[var(--status-active)] flex gap-2">
                          <span>-</span> {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {insight.anomalies.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--status-failed)] mb-1.5">이상 징후</p>
                    <ul className="space-y-1">
                      {insight.anomalies.map((a, i) => (
                        <li key={i} className="text-sm text-[var(--status-failed)] flex gap-2">
                          <span>-</span> {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-disabled)] text-center py-6">
                'AI 분석 실행' 버튼을 클릭하면 GA4 데이터를 기반으로 인사이트를 생성합니다.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
