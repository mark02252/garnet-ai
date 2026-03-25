'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────────────────

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

type EngagementMetric = {
  date: string;
  engagementRate: number;
  bounceRate: number;
  averageSessionDuration: number;
  screenPageViewsPerSession: number;
};

type DeviceBreakdown = {
  deviceCategory: string;
  sessions: number;
  activeUsers: number;
  engagementRate: number;
};

type GeoBreakdown = {
  country: string;
  activeUsers: number;
  sessions: number;
};

type LandingPage = {
  landingPage: string;
  sessions: number;
  bounceRate: number;
  engagementRate: number;
};

type AiInsight = {
  summary: string;
  highlights: string[];
  recommendations: string[];
  anomalies: string[];
  generatedAt: string;
};

type DateRange = '7daysAgo' | '14daysAgo' | '30daysAgo' | '90daysAgo';

// ── Demo Data ──────────────────────────────────────────────────────────────

function generateDemoTraffic(days = 30): DailyTraffic[] {
  const data: DailyTraffic[] = [];
  const base = new Date('2026-03-25');
  const trend = [0.7, 0.75, 0.8, 0.85, 0.88, 0.9, 0.92, 0.95, 0.97, 1.0];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().slice(0, 10).replace(/-/g, '');
    const factor = trend[Math.min(Math.floor((days - 1 - i) / (days / 10)), 9)];
    const weekday = d.getDay();
    const weekendBoost = weekday === 0 || weekday === 6 ? 0.85 : 1.0;
    const users = Math.floor((800 + Math.random() * 300) * factor * weekendBoost);
    data.push({
      date: dayStr,
      activeUsers: users,
      sessions: Math.floor(users * 1.29),
      screenPageViews: Math.floor(users * 6.3),
      eventCount: Math.floor(users * 5),
      conversions: Math.floor(users * 0.08),
    });
  }
  return data;
}

const DEMO_CHANNELS: ChannelBreakdown[] = [
  { source: 'google', medium: 'organic', sessions: 11420, activeUsers: 8670, conversions: 344 },
  { source: 'instagram', medium: 'social', sessions: 5856, activeUsers: 4380, conversions: 188 },
  { source: '(direct)', medium: '(none)', sessions: 4334, activeUsers: 3290, conversions: 122 },
  { source: 'naver', medium: 'organic', sessions: 2978, activeUsers: 2210, conversions: 91 },
  { source: 'blog.naver', medium: 'referral', sessions: 1956, activeUsers: 1330, conversions: 55 },
  { source: 'facebook', medium: 'social', sessions: 1234, activeUsers: 980, conversions: 40 },
  { source: 'kakao', medium: 'social', sessions: 890, activeUsers: 720, conversions: 32 },
  { source: 'youtube', medium: 'social', sessions: 670, activeUsers: 540, conversions: 21 },
  { source: 'twitter', medium: 'social', sessions: 340, activeUsers: 280, conversions: 9 },
  { source: 'newsletter', medium: 'email', sessions: 218, activeUsers: 190, conversions: 14 },
];

const DEMO_PAGES: PagePerformance[] = [
  { pagePath: '/', screenPageViews: 28340, activeUsers: 18890, averageSessionDuration: 45 },
  { pagePath: '/promotion/spring-2026', screenPageViews: 11120, activeUsers: 7560, averageSessionDuration: 72 },
  { pagePath: '/menu', screenPageViews: 8890, activeUsers: 5420, averageSessionDuration: 38 },
  { pagePath: '/reservation', screenPageViews: 6670, activeUsers: 4310, averageSessionDuration: 120 },
  { pagePath: '/about', screenPageViews: 4450, activeUsers: 2880, averageSessionDuration: 25 },
  { pagePath: '/blog/marketing-tips', screenPageViews: 3380, activeUsers: 2210, averageSessionDuration: 180 },
  { pagePath: '/contact', screenPageViews: 2230, activeUsers: 1900, averageSessionDuration: 15 },
  { pagePath: '/pricing', screenPageViews: 1940, activeUsers: 1500, averageSessionDuration: 55 },
  { pagePath: '/blog/seo-guide-2026', screenPageViews: 1720, activeUsers: 1310, averageSessionDuration: 210 },
  { pagePath: '/careers', screenPageViews: 890, activeUsers: 770, averageSessionDuration: 40 },
];

