import type { InstagramConnectionMode } from '@/lib/meta-connection';

export type InstagramReachPoint = {
  endTime: string;
  reach: number;
};

type MetaErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function parseReachValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  const record = asRecord(value);
  if (!record) return null;
  return parseReachValue(record.value);
}

function extractMetaErrorMessage(payload: unknown, fallback: string) {
  const message =
    asRecord(payload) &&
    asRecord(payload)?.error &&
    typeof asRecord(asRecord(payload)?.error)?.message === 'string'
      ? (asRecord(asRecord(payload)?.error)?.message as string)
      : null;

  return message || fallback;
}

function getMetricValues(payload: unknown): Array<{ end_time?: unknown; value?: unknown }> {
  const payloadRecord = asRecord(payload);
  if (!payloadRecord) return [];

  const data = payloadRecord.data;
  if (!Array.isArray(data)) return [];

  const metricNode =
    data.find((item) => asRecord(item)?.name === 'reach') ||
    data.find((item) => Array.isArray(asRecord(item)?.values));

  if (!metricNode) return [];

  const values = asRecord(metricNode)?.values;
  if (!Array.isArray(values)) return [];
  return values as Array<{ end_time?: unknown; value?: unknown }>;
}

function getNextPage(payload: unknown): string | null {
  const next = asRecord(asRecord(payload)?.paging)?.next;
  return typeof next === 'string' && next.length > 0 ? next : null;
}

export async function fetchInstagramDailyReach(params: {
  accessToken: string;
  instagramBusinessAccountId: string;
  since: Date;
  until: Date;
  graphApiVersion?: string;
  connectionMode?: InstagramConnectionMode;
}) {
  const graphApiVersion = params.graphApiVersion || 'v22.0';
  const base =
    params.connectionMode === 'instagram_login'
      ? `https://graph.instagram.com/${params.instagramBusinessAccountId}/insights`
      : `https://graph.facebook.com/${graphApiVersion}/${params.instagramBusinessAccountId}/insights`;
  const query = new URLSearchParams({
    metric: 'reach',
    period: 'day',
    since: String(Math.floor(params.since.getTime() / 1000)),
    until: String(Math.floor(params.until.getTime() / 1000)),
    access_token: params.accessToken
  });

  const deduped = new Map<string, InstagramReachPoint>();
  let nextUrl: string | null = `${base}?${query.toString()}`;
  let pageCount = 0;

  while (nextUrl && pageCount < 20) {
    const response = await fetch(nextUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });

    const payload = (await response.json().catch(() => null)) as MetaErrorPayload | null;
    if (!response.ok) {
      throw new Error(
        extractMetaErrorMessage(payload, `Meta API 호출 실패 (${response.status})`)
      );
    }

    const values = getMetricValues(payload);
    for (const value of values) {
      const endTime = typeof value.end_time === 'string' ? value.end_time : null;
      const reach = parseReachValue(value.value);
      if (!endTime || reach === null || reach < 0) continue;
      deduped.set(endTime, { endTime, reach });
    }

    nextUrl = getNextPage(payload);
    pageCount += 1;
  }

  return Array.from(deduped.values()).sort((a, b) => a.endTime.localeCompare(b.endTime));
}
