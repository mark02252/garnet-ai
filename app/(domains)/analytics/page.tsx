'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart,
  Area,
  ComposedChart,
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
  CartesianGrid,
  LabelList,
  ReferenceLine,
} from 'recharts';
import type { ForecastPoint, AnomalyPoint } from '@/lib/analytics/forecast';
import { computeForecast, detectAnomalies } from '@/lib/analytics/forecast';

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
  sessionsPerUser: number;
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

type ChartPoint = {
  date: string;
  activeUsers: number | null;
  forecastValue: number | null;
  bandBase: number | null;
  bandWidth: number | null;
  isAnomaly: boolean;
};

type ForecastData = {
  forecast: ForecastPoint[];
  anomalies: AnomalyPoint[];
  historical: { date: string; activeUsers: number }[];
};

type HourlyPattern = {
  hour: string;
  activeUsers: number;
  sessions: number;
};

type NewVsReturning = {
  userType: string;
  activeUsers: number;
  sessions: number;
  engagementRate: number;
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
    sessionsPerUser: 1.1 + Math.random() * 0.5,
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

const DEMO_HOURLY: HourlyPattern[] = Array.from({ length: 24 }, (_, i) => {
  const hour = String(i).padStart(2, '0');
  // Simulate realistic traffic: low at night, morning/evening peaks
  let baseSessions = 40;
  if (i >= 0 && i <= 5) baseSessions = 10 + i * 3;
  else if (i >= 6 && i <= 9) baseSessions = 60 + (i - 6) * 30;
  else if (i >= 10 && i <= 13) baseSessions = 120 + Math.random() * 30;
  else if (i >= 14 && i <= 17) baseSessions = 110 + Math.random() * 20;
  else if (i >= 18 && i <= 21) baseSessions = 140 + (i === 19 || i === 20 ? 40 : 0) + Math.random() * 20;
  else baseSessions = 60 - (i - 21) * 15;
  const sessions = Math.max(8, Math.floor(baseSessions + Math.random() * 20));
  return { hour, sessions, activeUsers: Math.floor(sessions * 0.77) };
});

const DEMO_USER_TYPE: NewVsReturning[] = [
  { userType: 'new', activeUsers: 19800, sessions: 24600, engagementRate: 0.56 },
  { userType: 'returning', activeUsers: 8200, sessions: 12300, engagementRate: 0.74 },
];

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
  if (medium === 'organic') return '#00ff88';
  if (medium === 'social') {
    if (source === 'instagram') return '#e1306c';
    if (source === 'facebook') return '#1877f2';
    if (source === 'youtube') return '#ff0000';
    if (source === 'kakao') return '#f7e600';
    return '#7E8A98';
  }
  if (medium === 'email') return '#ffaa00';
  if (medium === 'referral') return '#4a9abf';
  if (medium === '(none)') return '#E8707E';
  if (medium === 'cpc' || medium === 'paid') return '#f97316';
  return '#4a9abf';
}

function getDeviceName(cat: string): string {
  if (cat === 'desktop') return '데스크탑';
  if (cat === 'mobile') return '모바일';
  if (cat === 'tablet') return '태블릿';
  return cat;
}

function getDeviceColor(cat: string): string {
  if (cat === 'desktop') return '#E8707E';
  if (cat === 'mobile') return '#00ff88';
  if (cat === 'tablet') return '#ffaa00';
  return '#7E8A98';
}

function buildDemoForecast(): ForecastData {
  const demoTraffic = generateDemoTraffic(30);
  const dates = demoTraffic.map(
    (d) => `${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}`
  );
  const values = demoTraffic.map((d) => d.activeUsers);
  return {
    historical: dates.map((date, i) => ({ date, activeUsers: values[i] })),
    forecast: computeForecast(dates, values, 7),
    anomalies: detectAnomalies(dates, values),
  };
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
  const color = isGood ? '#00ff88' : '#ff4466';
  const bg = isGood ? 'rgba(0,255,136,0.06)' : 'rgba(255,68,102,0.06)';
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
        background: 'rgba(8,10,20,0.94)',
        border: '1px solid rgba(201,53,69,0.14)',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        fontSize: 12,
      }}
    >
      <p style={{ color: '#7E8A98', marginBottom: 6, fontWeight: 600 }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span
            style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }}
          />
          <span style={{ color: '#7E8A98' }}>{p.name}</span>
          <span style={{ fontWeight: 700, color: '#F0ECE8', marginLeft: 'auto', paddingLeft: 12 }}>
            {pctMode
              ? `${(typeof p.value === 'number' ? p.value : 0).toFixed(1)}%`
              : (typeof p.value === 'number' ? p.value : 0).toLocaleString('ko-KR')}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Forecast Components ────────────────────────────────────────────────────

type DotProps = {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
};

function CustomAnomalyDot({ cx, cy, payload }: DotProps) {
  if (!payload?.isAnomaly || cx == null || cy == null) return null;
  return (
    <circle cx={cx} cy={cy} r={5} fill="#ff4444" stroke="#ff0000" strokeWidth={2} />
  );
}

