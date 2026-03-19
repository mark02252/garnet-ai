import { describe, it, expect } from 'vitest'
import { formatCompactNumber, formatChartTick } from '../format-number'

describe('formatCompactNumber', () => {
  it('formats millions', () => {
    expect(formatCompactNumber(1_500_000)).toBe('1.5M')
    expect(formatCompactNumber(1_000_000)).toBe('1M')
  })
  it('formats thousands', () => {
    expect(formatCompactNumber(50_000)).toBe('50K')
    expect(formatCompactNumber(1_500)).toBe('1.5K')
  })
  it('formats small numbers', () => {
    expect(formatCompactNumber(999)).toBe('999')
    expect(formatCompactNumber(0)).toBe('0')
  })
})

describe('formatChartTick', () => {
  it('formats for chart axis', () => {
    expect(formatChartTick(1_000_000)).toBe('1M')
    expect(formatChartTick(50_000)).toBe('50K')
    expect(formatChartTick(500)).toBe('500')
  })
})
