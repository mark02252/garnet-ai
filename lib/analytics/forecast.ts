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
    const lower = Math.round(Math.max(0, value - 1.5 * stdDev));
    const upper = Math.round(value + 1.5 * stdDev);

    const d = new Date(lastDate);
    d.setDate(d.getDate() + i + 1);
    const date = d.toISOString().slice(0, 10);

    result.push({ date, value, lower, upper });
  }

  return result;
}

/** 오늘 날짜인지 판별 (YYYY-MM-DD 또는 YYYYMMDD 형식 지원) */
function isTodayDate(dateStr: string): boolean {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayISO = `${y}-${m}-${d}`;
  const todayCompact = `${y}${m}${d}`;
  return dateStr === todayISO || dateStr === todayCompact;
}

/**
 * Z-score 이상 감지. |z| > threshold (기본 2.0) 포인트만 반환.
 * stdDev === 0 이면 [] 반환.
 * 당일(오늘) 데이터는 수집 중이므로 이상치 감지에서 제외합니다.
 */
export function detectAnomalies(
  dates: string[],
  values: number[],
  threshold = 2.0
): AnomalyPoint[] {
  const n = values.length;
  if (n === 0) return [];
  if (dates.length !== values.length) return [];

  // 당일 데이터를 통계 계산과 결과 모두에서 제외
  const completed = values
    .map((v, i) => ({ date: dates[i], value: v, index: i }))
    .filter(d => !isTodayDate(d.date));

  if (completed.length === 0) return [];

  const completedValues = completed.map(d => d.value);
  const mean = completedValues.reduce((s, v) => s + v, 0) / completedValues.length;
  const variance = completedValues.reduce((s, v) => s + (v - mean) ** 2, 0) / completedValues.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return [];

  return completed
    .map((d) => ({
      date: d.date,
      value: d.value,
      zScore: Math.abs((d.value - mean) / stdDev),
    }))
    .filter((p) => p.zScore > threshold);
}