const DEMO_ENGAGEMENT: EngagementMetric[] = Array.from({ length: 30 }, (_, i) => {
  const base = new Date('2026-03-25');
  base.setDate(base.getDate() - (29 - i));
  const dateStr = base.toISOString().slice(0, 10).replace(/-/g, '');
  const engRate = 0.58 + Math.random() * 0.12 + (i > 20 ? 0.04 : 0);
  return {
    date: dateStr,
    engagementRate: Math.min(engRate, 0.95),
    bounceRate: 1 - engRate + Math.random() * 0.05,
    averageSessionDuration: 120 + Math.random() * 60,
    screenPageViewsPerSession: 3 + Math.random() * 2,
  };
});

const DEMO_DEVICES: DeviceBreakdown[] = [
  { deviceCategory: 'mobile', sessions: 21450, activeUsers: 17200, engagementRate: 0.61 },
  { deviceCategory: 'desktop', sessions: 12890, activeUsers: 9340, engagementRate: 0.68 },
  { deviceCategory: 'tablet', sessions: 2578, activeUsers: 1980, engagementRate: 0.57 },
];

const DEMO_GEO: GeoBreakdown[] = [
  { country: '대한민국', activeUsers: 24560, sessions: 31200 },
  { country: '미국', activeUsers: 1890, sessions: 2340 },
  { country: '일본', activeUsers: 940, sessions: 1180 },
  { country: '캐나다', activeUsers: 380, sessions: 460 },
  { country: '싱가포르', activeUsers: 290, sessions: 350 },
  { country: '호주', activeUsers: 210, sessions: 260 },
  { country: '영국', activeUsers: 180, sessions: 220 },
  { country: '독일', activeUsers: 140, sessions: 170 },
  { country: '프랑스', activeUsers: 110, sessions: 135 },
  { country: '중국', activeUsers: 90, sessions: 108 },
];

const DEMO_LANDING_PAGES: LandingPage[] = [
  { landingPage: '/', sessions: 14200, bounceRate: 0.32, engagementRate: 0.68 },
  { landingPage: '/promotion/spring-2026', sessions: 6800, bounceRate: 0.41, engagementRate: 0.59 },
  { landingPage: '/blog/marketing-tips', sessions: 3200, bounceRate: 0.28, engagementRate: 0.72 },
  { landingPage: '/menu', sessions: 2900, bounceRate: 0.55, engagementRate: 0.45 },
  { landingPage: '/reservation', sessions: 2400, bounceRate: 0.22, engagementRate: 0.78 },
  { landingPage: '/about', sessions: 1800, bounceRate: 0.62, engagementRate: 0.38 },
  { landingPage: '/pricing', sessions: 1600, bounceRate: 0.48, engagementRate: 0.52 },
  { landingPage: '/blog/seo-guide-2026', sessions: 1400, bounceRate: 0.24, engagementRate: 0.76 },
  { landingPage: '/contact', sessions: 980, bounceRate: 0.71, engagementRate: 0.29 },
  { landingPage: '/careers', sessions: 760, bounceRate: 0.58, engagementRate: 0.42 },
  { landingPage: '/blog/sns-trend', sessions: 640, bounceRate: 0.33, engagementRate: 0.67 },
  { landingPage: '/gallery', sessions: 520, bounceRate: 0.44, engagementRate: 0.56 },
  { landingPage: '/faq', sessions: 410, bounceRate: 0.66, engagementRate: 0.34 },
  { landingPage: '/login', sessions: 380, bounceRate: 0.19, engagementRate: 0.81 },
  { landingPage: '/terms', sessions: 210, bounceRate: 0.78, engagementRate: 0.22 },
];

const DEMO_INSIGHT: AiInsight = {
  summary:
    '최근 30일간 활성 사용자가 전월 대비 12.3% 증가했으며, Instagram 유입이 특히 강세입니다. 전환율은 3.2%로 업계 평균(2.5%)을 상회하고 있습니다.',
  highlights: [
    'Google Organic이 전체 유입의 38%를 차지하며 가장 안정적인 채널입니다.',
    'Instagram 소셜 유입이 전주 대비 23% 증가 — 최근 콘텐츠 캠페인 효과로 분석됩니다.',
    '예약 페이지 체류 시간이 평균 2분으로 전환 의도가 높은 트래픽입니다.',
    '모바일 참여율이 데스크탑 대비 7%p 낮아 모바일 UX 개선 여지가 있습니다.',
  ],
  recommendations: [
    'Naver 블로그 콘텐츠를 주 2회로 확대하면 organic 유입 20% 추가 성장이 기대됩니다.',
    '예약 페이지 CTA 버튼 최적화로 전환율 0.5%p 추가 개선 가능성이 있습니다.',
    '이탈률이 70% 이상인 페이지(terms, contact)는 콘텐츠 재구성이 필요합니다.',
  ],
  anomalies: [
    '3월 15일 트래픽이 평소 대비 45% 급감 — 서버 장애 또는 외부 요인 확인이 필요합니다.',
  ],
  generatedAt: new Date().toISOString(),
};

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  return `${parseInt(m)}/${parseInt(d)}`;
}

