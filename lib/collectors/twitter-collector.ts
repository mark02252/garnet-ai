import type { ICollector, CollectorResult, IntelItem } from './types';
import { CollectorError } from './types';

interface Tweet {
  id?: string;
  text?: string;
  created_at?: string;
  public_metrics?: { like_count?: number; retweet_count?: number; reply_count?: number; impression_count?: number; };
}

interface TwitterSearchResponse { data?: Tweet[]; }

export class TwitterCollector implements ICollector {
  id = 'twitter';
  name = 'Twitter/X 검색';
  platform = 'TWITTER';

  isConfigured(): boolean { return Boolean(process.env.TWITTER_BEARER_TOKEN); }

  async collect(query: string): Promise<CollectorResult> {
    const token = process.env.TWITTER_BEARER_TOKEN;
    if (!token) throw new CollectorError('MISSING_CONFIG', 'TWITTER_BEARER_TOKEN 미설정', this.platform);

    const params = new URLSearchParams({
      query, max_results: '10', 'tweet.fields': 'created_at,public_metrics,author_id'
    });

    const response = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 429) throw new CollectorError('RATE_LIMIT', 'Twitter rate limit', this.platform);
    if (response.status === 401) throw new CollectorError('AUTH', 'Twitter auth failed', this.platform);
    if (!response.ok) throw new CollectorError('UNKNOWN', `Twitter ${response.status}`, this.platform);

    const json = (await response.json()) as TwitterSearchResponse;
    const items: IntelItem[] = (json.data || []).map((tweet) => ({
      title: (tweet.text || '').slice(0, 100),
      snippet: tweet.text || '',
      url: tweet.id ? `https://twitter.com/i/status/${tweet.id}` : '',
      platform: 'TWITTER',
      publishedAt: tweet.created_at ? new Date(tweet.created_at) : undefined,
      engagement: {
        likes: tweet.public_metrics?.like_count,
        shares: tweet.public_metrics?.retweet_count,
        comments: tweet.public_metrics?.reply_count,
        views: tweet.public_metrics?.impression_count,
      },
    }));

    return { items, meta: { query, source: 'twitter', fetchedAt: new Date(), count: items.length } };
  }
}
