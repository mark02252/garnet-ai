# Analytics 예측 분석 & 이상 감지 설계 문서

## 목표

기존 GA4 analytics 페이지에 트래픽 예측(7일)과 이상 감지 기능을 추가한다.
- 통계 기반 7일 예측 → 기존 차트에 점선 연장
- Z-score 이상 감지 → 빨간 마커
- LLM 호출 없음 — 순수 수치 계산 + 요약 카드

## 아키텍처

```
[클라이언트 analytics/page.tsx]
  ↓ GET /api/ga4/forecast
[app/api/ga4/forecast/route.ts]
  ↓ fetchDailyTraffic('30daysAgo', 'today')  — lib/ga4-client.ts
  ↓ computeForecast(dates, activeUsers, 7)   — lib/analytics/forecast.ts
  ↓ detectAnomalies(dates, activeUsers)      — lib/analytics/forecast.ts
  ← { configured: true, historical, forecast, anomalies }
[클라이언트]
  → ComposedChart로 교체된 기존 일간 트래픽 차트에 오버레이
```

## 파일 구조

| 파일 | 변경 | 역할 |
|------|------|------|
| `lib/analytics/forecast.ts` | 신규 | SMA·선형회귀·Z-score 순수 함수 |
| `app/api/ga4/forecast/route.ts` | 신규 | 예측 데이터 GET 엔드포인트 |
| `app/(domains)/analytics/page.tsx` | 수정 | 예측 차트 + 이상 감지 + 요약 카드 추가 |

`lib/ga4-client.ts`와 기존 API 라우트는 변경하지 않는다.

---

## lib/analytics/forecast.ts 상세

순수 함수만 포함. 서버/클라이언트 모두에서 import 가능 (외부 의존성 없음).

### 타입

```typescript
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
```

### computeSMA

```typescript
// window > values.length 이면 빈 배열 반환
export function computeSMA(values: number[], window: number): number[]
// 반환: values를 window 크기로 슬라이딩하며 평균 계산
// 예: computeSMA([1,2,3,4,5], 3) → [2, 3, 4]
```

### computeSlope

```typescript
// 최소 자승법 선형 회귀 기울기
// x[i] = i  (0-based 정수 인덱스)
// y[i] = values[i]
// slope = (n*Σ(x*y) - Σx*Σy) / (n*Σ(x²) - (Σx)²)
// values.length < 2 이면 0 반환
export function computeSlope(values: number[]): number
```

### computeForecast

```typescript
// 알고리즘:
//   1. historicalDates.length !== historicalValues.length → 빈 배열 반환
//   2. sma = computeSMA(historicalValues, 7)
//   3. sma.length < 2 → 빈 배열 반환 (데이터 최소 8일 필요)
//   4. slope = computeSlope(sma)
//   5. baseline = sma[sma.length - 1]
//   6. stdDev = historicalValues의 모집단 표준편차 (÷N): sqrt(Σ(v - mean)² / N)
//      v는 historicalValues 각 요소, mean은 historicalValues의 평균
//   7. 예측값[i] = Math.round(baseline + slope * (i + 1))   i = 0..forecastDays-1
//   8. lower[i] = Math.max(0, 예측값[i] - 1.5 * stdDev)
//   9. upper[i] = 예측값[i] + 1.5 * stdDev
//  10. 날짜: historicalDates 마지막 날짜에서 i+1일 후 ('YYYY-MM-DD')
//      - lastDate = historicalDates[historicalDates.length - 1]
//      - const d = new Date(lastDate); d.setDate(d.getDate() + i + 1);
//      - date = d.toISOString().slice(0, 10)
export function computeForecast(
  historicalDates: string[],    // 'YYYY-MM-DD' 형식
  historicalValues: number[],
  forecastDays: number
): ForecastPoint[]
```

### detectAnomalies

```typescript
// Z-score 이상 감지
// mean = 전체 values 평균
// stdDev = 모집단 표준편차 (÷N)
// stdDev === 0 → 빈 배열 반환
// |z| > threshold 인 포인트만 반환
// threshold 기본값: 2.0
export function detectAnomalies(
  dates: string[],
  values: number[],
  threshold?: number
): AnomalyPoint[]
```

---

## app/api/ga4/forecast/route.ts 상세

