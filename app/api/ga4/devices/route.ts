import { NextResponse } from 'next/server';
import { fetchDeviceBreakdown, isGA4Configured } from '@/lib/ga4-client';

export async function GET(req: Request) {
  if (!isGA4Configured()) return NextResponse.json({ configured: false });
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('startDate') || '30daysAgo';
  const end = searchParams.get('endDate') || 'today';
  try {
    const data = await fetchDeviceBreakdown(start, end);
    return NextResponse.json({ configured: true, data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
