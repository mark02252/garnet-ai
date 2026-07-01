import { BigQuery } from '@google-cloud/bigquery';

let _bq: BigQuery | null = null;

export function getBQ(): BigQuery {
  if (!_bq) {
    _bq = new BigQuery({
      projectId: process.env.BQ_PROJECT_ID!,
      credentials: {
        client_email: process.env.GA4_CLIENT_EMAIL!,
        private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      },
    });
  }
  return _bq;
}

export function getDS(): string {
  return process.env.BQ_DATASET!;
}

export async function query(sql: string): Promise<any[]> {
  const [rows] = await getBQ().query({ query: sql });
  return rows;
}

// 날짜 유틸
export function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, '');
}

export function daysAgoKST(days: number): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setDate(kst.getDate() - days);
  return kst.toISOString().slice(0, 10).replace(/-/g, '');
}
