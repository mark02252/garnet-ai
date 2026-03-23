import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('SchedulerEngine', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should export start and stop functions', async () => {
    const engine = await import('@/lib/scheduler/engine');
    expect(typeof engine.startScheduler).toBe('function');
    expect(typeof engine.stopScheduler).toBe('function');
  });

  it('should export registerJob and unregisterJob', async () => {
    const engine = await import('@/lib/scheduler/engine');
    expect(typeof engine.registerJob).toBe('function');
    expect(typeof engine.unregisterJob).toBe('function');
  });

  it('should export getJobStatuses', async () => {
    const engine = await import('@/lib/scheduler/engine');
    expect(typeof engine.getJobStatuses).toBe('function');
  });
});
