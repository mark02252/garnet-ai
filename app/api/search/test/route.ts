import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  buildWebIntelligenceReport,
  buildWebIntelligenceSummary,
  runWebSearchWithRuntime,
  buildMarketingQuery,
  buildSearchQueries,
  resolveSearchContext
} from '@/lib/search';

const bodySchema = z.object({
  topic: z.string().min(1),
  brand: z.string().optional(),
  region: z.string().optional(),
  goal: z.string().optional(),
  runtime: z
    .object({
      searchApiKey: z.string().optional(),
      searchProvider: z.enum(['serper', 'brave', 'naver']).optional(),
      searchIncludeDomains: z.string().optional(),
      searchExcludeDomains: z.string().optional()
    })
    .optional()
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const runtimeKey = body.runtime?.searchApiKey?.trim();
    if (!runtimeKey && !process.env.SEARCH_API_KEY) {
      return NextResponse.json({ error: 'SEARCH_API_KEY가 없습니다.' }, { status: 400 });
    }
    const resolution = resolveSearchContext(body.topic, body.brand, body.region, body.goal);
    const query = buildMarketingQuery(
      resolution.cleanedTopic || body.topic,
      resolution.effectiveBrand || body.brand,
      resolution.effectiveRegion || body.region,
      body.goal
    );
    const triedQueries = buildSearchQueries(
      resolution.cleanedTopic || body.topic,
      resolution.effectiveBrand || body.brand,
      resolution.effectiveRegion || body.region,
      body.goal
    );
    const webSources = await runWebSearchWithRuntime(body.topic, body.brand, body.region, body.goal, body.runtime);
    const summary = buildWebIntelligenceSummary(webSources);
    const report = buildWebIntelligenceReport(webSources);

    return NextResponse.json({
      ok: true,
      resolution,
      query,
      triedQueries,
      sourceCount: webSources.length,
      summary,
      report,
      webSources
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '웹서치 테스트 실패' },
      { status: 500 }
    );
  }
}
