import { prisma } from '@/lib/prisma';
import { collectorRegistry } from './registry';
import { loadKeywordsForPlatform } from './query-builder';
import { checkQuota, consumeQuota } from './quota-tracker';
import { CollectorError } from './types';
import type { IntelItem } from './types';
import type { JobRunResult } from '@/lib/scheduler/types';

type PrismaIntelPlatform = 'YOUTUBE' | 'TWITTER' | 'REDDIT' | 'SERPER' | 'NAVER';

function toPrismaEngagement(item: IntelItem) {
  return {
    views: item.engagement?.views ?? null,
    likes: item.engagement?.likes ?? null,
    comments: item.engagement?.comments ?? null,
    shares: item.engagement?.shares ?? null,
  };
}

export async function runCollectionJob(platformId: string): Promise<JobRunResult> {
  const collector = collectorRegistry.get(platformId);
  if (!collector) return { ok: false, message: `Collector not found: ${platformId}` };
  if (!collector.isConfigured()) return { ok: false, message: `${platformId} API 키 미설정` };

  const platform = collector.platform as PrismaIntelPlatform;
  const quota = checkQuota(platform);
  if (!quota.canProceed) {
    return { ok: false, message: `${platform} 쿼터 소진 (남은: ${quota.remaining})` };
  }

  const queries = await loadKeywordsForPlatform(platformId);
  if (queries.length === 0) {
    return { ok: true, message: '검색 키워드 없음 (캠페인/워치리스트 등록 필요)' };
  }

  let totalCollected = 0;
  let errors = 0;

  for (const query of queries) {
    const quotaCheck = checkQuota(platform);
    if (!quotaCheck.canProceed) break;

    try {
      const result = await collector.collect(query);
      consumeQuota(platform, 1);

      for (const item of result.items) {
        if (!item.url) continue;
        const engagement = toPrismaEngagement(item);
        await prisma.marketingIntel.upsert({
          where: { platform_url: { platform, url: item.url } },
          create: {
            platform, query, title: item.title, snippet: item.snippet, url: item.url,
            publishedAt: item.publishedAt, ...engagement,
            raw: item.raw ? JSON.stringify(item.raw) : null,
          },
          update: {
            query, title: item.title, snippet: item.snippet,
            publishedAt: item.publishedAt, ...engagement,
          }
        });
        totalCollected++;
      }
    } catch (err) {
      errors++;
      if (err instanceof CollectorError && (err.code === 'QUOTA' || err.code === 'RATE_LIMIT')) break;
    }
  }

  return {
    ok: errors === 0,
    message: `${platform}: ${totalCollected}건 수집, ${queries.length}개 쿼리 실행, ${errors}건 에러`
  };
}
