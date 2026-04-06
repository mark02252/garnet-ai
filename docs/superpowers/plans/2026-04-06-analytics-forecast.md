# Analytics 예측 분석 & 이상 감지 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GA4 analytics 페이지에 통계 기반 7일 트래픽 예측과 Z-score 이상 감지를 추가한다.

**Architecture:** 순수 함수 라이브러리(`lib/analytics/forecast.ts`)가 SMA·선형회귀·Z-score 계산을 담당하고, `/api/ga4/forecast` 엔드포인트가 GA4 데이터를 페칭해 계산을 실행한다. `analytics/page.tsx`는 엔드포인트를 호출해 기존 트래픽 트렌드 차트를 Recharts ComposedChart로 교체하고 예측 점선·신뢰 구간 밴드·이상치 마커·요약 카드를 추가한다.

**Tech Stack:** TypeScript, Next.js App Router, Recharts (ComposedChart, Area, Line, ReferenceLine), Vitest

---

## Chunk 1: Pure Functions & API Route

### Task 1: lib/analytics/forecast.ts — 순수 함수

**Files:**
- Create: `lib/analytics/forecast.ts`
- Create: `lib/__tests__/forecast.test.ts`

- [ ] **Step 1: 테스트 파일 생성**

```typescript
// lib/__tests__/forecast.test.ts
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd "/Users/rnr/Documents/New project" && npx vitest run lib/__tests__/forecast.test.ts 2>&1 | tail -20
```

Expected: `Cannot find module '@/lib/analytics/forecast'` 또는 `FAIL`

- [ ] **Step 3: lib/analytics/forecast.ts 구현**

```typescript
// lib/analytics/forecast.ts

export type ForecastPoint = {
  date: string;    // 'YYYY-MM-DD'
  value: number;   // 예측값 (Math.round 정수)
  lower: number;   // 하한 = Math.max(0, value - 1.5 * stdDev)
  upper: number;   // 상한 = value + 1.5 * stdDev
};

export type AnomalyPoint = {
  date: string;
  value: number;
  zScore: number;
};

/** values를 window 크기로 슬라이딩하며 평균 계산. window > values.length 이면 [] 반환 */
export function computeSMA(values: number[], window: number): number[] {
  if (window > values.length) return [];
  const result: number[] = [];
  for (let i = 0; i <= values.length - window; i++) {
    const slice = values.slice(i, i + window);
    result.push(slice.reduce((s, v) => s + v, 0) / window);
  }
  return result;
}

/** 최소 자승법 선형 회귀 기울기. x[i]=i (0-based). length < 2 이면 0 반환 */
export function computeSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * SMA(7) + 선형회귀로 forecastDays일 예측.
 * 최소 8일 데이터 필요 (SMA-7이 점 2개 이상이 되려면).
 * stdDev는 historicalValues의 모집단 표준편차 (÷N).
 */
export function computeForecast(
  historicalDates: string[],
  historicalValues: number[],
  forecastDays: number
): ForecastPoint[] {
  if (historicalDates.length !== historicalValues.length) return [];

  const sma = computeSMA(historicalValues, 7);
  if (sma.length < 2) return [];

  const slope = computeSlope(sma);
  const baseline = sma[sma.length - 1];

  // 모집단 표준편차 (÷N) — historicalValues 기준
  const mean = historicalValues.reduce((s, v) => s + v, 0) / historicalValues.length;
  const variance =
    historicalValues.reduce((s, v) => s + (v - mean) ** 2, 0) / historicalValues.length;
  const stdDev = Math.sqrt(variance);

  const lastDate = historicalDates[historicalDates.length - 1];
  const result: ForecastPoint[] = [];

  for (let i = 0; i < forecastDays; i++) {
    const value = Math.round(baseline + slope * (i + 1));
    const lower = Math.max(0, value - 1.5 * stdDev);
    const upper = value + 1.5 * stdDev;

    const d = new Date(lastDate);
    d.setDate(d.getDate() + i + 1);
    const date = d.toISOString().slice(0, 10);

    result.push({ date, value, lower, upper });
  }

  return result;
}

/**
 * Z-score 이상 감지. |z| > threshold (기본 2.0) 포인트만 반환.
 * stdDev === 0 이면 [] 반환.
 */
export function detectAnomalies(
  dates: string[],
  values: number[],
  threshold = 2.0
): AnomalyPoint[] {
  const n = values.length;
  if (n === 0) return [];

  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return [];

  return values
    .map((v, i) => ({
      date: dates[i],
      value: v,
      zScore: Math.abs((v - mean) / stdDev),
    }))
    .filter((p) => p.zScore > threshold);
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd "/Users/rnr/Documents/New project" && npx vitest run lib/__tests__/forecast.test.ts 2>&1 | tail -20
```

