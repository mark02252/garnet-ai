// Dynamic import로 변경 — Turbopack에서 google-gax top-level import 크래시 방지
let _analyticsClient: InstanceType<typeof import('@google-analytics/data').BetaAnalyticsDataClient> | null = null;

async function getAnalyticsClient(credentials: { clientEmail: string; privateKey: string }) {
  if (!_analyticsClient) {
    const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
    _analyticsClient = new BetaAnalyticsDataClient({
      credentials: {
        client_email: credentials.clientEmail,
        private_key: credentials.privateKey,
      },
    });
  }
  return _analyticsClient;
}

import { runLLM } from '@/lib/llm';
import type { RuntimeConfig } from '@/lib/types';

type GA4Credentials = {
  propertyId: string;
  clientEmail: string;
  privateKey: string;
};

export type GA4ReportRow = {
  dimensions: Record<string, string>;
  metrics: Record<string, string>;
};

export type GA4DailyTraffic = {
  date: string;
  activeUsers: number;
  sessions: number;
  screenPageViews: number;
  eventCount: number;
  conversions: number;
};

export type GA4ChannelBreakdown = {
  source: string;
  medium: string;
  sessions: number;
  activeUsers: number;
  conversions: number;
};

export type GA4PagePerformance = {
  pagePath: string;
  screenPageViews: number;
  activeUsers: number;
  averageSessionDuration: number;
};

export type GA4AiInsight = {
  summary: string;
  highlights: string[];
  recommendations: Array<string | { priority?: string; action: string; expectedROI?: string; deadline?: string }>;
  anomalies: string[];
  channelDiagnosis?: Array<{ channel: string; status: string; insight: string; action: string }>;
  pageDiagnosis?: Array<{ page: string; issue: string; action: string; expectedImpact?: string }>;
  weeklyFocus?: string;
  budgetAdvice?: string;
  generatedAt: Date;
};

function resolveCredentials(): GA4Credentials | null {
  const propertyId = process.env.GA4_PROPERTY_ID || '';
  const clientEmail = process.env.GA4_CLIENT_EMAIL || '';
  let privateKey = process.env.GA4_PRIVATE_KEY || '';
  // Base64 인코딩된 키 지원 (Vercel에서 멀티라인 문제 방지)
  if (privateKey && !privateKey.includes('BEGIN')) {
    try { privateKey = Buffer.from(privateKey, 'base64').toString('utf-8'); } catch { /* ignore */ }
  }
  privateKey = privateKey.replace(/\\n/g, '\n');

  if (!propertyId || !clientEmail || !privateKey) return null;
  return { propertyId, clientEmail, privateKey };
}

async function createClient(creds: GA4Credentials) {
  return getAnalyticsClient({ clientEmail: creds.clientEmail, privateKey: creds.privateKey });
}

export function isGA4Configured(): boolean {
  return resolveCredentials() !== null;
}

export async function fetchDailyTraffic(startDate: string, endDate: string): Promise<GA4DailyTraffic[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');

  const client = await createClient(creds);
  const [response] = await client.runReport({
    property: `properties/${creds.propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'activeUsers' },
      { name: 'sessions' },
      { name: 'screenPageViews' },
      { name: 'eventCount' },
      { name: 'conversions' }
    ],
    orderBys: [{ dimension: { dimensionName: 'date' } }]
  });

  return (response.rows || []).map((row) => ({
    date: row.dimensionValues?.[0]?.value || '',
    activeUsers: Number(row.metricValues?.[0]?.value || 0),
    sessions: Number(row.metricValues?.[1]?.value || 0),
    screenPageViews: Number(row.metricValues?.[2]?.value || 0),
    eventCount: Number(row.metricValues?.[3]?.value || 0),
    conversions: Number(row.metricValues?.[4]?.value || 0)
  }));
}

export async function fetchChannelBreakdown(startDate: string, endDate: string): Promise<GA4ChannelBreakdown[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');

  const client = await createClient(creds);
  const [response] = await client.runReport({
    property: `properties/${creds.propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'conversions' }
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 20
  });

  return (response.rows || []).map((row) => ({
    source: row.dimensionValues?.[0]?.value || '(direct)',
    medium: row.dimensionValues?.[1]?.value || '(none)',
    sessions: Number(row.metricValues?.[0]?.value || 0),
    activeUsers: Number(row.metricValues?.[1]?.value || 0),
    conversions: Number(row.metricValues?.[2]?.value || 0)
  }));
}

