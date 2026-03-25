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
  recommendations: string[];
  anomalies: string[];
  generatedAt: Date;
};

function resolveCredentials(): GA4Credentials | null {
  const propertyId = process.env.GA4_PROPERTY_ID || '';
  const clientEmail = process.env.GA4_CLIENT_EMAIL || '';
  const privateKey = (process.env.GA4_PRIVATE_KEY || '').replace(/\\n/g, '\n');

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

export async function analyzeGA4WithAI(
  traffic: GA4DailyTraffic[],
  channels: GA4ChannelBreakdown[],
  pages: GA4PagePerformance[],
  runtime?: RuntimeConfig
): Promise<GA4AiInsight> {
  const systemPrompt = `당신은 디지털 마케팅 데이터 분석 전문가입니다. GA4 데이터를 분석하여 실행 가능한 인사이트를 제공합니다.
반드시 아래 JSON 형식으로만 응답하세요:
{
  "summary": "전체 성과 요약 (2-3문장)",
  "highlights": ["주요 발견 1", "주요 발견 2", "주요 발견 3"],
  "recommendations": ["개선 권고 1", "개선 권고 2"],
  "anomalies": ["이상 징후 (있는 경우)"]
}`;

  const userPrompt = `다음 GA4 데이터를 분석해주세요:

## 일별 트래픽 (최근 ${traffic.length}일)
${JSON.stringify(traffic.slice(-14), null, 2)}

## 유입 채널 Top 10
${JSON.stringify(channels.slice(0, 10), null, 2)}

## 상위 페이지
${JSON.stringify(pages.slice(0, 10), null, 2)}

분석 포인트:
1. 전주 대비 트래픽 변화 추이
2. 가장 효과적인 유입 채널
3. 전환에 기여하는 핵심 페이지
4. 이상 징후 (급격한 트래픽 변동 등)
5. 즉시 실행 가능한 개선 권고`;

  const raw = await runLLM(systemPrompt, userPrompt, 0.3, 2000, runtime);

  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('JSON not found');
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      summary?: string;
      highlights?: string[];
      recommendations?: string[];
      anomalies?: string[];
    };

    return {
      summary: parsed.summary || '분석 결과를 생성했습니다.',
      highlights: parsed.highlights || [],
      recommendations: parsed.recommendations || [],
      anomalies: parsed.anomalies || [],
      generatedAt: new Date()
    };
  } catch {
    return {
      summary: raw.slice(0, 300),
      highlights: [],
      recommendations: [],
      anomalies: [],
      generatedAt: new Date()
    };
  }
}
