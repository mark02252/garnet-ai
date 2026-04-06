import { NextResponse } from 'next/server';
import { isGA4Configured, fetchDailyTraffic } from '@/lib/ga4-client';
import { computeForecast, detectAnomalies } from '@/lib/analytics/forecast';

export async function GET(_req: Request): Promise<Response> {
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
