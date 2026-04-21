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

/** 제목 유사도 (간단한 bigram 오버랩) */
function titleSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.replace(/[^가-힣a-zA-Z0-9\s]/g, '').toLowerCase().trim()
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  const wordsA = new Set(na.split(/\s+/))
  const wordsB = new Set(nb.split(/\s+/))
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size
  return union > 0 ? intersection / union : 0
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

  // 24시간 내 이미 수집된 쿼리 스킵 (MarketingIntel에서 직접 확인)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentIntel = await prisma.marketingIntel.findMany({
    where: { platform, updatedAt: { gte: oneDayAgo } },
    select: { query: true },
    distinct: ['query'],
  }).catch(() => [] as Array<{ query: string }>)
  const recentQueries = new Set(recentIntel.map(r => r.query))

  // 기존 제목 캐시 (유사도 체크용)
  const existingTitles = await prisma.marketingIntel.findMany({
    where: { platform, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    select: { title: true },
    take: 200,
  })
  const knownTitles = existingTitles.map(e => e.title)

  let totalCollected = 0;
  let skippedSimilar = 0;
  let skippedQuery = 0;
  let errors = 0;

  for (const query of queries) {
    // 24시간 내 동일 쿼리 스킵
    if (recentQueries.has(query)) {
      skippedQuery++;
      continue;
    }

    const quotaCheck = checkQuota(platform);
    if (!quotaCheck.canProceed) break;

    try {
      const result = await collector.collect(query);
      consumeQuota(platform, 1);

      for (const item of result.items) {
        if (!item.url) continue;

        // 제목 유사도 80%+ → 스킵
        if (item.title && knownTitles.some(t => titleSimilarity(t, item.title) >= 0.8)) {
          skippedSimilar++;
          continue;
        }

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
        knownTitles.push(item.title)  // 이번 수집 내에서도 중복 방지
        totalCollected++;
      }
    } catch (err) {
      errors++;
      if (err instanceof CollectorError && (err.code === 'QUOTA' || err.code === 'RATE_LIMIT')) break;
    }
  }

  return {
    ok: errors === 0,
    message: `${platform}: ${totalCollected}건 수집, ${queries.length}개 쿼리 중 ${skippedQuery}개 스킵, 유사 ${skippedSimilar}건 제외, ${errors}건 에러`
  };
}
