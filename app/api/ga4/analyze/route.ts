import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  fetchDailyTraffic,
  fetchChannelBreakdown,
  fetchPagePerformance,
  analyzeGA4WithAI,
  isGA4Configured
} from '@/lib/ga4-client';

const bodySchema = z.object({
  startDate: z.string().min(1).default('30daysAgo'),
  endDate: z.string().min(1).default('today'),
  runtime: z.object({
    llmProvider: z.string().optional(),
    openaiApiKey: z.string().optional(),
    geminiApiKey: z.string().optional(),
    groqApiKey: z.string().optional(),
    anthropicApiKey: z.string().optional()
  }).optional()
});

export async function POST(req: Request) {
  try {
    if (!isGA4Configured()) {
      return NextResponse.json(
        { error: 'GA4 credentials not configured. Set GA4_PROPERTY_ID, GA4_CLIENT_EMAIL, GA4_PRIVATE_KEY in .env' },
        { status: 400 }
      );
    }

    const body = bodySchema.parse(await req.json());

    const [traffic, channels, pages] = await Promise.all([
      fetchDailyTraffic(body.startDate, body.endDate),
      fetchChannelBreakdown(body.startDate, body.endDate),
      fetchPagePerformance(body.startDate, body.endDate)
    ]);

    const insight = await analyzeGA4WithAI(traffic, channels, pages, body.runtime as Record<string, string> | undefined);

    return NextResponse.json({
      insight,
      data: { traffic, channels, pages }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GA4 analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