```typescript
import { isGA4Configured, fetchDailyTraffic } from '@/lib/ga4-client';
import { computeForecast, detectAnomalies } from '@/lib/analytics/forecast';

// GET /api/ga4/forecast
// 성공 응답 (200):
// { configured: true, historical: {date:string, activeUsers:number}[], forecast: ForecastPoint[], anomalies: AnomalyPoint[] }
//
// GA4 미설정 응답 (200):
// { configured: false }
//
// 오류 (500):
// { error: string }
```

처리 순서:
1. `isGA4Configured()` false → `NextResponse.json({ configured: false })` 반환
   - 기존 `/api/ga4/report`가 400을 반환하는 것과 달리, forecast는 클라이언트 폴백을 위해 200으로 반환한다
2. `fetchDailyTraffic('30daysAgo', 'today')` 호출
3. GA4의 date 차원은 `'YYYYMMDD'` 형식으로 반환됨 → `'YYYY-MM-DD'`로 변환:
   ```typescript
   const dates = data.map(d => `${d.date.slice(0,4)}-${d.date.slice(4,6)}-${d.date.slice(6,8)}`);
   const values = data.map(d => d.activeUsers);
   ```
4. `computeForecast(dates, values, 7)` — 빈 배열도 정상 (데이터 부족)
5. `detectAnomalies(dates, values)` — 빈 배열도 정상
6. `{ configured: true, historical: data.map((d, i) => ({date: dates[i], activeUsers: d.activeUsers})), forecast, anomalies }` 반환
7. 오류 → `NextResponse.json({ error: message }, { status: 500 })`

---

## app/(domains)/analytics/page.tsx 수정 상세

### 상태 관리

`analytics/page.tsx`는 `'use client'` 컴포넌트다. 기존 상태(`loading`, `data` 등) 외에 아래 상태를 추가한다:

```typescript
const [forecastData, setForecastData] = useState<{
  forecast: ForecastPoint[];
  anomalies: AnomalyPoint[];
  historical: { date: string; activeUsers: number }[];
} | null>(null);
```

`fetchForecastData()`는 기존 데이터 패칭 `useEffect` 또는 `fetchAllData` 함수 내에서 함께 호출하고 결과를 `setForecastData`로 설정한다. 예측은 항상 최근 30일 고정이므로 `dateRange` 변경에 따라 다시 호출할 필요가 없다 — 초기 마운트 시 1회만 호출한다.

렌더링 시 `forecastData`가 null이면 예측 차트 영역을 스킵(숨김)한다.

### 타입 추가

`ForecastPoint`, `AnomalyPoint`는 `lib/analytics/forecast.ts`에서 import한다:

```typescript
import type { ForecastPoint, AnomalyPoint } from '@/lib/analytics/forecast';
```

통합 차트 포인트 타입 (파일 내 로컬 선언):

```typescript
type ChartPoint = {
  date: string;
  activeUsers: number | null;   // 과거: 실제값, 예측: null
  forecastValue: number | null; // 과거: null, 예측: 예측값
  bandBase: number | null;      // 과거: null, 예측: lower (confidence band 하단 offset)
  bandWidth: number | null;     // 과거: null, 예측: upper - lower
  isAnomaly: boolean;
};
```

### `todayStr` 정의

```typescript
const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // 'YYYY-MM-DD'
```

### 데이터 페칭

```typescript
async function fetchForecastData(): Promise<{
  forecast: ForecastPoint[];
  anomalies: AnomalyPoint[];
  historical: { date: string; activeUsers: number }[];
}> {
  try {
    const res = await fetch('/api/ga4/forecast');
    const data = await res.json();
    if (!data.configured || !data.forecast) {
      return buildDemoForecast(); // 아래 참조
    }
    return data;
  } catch {
    return buildDemoForecast();
  }
}
```

### 데모 폴백 (`buildDemoForecast`)

```typescript
import { computeForecast, detectAnomalies } from '@/lib/analytics/forecast';

function buildDemoForecast() {
  const demoTraffic = generateDemoTraffic(30); // DailyTraffic[], date: 'YYYYMMDD'
  // generateDemoTraffic의 date는 'YYYYMMDD' 형식 → 'YYYY-MM-DD'로 변환
  const dates = demoTraffic.map(d =>
    `${d.date.slice(0,4)}-${d.date.slice(4,6)}-${d.date.slice(6,8)}`
  );
  const values = demoTraffic.map(d => d.activeUsers);
  return {
    historical: dates.map((date, i) => ({ date, activeUsers: values[i] })),
    forecast: computeForecast(dates, values, 7),
    anomalies: detectAnomalies(dates, values),
  };
}
```

