import { describe, it, expect } from 'vitest';
import { CollectorRegistry } from '@/lib/collectors/registry';
import type { ICollector, CollectorResult } from '@/lib/collectors/types';

function makeFakeCollector(id: string, configured: boolean): ICollector {
  return {
    id,
    name: `Fake ${id}`,
    platform: id,
    isConfigured: () => configured,
    collect: async (query: string): Promise<CollectorResult> => ({
      items: [{ title: 'test', snippet: 'test', url: 'https://test.com', platform: id }],
      meta: { query, source: id, fetchedAt: new Date(), count: 1 }
    })
  };
}

describe('CollectorRegistry', () => {
  it('should register and retrieve a collector', () => {
    const registry = new CollectorRegistry();
    const collector = makeFakeCollector('test', true);
    registry.register(collector);
    expect(registry.get('test')).toBe(collector);
  });

  it('should list only configured collectors', () => {
    const registry = new CollectorRegistry();
    registry.register(makeFakeCollector('a', true));
    registry.register(makeFakeCollector('b', false));
    const configured = registry.getConfigured();
    expect(configured).toHaveLength(1);
    expect(configured[0].id).toBe('a');
  });

  it('should return undefined for unknown collector', () => {
    const registry = new CollectorRegistry();
    expect(registry.get('nope')).toBeUndefined();
  });
});
