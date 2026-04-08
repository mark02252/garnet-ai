import { NextResponse } from 'next/server';
import { fetchCohortRetention, isGA4Configured } from '@/lib/ga4-client';

export async function GET(req: Request) {
  if (!isGA4Configured()) return NextResponse.json({ configured: false });
  const { searchParams } = new URL(req.url);
  const weeks = Number(searchParams.get('weeks') || '6');
  try {
    const data = await fetchCohortRetention(weeks);
    return NextResponse.json({ configured: true, data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
