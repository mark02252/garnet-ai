import { describe, it, expect } from 'vitest';

describe('Scheduler Integration', () => {
  it('should import init module without errors', async () => {
    const mod = await import('@/lib/scheduler/init');
    expect(typeof mod.initSchedulerSystem).toBe('function');
    expect(typeof mod.shutdownSchedulerSystem).toBe('function');
  });

  it('should import all collectors without errors', async () => {
    const mod = await import('@/lib/collectors/init');
    expect(typeof mod.initCollectors).toBe('function');
  });

  it('should import analyzer without errors', async () => {
    const mod = await import('@/lib/intel/analyzer');
    expect(typeof mod.analyzeRecentIntel).toBe('function');
  });

  it('should import digest builder without errors', async () => {
    const mod = await import('@/lib/intel/digest-builder');
    expect(typeof mod.buildDailyDigest).toBe('function');
  });

  it('should import urgent detector without errors', async () => {
    const mod = await import('@/lib/intel/urgent-detector');
    expect(typeof mod.detectAndAlertUrgent).toBe('function');
  });
});
