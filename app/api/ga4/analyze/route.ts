import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  fetchDailyTraffic,
  fetchChannelBreakdown,
  fetchPagePerformance,
  fetchEngagementMetrics,
  fetchDeviceBreakdown,
  fetchLandingPages,
  fetchNewVsReturning,
  fetchChannelConversions,
  fetchStickiness,
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
    const start = body.startDate;
    const end = body.endDate;

    // Core data (required)
    const [traffic, channels, pages] = await Promise.all([
      fetchDailyTraffic(start, end),
      fetchChannelBreakdown(start, end),
      fetchPagePerformance(start, end),
    ]);

    // Extended data (best-effort, non-blocking)
    const [engRes, devRes, lpRes, nvrRes, ccRes, stkRes] = await Promise.allSettled([
      fetchEngagementMetrics(start, end),
      fetchDeviceBreakdown(start, end),
      fetchLandingPages(start, end),
      fetchNewVsReturning(start, end),
      fetchChannelConversions(start, end),
      fetchStickiness(start, end),
    ]);

    const extraData = {
      engagement: engRes.status === 'fulfilled' ? engRes.value : undefined,
      devices: devRes.status === 'fulfilled' ? devRes.value : undefined,
      landingPages: lpRes.status === 'fulfilled' ? lpRes.value : undefined,
      newVsReturning: nvrRes.status === 'fulfilled' ? nvrRes.value : undefined,
      channelConversions: ccRes.status === 'fulfilled' ? ccRes.value : undefined,
      stickiness: stkRes.status === 'fulfilled' ? stkRes.value : undefined,
    };

    const insight = await analyzeGA4WithAI(
      traffic, channels, pages,
      body.runtime as Record<string, string> | undefined,
      extraData
    );

    return NextResponse.json({
      insight,
      data: { traffic, channels, pages }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GA4 analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