export async function fetchPagePerformance(startDate: string, endDate: string): Promise<GA4PagePerformance[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');

  const client = await createClient(creds);
  const [response] = await client.runReport({
    property: `properties/${creds.propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'activeUsers' },
      { name: 'averageSessionDuration' }
    ],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 30
  });

  return (response.rows || []).map((row) => ({
    pagePath: row.dimensionValues?.[0]?.value || '/',
    screenPageViews: Number(row.metricValues?.[0]?.value || 0),
    activeUsers: Number(row.metricValues?.[1]?.value || 0),
    averageSessionDuration: Number(row.metricValues?.[2]?.value || 0)
  }));
}

export async function fetchRealtimeActiveUsers(): Promise<number> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');

  const client = await createClient(creds);
  const [response] = await client.runRealtimeReport({
    property: `properties/${creds.propertyId}`,
    metrics: [{ name: 'activeUsers' }]
  });

  return Number(response.rows?.[0]?.metricValues?.[0]?.value || 0);
}

export type GA4EngagementMetrics = {
  date: string;
  engagementRate: number;
  bounceRate: number;
  averageSessionDuration: number;
  screenPageViewsPerSession: number;
  sessionsPerUser: number;
};

export type GA4DeviceBreakdown = {
  deviceCategory: string;
  sessions: number;
  activeUsers: number;
  engagementRate: number;
  bounceRate: number;
};

export type GA4GeoBreakdown = {
  country: string;
  activeUsers: number;
  sessions: number;
};

export type GA4LandingPage = {
  landingPage: string;
  sessions: number;
  bounceRate: number;
  engagementRate: number;
};

export async function fetchEngagementMetrics(startDate: string, endDate: string): Promise<GA4EngagementMetrics[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');
  const client = await createClient(creds);
  const [response] = await client.runReport({
    property: `properties/${creds.propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'engagementRate' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'screenPageViewsPerSession' },
      { name: 'sessionsPerUser' }
    ],
    orderBys: [{ dimension: { dimensionName: 'date' } }]
  });
  return (response.rows || []).map(row => ({
    date: row.dimensionValues?.[0]?.value || '',
    engagementRate: Number(row.metricValues?.[0]?.value || 0),
    bounceRate: Number(row.metricValues?.[1]?.value || 0),
    averageSessionDuration: Number(row.metricValues?.[2]?.value || 0),
    screenPageViewsPerSession: Number(row.metricValues?.[3]?.value || 0),
    sessionsPerUser: Number(row.metricValues?.[4]?.value || 0)
  }));
}

export async function fetchDeviceBreakdown(startDate: string, endDate: string): Promise<GA4DeviceBreakdown[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');
  const client = await createClient(creds);
  const [response] = await client.runReport({
    property: `properties/${creds.propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'engagementRate' },
      { name: 'bounceRate' }
    ]
  });
  return (response.rows || []).map(row => ({
    deviceCategory: row.dimensionValues?.[0]?.value || '',
    sessions: Number(row.metricValues?.[0]?.value || 0),
    activeUsers: Number(row.metricValues?.[1]?.value || 0),
    engagementRate: Number(row.metricValues?.[2]?.value || 0),
    bounceRate: Number(row.metricValues?.[3]?.value || 0)
  }));
}

export async function fetchGeoBreakdown(startDate: string, endDate: string): Promise<GA4GeoBreakdown[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');
  const client = await createClient(creds);
  const [response] = await client.runReport({
    property: `properties/${creds.propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'country' }],
    metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
    limit: 10,
    orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }]
  });
  return (response.rows || []).map(row => ({
    country: row.dimensionValues?.[0]?.value || '',
    activeUsers: Number(row.metricValues?.[0]?.value || 0),
    sessions: Number(row.metricValues?.[1]?.value || 0)
  }));
}

