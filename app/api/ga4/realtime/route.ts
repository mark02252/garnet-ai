import { NextResponse } from 'next/server';
import { fetchRealtimeActiveUsers, isGA4Configured } from '@/lib/ga4-client';

export async function GET() {
  try {
    if (!isGA4Configured()) {
      return NextResponse.json(
        { error: 'GA4 credentials not configured' },
        { status: 400 }
      );
    }

    const activeUsers = await fetchRealtimeActiveUsers();
    return NextResponse.json({ activeUsers, fetchedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GA4 realtime failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
