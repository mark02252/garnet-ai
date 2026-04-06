import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/job-scheduler', () => ({
  runDailyBriefingJob: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/cron/daily-briefing/route';
import { runDailyBriefingJob } from '@/lib/job-scheduler';

const VALID_SECRET = 'test-cron-secret';

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('Authorization', authHeader);
  return new Request('https://garnet.app/api/cron/daily-briefing', { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = VALID_SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/daily-briefing', () => {
  it('returns 401 when CRON_SECRET env is not set', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest(`Bearer ${VALID_SECRET}`));
    expect(res.status).toBe(401);
    expect(runDailyBriefingJob).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(runDailyBriefingJob).not.toHaveBeenCalled();
  });

  it('returns 401 when secret does not match', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret'));
    expect(res.status).toBe(401);
    expect(runDailyBriefingJob).not.toHaveBeenCalled();
  });

  it('returns 200 and calls runDailyBriefingJob on valid request', async () => {
    const res = await GET(makeRequest(`Bearer ${VALID_SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(runDailyBriefingJob).toHaveBeenCalledOnce();
  });

  it('returns 500 when runDailyBriefingJob throws', async () => {
    vi.mocked(runDailyBriefingJob).mockRejectedValue(new Error('job failed'));
    const res = await GET(makeRequest(`Bearer ${VALID_SECRET}`));
    expect(res.status).toBe(500);
    expect(runDailyBriefingJob).toHaveBeenCalledOnce();
  });
});