// recharts content callback receives active/payload/label separately; typed inline.
function ForecastTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartPoint | undefined;
  return (
    <div
      style={{
        background: '#0d1a2a',
        border: '1px solid #3a6080',
        padding: '8px',
        fontSize: '12px',
        borderRadius: 6,
      }}
    >
      <p style={{ color: '#B0B8C4', marginBottom: 4 }}>{label}</p>
      {point?.activeUsers != null && (
        <p style={{ color: '#F0ECE8' }}>방문자: {point.activeUsers.toLocaleString('ko-KR')}명</p>
      )}
      {point?.forecastValue != null && (
        <p style={{ color: '#E8707E' }}>예측: {point.forecastValue.toLocaleString('ko-KR')}명</p>
      )}
      {point?.isAnomaly && (
        <p style={{ color: '#ff4444' }}>⚠️ 이상 트래픽 감지</p>
      )}
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
  const [hourlyPattern, setHourlyPattern] = useState<HourlyPattern[]>([]);
  const [userType, setUserType] = useState<NewVsReturning[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>('30daysAgo');
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [channelTrend, setChannelTrend] = useState<Array<{date: string; channel: string; sessions: number}>>([]);
  const [stickiness, setStickiness] = useState<Array<{date: string; dau: number; wau: number; mau: number}>>([]);
  const [channelConv, setChannelConv] = useState<Array<{channel: string; sessions: number; conversions: number; engagementRate: number}>>([]);

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
    setHourlyPattern(DEMO_HOURLY);
    setUserType(DEMO_USER_TYPE);
    setRealtimeUsers(23);
    setLoading(false);
  }, [dateRange]);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    const params = `startDate=${dateRange}&endDate=today`;
    try {
      const [reportRes, engRes, devRes, geoRes, lpRes, hourlyRes, userTypeRes] = await Promise.allSettled([
        fetch(`/api/ga4/report?${params}&type=all`).then(r => r.json()),
        fetch(`/api/ga4/engagement?${params}`).then(r => r.json()),
        fetch(`/api/ga4/devices?${params}`).then(r => r.json()),
        fetch(`/api/ga4/geo?${params}`).then(r => r.json()),
        fetch(`/api/ga4/landing-pages?${params}`).then(r => r.json()),
        fetch(`/api/ga4/hourly?${params}`).then(r => r.json()),
        fetch(`/api/ga4/user-type?${params}`).then(r => r.json()),
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
      if (hourlyRes.status === 'fulfilled' && hourlyRes.value.configured && hourlyRes.value.data) {
        setHourlyPattern(hourlyRes.value.data);
      } else {
        setHourlyPattern(DEMO_HOURLY);
      }
      if (userTypeRes.status === 'fulfilled' && userTypeRes.value.configured && userTypeRes.value.data) {
        setUserType(userTypeRes.value.data);
      } else {
        setUserType(DEMO_USER_TYPE);
      }

      // Tier 2+ data (non-blocking)
      Promise.allSettled([
        fetch(`/api/ga4/channel-trend?${params}`).then(r => r.json()),
        fetch(`/api/ga4/stickiness?${params}`).then(r => r.json()),
        fetch(`/api/ga4/channel-conv?${params}`).then(r => r.json()),
      ]).then(([ctRes, stkRes, ccRes]) => {
        if (ctRes.status === 'fulfilled' && ctRes.value.data) setChannelTrend(ctRes.value.data);
        if (stkRes.status === 'fulfilled' && stkRes.value.data) setStickiness(stkRes.value.data);
        if (ccRes.status === 'fulfilled' && ccRes.value.data) setChannelConv(ccRes.value.data);
      });
    } catch {
      loadDemoData();
    } finally {
      setLoading(false);
    }
  }, [dateRange, loadDemoData]);

  const fetchForecastData = useCallback(async () => {
    try {
      const res = await fetch('/api/ga4/forecast');
      const data = await res.json();
      if (!data.configured || !data.forecast) {
        setForecastData(buildDemoForecast());
        return;
      }
      setForecastData(data as ForecastData);
    } catch {
      setForecastData(buildDemoForecast());
    }
  }, []);

  useEffect(() => {
    fetchAllData();
    fetchForecastData();
    fetchRealtime();
    const interval = setInterval(fetchRealtime, 60_000);
    return () => clearInterval(interval);
  }, [fetchAllData, fetchForecastData, fetchRealtime]);

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

  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

  const chartData: ChartPoint[] = forecastData
    ? (() => {
        const anomalyDates = new Set(forecastData.anomalies.map((a) => a.date));
        const historicalPoints: ChartPoint[] = forecastData.historical.map((h) => ({
          date: h.date,
          activeUsers: h.activeUsers,
          forecastValue: null,
          bandBase: null,
          bandWidth: null,
          isAnomaly: anomalyDates.has(h.date),
        }));
        const forecastPoints: ChartPoint[] = forecastData.forecast.map((f) => ({
          date: f.date,
          activeUsers: null,
          forecastValue: f.value,
          bandBase: f.lower,
          bandWidth: f.upper - f.lower,
          isAnomaly: false,
        }));
        return [...historicalPoints, ...forecastPoints];
      })()
    : [];

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

  // ── New section computed values ───────────────────────────────────────
  // Hourly chart data
  const hourlyChartData = hourlyPattern.map(h => ({
    name: `${parseInt(h.hour)}시`,
    세션: h.sessions,
    활성사용자: h.activeUsers,
  }));

  // Peak hour
  const peakHourEntry = hourlyPattern.reduce(
    (max, h) => (h.sessions > max.sessions ? h : max),
    hourlyPattern[0] || { hour: '0', sessions: 0, activeUsers: 0 }
  );
  const peakHour = peakHourEntry ? parseInt(peakHourEntry.hour) : 0;

  // New vs Returning
  const newUser = userType.find(u => u.userType === 'new');
  const returningUser = userType.find(u => u.userType === 'returning');
  const totalUserTypeUsers = (newUser?.activeUsers || 0) + (returningUser?.activeUsers || 0);
  const newUserPct = totalUserTypeUsers > 0 ? ((newUser?.activeUsers || 0) / totalUserTypeUsers) * 100 : 0;
  const returningUserPct = totalUserTypeUsers > 0 ? ((returningUser?.activeUsers || 0) / totalUserTypeUsers) * 100 : 0;

  // WoW week comparison (split daily traffic into two halves)
  const halfIdx = Math.floor(traffic.length / 2);
  const prevWeekData = traffic.slice(0, halfIdx);
  const currWeekData = traffic.slice(halfIdx);
  const prevWeekTotals = {
    users: prevWeekData.reduce((s, d) => s + d.activeUsers, 0),
    sessions: prevWeekData.reduce((s, d) => s + d.sessions, 0),
    pageViews: prevWeekData.reduce((s, d) => s + d.screenPageViews, 0),
  };
  const currWeekTotals = {
    users: currWeekData.reduce((s, d) => s + d.activeUsers, 0),
    sessions: currWeekData.reduce((s, d) => s + d.sessions, 0),
    pageViews: currWeekData.reduce((s, d) => s + d.screenPageViews, 0),
  };
  function wowPct(curr: number, prev: number) {
    if (prev === 0) return 0;
    return ((curr - prev) / prev) * 100;
  }

  // Best channel
  const bestChannel = channels.length > 0 ? `${channels[0].source}/${channels[0].medium}` : '—';

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {/* ── Demo Banner ── */}
      {isDemo && (
        <div
          style={{
            background: 'rgba(201,53,69,0.07)',
            border: '1px solid rgba(201,53,69,0.2)',
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
            <p style={{ fontSize: 13, fontWeight: 700, color: '#E8707E', margin: 0 }}>
              미리보기 모드 — 데모 데이터로 표시 중
            </p>
            <p style={{ fontSize: 12, color: '#7E8A98', margin: '3px 0 0' }}>
              GA4 연동 후 실제 데이터로 자동 전환됩니다.{' '}
              <code
                style={{
                  background: 'rgba(201,53,69,0.1)',
                  color: '#E8707E',
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
                background: 'rgba(0,255,136,0.06)',
                border: '1px solid rgba(0,255,136,0.2)',
                borderRadius: 10,
                padding: '7px 14px',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#00ff88',
                  display: 'inline-block',
                  boxShadow: '0 0 0 3px rgba(34,197,94,0.25)',
                  animation: 'pulse 2s infinite',
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#00ff88' }}>
                실시간 {realtimeUsers.toLocaleString('ko-KR')}명
              </span>
              {isDemo && (
                <span style={{ fontSize: 11, color: '#7E8A98' }}>(데모)</span>
              )}
            </div>
          )}
          {/* Date Range Buttons */}
          <div
            style={{
              display: 'flex',
              background: 'var(--surface-sub)',
              border: '1px solid rgba(201,53,69,0.14)',
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
                    color: active ? '#fff' : '#7E8A98',
                    background: active ? '#C93545' : 'transparent',
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
              border: '3px solid rgba(201,53,69,0.14)',
              borderTopColor: '#C93545',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <p style={{ color: '#7E8A98', fontSize: 14 }}>데이터를 불러오는 중...</p>
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
                color: '#E8707E',
              },
              {
                label: '세션',
                value: totalSessions,
                wow: wowSessions,
                dataKey: 'sessions' as keyof DailyTraffic,
                color: '#7E8A98',
              },
              {
                label: '페이지뷰',
                value: totalPageViews,
                wow: wowPageViews,
                dataKey: 'screenPageViews' as keyof DailyTraffic,
                color: '#ffaa00',
              },
              {
                label: '참여율',
                value: null,
                displayValue: `${avgEngagement.toFixed(1)}%`,
                wow: wowEngagement,
                dataKey: 'activeUsers' as keyof DailyTraffic,
                color: '#00ff88',
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
                  <span style={{ fontSize: 11, color: '#7E8A98' }}>vs 이전 {periodLabel}</span>
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
                <p style={{ fontSize: 11, fontWeight: 600, color: '#E8707E', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  Traffic Overview
                </p>
                <h2 className="section-title">트래픽 트렌드</h2>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {[
                  { label: '활성 사용자', color: '#C93545' },
                  { label: '세션', color: '#7E8A98' },
                ].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 3, background: l.color, borderRadius: 2, display: 'inline-block' }} />
                    <span style={{ fontSize: 12, color: '#7E8A98' }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              {chartData.length > 0 ? (
                <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#7E8A98' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: string) =>
                      `${parseInt(v.slice(5, 7))}/${parseInt(v.slice(8, 10))}`
                    }
                    interval={Math.max(1, Math.floor(chartData.length / 8) - 1)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#7E8A98' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                    width={36}
                  />
                  <Tooltip content={<ForecastTooltip />} />
                  <ReferenceLine
                    x={todayStr}
                    stroke="#3a6080"
                    strokeDasharray="3 3"
                    label={{ value: '오늘', fill: '#7E8A98', fontSize: 11 }}
                  />

                  {/* 신뢰 구간 밴드 (stackId 기법) */}
                  <Area
                    stackId="band"
                    dataKey="bandBase"
                    stroke="none"
                    fill="transparent"
                    fillOpacity={0}
                    legendType="none"
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Area
                    stackId="band"
                    dataKey="bandWidth"
                    stroke="none"
                    fill="#C93545"
                    fillOpacity={0.1}
                    legendType="none"
                    connectNulls={false}
                    isAnimationActive={false}
                  />

                  {/* 과거 실제 트래픽 */}
                  <Area
                    dataKey="activeUsers"
                    stroke="#C93545"
                    fill="#C93545"
                    fillOpacity={0.15}
                    strokeWidth={2}
                    dot={<CustomAnomalyDot />}
                    connectNulls={false}
                    isAnimationActive={false}
                  />

                  {/* 예측 점선 */}
                  <Line
                    dataKey="forecastValue"
                    stroke="#C93545"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              ) : (
                <AreaChart data={trafficChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C93545" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#C93545" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#7E8A98' }}
                    axisLine={false}
                    tickLine={false}
                    interval={Math.max(1, Math.floor(trafficChartData.length / 8) - 1)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#7E8A98' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                    width={36}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="활성 사용자"
                    stroke="#C93545"
                    strokeWidth={2}
                    fill="url(#gradUsers)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: '#C93545' }}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* ════════════════════════════════════════════════════════
              Section 3: 채널별 세션 추세 (replaces 참여도 & 이탈률)
          ════════════════════════════════════════════════════════ */}
          {(() => {
            const CHANNEL_COLORS: Record<string, string> = {
              'Organic Search': '#C93545', Direct: '#0066ff', Referral: '#ffaa00',
              'Organic Social': '#00ff88', 'Paid Search': '#6366f1', Other: '#7E8A98',
            };
            const topChannels = [...new Set(channelTrend.map(d => d.channel))].slice(0, 5);
            const dateMap = new Map<string, Record<string, number>>();
            for (const d of channelTrend) {
              const ch = topChannels.includes(d.channel) ? d.channel : 'Other';
              const key = fmtDate(d.date);
              if (!dateMap.has(key)) dateMap.set(key, { date: key } as any);
              const row = dateMap.get(key)!;
              (row as any)[ch] = ((row as any)[ch] || 0) + d.sessions;
            }
            const chartData = [...dateMap.values()];
            const displayChannels = topChannels.length > 0 ? topChannels : ['Organic Search', 'Direct', 'Referral'];
            return chartData.length > 0 ? (
              <div className="ops-zone" style={{ marginBottom: 20 }}>
                <div className="ops-zone-head">
                  <span className="ops-zone-label">Channel Trend</span>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {displayChannels.map(ch => (
                      <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 10, height: 3, background: CHANNEL_COLORS[ch] || '#7E8A98', borderRadius: 2, display: 'inline-block' }} />
                        <span style={{ fontSize: 10, color: '#7E8A98' }}>{ch}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ padding: 16 }}>
                  <h2 className="section-title" style={{ marginBottom: 16 }}>채널별 세션 추세</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        {displayChannels.map(ch => (
                          <linearGradient key={ch} id={`gradCh${ch.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={CHANNEL_COLORS[ch] || '#7E8A98'} stopOpacity={0.15} />
                            <stop offset="95%" stopColor={CHANNEL_COLORS[ch] || '#7E8A98'} stopOpacity={0.01} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,53,69,0.08)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7E8A98' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#7E8A98' }} axisLine={false} tickLine={false} width={40} />
                      <Tooltip content={<ChartTooltip />} />
                      {displayChannels.map(ch => (
                        <Area key={ch} type="monotone" dataKey={ch} stroke={CHANNEL_COLORS[ch] || '#7E8A98'} strokeWidth={2}
                          fill={`url(#gradCh${ch.replace(/\s/g, '')})`} dot={false}
                          activeDot={{ r: 3, strokeWidth: 0, fill: CHANNEL_COLORS[ch] || '#7E8A98' }} />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null;
          })()}

          {/* ════════════════════════════════════════════════════════
              Section 3b: 이탈률 변화 추세
          ════════════════════════════════════════════════════════ */}
          {engagementChartData.length > 0 && (
            <div className="ops-zone" style={{ marginBottom: 20 }}>
              <div className="ops-zone-head">
                <span className="ops-zone-label">Bounce Rate Trend</span>
              </div>
              <div style={{ padding: 16 }}>
                <h2 className="section-title" style={{ marginBottom: 16 }}>이탈률 변화 추세</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={engagementChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradBounceNew" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ff4466" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#ff4466" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,53,69,0.08)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7E8A98' }} axisLine={false} tickLine={false}
                      interval={Math.max(1, Math.floor(engagementChartData.length / 8) - 1)} />
                    <YAxis tick={{ fontSize: 11, fill: '#7E8A98' }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => `${v}%`} width={36} />
                    <Tooltip content={<ChartTooltip pctMode />} />
                    <Area type="monotone" dataKey="이탈률" stroke="#ff4466" strokeWidth={2}
                      fill="url(#gradBounceNew)" dot={false}
                      activeDot={{ r: 4, strokeWidth: 0, fill: '#ff4466' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════
              Section 3c: 세션 깊이 추세
          ════════════════════════════════════════════════════════ */}
          {engagement.length > 0 && (
            <div className="ops-zone" style={{ marginBottom: 20 }}>
              <div className="ops-zone-head">
                <span className="ops-zone-label">Session Depth</span>
              </div>
              <div style={{ padding: 16 }}>
                <h2 className="section-title" style={{ marginBottom: 16 }}>세션 깊이 추세</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={engagement.map(d => ({
                    date: fmtDate(d.date),
                    '페이지뷰/세션': parseFloat(d.screenPageViewsPerSession.toFixed(2)),
                    '세션/사용자': parseFloat(d.sessionsPerUser.toFixed(2)),
                  }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,53,69,0.08)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7E8A98' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#7E8A98' }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="monotone" dataKey="페이지뷰/세션" stroke="#0066ff" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="세션/사용자" stroke="#ffaa00" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
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
                <p style={{ fontSize: 11, fontWeight: 600, color: '#7E8A98', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
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
                          color: '#7E8A98',
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
                          color: '#B0B8C4',
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
                          background: 'var(--surface-sub)',
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
                          color: '#F0ECE8',
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
                <p style={{ fontSize: 11, fontWeight: 600, color: '#ffaa00', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
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
                          background: 'rgba(8,10,20,0.94)',
                          border: '1px solid rgba(201,53,69,0.14)',
                          borderRadius: 8,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                          color: '#F0ECE8',
                        }}
                        labelStyle={{ color: '#7E8A98' }}
                        itemStyle={{ color: '#B0B8C4' }}
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
                    <p style={{ fontSize: 11, color: '#7E8A98', margin: 0 }}>총 세션</p>
                    <p style={{ fontSize: 18, fontWeight: 800, color: '#F0ECE8', margin: '2px 0 0' }}>
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
                      <span style={{ fontSize: 12, color: '#7E8A98' }}>{d.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#F0ECE8' }}>
                        {((d.value / totalDeviceSessions) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
                {/* Device engagement rates */}
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#7E8A98', marginBottom: 6 }}>참여율 by Device</p>
                  {devices.map(d => {
                    const engPct = (d.engagementRate * 100).toFixed(1);
                    const label = d.deviceCategory === 'mobile' ? '모바일' : d.deviceCategory === 'desktop' ? '데스크탑' : '태블릿';
                    return (
                      <div key={d.deviceCategory} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: '#7E8A98', width: 48, flexShrink: 0 }}>{label}</span>
                        <div className="ops-bar-track" style={{ flex: 1, height: 4 }}>
                          <div className="ops-bar-fill" style={{ width: `${d.engagementRate * 100}%`, backgroundColor: '#E8707E' }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#F0ECE8', width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{engPct}%</span>
                      </div>
                    );
                  })}
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
                <p style={{ fontSize: 11, fontWeight: 600, color: '#E8707E', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  Content
                </p>
                <h2 className="section-title">상위 페이지 Top 10</h2>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(201,53,69,0.14)' }}>
                    <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#7E8A98', padding: '0 0 8px', paddingRight: 8 }}>
                      페이지
                    </th>
                    <th style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#7E8A98', padding: '0 0 8px', paddingLeft: 8, width: 64 }}>
                      조회수
                    </th>
                    <th style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#7E8A98', padding: '0 0 8px', paddingLeft: 8, width: 64 }}>
                      사용자
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pages.slice(0, 10).map((pg, i) => (
                    <tr
                      key={i}
                      style={{
                        background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-sub)',
                        borderBottom: i < 9 ? '1px solid rgba(201,53,69,0.14)' : 'none',
                      }}
                    >
                      <td
                        style={{
                          fontSize: 12,
                          color: '#B0B8C4',
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
                      <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#F0ECE8', padding: '7px 0 7px 8px' }}>
                        {pg.screenPageViews.toLocaleString('ko-KR')}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: '#7E8A98', padding: '7px 0 7px 8px' }}>
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
                <p style={{ fontSize: 11, fontWeight: 600, color: '#00ff88', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  Geography
                </p>
                <h2 className="section-title">상위 국가</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {geoChartData.map((g, i) => {
                  const pct = (g['활성 사용자'] / maxGeoUsers) * 100;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#7E8A98', width: 14, textAlign: 'right', flexShrink: 0 }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 12, color: '#B0B8C4', width: 90, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.name}
                      </span>
                      <div style={{ flex: 1, height: 8, background: 'var(--surface-sub)', borderRadius: 100, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: i === 0 ? '#C93545' : `rgba(201,53,69,${0.85 - i * 0.07})`,
                            borderRadius: 100,
                            transition: 'width 0.6s ease',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#F0ECE8', width: 52, textAlign: 'right', flexShrink: 0 }}>
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
                <p style={{ fontSize: 11, fontWeight: 600, color: '#ffaa00', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  Landing Pages
                </p>
                <h2 className="section-title">랜딩 페이지 성과</h2>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid rgba(201,53,69,0.14)' }}>
                      {['랜딩 페이지', '세션', '이탈률', '참여율'].map((h, i) => (
                        <th
                          key={h}
                          style={{
                            textAlign: i === 0 ? 'left' : 'right',
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#7E8A98',
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
                          ? { bg: 'rgba(255,68,102,0.06)', text: '#ff4466' }
                          : lp.bounceRate > 0.5
                          ? { bg: 'rgba(249,115,22,0.06)', text: '#fbbf24' }
                          : { bg: 'rgba(0,255,136,0.06)', text: '#00ff88' };
                      const engColor =
                        lp.engagementRate > 0.5
                          ? { bg: 'rgba(0,255,136,0.06)', text: '#00ff88' }
                          : lp.engagementRate > 0.3
                          ? { bg: 'rgba(249,115,22,0.06)', text: '#fbbf24' }
                          : { bg: 'rgba(255,68,102,0.06)', text: '#ff4466' };
                      return (
                        <tr
                          key={i}
                          style={{
                            background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-sub)',
                            borderBottom: i < landingPages.length - 1 ? '1px solid rgba(201,53,69,0.14)' : 'none',
                          }}
                        >
                          <td
                            style={{
                              fontSize: 12,
                              color: '#B0B8C4',
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
                          <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#F0ECE8', padding: '9px 8px' }}>
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
              Section: 7일 트래픽 예측 요약
          ════════════════════════════════════════════════════════ */}
          {forecastData && forecastData.forecast.length > 0 && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#E8707E',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    marginBottom: 2,
                  }}
                >
                  Forecast
                </p>
                <h2 className="section-title">📈 7일 트래픽 예측</h2>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 12,
                }}
              >
                <div className="metric-card">
                  <p className="metric-label">예측 평균 방문자</p>
                  <p className="metric-value" style={{ color: '#E8707E' }}>
                    {Math.round(
                      forecastData.forecast.reduce((s, f) => s + f.value, 0) /
                        forecastData.forecast.length
                    ).toLocaleString('ko-KR')}
                    명/일
                  </p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">예측 범위</p>
                  <p className="metric-value" style={{ color: '#7E8A98', fontSize: '1.1rem' }}>
                    {Math.min(...forecastData.forecast.map((f) => f.lower)).toLocaleString('ko-KR')}
                    ~
                    {Math.max(...forecastData.forecast.map((f) => f.upper)).toLocaleString('ko-KR')}
                    명/일
                  </p>
                </div>
                {forecastData.anomalies.length > 0 && (
                  <div className="metric-card" style={{ borderTop: '3px solid #ff4444' }}>
                    <p className="metric-label">이상 트래픽 감지</p>
                    <p className="metric-value" style={{ color: '#ff4444' }}>
                      {forecastData.anomalies.length}건
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════
              Section 7: AI 성과 분석
          ════════════════════════════════════════════════════════ */}
          <div className="panel" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#7E8A98', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  AI Insights
                </p>
                <h2 className="section-title">AI 성과 분석</h2>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {insight && (
                  <button
                    onClick={() => { setInsight(null); runAiAnalysis(); }}
                    disabled={analyzing}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 16px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#7E8A98',
                      background: 'var(--surface-sub)',
                      border: 'none',
                      borderRadius: 10,
                      cursor: analyzing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 13 }}>↺</span>
                    다시 분석
                  </button>
                )}
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
                    background: analyzing ? '#B02D3C' : 'linear-gradient(135deg, #C93545 0%, #B02D3C 100%)',
                    border: 'none',
                    borderRadius: 10,
                    cursor: analyzing ? 'not-allowed' : 'pointer',
                    transition: 'opacity 0.15s',
                    boxShadow: analyzing ? 'none' : '0 2px 8px rgba(201,53,69,0.3)',
                  }}
                >
                  <span style={{ fontSize: 15 }}>{analyzing ? '⏳' : '✨'}</span>
                  {analyzing ? '분석 중...' : isDemo ? 'AI 분석 미리보기' : 'AI 분석 실행'}
                </button>
              </div>
            </div>

            {insight ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* ── 1. Executive Summary Card ── */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, #1e40af 0%, #6d28d9 60%, #7c3aed 100%)',
                    borderRadius: 16,
                    padding: '28px 32px',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* decorative circle */}
                  <div style={{
                    position: 'absolute', top: -40, right: -40,
                    width: 180, height: 180,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.06)',
                    pointerEvents: 'none',
                  }} />
                  <div style={{
                    position: 'absolute', bottom: -30, left: 120,
                    width: 120, height: 120,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.04)',
                    pointerEvents: 'none',
                  }} />
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{
                        background: 'rgba(255,255,255,0.18)',
                        borderRadius: 8,
                        padding: '3px 10px',
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#c7d2fe',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}>Executive Summary</span>
                    </div>
                    <p style={{ fontSize: 15, color: '#fff', lineHeight: 1.75, margin: 0, fontWeight: 400, maxWidth: 720 }}>
                      {insight.summary}
                    </p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: '14px 0 0' }}>
                      {new Date(insight.generatedAt).toLocaleString('ko-KR')} 생성 · Powered by AI
                    </p>
                  </div>
                </div>

                {/* ── 2. Key Findings ── */}
                {insight.highlights.length > 0 && (
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#F0ECE8', letterSpacing: '0.04em', marginBottom: 12, textTransform: 'uppercase' }}>
                      주요 발견 사항
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                      {insight.highlights.map((h, i) => {
                        const isWarning = i === 0;
                        const isOpportunity = i === 1;
                        const iconColor = isWarning ? '#ff4466' : isOpportunity ? '#00ff88' : '#E8707E';
                        const iconBg = isWarning ? 'rgba(255,68,102,0.06)' : isOpportunity ? 'rgba(0,255,136,0.06)' : 'rgba(29,78,216,0.08)';
                        const iconLabel = isWarning ? '⚠' : isOpportunity ? '↑' : 'i';
                        const badgeText = isWarning ? '높은 영향' : isOpportunity ? '성장 기회' : '참고 정보';
                        const badgeBg = isWarning ? 'rgba(255,68,102,0.1)' : isOpportunity ? 'rgba(0,255,136,0.1)' : 'rgba(29,78,216,0.1)';
                        const badgeColor = isWarning ? '#ff4466' : isOpportunity ? '#00ff88' : '#60a5fa';
                        const title = h.length > 30 ? h.slice(0, h.indexOf('—') > 0 ? h.indexOf('—') : 30).trim() : h;
                        const desc = h.indexOf('—') > 0 ? h.slice(h.indexOf('—') + 1).trim() : (h.length > 30 ? h.slice(30) : '');
                        return (
                          <div key={i} className="soft-card" style={{ padding: '16px 18px', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{
                                width: 34, height: 34, borderRadius: '50%',
                                background: iconBg,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 14, fontWeight: 700, color: iconColor, flexShrink: 0,
                              }}>
                                {iconLabel}
                              </div>
                              <span style={{
                                fontSize: 11, fontWeight: 700, padding: '3px 8px',
                                borderRadius: 6, background: badgeBg, color: badgeColor,
                              }}>
                                {badgeText}
                              </span>
                            </div>
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 700, color: '#F0ECE8', margin: '0 0 4px', lineHeight: 1.4 }}>
                                {title}
                              </p>
                              {desc && (
                                <p style={{ fontSize: 12, color: '#7E8A98', margin: 0, lineHeight: 1.55 }}>
                                  {desc}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── 3. Recommendations ── */}
                {insight.recommendations.length > 0 && (
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#F0ECE8', letterSpacing: '0.04em', marginBottom: 12, textTransform: 'uppercase' }}>
                      우선순위별 개선 권고
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {insight.recommendations.map((r, i) => {
                        const isObj = typeof r === 'object' && r !== null;
                        const text = isObj ? r.action : String(r);
                        const priority = isObj && r.priority ? r.priority.toUpperCase() : (i === 0 ? 'HIGH' : i === 1 ? 'MEDIUM' : 'LOW');
                        const borderColor = priority === 'HIGH' ? '#ff4466' : priority === 'MEDIUM' ? '#f97316' : '#C93545';
                        const badgeBg = priority === 'HIGH' ? 'rgba(255,68,102,0.06)' : priority === 'MEDIUM' ? 'rgba(249,115,22,0.08)' : 'rgba(29,78,216,0.08)';
                        const badgeColor = priority === 'HIGH' ? '#ff4466' : priority === 'MEDIUM' ? '#fb923c' : '#60a5fa';
                        const badgeLabel = priority === 'HIGH' ? '높음' : priority === 'MEDIUM' ? '중간' : '낮음';
                        const impact = isObj && r.expectedROI ? r.expectedROI : (priority === 'HIGH' ? '전환율 +0.5%p 예상' : priority === 'MEDIUM' ? '유입 +15% 예상' : '참여도 개선');
                        const deadline = isObj && r.deadline ? r.deadline : null;
                        return (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 14,
                              padding: '14px 18px',
                              background: 'var(--surface)',
                              border: '1px solid rgba(201,53,69,0.14)',
                              borderLeft: `4px solid ${borderColor}`,
                              borderRadius: 10,
                            }}
                          >
                            <span style={{
                              fontSize: 11, fontWeight: 800, padding: '3px 9px',
                              borderRadius: 6, background: badgeBg, color: badgeColor,
                              letterSpacing: '0.04em', flexShrink: 0,
                              minWidth: 40, textAlign: 'center',
                            }}>
                              {badgeLabel}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13, color: '#F0ECE8', margin: 0, lineHeight: 1.55 }}>{text}</p>
                              {deadline && <p style={{ fontSize: 10, color: '#7E8A98', margin: '2px 0 0' }}>{deadline}</p>}
                            </div>
                            <span style={{
                              fontSize: 11, color: '#7E8A98', background: 'var(--surface-sub)',
                              borderRadius: 6, padding: '3px 8px', flexShrink: 0,
                              whiteSpace: 'nowrap',
                            }}>
                              {impact}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── 4. Anomaly Detection ── */}
                {insight.anomalies.length > 0 && (
                  <div
                    style={{
                      background: 'rgba(255,68,102,0.06)',
                      border: '1px solid rgba(255,68,102,0.2)',
                      borderRadius: 14,
                      padding: '18px 20px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'rgba(255,68,102,0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16,
                        }}>
                          ⚠
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#ff4466', margin: 0 }}>
                          이상 감지 — Anomaly Detection
                        </p>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 10px',
                        borderRadius: 20, background: '#ff4466', color: '#fff',
                        letterSpacing: '0.04em',
                      }}>
                        즉시 확인 필요
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {insight.anomalies.map((a, i) => (
                        <div key={i} style={{
                          display: 'flex', gap: 10, alignItems: 'flex-start',
                          padding: '10px 14px',
                          background: 'var(--surface)',
                          border: '1px solid rgba(255,68,102,0.2)',
                          borderRadius: 8,
                        }}>
                          <span style={{ color: '#ff4466', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>!</span>
                          <p style={{ fontSize: 13, color: '#F0ECE8', margin: 0, lineHeight: 1.55 }}>{a}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── 5. Weekly Focus ── */}
                {insight.weeklyFocus && (
                  <div style={{
                    padding: '14px 18px', borderRadius: 10,
                    background: 'rgba(201,53,69,0.06)', border: '1px solid rgba(201,53,69,0.2)',
                  }}>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#E8707E', marginBottom: 6 }}>This Week&apos;s Focus</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#F0ECE8', margin: 0, lineHeight: 1.6 }}>{insight.weeklyFocus}</p>
                  </div>
                )}

                {/* ── 6. Budget Advice ── */}
                {insight.budgetAdvice && (
                  <div style={{
                    padding: '14px 18px', borderRadius: 10,
                    background: 'var(--surface)', border: '1px solid rgba(201,53,69,0.14)',
                  }}>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#7E8A98', marginBottom: 6 }}>Budget Allocation</p>
                    <p style={{ fontSize: 13, color: '#B0B8C4', margin: 0, lineHeight: 1.6 }}>{insight.budgetAdvice}</p>
                  </div>
                )}

                {/* ── 7. Channel Diagnosis ── */}
                {insight.channelDiagnosis && insight.channelDiagnosis.length > 0 && (
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#7E8A98', marginBottom: 10 }}>Channel Diagnosis</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {insight.channelDiagnosis.map((cd, i) => {
                        const statusColor = cd.status === 'growth' ? '#00ff88' : cd.status === 'decline' ? '#ff4466' : '#7E8A98';
                        const statusLabel = cd.status === 'growth' ? '성장' : cd.status === 'decline' ? '하락' : '안정';
                        return (
                          <div key={i} style={{
                            padding: '10px 14px', borderRadius: 8,
                            background: 'var(--surface)', border: '1px solid rgba(201,53,69,0.14)',
                            display: 'flex', gap: 10, alignItems: 'flex-start',
                          }}>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                              background: `${statusColor}15`, color: statusColor, flexShrink: 0, marginTop: 2 }}>{statusLabel}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, fontWeight: 600, color: '#F0ECE8', margin: 0 }}>{cd.channel}</p>
                              <p style={{ fontSize: 11, color: '#7E8A98', margin: '2px 0 0', lineHeight: 1.5 }}>{cd.insight}</p>
                              <p style={{ fontSize: 11, color: '#E8707E', margin: '4px 0 0' }}>{cd.action}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── 8. Page Diagnosis ── */}
                {insight.pageDiagnosis && insight.pageDiagnosis.length > 0 && (
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#7E8A98', marginBottom: 10 }}>Page Diagnosis</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {insight.pageDiagnosis.map((pd, i) => (
                        <div key={i} style={{
                          padding: '10px 14px', borderRadius: 8,
                          background: 'var(--surface)', border: '1px solid rgba(201,53,69,0.14)',
                        }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: '#F0ECE8', margin: 0, fontFamily: 'ui-monospace, monospace' }}>{pd.page}</p>
                          <p style={{ fontSize: 11, color: '#ff4466', margin: '3px 0 0' }}>{pd.issue}</p>
                          <p style={{ fontSize: 11, color: '#E8707E', margin: '2px 0 0' }}>{pd.action}</p>
                          {pd.expectedImpact && (
                            <p style={{ fontSize: 10, color: '#7E8A98', margin: '2px 0 0' }}>{pd.expectedImpact}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
                <p style={{ fontSize: 14, color: '#7E8A98', margin: 0 }}>
                  {isDemo
                    ? 'AI 분석 미리보기 버튼을 클릭하면 데모 인사이트를 확인할 수 있습니다.'
                    : 'AI 분석 실행 버튼을 클릭하면 GA4 데이터를 기반으로 인사이트를 생성합니다.'}
                </p>
                <p style={{ fontSize: 12, color: '#7E8A98', margin: 0 }}>
                  트래픽 패턴, 채널 성과, 이탈률 개선 방향을 AI가 분석합니다.
                </p>
              </div>
            )}
          </div>

          {/* ════════════════════════════════════════════════════════
              Section 8: 시간대별 트래픽 패턴
          ════════════════════════════════════════════════════════ */}
          {hourlyChartData.length > 0 && (
            <div className="panel" style={{ marginBottom: 20, marginTop: 20 }}>
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#E8707E', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  Hourly Pattern
                </p>
                <h2 className="section-title">시간대별 트래픽</h2>
                <p style={{ fontSize: 13, color: '#7E8A98', marginTop: 4 }}>
                  방문이 집중되는 시간대를 파악하세요
                </p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourlyChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={14}>
                  <defs>
                    <linearGradient id="hourlyBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#C93545" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#C93545" stopOpacity={0.45} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#7E8A98' }}
                    tickLine={false}
                    axisLine={false}
                    interval={2}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#7E8A98' }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(201,53,69,0.06)' }}
                  />
                  <Bar dataKey="세션" fill="url(#hourlyBarGrad)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <p style={{ fontSize: 12, color: '#7E8A98', textAlign: 'center', marginTop: 8 }}>
                피크 타임:{' '}
                <strong style={{ color: '#E8707E' }}>{peakHour}시</strong>에 세션이 가장 집중됩니다
              </p>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════
              Section 9: 신규 vs 재방문 사용자
          ════════════════════════════════════════════════════════ */}
          {userType.length > 0 && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#7E8A98', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  User Segments
                </p>
                <h2 className="section-title">신규 vs 재방문 사용자</h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                {/* 신규 사용자 */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(29,78,216,0.06) 0%, rgba(29,78,216,0.1) 100%)',
                    border: '1px solid #bfdbfe',
                    borderRadius: 12,
                    padding: '20px 24px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 20 }}>🆕</span>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', margin: 0 }}>신규 사용자</p>
                  </div>
                  <p style={{ fontSize: '2rem', fontWeight: 800, color: '#60a5fa', margin: '0 0 4px' }}>
                    {(newUser?.activeUsers || 0).toLocaleString('ko-KR')}
                  </p>
                  <p style={{ fontSize: 12, color: '#E8707E', margin: '0 0 14px' }}>
                    전체의 <strong>{newUserPct.toFixed(1)}%</strong>
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#7E8A98' }}>참여율</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa' }}>
                      {((newUser?.engagementRate || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(29,78,216,0.15)', borderRadius: 100, marginTop: 6, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min((newUser?.engagementRate || 0) * 100, 100)}%`,
                        background: '#C93545',
                        borderRadius: 100,
                      }}
                    />
                  </div>
                </div>

                {/* 재방문 사용자 */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(99,102,241,0.08) 100%)',
                    border: '1px solid rgba(99,102,241,0.15)',
                    borderRadius: 12,
                    padding: '20px 24px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 20 }}>🔁</span>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', margin: 0 }}>재방문 사용자</p>
                  </div>
                  <p style={{ fontSize: '2rem', fontWeight: 800, color: '#7c3aed', margin: '0 0 4px' }}>
                    {(returningUser?.activeUsers || 0).toLocaleString('ko-KR')}
                  </p>
                  <p style={{ fontSize: 12, color: '#7E8A98', margin: '0 0 14px' }}>
                    전체의 <strong>{returningUserPct.toFixed(1)}%</strong>
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#7E8A98' }}>참여율</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>
                      {((returningUser?.engagementRate || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(99,102,241,0.15)', borderRadius: 100, marginTop: 6, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min((returningUser?.engagementRate || 0) * 100, 100)}%`,
                        background: '#7E8A98',
                        borderRadius: 100,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Split Bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#E8707E', fontWeight: 600 }}>신규 {newUserPct.toFixed(1)}%</span>
                  <span style={{ fontSize: 12, color: '#7E8A98', fontWeight: 600 }}>재방문 {returningUserPct.toFixed(1)}%</span>
                </div>
                <div style={{ height: 10, background: 'var(--surface-sub)', borderRadius: 100, overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${newUserPct}%`, background: '#C93545', transition: 'width 0.6s ease' }} />
                  <div style={{ width: `${returningUserPct}%`, background: '#7E8A98', transition: 'width 0.6s ease' }} />
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════
              Section 10: 주간 비교 (WoW)
          ════════════════════════════════════════════════════════ */}
          {traffic.length >= 4 && (
            <div className="panel" style={{ marginBottom: 20 }}>
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#ffaa00', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  Week-over-Week
                </p>
                <h2 className="section-title">주간 비교 (WoW)</h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {[
                  {
                    label: '사용자',
                    curr: currWeekTotals.users,
                    prev: prevWeekTotals.users,
                    color: '#E8707E',
                    icon: '👤',
                  },
                  {
                    label: '세션',
                    curr: currWeekTotals.sessions,
                    prev: prevWeekTotals.sessions,
                    color: '#7E8A98',
                    icon: '📊',
                  },
                  {
                    label: '페이지뷰',
                    curr: currWeekTotals.pageViews,
                    prev: prevWeekTotals.pageViews,
                    color: '#ffaa00',
                    icon: '📄',
                  },
                ].map(metric => {
                  const pct = wowPct(metric.curr, metric.prev);
                  const isUp = pct >= 0;
                  return (
                    <div
                      key={metric.label}
                      style={{
                        background: 'var(--surface-sub)',
                        border: '1px solid rgba(201,53,69,0.14)',
                        borderRadius: 12,
                        padding: '18px 20px',
                        borderTop: `3px solid ${metric.color}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                        <span style={{ fontSize: 16 }}>{metric.icon}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#7E8A98' }}>{metric.label}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                          <p style={{ fontSize: 10, color: '#7E8A98', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                            이전 기간
                          </p>
                          <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#7E8A98', margin: 0 }}>
                            {metric.prev.toLocaleString('ko-KR')}
                          </p>
                        </div>
                        <div>
                          <p style={{ fontSize: 10, color: '#7E8A98', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                            현재 기간
                          </p>
                          <p style={{ fontSize: '1.1rem', fontWeight: 800, color: metric.color, margin: 0 }}>
                            {metric.curr.toLocaleString('ko-KR')}
                          </p>
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 13,
                          fontWeight: 700,
                          color: isUp ? '#00ff88' : '#ff4466',
                          background: isUp ? 'rgba(0,255,136,0.06)' : 'rgba(255,68,102,0.06)',
                          borderRadius: 8,
                          padding: '4px 10px',
                        }}
                      >
                        {isUp ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════
              Section 11: 핵심 인사이트 요약
          ════════════════════════════════════════════════════════ */}
          {(hourlyChartData.length > 0 || userType.length > 0 || channels.length > 0) && (
            <div className="panel" style={{ marginBottom: 8 }}>
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#00ff88', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                  Key Insights
                </p>
                <h2 className="section-title">핵심 인사이트 요약</h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {/* 가장 활발한 시간대 */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(29,78,216,0.06) 0%, rgba(29,78,216,0.1) 100%)',
                    border: '1px solid #bfdbfe',
                    borderRadius: 12,
                    padding: '20px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: '#C93545',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        flexShrink: 0,
                      }}
                    >
                      ⏰
                    </span>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa', margin: 0 }}>
                      가장 활발한 시간대
                    </p>
                  </div>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#60a5fa', margin: 0 }}>
                    {peakHour}시
                  </p>
                  <p style={{ fontSize: 12, color: '#E8707E', margin: 0, lineHeight: 1.5 }}>
                    이 시간대에 콘텐츠 발행 및 광고 집중을 권장합니다
                  </p>
                </div>

                {/* 신규 사용자 비율 */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(99,102,241,0.08) 100%)',
                    border: '1px solid rgba(99,102,241,0.15)',
                    borderRadius: 12,
                    padding: '20px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: '#7E8A98',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        flexShrink: 0,
                      }}
                    >
                      🆕
                    </span>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', margin: 0 }}>
                      신규 사용자 비율
                    </p>
                  </div>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#7c3aed', margin: 0 }}>
                    {newUserPct.toFixed(1)}%
                  </p>
                  <p style={{ fontSize: 12, color: '#7E8A98', margin: 0, lineHeight: 1.5 }}>
                    재방문율 {returningUserPct.toFixed(1)}% — 높을수록 브랜드 충성도가 높습니다
                  </p>
                </div>

                {/* 최고 성과 채널 */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(0,255,136,0.06) 0%, rgba(0,255,136,0.1) 100%)',
                    border: '1px solid rgba(0,255,136,0.2)',
                    borderRadius: 12,
                    padding: '20px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: '#00ff88',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        flexShrink: 0,
                      }}
                    >
                      🏆
                    </span>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#00ff88', margin: 0 }}>
                      최고 성과 채널
                    </p>
                  </div>
                  <p
                    style={{
                      fontSize: '1.1rem',
                      fontWeight: 800,
                      color: '#00ff88',
                      margin: 0,
                      wordBreak: 'break-all',
                      fontFamily: 'ui-monospace, monospace',
                    }}
                  >
                    {bestChannel}
                  </p>
                  <p style={{ fontSize: 12, color: '#00ff88', margin: 0, lineHeight: 1.5 }}>
                    {channels.length > 0
                      ? `${channels[0].sessions.toLocaleString('ko-KR')}세션으로 가장 높은 유입량`
                      : '채널 데이터 없음'}
                  </p>
                </div>
              </div>
            </div>
          )}
          {/* ════════════════════════════════════════════════════════
              Section 12: DAU/WAU/MAU 스티키니스
          ════════════════════════════════════════════════════════ */}
          {stickiness.length > 0 && (() => {
            const stickyData = stickiness.map(d => ({
              date: fmtDate(d.date),
              DAU: d.dau,
              WAU: d.wau,
              MAU: d.mau,
            }));
            const latest = stickiness[stickiness.length - 1];
            const dauMau = latest && latest.mau > 0 ? ((latest.dau / latest.mau) * 100).toFixed(1) : '0';
            const dauWau = latest && latest.wau > 0 ? ((latest.dau / latest.wau) * 100).toFixed(1) : '0';
            return (
              <div className="ops-zone" style={{ marginBottom: 20 }}>
                <div className="ops-zone-head">
                  <span className="ops-zone-label">Stickiness</span>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <span style={{ fontSize: 10, color: '#7E8A98' }}>DAU/MAU <strong style={{ color: '#F0ECE8' }}>{dauMau}%</strong></span>
                    <span style={{ fontSize: 10, color: '#7E8A98' }}>DAU/WAU <strong style={{ color: '#F0ECE8' }}>{dauWau}%</strong></span>
                  </div>
                </div>
                <div style={{ padding: 16 }}>
                  <h2 className="section-title" style={{ marginBottom: 16 }}>사용자 정착도</h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={stickyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradDAU" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#C93545" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#C93545" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,53,69,0.08)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7E8A98' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#7E8A98' }} axisLine={false} tickLine={false} width={45} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="MAU" stroke="#6366f1" strokeWidth={1.5} fill="none" dot={false} />
                      <Area type="monotone" dataKey="WAU" stroke="#0066ff" strokeWidth={1.5} fill="none" dot={false} />
                      <Area type="monotone" dataKey="DAU" stroke="#C93545" strokeWidth={2} fill="url(#gradDAU)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}

          {/* ════════════════════════════════════════════════════════
              Section 13: 채널별 전환 기여도
          ════════════════════════════════════════════════════════ */}
          {channelConv.length > 0 && (() => {
            const totalConv = channelConv.reduce((s, c) => s + c.conversions, 0);
            const CONV_COLORS = ['#C93545', '#0066ff', '#ffaa00', '#00ff88', '#6366f1', '#E8707E', '#7E8A98'];
            return (
              <div className="ops-zone" style={{ marginBottom: 20 }}>
                <div className="ops-zone-head">
                  <span className="ops-zone-label">Channel Attribution</span>
                  <span style={{ fontSize: 10, color: '#7E8A98' }}>전환 합계 <strong style={{ color: '#F0ECE8' }}>{totalConv.toLocaleString()}</strong></span>
                </div>
                <div style={{ padding: 16 }}>
                  <h2 className="section-title" style={{ marginBottom: 16 }}>채널별 전환 기여</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {channelConv.map((c, i) => {
                      const pct = totalConv > 0 ? (c.conversions / totalConv * 100) : 0;
                      const color = CONV_COLORS[i % CONV_COLORS.length];
                      return (
                        <div key={c.channel}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                            <span style={{ fontSize: 12, color: '#F0ECE8', fontWeight: 500 }}>{c.channel}</span>
                            <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#7E8A98' }}>
                              <span>{c.conversions.toLocaleString()} 전환</span>
                              <span>{c.sessions.toLocaleString()} 세션</span>
                              <span style={{ color: '#E8707E', fontWeight: 600 }}>{pct.toFixed(1)}%</span>
                            </div>
                          </div>
                          <div className="ops-bar-track" style={{ height: 6 }}>
                            <div className="ops-bar-fill" style={{ width: `${Math.max(2, pct)}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ════════════════════════════════════════════════════════
              Section 14: 콘텐츠 그룹별 성과
          ════════════════════════════════════════════════════════ */}
          {pages.length > 0 && (() => {
            const groups: Record<string, { views: number; users: number; pages: string[] }> = {};
            const classify = (path: string) => {
              if (path.startsWith('/movie')) return '영화';
              if (path.startsWith('/booking')) return '예매';
              if (path.startsWith('/space')) return '공간';
              if (path.startsWith('/login') || path === '/login_popup') return '로그인';
              if (path.startsWith('/blog') || path.startsWith('/community')) return '콘텐츠';
              return '기타';
            };
            for (const p of pages) {
              const g = classify(p.pagePath);
              if (!groups[g]) groups[g] = { views: 0, users: 0, pages: [] };
              groups[g].views += p.screenPageViews;
              groups[g].users += p.activeUsers;
              if (groups[g].pages.length < 3) groups[g].pages.push(p.pagePath);
            }
            const totalViews = Object.values(groups).reduce((s, g) => s + g.views, 0);
            const sorted = Object.entries(groups).sort((a, b) => b[1].views - a[1].views);
            const GROUP_COLORS: Record<string, string> = {
              '영화': '#C93545', '예매': '#0066ff', '공간': '#6366f1',
              '로그인': '#ffaa00', '콘텐츠': '#00ff88', '기타': '#7E8A98',
            };
            return (
              <div className="ops-zone" style={{ marginBottom: 20 }}>
                <div className="ops-zone-head">
                  <span className="ops-zone-label">Content Groups</span>
                </div>
                <div style={{ padding: 16 }}>
                  <h2 className="section-title" style={{ marginBottom: 16 }}>콘텐츠 그룹별 성과</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sorted.map(([name, data]) => {
                      const pct = totalViews > 0 ? (data.views / totalViews * 100) : 0;
                      return (
                        <div key={name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 2, background: GROUP_COLORS[name] || '#7E8A98', flexShrink: 0 }} />
                              <span style={{ fontSize: 12, color: '#F0ECE8', fontWeight: 600 }}>{name}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#7E8A98' }}>
                              <span>{data.views.toLocaleString()} 조회</span>
                              <span>{data.users.toLocaleString()} 사용자</span>
                              <span style={{ color: '#E8707E', fontWeight: 600 }}>{pct.toFixed(1)}%</span>
                            </div>
                          </div>
                          <div className="ops-bar-track" style={{ height: 5 }}>
                            <div className="ops-bar-fill" style={{ width: `${Math.max(2, pct)}%`, backgroundColor: GROUP_COLORS[name] || '#7E8A98' }} />
                          </div>
                          <p style={{ fontSize: 9, color: '#4A5568', marginTop: 2 }}>{data.pages.join(', ')}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ════════════════════════════════════════════════════════
              Section 15: 이상 트래픽 로그
          ════════════════════════════════════════════════════════ */}
          {forecastData && forecastData.forecast && (() => {
            const anomalies = forecastData.forecast.filter(d => d.isAnomaly);
            if (anomalies.length === 0) return null;
            return (
              <div className="ops-zone" style={{ marginBottom: 20 }}>
                <div className="ops-zone-head">
                  <span className="ops-zone-label">Anomaly Log</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#ff4466' }}>{anomalies.length} detected</span>
                </div>
                <div style={{ padding: 0 }}>
                  {anomalies.map((a, i) => (
                    <div key={i} className="ops-row" style={{ padding: '8px 16px' }}>
                      <span className="ops-dot" style={{ backgroundColor: '#ff4466' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#F0ECE8' }}>{fmtDate(a.date)}</span>
                        <span style={{ fontSize: 10, color: '#7E8A98', marginLeft: 8 }}>
                          실제 {a.activeUsers.toLocaleString()}명
                          {a.forecastValue != null && ` vs 예측 ${Math.round(a.forecastValue).toLocaleString()}명`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
