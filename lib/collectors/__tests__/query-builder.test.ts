import { describe, it, expect } from 'vitest';
import { buildQueriesForPlatform, optimizeForPlatform } from '@/lib/collectors/query-builder';

describe('optimizeForPlatform', () => {
  it('should add hashtag for twitter', () => {
    const result = optimizeForPlatform('나이키', 'twitter');
    expect(result).toContain('#나이키');
  });

  it('should add review suffix for youtube', () => {
    const result = optimizeForPlatform('나이키', 'youtube');
    expect(result).toContain('리뷰');
  });

  it('should return keyword as-is for serper', () => {
    const result = optimizeForPlatform('나이키', 'serper');
    expect(result).toBe('나이키');
  });
});

describe('buildQueriesForPlatform', () => {
  it('should deduplicate and limit queries', () => {
    const keywords = Array.from({ length: 20 }, (_, i) => `keyword${i}`);
    const result = buildQueriesForPlatform(keywords, 'serper', 10);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('should deduplicate identical keywords', () => {
    const result = buildQueriesForPlatform(['test', 'test', 'TEST'], 'serper', 10);
    expect(result).toHaveLength(1);
  });
});
