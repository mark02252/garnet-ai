import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getInstagramAgentSecret, runInstagramReachAgent } from '@/lib/instagram-reach-agent';
import { ensureInstagramReachTables } from '@/lib/instagram-reach-storage';
import { loadMetaConnectionFromFile } from '@/lib/meta-connection-file-store';

const postBodySchema = z
  .object({
    lookbackDays: z.number().int().min(2).max(120).optional(),
    accessToken: z.string().min(1).optional(),
    instagramBusinessAccountId: z.string().min(1).optional(),
    graphApiVersion: z.string().min(2).optional(),
    connectionMode: z.enum(['instagram_login', 'meta_business']).optional()
  })
  .optional();

const getQuerySchema = z.object({
  days: z.coerce.number().int().min(2).max(120).default(30),
  accountId: z.string().optional()
});

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isAuthorized(req: Request) {
  const secret = getInstagramAgentSecret();
  const url = new URL(req.url);
  const isLoopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (!secret) return true;
  if (isLoopback) return true;

  const headerSecret = req.headers.get('x-agent-secret') || '';
  const bearer = req.headers.get('authorization') || '';
  const bearerToken = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : '';
  return headerSecret === secret || bearerToken === secret;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let payload: unknown = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    const input = postBodySchema.parse(payload);

    // Token resolution: body → file store → env vars (handled inside runInstagramReachAgent)
    let accessToken = input?.accessToken;
    let instagramBusinessAccountId = input?.instagramBusinessAccountId;
    if (!accessToken || !instagramBusinessAccountId) {
      const fileData = await loadMetaConnectionFromFile();
      if (fileData) {
        if (!accessToken) accessToken = fileData.accessToken || undefined;
        if (!instagramBusinessAccountId) instagramBusinessAccountId = fileData.instagramBusinessAccountId || undefined;
      }
    }

    const result = await runInstagramReachAgent({
      lookbackDays: input?.lookbackDays,
      accessToken,
      instagramBusinessAccountId,
      graphApiVersion: input?.graphApiVersion,
      connectionMode: input?.connectionMode
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '인스타그램 도달 분석 실행에 실패했습니다.' },
      { status: 400 }
    );
  }
}

export async function GET(req: Request) {
  try {
    await ensureInstagramReachTables();

    const url = new URL(req.url);
    const query = getQuerySchema.parse({
      days: url.searchParams.get('days') ?? 30,
      accountId: url.searchParams.get('accountId') ?? undefined
    });
    const accountId = query.accountId || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

    if (!accountId) {
      const latestAnyRun = await prisma.instagramReachAnalysisRun.findFirst({
        orderBy: { createdAt: 'desc' }
      });
      if (!latestAnyRun) {
        return NextResponse.json(
          { error: '조회할 인스타그램 분석 계정이 없습니다. 먼저 인스타그램 연결 후 분석을 실행해 주세요.' },
          { status: 400 }
        );
      }
      return NextResponse.json({
        accountId: latestAnyRun.accountId,
        since: latestAnyRun.since.toISOString().slice(0, 10),
        until: latestAnyRun.until.toISOString().slice(0, 10),
        series: [],
        latestAnalysis: {
          id: latestAnyRun.id,
          createdAt: latestAnyRun.createdAt,
          summary: latestAnyRun.summary,
          trendDirection: latestAnyRun.trendDirection,
          averageReach: latestAnyRun.averageReach,
          latestReach: latestAnyRun.latestReach,
          dayOverDayChangePct: latestAnyRun.dayOverDayChangePct,
          sevenDayAverage: latestAnyRun.sevenDayAverage,
          anomalyCount: latestAnyRun.anomalyCount,
          raw: latestAnyRun.rawJson ? JSON.parse(latestAnyRun.rawJson) : null
        }
      });
    }

    const todayUtc = startOfUtcDay(new Date());
    const since = addUtcDays(todayUtc, -query.days);

    const [series, latestRun] = await Promise.all([
      prisma.instagramReachDaily.findMany({
        where: {
          accountId,
          metricDate: {
            gte: since,
            lte: todayUtc
          }
        },
        orderBy: { metricDate: 'asc' }
      }),
      prisma.instagramReachAnalysisRun.findFirst({
        where: { accountId },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    const parsedRaw = (() => {
      if (!latestRun?.rawJson) return null;
      try {
        return JSON.parse(latestRun.rawJson) as unknown;
      } catch {
        return null;
      }
    })();

    return NextResponse.json({
      accountId,
      since: toIsoDate(since),
      until: toIsoDate(todayUtc),
      series: series.map((item) => ({
        date: toIsoDate(item.metricDate),
        reach: item.reach
      })),
      latestAnalysis: latestRun
        ? {
            id: latestRun.id,
            createdAt: latestRun.createdAt,
            summary: latestRun.summary,
            trendDirection: latestRun.trendDirection,
            averageReach: latestRun.averageReach,
            latestReach: latestRun.latestReach,
            dayOverDayChangePct: latestRun.dayOverDayChangePct,
            sevenDayAverage: latestRun.sevenDayAverage,
            anomalyCount: latestRun.anomalyCount,
            raw: parsedRaw
          }
        : null
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '인스타그램 도달 조회에 실패했습니다.' },
      { status: 400 }
    );
  }
}