export async function fetchLandingPages(startDate: string, endDate: string): Promise<GA4LandingPage[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');
  const client = await createClient(creds);
  const [response] = await client.runReport({
    property: `properties/${creds.propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'landingPage' }],
    metrics: [
      { name: 'sessions' },
      { name: 'bounceRate' },
      { name: 'engagementRate' }
    ],
    limit: 15,
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
  });
  return (response.rows || []).map(row => ({
    landingPage: row.dimensionValues?.[0]?.value || '',
    sessions: Number(row.metricValues?.[0]?.value || 0),
    bounceRate: Number(row.metricValues?.[1]?.value || 0),
    engagementRate: Number(row.metricValues?.[2]?.value || 0)
  }));
}

export type GA4HourlyPattern = {
  hour: string;
  activeUsers: number;
  sessions: number;
};

export async function fetchHourlyPattern(startDate: string, endDate: string): Promise<GA4HourlyPattern[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');
  const client = await createClient(creds);
  const [response] = await client.runReport({
    property: `properties/${creds.propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'hour' }],
    metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
    orderBys: [{ dimension: { dimensionName: 'hour' } }]
  });
  return (response.rows || []).map(row => ({
    hour: row.dimensionValues?.[0]?.value || '',
    activeUsers: Number(row.metricValues?.[0]?.value || 0),
    sessions: Number(row.metricValues?.[1]?.value || 0)
  }));
}

export type GA4NewVsReturning = {
  userType: string;
  activeUsers: number;
  sessions: number;
  engagementRate: number;
};

