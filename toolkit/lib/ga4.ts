import { BetaAnalyticsDataClient } from '@google-analytics/data';

let _client: BetaAnalyticsDataClient | null = null;

export function getGA4Client(): BetaAnalyticsDataClient {
  if (!_client) {
    _client = new BetaAnalyticsDataClient({
      credentials: {
        client_email: process.env.GA4_CLIENT_EMAIL!,
        private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      },
    });
  }
  return _client;
}

export function getPropertyId(): string {
  return `properties/${process.env.GA4_PROPERTY_ID!}`;
}

export async function runReport(config: any) {
  const client = getGA4Client();
  const [res] = await client.runReport({ property: getPropertyId(), ...config });
  return res;
}

export async function runRealtimeReport(config: any) {
  const client = getGA4Client();
  const [res] = await client.runRealtimeReport({ property: getPropertyId(), ...config });
  return res;
}