### 차트 데이터 병합

```typescript
const anomalyDates = new Set(anomalies.map(a => a.date));
const historicalPoints: ChartPoint[] = historical.map(h => ({
  date: h.date,
  activeUsers: h.activeUsers,
  forecastValue: null,
  bandBase: null,
  bandWidth: null,
  isAnomaly: anomalyDates.has(h.date),
}));
const forecastPoints: ChartPoint[] = forecast.map(f => ({
  date: f.date,
  activeUsers: null,
  forecastValue: f.value,
  bandBase: f.lower,
  bandWidth: f.upper - f.lower,
  isAnomaly: false,
}));
const chartData = [...historicalPoints, ...forecastPoints];
```

### Recharts ComposedChart 구성

기존 `AreaChart`를 `ComposedChart`로 교체한다.

**신뢰 구간 렌더링:** `stackId="band"` 기법 사용
- Area 1 (`bandBase`): 투명 채움으로 lower까지 offset 생성
- Area 2 (`bandWidth`): upper-lower 폭만큼 cyan으로 채움
- 결과: lower~upper 사이만 밴드로 표시

```tsx
<ComposedChart data={chartData}>
  <XAxis dataKey="date" />
  <YAxis />
  <Tooltip content={<ForecastTooltip />} />
  <ReferenceLine x={todayStr} stroke="#3a6080" strokeDasharray="3 3" label="오늘" />

  {/* 신뢰 구간 밴드 (stackId 기법) */}
  <Area stackId="band" dataKey="bandBase"  stroke="none" fill="transparent" fillOpacity={0} legendType="none" connectNulls={false} />
  <Area stackId="band" dataKey="bandWidth" stroke="none" fill="#00d4ff"    fillOpacity={0.1} legendType="none" connectNulls={false} />

  {/* 과거 실제 트래픽 */}
  <Area
    dataKey="activeUsers"
    stroke="#00d4ff"
    fill="#00d4ff"
    fillOpacity={0.15}
    dot={<CustomAnomalyDot />}
    connectNulls={false}
  />

  {/* 예측 점선 */}
  <Line
    dataKey="forecastValue"
    stroke="#00d4ff"
    strokeDasharray="5 5"
    dot={false}
    connectNulls={false}
  />
</ComposedChart>
```

### CustomAnomalyDot 컴포넌트

`payload.isAnomaly`로 이상치 여부를 판단한다. `dot={<CustomAnomalyDot />}`로 전달하면 Recharts가 `React.cloneElement`로 `cx`, `cy`, `payload` 등을 자동 주입한다.

```typescript
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
```

### ForecastTooltip 컴포넌트

기본 `<Tooltip />`은 `isAnomaly`를 표시하지 않으므로 커스텀 컴포넌트 사용:

```typescript
function ForecastTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartPoint | undefined;
  return (
    <div style={{ background: '#0d1a2a', border: '1px solid #3a6080', padding: '8px', fontSize: '12px' }}>
      <p style={{ color: '#a8d8ff' }}>{label}</p>
      {point?.activeUsers != null && <p>방문자: {point.activeUsers.toLocaleString('ko-KR')}명</p>}
      {point?.forecastValue != null && <p>예측: {point.forecastValue.toLocaleString('ko-KR')}명</p>}
      {point?.isAnomaly && <p style={{ color: '#ff4444' }}>⚠️ 이상 트래픽 감지</p>}
    </div>
  );
}
```

`TooltipProps`는 `recharts`에서 import한다.

### 예측 요약 카드

기존 AI 인사이트 섹션 위에 추가:

```tsx
{forecast.length > 0 && (
  <div className="forecast-summary-card">
    <h3>📈 7일 예측</h3>
    <p>예측 평균 방문자: {Math.round(forecast.reduce((s, f) => s + f.value, 0) / forecast.length).toLocaleString('ko-KR')}명/일</p>
    <p>예측 범위: {Math.min(...forecast.map(f => f.lower)).toLocaleString('ko-KR')}~{Math.max(...forecast.map(f => f.upper)).toLocaleString('ko-KR')}명/일</p>
    {anomalies.length > 0 && (
      <p style={{ color: '#ff4444' }}>⚠️ 과거 이상 트래픽 {anomalies.length}건 감지</p>
    )}
  </div>
)}
```

