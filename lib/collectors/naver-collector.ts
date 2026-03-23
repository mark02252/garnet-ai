import type { ICollector, CollectorResult, IntelItem } from './types';
import { CollectorError } from './types';

interface NaverItem {
  title?: string;
  description?: string;
  link?: string;
  postdate?: string;
  pubDate?: string;
}

export class NaverCollector implements ICollector {
  id = 'naver';
  name = '네이버 검색 (블로그/뉴스)';
  platform = 'NAVER';

  isConfigured(): boolean {
    return Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
  }

  async collect(query: string): Promise<CollectorResult> {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new CollectorError('MISSING_CONFIG', 'NAVER_CLIENT_ID/SECRET 미설정', this.platform);

    const headers = { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret };
    const blogUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=8&sort=sim`;
    const newsUrl = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=8&sort=sim`;

    const [blogRes, newsRes] = await Promise.allSettled([
      fetch(blogUrl, { headers }),
      fetch(newsUrl, { headers })
    ]);

    const items: IntelItem[] = [];
    for (const res of [blogRes, newsRes]) {
      if (res.status !== 'fulfilled' || !res.value.ok) continue;
      const json = (await res.value.json()) as { items?: NaverItem[] };
      for (const item of json.items || []) {
        items.push({
          title: (item.title || '').replace(/<[^>]*>/g, ''),
          snippet: (item.description || '').replace(/<[^>]*>/g, ''),
          url: item.link || '',
          platform: 'NAVER',
          publishedAt: item.postdate ? new Date(item.postdate) : item.pubDate ? new Date(item.pubDate) : undefined,
        });
      }
    }

    return { items, meta: { query, source: 'naver', fetchedAt: new Date(), count: items.length } };
  }
}
