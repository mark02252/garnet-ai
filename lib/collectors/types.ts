export interface IntelItem {
  title: string;
  snippet: string;
  url: string;
  platform: string;
  publishedAt?: Date;
  engagement?: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  };
  raw?: unknown;
}

export interface CollectorResult {
  items: IntelItem[];
  meta: {
    query: string;
    source: string;
    fetchedAt: Date;
    count: number;
  };
}

export interface ICollector {
  id: string;
  name: string;
  platform: string;
  collect(query: string): Promise<CollectorResult>;
  isConfigured(): boolean;
}

export type CollectorErrorCode =
  | 'MISSING_CONFIG'
  | 'AUTH'
  | 'QUOTA'
  | 'RATE_LIMIT'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'UNKNOWN';

export class CollectorError extends Error {
  constructor(
    public code: CollectorErrorCode,
    message: string,
    public platform: string
  ) {
    super(message);
    this.name = 'CollectorError';
  }
}