Expected: `16 tests passed`

- [ ] **Step 5: 커밋**

```bash
cd "/Users/rnr/Documents/New project" && git add lib/analytics/forecast.ts lib/__tests__/forecast.test.ts && git commit -m "feat(analytics): add forecast pure functions (SMA, slope, computeForecast, detectAnomalies)"
```

---

### Task 2: app/api/ga4/forecast/route.ts — API 엔드포인트

**Files:**
- Create: `app/api/ga4/forecast/route.ts`
- Create: `app/api/ga4/__tests__/forecast.test.ts`

- [ ] **Step 1: 테스트 파일 생성**

```typescript
// app/api/ga4/__tests__/forecast.test.ts
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd "/Users/rnr/Documents/New project" && npx vitest run "app/api/ga4/__tests__/forecast.test.ts" 2>&1 | tail -20
```

Expected: `Cannot find module '@/app/api/ga4/forecast/route'` 또는 `FAIL`

- [ ] **Step 3: app/api/ga4/forecast/route.ts 구현**

```typescript
// app/api/ga4/forecast/route.ts
import { NextResponse } from 'next/server';
import { isGA4Configured, fetchDailyTraffic } from '@/lib/ga4-client';
import { computeForecast, detectAnomalies } from '@/lib/analytics/forecast';

export async function GET(): Promise<Response> {
  if (!isGA4Configured()) {
    return NextResponse.json({ configured: false });
  }

  try {
    const data = await fetchDailyTraffic('30daysAgo', 'today');

    // GA4 date 차원은 'YYYYMMDD' 형식 → 'YYYY-MM-DD'로 변환
    const dates = data.map(
      (d) => `${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}`
    );
    const values = data.map((d) => d.activeUsers);

    const forecast = computeForecast(dates, values, 7);
    const anomalies = detectAnomalies(dates, values);

    return NextResponse.json({
      configured: true,
      historical: data.map((d, i) => ({ date: dates[i], activeUsers: d.activeUsers })),
      forecast,
      anomalies,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'forecast failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd "/Users/rnr/Documents/New project" && npx vitest run "app/api/ga4/__tests__/forecast.test.ts" 2>&1 | tail -20
```

Expected: `5 tests passed`

- [ ] **Step 5: 커밋**

```bash
cd "/Users/rnr/Documents/New project" && git add app/api/ga4/forecast/route.ts "app/api/ga4/__tests__/forecast.test.ts" && git commit -m "feat(analytics): add /api/ga4/forecast GET endpoint"
```

---

## Chunk 2: Page Integration

### Task 3: analytics/page.tsx — 예측 차트 & 요약 카드 통합

**Files:**
- Modify: `app/(domains)/analytics/page.tsx`

이 태스크는 여러 구역을 수정하므로 단계별로 쪼개서 진행한다. 각 단계 후 개발 서버를 실행할 필요 없이 TypeScript 컴파일만 확인한다.

**현재 파일 구조 파악 (수정 전 확인):**
- Line 3-20: recharts imports (`AreaChart`, `Area`, etc.)
- Line 408-423: useState 선언부
- Line 449-510: `fetchAllData` useCallback
- Line 556-560: `trafficChartData` 계산
- Line 868-938: Section 2 "트래픽 트렌드" 패널 (`AreaChart` 사용)
- Line 1408: AI Insights 섹션 시작

- [ ] **Step 1: imports 업데이트 — recharts + forecast 타입 추가**

파일 상단의 recharts import 블록을 찾아 `ComposedChart`, `ReferenceLine`을 추가하고 `TooltipProps`도 추가한다.

현재 코드:
```typescript
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
```

교체할 코드:
```typescript
import {
  AreaChart,
  Area,
  ComposedChart,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
  ReferenceLine,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { ForecastPoint, AnomalyPoint } from '@/lib/analytics/forecast';
import { computeForecast, detectAnomalies } from '@/lib/analytics/forecast';
```

- [ ] **Step 2: 타입 & 상수 추가 — ChartPoint, ForecastData 타입**

기존 타입 선언 블록(line ~22 `// ── Types ──`) 끝, `// ── Demo Data ──` 시작 전에 아래 타입을 추가한다:

