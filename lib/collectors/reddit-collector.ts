import type { ICollector, CollectorResult, IntelItem } from './types';
import { CollectorError } from './types';

interface RedditPost {
  data?: {
    title?: string; selftext?: string; url?: string; permalink?: string;
    created_utc?: number; ups?: number; num_comments?: number;
  };
}

interface RedditSearchResponse { data?: { children?: RedditPost[] }; }

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getRedditAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt) return cachedAccessToken.token;

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Reddit credentials missing');

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) throw new Error(`Reddit auth failed: ${response.status}`);
  const json = (await response.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
  return cachedAccessToken.token;
}

export class RedditCollector implements ICollector {
  id = 'reddit';
  name = 'Reddit 검색';
  platform = 'REDDIT';

  isConfigured(): boolean { return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET); }

  async collect(query: string): Promise<CollectorResult> {
    let token: string;
    try { token = await getRedditAccessToken(); }
    catch { throw new CollectorError('AUTH', 'Reddit 인증 실패', this.platform); }

    const params = new URLSearchParams({ q: query, limit: '10', sort: 'relevance', t: 'week' });
    const response = await fetch(`https://oauth.reddit.com/search?${params}`, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Garnet/0.5.0' }
    });

    if (response.status === 429) throw new CollectorError('RATE_LIMIT', 'Reddit rate limit', this.platform);
    if (!response.ok) throw new CollectorError('UNKNOWN', `Reddit ${response.status}`, this.platform);

    const json = (await response.json()) as RedditSearchResponse;
    const items: IntelItem[] = (json.data?.children || []).map((post) => {
      const d = post.data;
      return {
        title: d?.title || '',
        snippet: (d?.selftext || '').slice(0, 300),
        url: d?.permalink ? `https://reddit.com${d.permalink}` : d?.url || '',
        platform: 'REDDIT',
        publishedAt: d?.created_utc ? new Date(d.created_utc * 1000) : undefined,
        engagement: { likes: d?.ups, comments: d?.num_comments },
      };
    });

    return { items, meta: { query, source: 'reddit', fetchedAt: new Date(), count: items.length } };
  }
}