function calcWoW(data: DailyTraffic[], key: keyof DailyTraffic): number {
  if (data.length < 2) return 0;
  const mid = Math.floor(data.length / 2);
  const prev = data.slice(0, mid).reduce((s, d) => s + (d[key] as number), 0);
  const curr = data.slice(mid).reduce((s, d) => s + (d[key] as number), 0);
  if (prev === 0) return 0;
  return ((curr - prev) / prev) * 100;
}

function calcEngagementAvg(data: EngagementMetric[]): number {
  if (!data.length) return 0;
  return data.reduce((s, d) => s + d.engagementRate, 0) / data.length;
}

function calcEngagementWoW(data: EngagementMetric[]): number {
  if (data.length < 2) return 0;
  const mid = Math.floor(data.length / 2);
  const prev = data.slice(0, mid).reduce((s, d) => s + d.engagementRate, 0) / mid;
  const curr = data.slice(mid).reduce((s, d) => s + d.engagementRate, 0) / (data.length - mid);
  if (prev === 0) return 0;
  return ((curr - prev) / prev) * 100;
}

function getChannelColor(source: string, medium: string): string {
  if (medium === 'organic') return '#22c55e';
  if (medium === 'social') {
    if (source === 'instagram') return '#e1306c';
    if (source === 'facebook') return '#1877f2';
    if (source === 'youtube') return '#ff0000';
    if (source === 'kakao') return '#f7e600';
    return '#8b5cf6';
  }
  if (medium === 'email') return '#f59e0b';
  if (medium === 'referral') return '#6b7280';
  if (medium === '(none)') return '#3182f6';
  if (medium === 'cpc' || medium === 'paid') return '#f97316';
  return '#94a3b8';
}

function getDeviceName(cat: string): string {
  if (cat === 'desktop') return '데스크탑';
  if (cat === 'mobile') return '모바일';
  if (cat === 'tablet') return '태블릿';
  return cat;
}

function getDeviceColor(cat: string): string {
  if (cat === 'desktop') return '#3182f6';
  if (cat === 'mobile') return '#22c55e';
  if (cat === 'tablet') return '#f59e0b';
  return '#8b5cf6';
}

// ── Sparkline Component ────────────────────────────────────────────────────