```typescript
type ChartPoint = {
  date: string;             // 'YYYY-MM-DD' 또는 포맷된 표시용
  activeUsers: number | null;   // 과거: 실제값, 예측: null
  forecastValue: number | null; // 과거: null, 예측: 예측값
  bandBase: number | null;      // 과거: null, 예측: lower
  bandWidth: number | null;     // 과거: null, 예측: upper - lower
  isAnomaly: boolean;
};

type ForecastData = {
  forecast: ForecastPoint[];
  anomalies: AnomalyPoint[];
  historical: { date: string; activeUsers: number }[];
};
```

- [ ] **Step 3: buildDemoForecast 헬퍼 추가**

`// ── Helpers ──` 섹션 (line ~241) 끝에 추가한다:

```typescript
function buildDemoForecast(): ForecastData {
  const demoTraffic = generateDemoTraffic(30);
  // generateDemoTraffic의 date는 'YYYYMMDD' → 'YYYY-MM-DD' 변환
  const dates = demoTraffic.map(
    (d) => `${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}`
  );
  const values = demoTraffic.map((d) => d.activeUsers);
  return {
    historical: dates.map((date, i) => ({ date, activeUsers: values[i] })),
    forecast: computeForecast(dates, values, 7),
    anomalies: detectAnomalies(dates, values),
  };
}
```

- [ ] **Step 4: ForecastTooltip & CustomAnomalyDot 컴포넌트 추가**

`// ── Main Page ──` (line ~406) 바로 위에 추가한다:

```typescript
// ── Forecast Components ────────────────────────────────────────────────────

type DotProps = {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
};

function CustomAnomalyDot({ cx, cy, payload }: DotProps) {
  if (!payload?.isAnomaly || cx == null || cy == null) return null;
  return (
    <circle cx={cx} cy={cy} r={5} fill="#ff4444" stroke="#ff0000" strokeWidth={2} />
  );
}

function ForecastTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartPoint | undefined;
  return (
    <div
      style={{
        background: '#0d1a2a',
        border: '1px solid #3a6080',
        padding: '8px',
        fontSize: '12px',
        borderRadius: 6,
      }}
    >
      <p style={{ color: '#a8d8ff', marginBottom: 4 }}>{label}</p>
      {point?.activeUsers != null && (
        <p style={{ color: '#e8f4ff' }}>방문자: {point.activeUsers.toLocaleString('ko-KR')}명</p>
      )}
      {point?.forecastValue != null && (
        <p style={{ color: '#00d4ff' }}>예측: {point.forecastValue.toLocaleString('ko-KR')}명</p>
      )}
      {point?.isAnomaly && (
        <p style={{ color: '#ff4444' }}>⚠️ 이상 트래픽 감지</p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: useState 추가 + fetchForecastData + useEffect 연결**

`AnalyticsPage` 함수 내 useState 선언부 끝(line ~423, `const [dateRange, setDateRange]` 아래)에 추가:

```typescript
const [forecastData, setForecastData] = useState<ForecastData | null>(null);
```

`fetchAllData` useCallback 끝(line ~510, `}, [dateRange, loadDemoData]);`) 바로 위에 새 useCallback 추가:

```typescript
const fetchForecastData = useCallback(async () => {
  try {
    const res = await fetch('/api/ga4/forecast');
    const data = await res.json();
    if (!data.configured || !data.forecast) {
      setForecastData(buildDemoForecast());
      return;
    }
    setForecastData(data as ForecastData);
  } catch {
    setForecastData(buildDemoForecast());
  }
}, []);
```

기존 `useEffect` (line ~512)를 찾아서:
```typescript
useEffect(() => {
  fetchAllData();
  fetchRealtime();
  const interval = setInterval(fetchRealtime, 60_000);
  return () => clearInterval(interval);
}, [fetchAllData, fetchRealtime]);
```

아래처럼 교체:
```typescript
useEffect(() => {
  fetchAllData();
  fetchForecastData();
  fetchRealtime();
  const interval = setInterval(fetchRealtime, 60_000);
  return () => clearInterval(interval);
}, [fetchAllData, fetchForecastData, fetchRealtime]);
```

- [ ] **Step 6: trafficChartData 아래에 chartData(예측 병합) 계산 추가**

기존 `trafficChartData` (line ~556) 아래에 추가:

```typescript
const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

