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
      body: JSON.stringify({ q: query, num: 10, gl: 'kr', hl: 'ko' })
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
      publishedAt: r.date ? new Date(r.date) : undefined,
    }));

    return { items, meta: { query, source: 'serper', fetchedAt: new Date(), count: items.length } };
  }
}
