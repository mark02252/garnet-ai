import { describe, it, expect } from 'vitest';

describe('shouldCatchUp', () => {
  it('should return true when last run is older than interval', async () => {
    const { shouldCatchUp } = await import('@/lib/scheduler/catch-up');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(shouldCatchUp(twoHoursAgo, '0 * * * *')).toBe(true);
  });

  it('should return false when last run is recent', async () => {
    const { shouldCatchUp } = await import('@/lib/scheduler/catch-up');
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(shouldCatchUp(fiveMinAgo, '0 * * * *')).toBe(false);
  });

  it('should return true when never run', async () => {
    const { shouldCatchUp } = await import('@/lib/scheduler/catch-up');
    expect(shouldCatchUp(null, '0 * * * *')).toBe(true);
  });
});