const chartData: ChartPoint[] = forecastData
  ? (() => {
      const anomalyDates = new Set(forecastData.anomalies.map((a) => a.date));
      const historicalPoints: ChartPoint[] = forecastData.historical.map((h) => ({
        date: h.date,
        activeUsers: h.activeUsers,
        forecastValue: null,
        bandBase: null,
        bandWidth: null,
        isAnomaly: anomalyDates.has(h.date),
      }));
      const forecastPoints: ChartPoint[] = forecastData.forecast.map((f) => ({
        date: f.date,
        activeUsers: null,
        forecastValue: f.value,
        bandBase: f.lower,
        bandWidth: f.upper - f.lower,
        isAnomaly: false,
      }));
      return [...historicalPoints, ...forecastPoints];
    })()
  : [];
```

- [ ] **Step 7: Section 2 "트래픽 트렌드" AreaChart → ComposedChart 교체**

현재 Section 2 (line ~868-938)의 패널 내용을 수정한다. 기존 `<ResponsiveContainer ... <AreaChart ...>` 블록 전체를 교체:

기존 코드 (line 891-937):
```tsx
<ResponsiveContainer width="100%" height={240}>
  <AreaChart data={trafficChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
    <defs>
      <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.25} />
        <stop offset="95%" stopColor="#00d4ff" stopOpacity={0.01} />
      </linearGradient>
      <linearGradient id="gradSessions" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="#6aabcc" stopOpacity={0.2} />
        <stop offset="95%" stopColor="#6aabcc" stopOpacity={0.01} />
      </linearGradient>
    </defs>
    <XAxis
      dataKey="date"
      tick={{ fontSize: 11, fill: '#b0b8c1' }}
      axisLine={false}
      tickLine={false}
      interval={Math.max(1, Math.floor(trafficChartData.length / 8) - 1)}
    />
    <YAxis
      tick={{ fontSize: 11, fill: '#b0b8c1' }}
      axisLine={false}
      tickLine={false}
      tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
      width={36}
    />
    <Tooltip content={<ChartTooltip />} />
    <Area
      type="monotone"
      dataKey="활성 사용자"
      stroke="#00d4ff"
      strokeWidth={2}
      fill="url(#gradUsers)"
      dot={false}
      activeDot={{ r: 4, strokeWidth: 0, fill: '#00d4ff' }}
    />
    <Area
      type="monotone"
      dataKey="세션"
      stroke="#6aabcc"
      strokeWidth={2}
      fill="url(#gradSessions)"
      dot={false}
      activeDot={{ r: 4, strokeWidth: 0, fill: '#6aabcc' }}
    />
  </AreaChart>
</ResponsiveContainer>
```

교체할 코드:
```tsx
<ResponsiveContainer width="100%" height={240}>
  {chartData.length > 0 ? (
    <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
      <XAxis
        dataKey="date"
        tick={{ fontSize: 11, fill: '#b0b8c1' }}
        axisLine={false}
        tickLine={false}
        tickFormatter={(v: string) =>
          `${parseInt(v.slice(5, 7))}/${parseInt(v.slice(8, 10))}`
        }
        interval={Math.max(1, Math.floor(chartData.length / 8) - 1)}
      />
      <YAxis
        tick={{ fontSize: 11, fill: '#b0b8c1' }}
        axisLine={false}
        tickLine={false}
        tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
        width={36}
      />
      <Tooltip content={<ForecastTooltip />} />
      <ReferenceLine
        x={todayStr}
        stroke="#3a6080"
        strokeDasharray="3 3"
        label={{ value: '오늘', fill: '#6aabcc', fontSize: 11 }}
      />

      {/* 신뢰 구간 밴드 (stackId 기법: bandBase offset + bandWidth fill) */}
      <Area
        stackId="band"
        dataKey="bandBase"
        stroke="none"
        fill="transparent"
        fillOpacity={0}
        legendType="none"
        connectNulls={false}
        isAnimationActive={false}
      />
      <Area
        stackId="band"
        dataKey="bandWidth"
        stroke="none"
        fill="#00d4ff"
        fillOpacity={0.1}
        legendType="none"
        connectNulls={false}
        isAnimationActive={false}
      />

      {/* 과거 실제 트래픽 */}
      <Area
        dataKey="activeUsers"
        stroke="#00d4ff"
        fill="#00d4ff"
        fillOpacity={0.15}
        strokeWidth={2}
        dot={<CustomAnomalyDot />}
        connectNulls={false}
        isAnimationActive={false}
      />

      {/* 예측 점선 */}
      <Line
        dataKey="forecastValue"
        stroke="#00d4ff"
        strokeDasharray="5 5"
        strokeWidth={2}
        dot={false}
        connectNulls={false}
        isAnimationActive={false}
      />
    </ComposedChart>
  ) : (
    <AreaChart data={trafficChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
      <defs>
        <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.25} />
          <stop offset="95%" stopColor="#00d4ff" stopOpacity={0.01} />
        </linearGradient>
      </defs>
      <XAxis
        dataKey="date"
        tick={{ fontSize: 11, fill: '#b0b8c1' }}
        axisLine={false}
        tickLine={false}
        interval={Math.max(1, Math.floor(trafficChartData.length / 8) - 1)}
      />
      <YAxis
        tick={{ fontSize: 11, fill: '#b0b8c1' }}
        axisLine={false}
        tickLine={false}
        tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
        width={36}
      />
      <Tooltip content={<ChartTooltip />} />
      <Area
        type="monotone"
        dataKey="활성 사용자"
        stroke="#00d4ff"
        strokeWidth={2}
        fill="url(#gradUsers)"
        dot={false}
        activeDot={{ r: 4, strokeWidth: 0, fill: '#00d4ff' }}
      />
    </AreaChart>
  )}
