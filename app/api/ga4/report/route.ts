import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  fetchDailyTraffic,
  fetchChannelBreakdown,
  fetchPagePerformance,
  isGA4Configured
} from '@/lib/ga4-client';

const querySchema = z.object({
  startDate: z.string().min(1).default('30daysAgo'),
  endDate: z.string().min(1).default('today'),
  type: z.enum(['traffic', 'channels', 'pages', 'all']).default('all')
});

export async function GET(req: Request) {
  try {
    if (!isGA4Configured()) {
      return NextResponse.json(
        { error: 'GA4 credentials not configured. Set GA4_PROPERTY_ID, GA4_CLIENT_EMAIL, GA4_PRIVATE_KEY in .env' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const params = querySchema.parse({
      startDate: searchParams.get('startDate') || '30daysAgo',
      endDate: searchParams.get('endDate') || 'today',
      type: searchParams.get('type') || 'all'
    });

    const result: Record<string, unknown> = {};

    if (params.type === 'traffic' || params.type === 'all') {
      result.traffic = await fetchDailyTraffic(params.startDate, params.endDate);
    }
    if (params.type === 'channels' || params.type === 'all') {
      result.channels = await fetchChannelBreakdown(params.startDate, params.endDate);
    }
    if (params.type === 'pages' || params.type === 'all') {
      result.pages = await fetchPagePerformance(params.startDate, params.endDate);
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GA4 report failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
