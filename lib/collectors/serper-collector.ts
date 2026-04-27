import type { ICollector, CollectorResult, IntelItem } from './types';
import { CollectorError } from './types';

interface SerperOrganicResult {
  title?: string;
  snippet?: string;
  link?: string;
  date?: string;
}

interface SerperResponse {
  organic?: SerperOrganicResult[];
}

/** "4일 전", "11시간 전" 같은 한국어 상대 시간을 Date로 변환 */
function parseRelativeDate(raw: string): Date | undefined {
  // ISO 날짜면 그대로 파싱
  const direct = new Date(raw)
  if (!isNaN(direct.getTime())) return direct

  // 한국어 상대 시간 파싱
  const now = Date.now()
  const hourMatch = raw.match(/(\d+)\s*시간\s*전/)
  if (hourMatch) return new Date(now - Number(hourMatch[1]) * 60 * 60 * 1000)

  const dayMatch = raw.match(/(\d+)\s*일\s*전/)
  if (dayMatch) return new Date(now - Number(dayMatch[1]) * 24 * 60 * 60 * 1000)

  const minMatch = raw.match(/(\d+)\s*분\s*전/)
  if (minMatch) return new Date(now - Number(minMatch[1]) * 60 * 1000)

  const weekMatch = raw.match(/(\d+)\s*주\s*전/)
  if (weekMatch) return new Date(now - Number(weekMatch[1]) * 7 * 24 * 60 * 60 * 1000)

  const monthMatch = raw.match(/(\d+)\s*개?월\s*전/)
  if (monthMatch) return new Date(now - Number(monthMatch[1]) * 30 * 24 * 60 * 60 * 1000)

  // 파싱 불가면 undefined (에러 방지)
  return undefined
}

export class SerperCollector implements ICollector {
  id = 'serper';
  name = 'Serper 웹/뉴스 검색';
  platform = 'SERPER';

  isConfigured(): boolean {
    return Boolean(process.env.SEARCH_API_KEY);
  }

  async collect(query: string): Promise<CollectorResult> {
    const apiKey = process.env.SEARCH_API_KEY;
    if (!apiKey) throw new CollectorError('MISSING_CONFIG', 'SEARCH_API_KEY가 설정되지 않았습니다.', this.platform);

    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 10, gl: 'kr', hl: 'ko', tbs: 'qdr:w1' })
    });

    if (response.status === 429) throw new CollectorError('RATE_LIMIT', 'Serper rate limit', this.platform);
    if (response.status === 401) throw new CollectorError('AUTH', 'Serper auth failed', this.platform);
    if (!response.ok) throw new CollectorError('UNKNOWN', `Serper ${response.status}`, this.platform);

    const json = (await response.json()) as SerperResponse;
    const items: IntelItem[] = (json.organic || []).map((r) => ({
      title: r.title || '',
      snippet: r.snippet || '',
      url: r.link || '',
      platform: 'SERPER',
      publishedAt: r.date ? parseRelativeDate(r.date) : undefined,
    }));

    return { items, meta: { query, source: 'serper', fetchedAt: new Date(), count: items.length } };
  }
}