</ResponsiveContainer>
```

> **Note:** `chartData.length > 0` 체크는 forecastData 로딩 전(null) 초기 상태에서 기존 AreaChart를 폴백으로 보여준다.

- [ ] **Step 8: 예측 요약 카드 추가 — AI 인사이트 섹션 바로 위**

AI Insights 섹션 (`{/* ════ Section N: AI 성과 분석 ════ */}`) 패널 전에 삽입.

`{/* ════════════════════════════════════════════════════════` 중 AI 성과 분석 섹션의 바로 앞 줄 앞에 삽입:

```tsx
{/* ════════════════════════════════════════════════════════
    Section N: 7일 트래픽 예측 요약
════════════════════════════════════════════════════════ */}
{forecastData && forecastData.forecast.length > 0 && (
  <div className="panel" style={{ marginBottom: 20 }}>
    <div style={{ marginBottom: 16 }}>
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#00d4ff',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: 2,
        }}
      >
        Forecast
      </p>
      <h2 className="section-title">📈 7일 트래픽 예측</h2>
    </div>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12,
      }}
    >
      <div className="metric-card">
        <p className="metric-label">예측 평균 방문자</p>
        <p className="metric-value" style={{ color: '#00d4ff' }}>
          {Math.round(
            forecastData.forecast.reduce((s, f) => s + f.value, 0) /
              forecastData.forecast.length
          ).toLocaleString('ko-KR')}
          명/일
        </p>
      </div>
      <div className="metric-card">
        <p className="metric-label">예측 범위</p>
        <p className="metric-value" style={{ color: '#6aabcc', fontSize: '1.1rem' }}>
          {Math.min(...forecastData.forecast.map((f) => f.lower)).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          ~
          {Math.max(...forecastData.forecast.map((f) => f.upper)).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          명/일
        </p>
      </div>
      {forecastData.anomalies.length > 0 && (
        <div className="metric-card" style={{ borderTop: '3px solid #ff4444' }}>
          <p className="metric-label">이상 트래픽 감지</p>
          <p className="metric-value" style={{ color: '#ff4444' }}>
            {forecastData.anomalies.length}건
          </p>
        </div>
      )}
    </div>
  </div>
)}
```

> **Note:** `예측 범위` 숫자 포맷은 `.toLocaleString('ko-KR')`을 사용해도 되지만 `Math.min/max`가 `number`이므로 직접 포맷한다. 더 간단하게 쓰려면 `Math.min(...).toLocaleString('ko-KR')` 으로 교체 가능.

- [ ] **Step 9: TypeScript 컴파일 확인**

```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit 2>&1 | head -30
```

Expected: 에러 없음 (또는 기존에 있던 에러만 — 새로 추가한 코드 관련 에러 없어야 함)

- [ ] **Step 10: 전체 테스트 통과 확인**

```bash
cd "/Users/rnr/Documents/New project" && npx vitest run 2>&1 | tail -20
```

Expected: 기존 테스트 모두 통과 + 새 테스트(forecast 14개 + API 5개) 통과

- [ ] **Step 11: 커밋**

```bash
cd "/Users/rnr/Documents/New project" && git add "app/(domains)/analytics/page.tsx" && git commit -m "feat(analytics): integrate forecast chart and anomaly detection into analytics page"
```
