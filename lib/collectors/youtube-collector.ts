import type { ICollector, CollectorResult, IntelItem } from './types';
import { CollectorError } from './types';

interface YouTubeSearchItem {
  id?: { videoId?: string };
  snippet?: { title?: string; description?: string; publishedAt?: string; };
}

interface YouTubeSearchResponse { items?: YouTubeSearchItem[]; }

export class YouTubeCollector implements ICollector {
  id = 'youtube';
  name = 'YouTube 동영상 검색';
  platform = 'YOUTUBE';

  isConfigured(): boolean { return Boolean(process.env.YOUTUBE_API_KEY); }

  async collect(query: string): Promise<CollectorResult> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) throw new CollectorError('MISSING_CONFIG', 'YOUTUBE_API_KEY 미설정', this.platform);

    const params = new URLSearchParams({
      part: 'snippet', q: query, type: 'video', maxResults: '10',
      order: 'relevance', relevanceLanguage: 'ko', key: apiKey
    });

    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (response.status === 403) throw new CollectorError('QUOTA', 'YouTube quota exceeded', this.platform);
    if (response.status === 401) throw new CollectorError('AUTH', 'YouTube auth failed', this.platform);
    if (!response.ok) throw new CollectorError('UNKNOWN', `YouTube ${response.status}`, this.platform);

    const json = (await response.json()) as YouTubeSearchResponse;
    const items: IntelItem[] = (json.items || []).map((item) => ({
      title: item.snippet?.title || '',
      snippet: item.snippet?.description || '',
      url: item.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : '',
      platform: 'YOUTUBE',
      publishedAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : undefined,
    }));

    return { items, meta: { query, source: 'youtube', fetchedAt: new Date(), count: items.length } };
  }
}
