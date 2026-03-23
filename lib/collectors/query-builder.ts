import { prisma } from '@/lib/prisma';

export function optimizeForPlatform(keyword: string, platform: string): string {
  switch (platform) {
    case 'twitter':
      return `${keyword} #${keyword.replace(/\s+/g, '')} lang:ko`;
    case 'youtube':
      return `${keyword} 리뷰`;
    case 'naver':
      return keyword;
    case 'reddit':
      return keyword;
    case 'serper':
    default:
      return keyword;
  }
}

export function buildQueriesForPlatform(
  keywords: string[],
  platform: string,
  maxQueries: number = 10
): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];

  for (const kw of keywords) {
    const normalized = kw.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    queries.push(optimizeForPlatform(kw.trim(), platform));
    if (queries.length >= maxQueries) break;
  }

  return queries;
}

export async function loadKeywordsForPlatform(platform: string): Promise<string[]> {
  const [campaigns, watchKeywords] = await Promise.all([
    prisma.manualCampaignRoom.findMany({
      where: { status: 'ACTIVE' },
      select: { brand: true, goal: true }
    }),
    prisma.watchKeyword.findMany({
      where: { isActive: true }
    })
  ]);

  const keywords: string[] = [];

  for (const c of campaigns) {
    if (c.brand) keywords.push(c.brand);
    if (c.goal) keywords.push(c.goal);
  }

  for (const wk of watchKeywords) {
    const platforms: string[] = JSON.parse(wk.platforms || '[]');
    if (platforms.length === 0 || platforms.includes(platform.toUpperCase())) {
      keywords.push(wk.keyword);
    }
  }

  return buildQueriesForPlatform(keywords, platform);
}