---

## 에러 처리

| 상황 | 처리 |
|------|------|
| GA4 미설정 | buildDemoForecast() 호출, 차트에 "(데모)" 배지 표시 |
| API 오류 | buildDemoForecast() 호출 |
| 데이터 < 8일 (SMA 최소치 미달) | forecast: [] → 예측 카드 숨김 (조용히 스킵) |
| 이상치 없음 | 이상치 메시지 숨김 |
| stdDev = 0 | detectAnomalies 빈 배열 반환 |
| dates.length ≠ values.length | computeForecast 빈 배열 반환 |

---

## 테스트 전략

### lib/analytics/forecast.ts

```typescript
// computeSMA
it('computes correct 3-window SMA', () => {
  expect(computeSMA([1,2,3,4,5], 3)).toEqual([2, 3, 4])
})
it('returns empty when window > length', () => {
  expect(computeSMA([1,2], 3)).toEqual([])
})

// computeSlope
it('returns 1.0 for linear series [0,1,2,3,4]', () => {
  expect(computeSlope([0,1,2,3,4])).toBeCloseTo(1.0)
})
it('returns positive for rising values', () => {
  expect(computeSlope([1,2,3,4,5])).toBeGreaterThan(0)
})
it('returns 0 for flat values', () => {
  expect(computeSlope([5,5,5,5,5])).toBeCloseTo(0)
})

// computeForecast
it('returns 7 points for 30-day input', () => {
  const dates = Array.from({length:30}, (_, i) => {
    const d = new Date('2026-01-01'); d.setDate(d.getDate()+i);
    return d.toISOString().slice(0,10);
  });
  const values = Array.from({length:30}, () => 100);
  expect(computeForecast(dates, values, 7)).toHaveLength(7);
})
it('satisfies lower <= value <= upper for all points', () => {
  const dates = Array.from({length:30}, (_, i) => {
    const d = new Date('2026-01-01'); d.setDate(d.getDate()+i);
    return d.toISOString().slice(0,10);
  });
  const values = Array.from({length:30}, (_, i) => 100 + i);
  const result = computeForecast(dates, values, 7);
  for (const p of result) {
    expect(p.lower).toBeLessThanOrEqual(p.value);
    expect(p.value).toBeLessThanOrEqual(p.upper);
  }
})
it('returns empty when data < 8 days', () => {
  expect(computeForecast(['2026-01-01'], [100], 7)).toEqual([])
})
it('returns empty when dates.length !== values.length', () => {
  expect(computeForecast(['2026-01-01', '2026-01-02'], [100], 7)).toEqual([])
})

// detectAnomalies
it('detects spike beyond threshold', () => {
  const values = [100,100,100,100,100,100,100,100,100,500];
  const dates = values.map((_, i) => {
    const d = new Date('2026-01-01'); d.setDate(d.getDate()+i);
    return d.toISOString().slice(0,10);
  });
  const result = detectAnomalies(dates, values);
  expect(result).toHaveLength(1);
  expect(result[0].date).toBe('2026-01-10');
  expect(result[0].zScore).toBeGreaterThan(2.0);
})
it('returns empty when stdDev = 0', () => {
  const values = Array(10).fill(100);
  const dates = values.map((_, i) => {
    const d = new Date('2026-01-01'); d.setDate(d.getDate()+i);
    return d.toISOString().slice(0,10);
  });
  expect(detectAnomalies(dates, values)).toEqual([])
})
```

### app/api/ga4/forecast/route.ts

테스트 패턴: 기존 `app/api/telegram/webhook/__tests__/route.test.ts` 패턴 동일 (`import { GET } from '@/app/api/ga4/forecast/route'` 후 직접 호출)

- `isGA4Configured` mock false → `{ configured: false }`, 200
- `isGA4Configured` mock true + `fetchDailyTraffic` mock → `{ configured: true, historical, forecast, anomalies }` 구조 확인
- `fetchDailyTraffic` throw → 500
