import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ga4-client', () => ({
  isGA4Configured: vi.fn(),
  fetchDailyTraffic: vi.fn(),
}));

// forecast.ts의 pure functions는 실제 구현 사용 (mock 불필요)

import { GET } from '@/app/api/ga4/forecast/route';
import { isGA4Configured, fetchDailyTraffic } from '@/lib/ga4-client';
import type { GA4DailyTraffic } from '@/lib/ga4-client';

// 30일치 데이터 (computeForecast가 동작하려면 >= 8일 필요)
function make30Days(): GA4DailyTraffic[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date('2026-01-01');
    d.setDate(d.getDate() + i);
    // GA4 date format: YYYYMMDD
    const date = d.toISOString().slice(0, 10).replace(/-/g, '');
    return {
      date,
      activeUsers: 100 + i,
      sessions: 130 + i,
      screenPageViews: 500,
      eventCount: 1000,
      conversions: 8,
    };
  });
}

function makeRequest(): Request {
  return new Request('https://garnet.app/api/ga4/forecast');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/ga4/forecast', () => {
  it('returns { configured: false } with status 200 when GA4 not set up', async () => {
    vi.mocked(isGA4Configured).mockReturnValue(false);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ configured: false });
    expect(fetchDailyTraffic).not.toHaveBeenCalled();
  });

  it('returns configured:true with historical, forecast, anomalies for valid data', async () => {
    vi.mocked(isGA4Configured).mockReturnValue(true);
    vi.mocked(fetchDailyTraffic).mockResolvedValue(make30Days());
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(Array.isArray(body.historical)).toBe(true);
    expect(body.historical).toHaveLength(30);
    // historical dates must be YYYY-MM-DD (converted from YYYYMMDD)
    expect(body.historical[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(body.forecast)).toBe(true);
    expect(body.forecast).toHaveLength(7);
    expect(Array.isArray(body.anomalies)).toBe(true);
  });

  it('returns empty forecast array when data < 8 days (computeForecast returns [])', async () => {
    vi.mocked(isGA4Configured).mockReturnValue(true);
    const shortData: GA4DailyTraffic[] = Array.from({ length: 5 }, (_, i) => ({
      date: `202601${String(i + 1).padStart(2, '0')}`,
      activeUsers: 100,
      sessions: 130,
      screenPageViews: 500,
      eventCount: 1000,
      conversions: 8,
    }));
    vi.mocked(fetchDailyTraffic).mockResolvedValue(shortData);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.forecast).toEqual([]);
  });

  it('returns 500 when fetchDailyTraffic throws', async () => {
    vi.mocked(isGA4Configured).mockReturnValue(true);
    vi.mocked(fetchDailyTraffic).mockRejectedValue(new Error('GA4 API error'));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