function Sparkline({
  data,
  dataKey,
  color,
}: {
  data: DailyTraffic[];
  dataKey: keyof DailyTraffic;
  color: string;
}) {
  const gradientId = `spark-${dataKey}-${color.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey={dataKey as string}
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── WoW Badge ─────────────────────────────────────────────────────────────

function WoWBadge({ pct }: { pct: number }) {
  const isGood = pct >= 0;
  const color = isGood ? '#22c55e' : '#ef4444';
  const bg = isGood ? '#f0fdf4' : '#fef2f2';
  const arrow = isGood ? '▲' : '▼';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 12,
        fontWeight: 600,
        color,
        background: bg,
        borderRadius: 6,
        padding: '2px 7px',
      }}
    >
      {arrow} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
  pctMode,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  pctMode?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e8ebed',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        fontSize: 12,
      }}
    >
      <p style={{ color: '#6b7684', marginBottom: 6, fontWeight: 600 }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span
            style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }}
          />
          <span style={{ color: '#6b7684' }}>{p.name}</span>
          <span style={{ fontWeight: 700, color: '#191f28', marginLeft: 'auto', paddingLeft: 12 }}>
            {pctMode
              ? `${(typeof p.value === 'number' ? p.value : 0).toFixed(1)}%`
              : (typeof p.value === 'number' ? p.value : 0).toLocaleString('ko-KR')}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [traffic, setTraffic] = useState<DailyTraffic[]>([]);
  const [channels, setChannels] = useState<ChannelBreakdown[]>([]);
  const [pages, setPages] = useState<PagePerformance[]>([]);
  const [engagement, setEngagement] = useState<EngagementMetric[]>([]);
  const [devices, setDevices] = useState<DeviceBreakdown[]>([]);
  const [geo, setGeo] = useState<GeoBreakdown[]>([]);
  const [landingPages, setLandingPages] = useState<LandingPage[]>([]);
  const [realtimeUsers, setRealtimeUsers] = useState<number | null>(null);
  const [insight, setInsight] = useState<AiInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>('30daysAgo');

  const fetchRealtime = useCallback(async () => {
    try {
      const res = await fetch('/api/ga4/realtime');
      const data = await res.json();
      if (!data.error && data.activeUsers !== undefined) setRealtimeUsers(data.activeUsers);
    } catch {/* silent */}
  }, []);

  const loadDemoData = useCallback(() => {
    const days = dateRange === '7daysAgo' ? 7 : dateRange === '14daysAgo' ? 14 : dateRange === '90daysAgo' ? 90 : 30;
    setIsDemo(true);
    setTraffic(generateDemoTraffic(days));
    setChannels(DEMO_CHANNELS);
    setPages(DEMO_PAGES);
    setEngagement(DEMO_ENGAGEMENT);
    setDevices(DEMO_DEVICES);
    setGeo(DEMO_GEO);
    setLandingPages(DEMO_LANDING_PAGES);
    setRealtimeUsers(23);
    setLoading(false);
  }, [dateRange]);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    const params = `startDate=${dateRange}&endDate=today`;
    try {
      const [reportRes, engRes, devRes, geoRes, lpRes] = await Promise.allSettled([
        fetch(`/api/ga4/report?${params}&type=all`).then(r => r.json()),
        fetch(`/api/ga4/engagement?${params}`).then(r => r.json()),
        fetch(`/api/ga4/devices?${params}`).then(r => r.json()),
        fetch(`/api/ga4/geo?${params}`).then(r => r.json()),
        fetch(`/api/ga4/landing-pages?${params}`).then(r => r.json()),
      ]);

      const report = reportRes.status === 'fulfilled' ? reportRes.value : null;

      if (!report || report.error || report.configured === false) {
        loadDemoData();
        return;
      }

      setIsDemo(false);
      setTraffic(report.traffic || []);
      setChannels(report.channels || []);
      setPages(report.pagePerformance || report.pages || []);

      if (engRes.status === 'fulfilled' && engRes.value.configured && engRes.value.data) {
        setEngagement(engRes.value.data);
      } else {
        setEngagement(DEMO_ENGAGEMENT);
      }
      if (devRes.status === 'fulfilled' && devRes.value.configured && devRes.value.data) {
        setDevices(devRes.value.data);
      } else {
        setDevices(DEMO_DEVICES);
      }
      if (geoRes.status === 'fulfilled' && geoRes.value.configured && geoRes.value.data) {
        setGeo(geoRes.value.data);
      } else {
        setGeo(DEMO_GEO);
      }
      if (lpRes.status === 'fulfilled' && lpRes.value.configured && lpRes.value.data) {
        setLandingPages(lpRes.value.data);
      } else {
        setLandingPages(DEMO_LANDING_PAGES);
      }
    } catch {
      loadDemoData();
    } finally {
      setLoading(false);
    }
  }, [dateRange, loadDemoData]);

  useEffect(() => {
    fetchAllData();
    fetchRealtime();
    const interval = setInterval(fetchRealtime, 60_000);
    return () => clearInterval(interval);
  }, [fetchAllData, fetchRealtime]);

  async function runAiAnalysis() {
    if (isDemo) {
      setAnalyzing(true);
      setTimeout(() => {
        setInsight(DEMO_INSIGHT);
        setAnalyzing(false);
      }, 1600);
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch('/api/ga4/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: dateRange, endDate: 'today', traffic, channels }),
      });
      const data = await res.json();
      if (data.insight) setInsight(data.insight);
    } catch {/* silent */}
    finally { setAnalyzing(false); }
  }

  // ── KPI aggregates ────────────────────────────────────────────────────
  const totalUsers = traffic.reduce((s, d) => s + d.activeUsers, 0);
  const totalSessions = traffic.reduce((s, d) => s + d.sessions, 0);
  const totalPageViews = traffic.reduce((s, d) => s + d.screenPageViews, 0);
  const avgEngagement = calcEngagementAvg(engagement) * 100;

  const wowUsers = calcWoW(traffic, 'activeUsers');
  const wowSessions = calcWoW(traffic, 'sessions');
  const wowPageViews = calcWoW(traffic, 'screenPageViews');
  const wowEngagement = calcEngagementWoW(engagement) * 100;

  // sparkline data (trim to last 14 for clarity)
  const sparkData = traffic.slice(-14);

  // chart data
  const trafficChartData = traffic.map(d => ({
    date: fmtDate(d.date),
    '활성 사용자': d.activeUsers,
    '세션': d.sessions,
  }));

  const engagementChartData = engagement.map(d => ({
    date: fmtDate(d.date),
    '참여율': parseFloat((d.engagementRate * 100).toFixed(1)),
    '이탈률': parseFloat((d.bounceRate * 100).toFixed(1)),
  }));

  const channelChartData = channels.slice(0, 10).map(c => ({
    name: `${c.source}/${c.medium}`,
    세션: c.sessions,
    color: getChannelColor(c.source, c.medium),
  }));
  const maxChannelSessions = Math.max(...channelChartData.map(c => c.세션), 1);

  const deviceChartData = devices.map(d => ({
    name: getDeviceName(d.deviceCategory),
    value: d.sessions,
    color: getDeviceColor(d.deviceCategory),
  }));
  const totalDeviceSessions = devices.reduce((s, d) => s + d.sessions, 0);

  const geoChartData = geo.slice(0, 10).map(g => ({
    name: g.country,
    '활성 사용자': g.activeUsers,
  }));
  const maxGeoUsers = Math.max(...geoChartData.map(g => g['활성 사용자']), 1);

  const periodLabel = dateRange === '7daysAgo' ? '7일' : dateRange === '14daysAgo' ? '14일' : dateRange === '90daysAgo' ? '90일' : '30일';

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {/* ── Demo Banner ── */}
      {isDemo && (
        <div
          style={{
            background: 'rgba(49,130,246,0.07)',
            border: '1px solid rgba(49,130,246,0.2)',
            borderRadius: 12,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            marginBottom: 24,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1.4 }}>📊</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#3182f6', margin: 0 }}>
              미리보기 모드 — 데모 데이터로 표시 중
            </p>
            <p style={{ fontSize: 12, color: '#6b7684', margin: '3px 0 0' }}>
              GA4 연동 후 실제 데이터로 자동 전환됩니다.{' '}
              <code
                style={{
                  background: 'rgba(49,130,246,0.1)',
                  color: '#3182f6',
                  borderRadius: 4,
                  padding: '1px 5px',
                  fontSize: 11,
                }}
              >
                .env
              </code>
              에서 GA4_PROPERTY_ID, GA4_CLIENT_EMAIL, GA4_PRIVATE_KEY를 설정하세요.
            </p>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 28,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <span className="dashboard-eyebrow" style={{ marginBottom: 8 }}>Analytics</span>
          <h1 className="dashboard-title" style={{ marginTop: 8, fontSize: '1.7rem' }}>
            성과 분석
          </h1>
          <p className="dashboard-copy" style={{ marginTop: 4 }}>
            실시간 웹사이트 성과를 분석합니다
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {realtimeUsers !== null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 10,
                padding: '7px 14px',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#22c55e',
                  display: 'inline-block',
                  boxShadow: '0 0 0 3px rgba(34,197,94,0.25)',
                  animation: 'pulse 2s infinite',
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
                실시간 {realtimeUsers.toLocaleString('ko-KR')}명
              </span>
              {isDemo && (
                <span style={{ fontSize: 11, color: '#6b7684' }}>(데모)</span>
              )}
            </div>
          )}
          {/* Date Range Buttons */}
          <div
            style={{
              display: 'flex',
              background: '#f5f6f7',
              border: '1px solid #e8ebed',
              borderRadius: 10,
              padding: 3,
              gap: 2,
            }}
          >
            {(['7daysAgo', '14daysAgo', '30daysAgo', '90daysAgo'] as DateRange[]).map((r) => {
              const label = r === '7daysAgo' ? '7일' : r === '14daysAgo' ? '14일' : r === '90daysAgo' ? '90일' : '30일';
              const active = dateRange === r;
              return (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  style={{
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    color: active ? '#fff' : '#6b7684',
                    background: active ? '#3182f6' : 'transparent',
                    border: 'none',
                    borderRadius: 7,
                    padding: '5px 12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Loading State ── */}
      {loading ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: 320,
            gap: 12,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: '3px solid #e8ebed',
              borderTopColor: '#3182f6',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <p style={{ color: '#6b7684', fontSize: 14 }}>데이터를 불러오는 중...</p>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
            @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
          `}</style>
        </div>
      ) : (
        <>
          <style>{`
            @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
          `}</style>

          {/* ════════════════════════════════════════════════════════
              Section 1: KPI Cards
          ════════════════════════════════════════════════════════ */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
              marginBottom: 20,
            }}
          >
            {[
              {
                label: '활성 사용자',
                value: totalUsers,
                wow: wowUsers,
                dataKey: 'activeUsers' as keyof DailyTraffic,
                color: '#3182f6',
              },
              {
                label: '세션',
                value: totalSessions,
                wow: wowSessions,
                dataKey: 'sessions' as keyof DailyTraffic,
                color: '#8b5cf6',
              },
              {
                label: '페이지뷰',
                value: totalPageViews,
                wow: wowPageViews,
                dataKey: 'screenPageViews' as keyof DailyTraffic,
                color: '#f59e0b',
              },
              {
                label: '참여율',
                value: null,
                displayValue: `${avgEngagement.toFixed(1)}%`,
                wow: wowEngagement,
                dataKey: 'activeUsers' as keyof DailyTraffic,
                color: '#22c55e',
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="metric-card"
                style={{
                  borderTop: `3px solid ${kpi.color}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0,
                }}
              >
                <p className="metric-label">{kpi.label}</p>
                <p
                  className="metric-value"
                  style={{ color: kpi.color, fontSize: '1.8rem', margin: '4px 0 2px' }}
                >
                  {kpi.displayValue ?? kpi.value!.toLocaleString('ko-KR')}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <WoWBadge pct={kpi.wow} />
                  <span style={{ fontSize: 11, color: '#b0b8c1' }}>vs 이전 {periodLabel}</span>
                </div>
                <Sparkline data={sparkData} dataKey={kpi.dataKey} color={kpi.color} />
              </div>
            ))}
          </div>

          {/* ════════════════════════════════════════════════════════
              Section 2: 트래픽 트렌드
          ════════════════════════════════════════════════════════ */}
          <div className="panel" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#3182f6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  Traffic Overview
                </p>
                <h2 className="section-title">트래픽 트렌드</h2>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {[
                  { label: '활성 사용자', color: '#3182f6' },
                  { label: '세션', color: '#8b5cf6' },
                ].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 3, background: l.color, borderRadius: 2, display: 'inline-block' }} />
                    <span style={{ fontSize: 12, color: '#6b7684' }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trafficChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3182f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3182f6" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="gradSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#b0b8c1' }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(1, Math.floor(trafficChartData.length / 8) - 1)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#b0b8c1' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                  width={36}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="활성 사용자"
                  stroke="#3182f6"
                  strokeWidth={2}
                  fill="url(#gradUsers)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: '#3182f6' }}
                />
                <Area
                  type="monotone"
                  dataKey="세션"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fill="url(#gradSessions)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: '#8b5cf6' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* ════════════════════════════════════════════════════════
              Section 3: 참여도 & 이탈률
          ════════════════════════════════════════════════════════ */}
          {engagementChartData.length > 0 && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                    Engagement
                  </p>
                  <h2 className="section-title">참여도 & 이탈률</h2>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  {[
                    { label: '참여율', color: '#22c55e' },
                    { label: '이탈률', color: '#ef4444' },
                  ].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 3, background: l.color, borderRadius: 2, display: 'inline-block' }} />
                      <span style={{ fontSize: 12, color: '#6b7684' }}>{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={engagementChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradEngage" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="gradBounce" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#b0b8c1' }}
                    axisLine={false}
                    tickLine={false}
                    interval={Math.max(1, Math.floor(engagementChartData.length / 8) - 1)}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: '#b0b8c1' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                    width={36}
                  />
                  <Tooltip content={<ChartTooltip pctMode />} />
                  <Area
                    type="monotone"
                    dataKey="참여율"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#gradEngage)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: '#22c55e' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="이탈률"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fill="url(#gradBounce)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: '#ef4444' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════
              Section 4: 유입 채널 + 디바이스 분포
          ════════════════════════════════════════════════════════ */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              marginBottom: 20,
            }}
          >
            {/* Left: 유입 채널 */}
            <div className="panel">
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  Acquisition
                </p>
                <h2 className="section-title">유입 채널 Top 10</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {channelChartData.map((ch, i) => {
                  const pct = (ch.세션 / maxChannelSessions) * 100;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#b0b8c1',
                          width: 14,
                          textAlign: 'right',
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: '#333d4b',
                          width: 130,
                          flexShrink: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ch.name}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 8,
                          background: '#f5f6f7',
                          borderRadius: 100,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: ch.color,
                            borderRadius: 100,
                            transition: 'width 0.6s ease',
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#191f28',
                          width: 52,
                          textAlign: 'right',
                          flexShrink: 0,
                        }}
                      >
                        {ch.세션.toLocaleString('ko-KR')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: 디바이스 분포 */}
            <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  Devices
                </p>
                <h2 className="section-title">디바이스 분포</h2>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: '100%', height: 200 }}>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={deviceChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={88}
                        paddingAngle={3}
                        dataKey="value"
                        startAngle={90}
                        endAngle={-270}
                      >
                        {deviceChartData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} strokeWidth={0} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [value != null ? Number(value).toLocaleString('ko-KR') : '0', '세션']}
                        contentStyle={{
                          fontSize: 12,
                          background: '#fff',
                          border: '1px solid #e8ebed',
                          borderRadius: 8,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      textAlign: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    <p style={{ fontSize: 11, color: '#6b7684', margin: 0 }}>총 세션</p>
                    <p style={{ fontSize: 18, fontWeight: 800, color: '#191f28', margin: '2px 0 0' }}>
                      {totalDeviceSessions.toLocaleString('ko-KR')}
                    </p>
                  </div>
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
                  {deviceChartData.map(d => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: d.color,
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 12, color: '#6b7684' }}>{d.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#191f28' }}>
                        {((d.value / totalDeviceSessions) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════
              Section 5: 상위 페이지 + 상위 국가
          ════════════════════════════════════════════════════════ */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              marginBottom: 20,
            }}
          >
            {/* Left: 상위 페이지 */}
            <div className="panel">
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#3182f6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  Content
                </p>
                <h2 className="section-title">상위 페이지 Top 10</h2>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e8ebed' }}>
                    <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#b0b8c1', padding: '0 0 8px', paddingRight: 8 }}>
                      페이지
                    </th>
                    <th style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#b0b8c1', padding: '0 0 8px', paddingLeft: 8, width: 64 }}>
                      조회수
                    </th>
                    <th style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#b0b8c1', padding: '0 0 8px', paddingLeft: 8, width: 64 }}>
                      사용자
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pages.slice(0, 10).map((pg, i) => (
                    <tr
                      key={i}
                      style={{
                        background: i % 2 === 0 ? '#fff' : '#f9fafb',
                        borderBottom: i < 9 ? '1px solid #f5f6f7' : 'none',
                      }}
                    >
                      <td
                        style={{
                          fontSize: 12,
                          color: '#333d4b',
                          padding: '7px 8px 7px 0',
                          fontFamily: 'ui-monospace, monospace',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 200,
                        }}
                        title={pg.pagePath}
                      >
                        {pg.pagePath.length > 30 ? pg.pagePath.slice(0, 30) + '…' : pg.pagePath}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#191f28', padding: '7px 0 7px 8px' }}>
                        {pg.screenPageViews.toLocaleString('ko-KR')}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: '#6b7684', padding: '7px 0 7px 8px' }}>
                        {pg.activeUsers.toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Right: 상위 국가 */}
            <div className="panel">
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  Geography
                </p>
                <h2 className="section-title">상위 국가</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {geoChartData.map((g, i) => {
                  const pct = (g['활성 사용자'] / maxGeoUsers) * 100;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#b0b8c1', width: 14, textAlign: 'right', flexShrink: 0 }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 12, color: '#333d4b', width: 90, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.name}
                      </span>
                      <div style={{ flex: 1, height: 8, background: '#f5f6f7', borderRadius: 100, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: i === 0 ? '#3182f6' : `rgba(49,130,246,${0.85 - i * 0.07})`,
                            borderRadius: 100,
                            transition: 'width 0.6s ease',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#191f28', width: 52, textAlign: 'right', flexShrink: 0 }}>
                        {g['활성 사용자'].toLocaleString('ko-KR')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════
              Section 6: 랜딩 페이지 성과
          ════════════════════════════════════════════════════════ */}
          {landingPages.length > 0 && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  Landing Pages
                </p>
                <h2 className="section-title">랜딩 페이지 성과</h2>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e8ebed' }}>
                      {['랜딩 페이지', '세션', '이탈률', '참여율'].map((h, i) => (
                        <th
                          key={h}
                          style={{
                            textAlign: i === 0 ? 'left' : 'right',
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#b0b8c1',
                            padding: '0 8px 10px',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {landingPages.map((lp, i) => {
                      const bounceColor =
                        lp.bounceRate > 0.7
                          ? { bg: '#fef2f2', text: '#ef4444' }
                          : lp.bounceRate > 0.5
                          ? { bg: '#fffbeb', text: '#d97706' }
                          : { bg: '#f0fdf4', text: '#16a34a' };
                      const engColor =
                        lp.engagementRate > 0.5
                          ? { bg: '#f0fdf4', text: '#16a34a' }
                          : lp.engagementRate > 0.3
                          ? { bg: '#fffbeb', text: '#d97706' }
                          : { bg: '#fef2f2', text: '#ef4444' };
                      return (
                        <tr
                          key={i}
                          style={{
                            background: i % 2 === 0 ? '#fff' : '#f9fafb',
                            borderBottom: i < landingPages.length - 1 ? '1px solid #f0f1f3' : 'none',
                          }}
                        >
                          <td
                            style={{
                              fontSize: 12,
                              color: '#333d4b',
                              padding: '9px 8px',
                              fontFamily: 'ui-monospace, monospace',
                              maxWidth: 280,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={lp.landingPage}
                          >
                            {lp.landingPage.length > 40 ? lp.landingPage.slice(0, 40) + '…' : lp.landingPage}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#191f28', padding: '9px 8px' }}>
                            {lp.sessions.toLocaleString('ko-KR')}
                          </td>
                          <td style={{ textAlign: 'right', padding: '9px 8px' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                fontSize: 11,
                                fontWeight: 700,
                                color: bounceColor.text,
                                background: bounceColor.bg,
                                borderRadius: 6,
                                padding: '2px 8px',
                                minWidth: 46,
                                textAlign: 'center',
                              }}
                            >
                              {Math.round(lp.bounceRate * 100)}%
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', padding: '9px 8px' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                fontSize: 11,
                                fontWeight: 700,
                                color: engColor.text,
                                background: engColor.bg,
                                borderRadius: 6,
                                padding: '2px 8px',
                                minWidth: 46,
                                textAlign: 'center',
                              }}
                            >
                              {Math.round(lp.engagementRate * 100)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════
              Section 7: AI 성과 분석
          ════════════════════════════════════════════════════════ */}
          <div className="panel" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  AI Insights
                </p>
                <h2 className="section-title">AI 성과 분석</h2>
              </div>
              <button
                onClick={runAiAnalysis}
                disabled={analyzing}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '9px 20px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#fff',
                  background: analyzing ? '#94a3b8' : 'linear-gradient(135deg, #3182f6 0%, #8b5cf6 100%)',
                  border: 'none',
                  borderRadius: 10,
                  cursor: analyzing ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.15s',
                  boxShadow: analyzing ? 'none' : '0 2px 8px rgba(49,130,246,0.3)',
                }}
              >
                <span style={{ fontSize: 15 }}>{analyzing ? '⏳' : '✨'}</span>
                {analyzing ? '분석 중...' : isDemo ? 'AI 분석 미리보기' : 'AI 분석 실행'}
              </button>
            </div>

            {insight ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Summary */}
                <div
                  style={{
                    background: 'rgba(49,130,246,0.05)',
                    border: '1px solid rgba(49,130,246,0.15)',
                    borderRadius: 10,
                    padding: '14px 16px',
                  }}
                >
                  <p style={{ fontSize: 14, color: '#191f28', lineHeight: 1.7, margin: 0 }}>
                    {insight.summary}
                  </p>
                  <p style={{ fontSize: 11, color: '#b0b8c1', margin: '8px 0 0' }}>
                    {new Date(insight.generatedAt).toLocaleString('ko-KR')} 생성
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  {/* Highlights */}
                  {insight.highlights.length > 0 && (
                    <div
                      style={{
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: 10,
                        padding: '14px 16px',
                      }}
                    >
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                        주요 발견
                      </p>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {insight.highlights.map((h, i) => (
                          <li key={i} style={{ display: 'flex', gap: 7, fontSize: 13, color: '#166534', lineHeight: 1.5 }}>
                            <span style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }}>•</span>
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Recommendations */}
                  {insight.recommendations.length > 0 && (
                    <div
                      style={{
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: 10,
                        padding: '14px 16px',
                      }}
                    >
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                        개선 권고
                      </p>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {insight.recommendations.map((r, i) => (
                          <li key={i} style={{ display: 'flex', gap: 7, fontSize: 13, color: '#1e40af', lineHeight: 1.5 }}>
                            <span style={{ color: '#3182f6', flexShrink: 0, marginTop: 1 }}>→</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Anomalies */}
                  {insight.anomalies.length > 0 && (
                    <div
                      style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: 10,
                        padding: '14px 16px',
                      }}
                    >
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                        이상 징후
                      </p>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {insight.anomalies.map((a, i) => (
                          <li key={i} style={{ display: 'flex', gap: 7, fontSize: 13, color: '#991b1b', lineHeight: 1.5 }}>
                            <span style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }}>!</span>
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '32px 0',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 32 }}>✨</span>
                <p style={{ fontSize: 14, color: '#6b7684', margin: 0 }}>
                  {isDemo
                    ? 'AI 분석 미리보기 버튼을 클릭하면 데모 인사이트를 확인할 수 있습니다.'
                    : 'AI 분석 실행 버튼을 클릭하면 GA4 데이터를 기반으로 인사이트를 생성합니다.'}
                </p>
                <p style={{ fontSize: 12, color: '#b0b8c1', margin: 0 }}>
                  트래픽 패턴, 채널 성과, 이탈률 개선 방향을 AI가 분석합니다.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
