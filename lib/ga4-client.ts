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

export async function analyzeGA4WithAI(
  traffic: GA4DailyTraffic[],
  channels: GA4ChannelBreakdown[],
  pages: GA4PagePerformance[],
  runtime?: RuntimeConfig
): Promise<GA4AiInsight> {
  const systemPrompt = `당신은 GA4 분석 전문가입니다. 반드시 아래 JSON만 출력하세요. 각 항목은 한국어 한 문장으로 간결하게:
{"summary":"2문장 요약","highlights":["발견1","발견2","발견3"],"recommendations":["권고1","권고2"],"anomalies":["이상징후 또는 없음"]}`;

  // Trim data to reduce prompt size and response length
  const trafficSummary = traffic.slice(-7).map(d => ({
    date: d.date, users: d.activeUsers, sessions: d.sessions, conversions: d.conversions ?? 0
  }));
  const topChannels = channels.slice(0, 5).map(c => ({ channel: c.channel, sessions: c.sessions }));
  const topPages = pages.slice(0, 5).map(p => ({ path: p.pagePath, views: p.pageViews, conversions: p.conversions ?? 0 }));

  const userPrompt = `GA4 데이터:
트래픽(7일):${JSON.stringify(trafficSummary)}
채널Top5:${JSON.stringify(topChannels)}
페이지Top5:${JSON.stringify(topPages)}`;

  const raw = await runLLM(systemPrompt, userPrompt, 0.3, 4000, runtime);

  // Extract string value for a given key from potentially-truncated JSON
  const extractField = (text: string, key: string): string | null => {
    // Full match (closing quote present)
    const full = text.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    if (full) return full[1];
    // Truncated: take everything from opening quote to end of text (min 10 chars)
    const partial = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"]{10,})`));
    return partial ? partial[1].trim() : null;
  };
  const extractArray = (text: string, key: string): string[] => {
    const match = text.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)`));
    if (!match) return [];
    return [...match[1].matchAll(/"((?:[^"\\\\]|\\\\.)*)"/g)].map(m => m[1]);
  };

  // Try multiple extraction strategies in order
  const extractJSON = (text: string): string | null => {
    // 1. Code block with closing fence: ```json ... ```
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenced) return fenced[1];
    // 2. Code block without closing fence: ```json { ... }
    const openFence = text.match(/```(?:json)?\s*(\{[\s\S]*\})/);
    if (openFence) return openFence[1];
    // 3. Raw JSON object anywhere in text
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) return text.slice(start, end + 1);
    return null;
  };

  try {
    const jsonStr = extractJSON(raw);
    if (!jsonStr) throw new Error('JSON not found');
    const parsed = JSON.parse(jsonStr) as {
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
    // JSON is truncated — extract individual fields via regex
    const summary = extractField(raw, 'summary');
    if (summary) {
      return {
        summary,
        highlights: extractArray(raw, 'highlights'),
        recommendations: extractArray(raw, 'recommendations'),
        anomalies: extractArray(raw, 'anomalies'),
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