export async function fetchNewVsReturning(startDate: string, endDate: string): Promise<GA4NewVsReturning[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');
  const client = await createClient(creds);
  const [response] = await client.runReport({
    property: `properties/${creds.propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'newVsReturning' }],
    metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'engagementRate' }]
  });
  return (response.rows || []).map(row => ({
    userType: row.dimensionValues?.[0]?.value || '',
    activeUsers: Number(row.metricValues?.[0]?.value || 0),
    sessions: Number(row.metricValues?.[1]?.value || 0),
    engagementRate: Number(row.metricValues?.[2]?.value || 0)
  }));
}

// ── Tier 2+ API functions ──────────────────────────────────────────────────

export type GA4ChannelTrend = {
  date: string;
  channel: string;
  sessions: number;
};

export async function fetchChannelTrend(startDate: string, endDate: string): Promise<GA4ChannelTrend[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');
  const client = await createClient(creds);
  const [response] = await client.runReport({
    property: `properties/${creds.propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
    limit: 500,
  });
  return (response.rows || []).map(row => ({
    date: row.dimensionValues?.[0]?.value || '',
    channel: row.dimensionValues?.[1]?.value || 'Other',
    sessions: Number(row.metricValues?.[0]?.value || 0),
  }));
}

export type GA4Stickiness = {
  date: string;
  dau: number;
  wau: number;
  mau: number;
};

export async function fetchStickiness(startDate: string, endDate: string): Promise<GA4Stickiness[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');
  const client = await createClient(creds);
  const [response] = await client.runReport({
    property: `properties/${creds.propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'active1DayUsers' },
      { name: 'active7DayUsers' },
      { name: 'active28DayUsers' },
    ],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  });
  return (response.rows || []).map(row => ({
    date: row.dimensionValues?.[0]?.value || '',
    dau: Number(row.metricValues?.[0]?.value || 0),
    wau: Number(row.metricValues?.[1]?.value || 0),
    mau: Number(row.metricValues?.[2]?.value || 0),
  }));
}

export type GA4ChannelConversion = {
  channel: string;
  sessions: number;
  conversions: number;
  engagementRate: number;
};

export async function fetchChannelConversions(startDate: string, endDate: string): Promise<GA4ChannelConversion[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');
  const client = await createClient(creds);
  const [response] = await client.runReport({
    property: `properties/${creds.propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [
      { name: 'sessions' },
      { name: 'conversions' },
      { name: 'engagementRate' },
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 10,
  });
  return (response.rows || []).map(row => ({
    channel: row.dimensionValues?.[0]?.value || 'Other',
    sessions: Number(row.metricValues?.[0]?.value || 0),
    conversions: Number(row.metricValues?.[1]?.value || 0),
    engagementRate: Number(row.metricValues?.[2]?.value || 0),
  }));
}

// ── Ecommerce / Purchase ─────────────────────────────────────────────────

export type GA4EcommerceData = {
  date: string;
  transactions: number;
  revenue: number;        // 원 단위
  purchaseRate: number;   // 구매 전환율 (0-1)
  avgOrderValue: number;  // 평균 주문 금액
};

export async function fetchEcommerceData(startDate: string, endDate: string): Promise<GA4EcommerceData[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');
  const client = await createClient(creds);
  const [response] = await client.runReport({
    property: `properties/${creds.propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'totalPurchasers' },     // 실제 구매자 수 (유니크)
      { name: 'purchaseRevenue' },      // 구매 수익
      { name: 'totalUsers' },           // 전체 사용자
    ],
    orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
  });
  return (response.rows || []).map(row => {
    const purchasers = Number(row.metricValues?.[0]?.value || 0);
    const revenue = Number(row.metricValues?.[1]?.value || 0);
    const totalUsers = Number(row.metricValues?.[2]?.value || 0);
    return {
      date: row.dimensionValues?.[0]?.value || '',
      transactions: purchasers,  // 실제 구매자 수
      revenue: Math.round(revenue),
      purchaseRate: totalUsers > 0 ? purchasers / totalUsers : 0, // 구매자/전체사용자
      avgOrderValue: purchasers > 0 ? Math.round(revenue / purchasers) : 0,
    };
  });
}

export type GA4EcommerceSummary = {
  totalTransactions: number;
  totalRevenue: number;
  avgPurchaseRate: number;
  avgOrderValue: number;
  dailyData: GA4EcommerceData[];
};

export async function fetchEcommerceSummary(days = 30): Promise<GA4EcommerceSummary> {
  const endDate = 'today';
  const startDate = `${days}daysAgo`;
  const data = await fetchEcommerceData(startDate, endDate);

  const totalTransactions = data.reduce((s, d) => s + d.transactions, 0);
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const totalSessions = data.reduce((s, d) => {
    // purchaseRate = transactions/sessions → sessions = transactions/purchaseRate
    return s + (d.purchaseRate > 0 ? d.transactions / d.purchaseRate : 0);
  }, 0);

  return {
    totalTransactions,
    totalRevenue,
    avgPurchaseRate: totalSessions > 0 ? totalTransactions / totalSessions : 0,
    avgOrderValue: totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0,
    dailyData: data,
  };
}

// ── Ecommerce Funnel ─────────────────────────────────────────────────────

export type GA4FunnelStage = {
  eventName: string;
  label: string;
  count: number;
  dropRate: number;   // 이전 단계 대비 이탈률 (0~1)
  continueRate: number; // 이전 단계 대비 진행률 (0~1)
};

const FUNNEL_DEFINITION: Array<{ eventName: string; label: string }> = [
  { eventName: 'view_item_list', label: '영화 목록 조회' },
  { eventName: 'view_item', label: '예매 페이지 진입' },
  { eventName: 'begin_checkout', label: '상영시간 선택' },
  { eventName: 'add_shipping_info', label: '좌석 확정' },
  { eventName: 'add_payment_info', label: '결제수단 선택' },
  { eventName: 'purchase', label: '결제 완료' },
];

export async function fetchEcommerceFunnel(days = 7): Promise<GA4FunnelStage[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');
  const client = await createClient(creds);

  const [response] = await client.runReport({
    property: `properties/${creds.propertyId}`,
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: {
          values: FUNNEL_DEFINITION.map(f => f.eventName),
        },
      },
    },
  });

  const counts: Record<string, number> = {};
  for (const row of response.rows || []) {
    const name = row.dimensionValues?.[0]?.value || '';
    counts[name] = Number(row.metricValues?.[0]?.value || 0);
  }

  const stages: GA4FunnelStage[] = [];
  let prevCount = 0;
  for (let i = 0; i < FUNNEL_DEFINITION.length; i++) {
    const def = FUNNEL_DEFINITION[i];
    const count = counts[def.eventName] || 0;
    const continueRate = i === 0 ? 1 : (prevCount > 0 ? count / prevCount : 0);
    const dropRate = 1 - continueRate;
    stages.push({
      eventName: def.eventName,
      label: def.label,
      count,
      continueRate,
      dropRate,
    });
    if (count > 0) prevCount = count;
  }

  return stages;
}

// ── Per-Movie Revenue ────────────────────────────────────────────────────

export type GA4MovieRevenue = {
  itemName: string;
  itemId: string;
  purchased: number;
  revenue: number;
};

/** 영화별 매출 상위 N개 (itemName 기준, 표준 이커머스 디멘션) */
export async function fetchMovieRevenueTop(days = 7, limit = 10): Promise<GA4MovieRevenue[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');
  const client = await createClient(creds);

  const [response] = await client.runReport({
    property: `properties/${creds.propertyId}`,
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'itemName' }, { name: 'itemId' }],
    metrics: [{ name: 'itemsPurchased' }, { name: 'itemRevenue' }],
    orderBys: [{ metric: { metricName: 'itemRevenue' }, desc: true }],
    limit,
  });

  return (response.rows || [])
    .map(row => ({
      itemName: row.dimensionValues?.[0]?.value || '(없음)',
      itemId: row.dimensionValues?.[1]?.value || '',
      purchased: Number(row.metricValues?.[0]?.value || 0),
      revenue: Math.round(Number(row.metricValues?.[1]?.value || 0)),
    }))
    .filter(m => m.revenue > 0);
}

// ── Per-Theater Revenue ──────────────────────────────────────────────────

export type GA4TheaterRevenue = {
  theaterCode: string;
  theaterName: string;
  purchased: number;
  revenue: number;
};

export type GA4TheaterUnmappedSummary = {
  unmappedCount: number;
  unmappedRevenue: number;
  unmappedRatio: number;
};

/**
 * 지점별 매출 상위 N개 (customEvent:theater_code 기준)
 * GA4에 theater_code가 Custom Dimension으로 등록되어야 조회 가능
 */
export async function fetchTheaterRevenueTop(days = 7, limit = 10): Promise<GA4TheaterRevenue[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');
  const client = await createClient(creds);

  try {
    const [response] = await client.runReport({
      property: `properties/${creds.propertyId}`,
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'customEvent:theater_code' }],
      metrics: [{ name: 'eventCount' }, { name: 'eventValue' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', stringFilter: { value: 'purchase', matchType: 'EXACT' } },
      },
      orderBys: [{ metric: { metricName: 'eventValue' }, desc: true }],
      limit,
    });

    const { mapTheaterCode } = await import('@/lib/theater-mapping');
    return (response.rows || [])
      .map(row => {
        const code = row.dimensionValues?.[0]?.value || '(없음)';
        return {
          theaterCode: code,
          theaterName: mapTheaterCode(code),
          purchased: Number(row.metricValues?.[0]?.value || 0),
          revenue: Math.round(Number(row.metricValues?.[1]?.value || 0)),
        };
      })
      .filter(t => t.theaterCode && t.theaterCode !== '(not set)');
  } catch {
    // Custom Dimension 미등록 시 빈 배열
    return [];
  }
}

/**
 * 미분류 (theater_code 누락) 결제 통계 조회
 */
export async function fetchUnmappedTheaterStats(days = 7): Promise<GA4TheaterUnmappedSummary> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');
  const client = await createClient(creds);

  try {
    const [response] = await client.runReport({
      property: `properties/${creds.propertyId}`,
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'customEvent:theater_code' }],
      metrics: [{ name: 'eventCount' }, { name: 'eventValue' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', stringFilter: { value: 'purchase', matchType: 'EXACT' } },
      },
    });

    let totalCount = 0, totalRev = 0, unmappedCount = 0, unmappedRev = 0;
    for (const row of response.rows || []) {
      const code = row.dimensionValues?.[0]?.value || '';
      const cnt = Number(row.metricValues?.[0]?.value || 0);
      const rev = Number(row.metricValues?.[1]?.value || 0);
      totalCount += cnt;
      totalRev += rev;
      if (!code || code === '(not set)' || code === '') {
        unmappedCount += cnt;
        unmappedRev += rev;
      }
    }
    return {
      unmappedCount,
      unmappedRevenue: Math.round(unmappedRev),
      unmappedRatio: totalCount > 0 ? unmappedCount / totalCount : 0,
    };
  } catch {
    return { unmappedCount: 0, unmappedRevenue: 0, unmappedRatio: 0 };
  }
}

// ── Cohort Retention ──────────────────────────────────────────────────────

export type GA4CohortRetention = {
  cohort: string; // 코호트 시작 주 (e.g. "2026-03-10")
  week: number;   // 0 = 첫 주, 1 = 1주차, ...
  users: number;
  retentionRate: number; // 0-1
};

export async function fetchCohortRetention(weeks = 6): Promise<GA4CohortRetention[]> {
  const creds = resolveCredentials();
  if (!creds) throw new Error('GA4 credentials not configured');
  const client = await createClient(creds);

  // 코호트: 최근 N주의 주별 코호트, 주별 리텐션
  const cohorts = [];
  const now = new Date();
  for (let i = 0; i < weeks; i++) {
    const start = new Date(now);
    start.setDate(start.getDate() - (i + 1) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    cohorts.push({
      name: `week_${i}`,
      dimension: 'firstSessionDate',
      dateRange: {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      },
    });
  }

  try {
    const [response] = await client.runReport({
      property: `properties/${creds.propertyId}`,
      cohortSpec: {
        cohorts,
        cohortsRange: {
          granularity: 'WEEKLY',
          startOffset: 0,
          endOffset: weeks - 1,
        },
      },
      dimensions: [
        { name: 'cohort' },
        { name: 'cohortNthWeek' },
      ],
      metrics: [
        { name: 'cohortActiveUsers' },
        { name: 'cohortTotalUsers' },
      ],
    });

    return (response.rows || []).map(row => {
      const cohortName = row.dimensionValues?.[0]?.value || '';
      const nthWeek = Number(row.dimensionValues?.[1]?.value || 0);
      const activeUsers = Number(row.metricValues?.[0]?.value || 0);
      const totalUsers = Number(row.metricValues?.[1]?.value || 0);

      // cohortName → 실제 날짜로 변환
      const cohortIndex = cohorts.findIndex(c => c.name === cohortName);
      const cohortDate = cohortIndex >= 0 ? cohorts[cohortIndex].dateRange.startDate : cohortName;

      return {
        cohort: cohortDate,
        week: nthWeek,
        users: activeUsers,
        retentionRate: totalUsers > 0 ? activeUsers / totalUsers : 0,
      };
    });
  } catch (e) {
    console.error('[GA4 Cohort] Error:', e instanceof Error ? e.message : e);
    return [];
  }
}

export type GA4AiAnalysisInput = {
  traffic: GA4DailyTraffic[];
  channels: GA4ChannelBreakdown[];
  pages: GA4PagePerformance[];
  engagement?: GA4EngagementMetrics[];
  devices?: GA4DeviceBreakdown[];
  landingPages?: { landingPage: string; sessions: number; bounceRate: number; engagementRate: number }[];
  newVsReturning?: { userType: string; activeUsers: number; sessions: number; engagementRate: number }[];
  channelConversions?: GA4ChannelConversion[];
  stickiness?: GA4Stickiness[];
};

export async function analyzeGA4WithAI(
  traffic: GA4DailyTraffic[],
  channels: GA4ChannelBreakdown[],
  pages: GA4PagePerformance[],
  runtime?: RuntimeConfig,
  extraData?: Partial<GA4AiAnalysisInput>
): Promise<GA4AiInsight> {
  // Business Context 주입
  let bizContext = ''
  try {
    const { getBusinessContextPrompt } = await import('@/lib/business-context')
    bizContext = getBusinessContextPrompt()
  } catch { /* skip */ }

  const systemPrompt = `당신은 10년차 퍼포먼스 마케터이자 GA4 분석 전문가입니다.
데이터를 기반으로 실행 가능한 인사이트를 도출합니다.
${bizContext ? `\n${bizContext}\n위 비즈니스 맥락을 반드시 반영하여 분석하세요.\n` : ''}
중요: 제공된 데이터에서 당일(오늘) 데이터는 이미 제외되어 있습니다. 모든 수치는 완료된 날짜 기준입니다. 마지막 날짜의 수치가 낮더라도 당일 수집 미완료 때문이 아닌 실제 하락인지 확인 후 판단하세요.

반드시 아래 JSON 형식으로만 출력하세요:
{
  "summary": "3-4문장의 경영진 브리핑. 핵심 수치와 트렌드 방향을 포함",
  "channelDiagnosis": [
    {"channel": "채널명", "status": "growth|decline|stable", "insight": "1-2문장 진단", "action": "구체적 액션"}
  ],
  "pageDiagnosis": [
    {"page": "페이지경로", "issue": "문제점", "action": "개선안", "expectedImpact": "예상효과"}
  ],
  "highlights": ["주요 발견 1", "주요 발견 2", "주요 발견 3"],
  "recommendations": [
    {"priority": "high|medium|low", "action": "구체적 권고", "expectedROI": "예상 효과 수치", "deadline": "실행 시점"}
  ],
  "anomalies": ["이상징후 또는 없음"],
  "weeklyFocus": "이번 주 가장 먼저 해야 할 한 가지 액션",
  "budgetAdvice": "예산 배분 관련 제안 (채널별 비중 조정 등)"
}`;

  // 당일 데이터 제외 (실시간 수집 중이므로 불완전)
  const todayYMD = (() => {
    const n = new Date(); const y = n.getFullYear();
    const m = String(n.getMonth() + 1).padStart(2, '0');
    const d = String(n.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  })();
  const completedTraffic = traffic.filter(d => d.date.replace(/-/g, '') !== todayYMD);

  // 전체 기간 트래픽 (최대 30일, 당일 제외)
  const trafficFull = completedTraffic.slice(-30).map(d => ({
    date: d.date, users: d.activeUsers, sessions: d.sessions,
    pageViews: d.screenPageViews, events: d.eventCount, conversions: d.conversions ?? 0
  }));

  // WoW 계산 (당일 제외)
  const recent7 = completedTraffic.slice(-7);
  const prev7 = completedTraffic.slice(-14, -7);
  const sumField = (arr: GA4DailyTraffic[], key: keyof GA4DailyTraffic) => arr.reduce((s, d) => s + (Number(d[key]) || 0), 0);
  const wow = prev7.length >= 7 ? {
    sessions: `${((sumField(recent7, 'sessions') / sumField(prev7, 'sessions') - 1) * 100).toFixed(1)}%`,
    users: `${((sumField(recent7, 'activeUsers') / sumField(prev7, 'activeUsers') - 1) * 100).toFixed(1)}%`,
    conversions: `${((sumField(recent7, 'conversions') / sumField(prev7, 'conversions') - 1) * 100).toFixed(1)}%`,
  } : null;

  // 채널 데이터 (전체)
  const channelData = channels.slice(0, 10).map(c => ({
    source: c.source, medium: c.medium, sessions: c.sessions,
    users: c.activeUsers, conversions: c.conversions
  }));

  // 페이지 성과 (Top 10)
  const pageData = pages.slice(0, 10).map(p => ({
    path: p.pagePath, views: p.screenPageViews, users: p.activeUsers,
    avgDuration: Math.round(p.averageSessionDuration)
  }));

  // 참여도 요약
  const engSummary = extraData?.engagement?.length ? (() => {
    const eng = extraData.engagement!;
    const avgEngRate = (eng.reduce((s, d) => s + d.engagementRate, 0) / eng.length * 100).toFixed(1);
    const avgBounce = (eng.reduce((s, d) => s + d.bounceRate, 0) / eng.length * 100).toFixed(1);
    const avgPPV = (eng.reduce((s, d) => s + d.screenPageViewsPerSession, 0) / eng.length).toFixed(2);
    return { avgEngagementRate: `${avgEngRate}%`, avgBounceRate: `${avgBounce}%`, avgPagesPerSession: avgPPV };
  })() : null;

  // 디바이스 요약
  const deviceSummary = extraData?.devices?.map(d => ({
    device: d.deviceCategory, sessions: d.sessions, engRate: `${(d.engagementRate * 100).toFixed(1)}%`
  }));

  // 랜딩 페이지 이탈률 Top 5
  const highBounceLPs = extraData?.landingPages
    ?.filter(lp => lp.sessions > 50)
    ?.sort((a, b) => b.bounceRate - a.bounceRate)
    ?.slice(0, 5)
    ?.map(lp => ({ page: lp.landingPage, bounceRate: `${(lp.bounceRate * 100).toFixed(1)}%`, sessions: lp.sessions }));

  // 신규 vs 재방문
  const userTypeSummary = extraData?.newVsReturning?.map(u => ({
    type: u.userType, users: u.activeUsers, engRate: `${(u.engagementRate * 100).toFixed(1)}%`
  }));

  // 스티키니스 (최신값)
  const stickyLatest = extraData?.stickiness?.length ? (() => {
    const s = extraData.stickiness![extraData.stickiness!.length - 1];
    return { dau: s.dau, wau: s.wau, mau: s.mau, dauMauRatio: `${((s.dau / Math.max(s.mau, 1)) * 100).toFixed(1)}%` };
  })() : null;

  const userPrompt = `GA4 분석 데이터 (10년차 마케터 관점으로 분석해주세요):

■ 트래픽 추세 (${trafficFull.length}일):
${JSON.stringify(trafficFull)}

■ WoW 변화: ${wow ? JSON.stringify(wow) : '데이터 부족'}

■ 채널별 성과 (Top 10):
${JSON.stringify(channelData)}

■ 페이지 성과 (Top 10):
${JSON.stringify(pageData)}

${engSummary ? `■ 참여도 평균: ${JSON.stringify(engSummary)}` : ''}
${deviceSummary ? `■ 디바이스별: ${JSON.stringify(deviceSummary)}` : ''}
${highBounceLPs?.length ? `■ 이탈률 높은 랜딩 페이지: ${JSON.stringify(highBounceLPs)}` : ''}
${userTypeSummary ? `■ 신규 vs 재방문: ${JSON.stringify(userTypeSummary)}` : ''}
${stickyLatest ? `■ 스티키니스: ${JSON.stringify(stickyLatest)}` : ''}

분석 관점:
1. 채널별로 성장/하락 진단하고 구체적 액션 제시
2. 이탈률 높은 페이지에 대한 개선안
3. 예산 배분 제안 (어느 채널에 더 투자할지)
4. 이번 주 가장 먼저 해야 할 한 가지
5. 이상 징후가 있다면 원인 추정과 대응 방안`;

  const raw = await runLLM(systemPrompt, userPrompt, 0.3, 8000, runtime);

  // Extract string value for a given key from potentially-truncated JSON
  const extractField = (text: string, key: string): string | null => {
    const full = text.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    if (full) return full[1];
    const partial = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"]{10,})`));
    return partial ? partial[1].trim() : null;
  };
  const extractArray = (text: string, key: string): string[] => {
    const match = text.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)`));
    if (!match) return [];
    return [...match[1].matchAll(/"((?:[^"\\\\]|\\\\.)*)"/g)].map(m => m[1]);
  };

  const extractJSON = (text: string): string | null => {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenced) return fenced[1];
    const openFence = text.match(/```(?:json)?\s*(\{[\s\S]*\})/);
    if (openFence) return openFence[1];
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s !== -1 && e > s) return text.slice(s, e + 1);
    return null;
  };

  try {
    const jsonStr = extractJSON(raw);
    if (!jsonStr) throw new Error('JSON not found');
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    return {
      summary: (parsed.summary as string) || '분석 결과를 생성했습니다.',
      highlights: (parsed.highlights as string[]) || [],
      recommendations: (parsed.recommendations as GA4AiInsight['recommendations']) || [],
      anomalies: (parsed.anomalies as string[]) || [],
      channelDiagnosis: parsed.channelDiagnosis as GA4AiInsight['channelDiagnosis'],
      pageDiagnosis: parsed.pageDiagnosis as GA4AiInsight['pageDiagnosis'],
      weeklyFocus: parsed.weeklyFocus as string | undefined,
      budgetAdvice: parsed.budgetAdvice as string | undefined,
      generatedAt: new Date()
    };
  } catch {
    const summary = extractField(raw, 'summary');
    if (summary) {
      return {
        summary,
        highlights: extractArray(raw, 'highlights'),
        recommendations: extractArray(raw, 'recommendations'),
        anomalies: extractArray(raw, 'anomalies'),
        weeklyFocus: extractField(raw, 'weeklyFocus') || undefined,
        budgetAdvice: extractField(raw, 'budgetAdvice') || undefined,
        generatedAt: new Date()
      };
    }
    return {
      summary: '분석 중 오류가 발생했습니다. 다시 시도해 주세요.',
      highlights: [],
      recommendations: [],
      anomalies: [],
      generatedAt: new Date()
    };
  }
}
