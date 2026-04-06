import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ga4-client', () => ({
  isGA4Configured: vi.fn(),
  fetchDailyTraffic: vi.fn(),
}));

import { getTodaySummary } from '@/lib/analytics/ga4';
import type { GA4DailyTraffic } from '@/lib/ga4-client';
import { isGA4Configured, fetchDailyTraffic } from '@/lib/ga4-client';

const MOCK_ROW: GA4DailyTraffic = {
  date: '2026-04-06',
  activeUsers: 1234,
  sessions: 2345,
  screenPageViews: 5000,
  eventCount: 10000,
  conversions: 47,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getTodaySummary', () => {
  it('returns unconfigured message when GA4 is not set up', async () => {
    vi.mocked(isGA4Configured).mockReturnValue(false);
    const result = await getTodaySummary();
    expect(result).toBe('GA4가 설정되지 않았습니다');
    expect(fetchDailyTraffic).not.toHaveBeenCalled();
  });

  it('returns no-data message when fetchDailyTraffic returns empty array', async () => {
    vi.mocked(isGA4Configured).mockReturnValue(true);
    vi.mocked(fetchDailyTraffic).mockResolvedValue([]);
    const result = await getTodaySummary();
    expect(result).toBe('오늘 데이터가 아직 없습니다');
  });

  it('formats visitors, sessions, and conversion rate correctly', async () => {
    vi.mocked(isGA4Configured).mockReturnValue(true);
    vi.mocked(fetchDailyTraffic).mockResolvedValue([MOCK_ROW]);
    const result = await getTodaySummary();
    // 방문자 1234 → '1,234명', 세션 2345 → '2,345', 전환율 47/2345*100 ≈ 2.0%
    expect(result).toContain('1,234명');
    expect(result).toContain('2,345');
    expect(result).toContain('%');
    expect(result).toContain('👤');
    expect(result).toContain('📈');
    expect(result).toContain('🎯');
  });

  it('shows 0.0% conversion rate when sessions is 0', async () => {
    vi.mocked(isGA4Configured).mockReturnValue(true);
    vi.mocked(fetchDailyTraffic).mockResolvedValue([{ ...MOCK_ROW, sessions: 0, conversions: 0 }]);
    const result = await getTodaySummary();
    expect(result).toContain('0.0%');
  });

  it('propagates error when fetchDailyTraffic throws', async () => {
    vi.mocked(isGA4Configured).mockReturnValue(true);
    vi.mocked(fetchDailyTraffic).mockRejectedValue(new Error('GA4 API error'));
    await expect(getTodaySummary()).rejects.toThrow('GA4 API error');
  });
});
