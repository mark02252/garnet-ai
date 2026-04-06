import { describe, it, expect } from 'vitest';
import {
  computeSMA,
  computeSlope,
  computeForecast,
  detectAnomalies,
} from '@/lib/analytics/forecast';

// ── computeSMA ──────────────────────────────────────────────────────────────

describe('computeSMA', () => {
  it('computes correct 3-window SMA', () => {
    expect(computeSMA([1, 2, 3, 4, 5], 3)).toEqual([2, 3, 4]);
  });

  it('returns empty when window > length', () => {
    expect(computeSMA([1, 2], 3)).toEqual([]);
  });

  it('returns single value when window === length', () => {
    expect(computeSMA([2, 4, 6], 3)).toEqual([4]);
  });
});

// ── computeSlope ────────────────────────────────────────────────────────────

describe('computeSlope', () => {
  it('returns 1.0 for linear series [0,1,2,3,4]', () => {
    expect(computeSlope([0, 1, 2, 3, 4])).toBeCloseTo(1.0);
  });

  it('returns positive for rising values', () => {
    expect(computeSlope([1, 2, 3, 4, 5])).toBeGreaterThan(0);
  });

  it('returns 0 for flat values', () => {
    expect(computeSlope([5, 5, 5, 5, 5])).toBeCloseTo(0);
  });

  it('returns 0 when length < 2', () => {
    expect(computeSlope([42])).toBeCloseTo(0);
    expect(computeSlope([])).toBeCloseTo(0);
  });
});

// ── computeForecast ─────────────────────────────────────────────────────────

function makeDates(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

describe('computeForecast', () => {
  it('returns 7 ForecastPoints for 30-day flat input', () => {
    const dates = makeDates('2026-01-01', 30);
    const values = Array.from({ length: 30 }, () => 100);
    const result = computeForecast(dates, values, 7);
    expect(result).toHaveLength(7);
  });

  it('satisfies lower <= value <= upper for all points', () => {
    const dates = makeDates('2026-01-01', 30);
    const values = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = computeForecast(dates, values, 7);
    for (const p of result) {
      expect(p.lower).toBeLessThanOrEqual(p.value);
      expect(p.value).toBeLessThanOrEqual(p.upper);
    }
  });

  it('returns dates sequentially after last historical date', () => {
    const dates = makeDates('2026-01-01', 30);
    const values = Array.from({ length: 30 }, () => 100);
    const result = computeForecast(dates, values, 7);
    expect(result[0].date).toBe('2026-01-31');
    expect(result[6].date).toBe('2026-02-06');
  });

  it('lower is always >= 0 (no negative visitors)', () => {
    const dates = makeDates('2026-01-01', 30);
    const values = Array.from({ length: 30 }, () => 1); // near-zero values
    const result = computeForecast(dates, values, 7);
    for (const p of result) {
      expect(p.lower).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns empty when data < 8 days (SMA-7 needs >= 8 values)', () => {
    expect(computeForecast(['2026-01-01'], [100], 7)).toEqual([]);
  });

  it('returns empty when dates.length !== values.length', () => {
    expect(
      computeForecast(['2026-01-01', '2026-01-02'], [100], 7)
    ).toEqual([]);
  });
});

// ── detectAnomalies ─────────────────────────────────────────────────────────

describe('detectAnomalies', () => {
  it('detects spike beyond threshold', () => {
    const values = [100, 100, 100, 100, 100, 100, 100, 100, 100, 500];
    const dates = makeDates('2026-01-01', 10);
    const result = detectAnomalies(dates, values);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-01-10');
    expect(result[0].zScore).toBeGreaterThan(2.0);
  });

  it('returns empty when stdDev = 0 (all values identical)', () => {
    const values = Array(10).fill(100);
    const dates = makeDates('2026-01-01', 10);
    expect(detectAnomalies(dates, values)).toEqual([]);
  });

  it('uses custom threshold', () => {
    // With threshold=1.0, more points will be flagged
    const values = [100, 100, 100, 100, 100, 100, 100, 100, 100, 200];
    const dates = makeDates('2026-01-01', 10);
    const defaultResult = detectAnomalies(dates, values);
    const strictResult = detectAnomalies(dates, values, 1.0);
    expect(strictResult.length).toBeGreaterThanOrEqual(defaultResult.length);
  });
});
