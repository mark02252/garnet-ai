import { ReachTrendDirection } from '@prisma/client';
import type { InstagramConnectionMode } from '@/lib/meta-connection';
import { prisma } from '@/lib/prisma';
import { fetchInstagramDailyReach } from '@/lib/instagram-meta';
import { ensureInstagramReachTables } from '@/lib/instagram-reach-storage';

type DailyPoint = {
  date: Date;
  reach: number;
};

type AnalysisStats = {
  days: number;
  averageReach: number;
  latestReach: number;
  previousReach: number | null;
  dayOverDayChangePct: number | null;
  sevenDayAverage: number | null;
  trendDirection: ReachTrendDirection;
  anomalies: Array<{ date: string; reach: number; zScore: number }>;
};

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function roundTwo(num: number) {
  return Math.round(num * 100) / 100;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function computeSlope(values: number[]) {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;

  for (let i = 0; i < n; i += 1) {
    const x = i + 1;
    const y = values[i];
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumXY += x * y;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return 0;
  return (n * sumXY - sumX * sumY) / denominator;
}

function buildTrendDirection(values: number[], average: number): ReachTrendDirection {
  if (values.length < 3 || average <= 0) return ReachTrendDirection.FLAT;

  const slope = computeSlope(values);
  const relativeSlope = slope / average;

  if (relativeSlope > 0.015) return ReachTrendDirection.UP;
  if (relativeSlope < -0.015) return ReachTrendDirection.DOWN;
  return ReachTrendDirection.FLAT;
}

function buildAnomalies(series: DailyPoint[], average: number) {
  if (series.length < 5) return [] as Array<{ date: string; reach: number; zScore: number }>;

  const variance =
    series.reduce((sum, point) => {
      const diff = point.reach - average;
      return sum + diff * diff;
    }, 0) / series.length;

  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return [] as Array<{ date: string; reach: number; zScore: number }>;

  return series
    .map((point) => {
      const zScore = (point.reach - average) / stdDev;
      return {
        date: toIsoDate(point.date),
        reach: point.reach,
        zScore: roundTwo(zScore)
      };
    })
    .filter((point) => Math.abs(point.zScore) >= 2);
}

function summarizeStats(stats: AnalysisStats) {
  const dodText =
    stats.dayOverDayChangePct === null
      ? '전일 비교 불가'
      : `${stats.dayOverDayChangePct > 0 ? '+' : ''}${roundTwo(stats.dayOverDayChangePct)}%`;
  const ma7Text = stats.sevenDayAverage === null ? '데이터 부족' : Math.round(stats.sevenDayAverage).toLocaleString();

  const trendKorean =
    stats.trendDirection === ReachTrendDirection.UP
      ? '상승'
      : stats.trendDirection === ReachTrendDirection.DOWN
        ? '하락'
        : '보합';

  return [
    `최근 ${stats.days}일 기준 평균 도달은 ${Math.round(stats.averageReach).toLocaleString()}입니다.`,
    `최신 도달은 ${stats.latestReach.toLocaleString()}이며 전일 대비 ${dodText}입니다.`,
    `7일 평균은 ${ma7Text}, 추세는 ${trendKorean}로 판정됩니다.`,
    `이상치(표준편차 2 이상)는 ${stats.anomalies.length}건입니다.`
  ].join(' ');
}

function analyzeSeries(series: DailyPoint[]): AnalysisStats {
  if (series.length === 0) {
    throw new Error('분석할 인스타그램 도달 데이터가 없습니다.');
  }

  const reaches = series.map((point) => point.reach);
  const days = reaches.length;
  const total = reaches.reduce((sum, value) => sum + value, 0);
  const averageReach = total / days;
  const latestReach = reaches[days - 1];
  const previousReach = days >= 2 ? reaches[days - 2] : null;
  const dayOverDayChangePct =
    previousReach && previousReach > 0 ? ((latestReach - previousReach) / previousReach) * 100 : null;
  const sevenDayValues = reaches.slice(-7);
  const sevenDayAverage =
    sevenDayValues.length === 7
      ? sevenDayValues.reduce((sum, value) => sum + value, 0) / sevenDayValues.length
      : null;
  const trendDirection = buildTrendDirection(reaches, averageReach);
  const anomalies = buildAnomalies(series, averageReach);

  return {
    days,
    averageReach: roundTwo(averageReach),
    latestReach,
    previousReach,
    dayOverDayChangePct: dayOverDayChangePct === null ? null : roundTwo(dayOverDayChangePct),
    sevenDayAverage: sevenDayAverage === null ? null : roundTwo(sevenDayAverage),
    trendDirection,
    anomalies
  };
}

function getAgentConfig(options?: {
  lookbackDays?: number;
  accessToken?: string;
  instagramBusinessAccountId?: string;
  graphApiVersion?: string;
  connectionMode?: InstagramConnectionMode;
}) {
  const accessToken = options?.accessToken?.trim() || process.env.META_ACCESS_TOKEN?.trim();
  const instagramBusinessAccountId =
    options?.instagramBusinessAccountId?.trim() || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim();
  const graphApiVersion = options?.graphApiVersion?.trim() || process.env.META_GRAPH_API_VERSION || 'v22.0';
  const connectionMode =
    options?.connectionMode ||
    (process.env.INSTAGRAM_CONNECTION_MODE === 'instagram_login' ? 'instagram_login' : 'meta_business');
  const configuredLookback = Number(process.env.INSTAGRAM_AGENT_LOOKBACK_DAYS || 30);
  const days = options?.lookbackDays ?? configuredLookback;

  const missing: string[] = [];
  if (!accessToken) missing.push('META_ACCESS_TOKEN');
  if (!instagramBusinessAccountId) missing.push('INSTAGRAM_BUSINESS_ACCOUNT_ID');

  if (missing.length) {
    throw new Error(`인스타그램 자동 분석에 필요한 환경 변수가 없습니다: ${missing.join(', ')}`);
  }

  if (!Number.isInteger(days) || days < 2 || days > 120) {
    throw new Error('lookbackDays는 2~120 사이 정수여야 합니다.');
  }

  return {
    accessToken: accessToken as string,
    instagramBusinessAccountId: instagramBusinessAccountId as string,
    graphApiVersion,
    connectionMode,
    lookbackDays: days
  };
}

async function upsertDailyReach(params: {
  accountId: string;
  points: Array<{ date: Date; reach: number; endTime: string }>;
}) {
  if (params.points.length === 0) return;

  await prisma.$transaction(
    params.points.map((point) =>
      prisma.instagramReachDaily.upsert({
        where: {
          accountId_metricDate: {
            accountId: params.accountId,
            metricDate: point.date
          }
        },
        create: {
          accountId: params.accountId,
          metricDate: point.date,
          reach: point.reach,
          rawValue: JSON.stringify({ endTime: point.endTime, reach: point.reach })
        },
        update: {
          reach: point.reach,
          rawValue: JSON.stringify({ endTime: point.endTime, reach: point.reach }),
          fetchedAt: new Date()
        }
      })
    )
  );
}

export async function runInstagramReachAgent(options?: {
  lookbackDays?: number;
  accessToken?: string;
  instagramBusinessAccountId?: string;
  graphApiVersion?: string;
  connectionMode?: InstagramConnectionMode;
}) {
  await ensureInstagramReachTables();

  const config = getAgentConfig(options);
  const todayUtc = startOfUtcDay(new Date());
  const since = addUtcDays(todayUtc, -config.lookbackDays);
  const until = todayUtc;

  const fetched = await fetchInstagramDailyReach({
    accessToken: config.accessToken,
    instagramBusinessAccountId: config.instagramBusinessAccountId,
    since,
    until,
    graphApiVersion: config.graphApiVersion,
    connectionMode: config.connectionMode
  });

  const byDate = new Map<string, { date: Date; reach: number; endTime: string }>();
  for (const point of fetched) {
    const parsed = new Date(point.endTime);
    if (Number.isNaN(parsed.getTime())) continue;
    const date = startOfUtcDay(parsed);
    const key = date.toISOString();
    byDate.set(key, { date, reach: point.reach, endTime: point.endTime });
  }

  const normalizedPoints = Array.from(byDate.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  await upsertDailyReach({
    accountId: config.instagramBusinessAccountId,
    points: normalizedPoints
  });

  const stored = await prisma.instagramReachDaily.findMany({
    where: {
      accountId: config.instagramBusinessAccountId,
      metricDate: {
        gte: since,
        lte: until
      }
    },
    orderBy: { metricDate: 'asc' }
  });

  const series = stored.map((item) => ({ date: item.metricDate, reach: item.reach }));
  const stats = analyzeSeries(series);
  const summary = summarizeStats(stats);

  const created = await prisma.instagramReachAnalysisRun.create({
    data: {
      accountId: config.instagramBusinessAccountId,
      since,
      until,
      days: stats.days,
      averageReach: stats.averageReach,
      latestReach: stats.latestReach,
      previousReach: stats.previousReach,
      dayOverDayChangePct: stats.dayOverDayChangePct,
      sevenDayAverage: stats.sevenDayAverage,
      trendDirection: stats.trendDirection,
      anomalyCount: stats.anomalies.length,
      summary,
      rawJson: JSON.stringify({
        series: series.map((point) => ({ date: toIsoDate(point.date), reach: point.reach })),
        anomalies: stats.anomalies
      })
    }
  });

  return {
    runId: created.id,
    accountId: config.instagramBusinessAccountId,
    since: toIsoDate(since),
    until: toIsoDate(until),
    summary,
    stats,
    series: series.map((point) => ({ date: toIsoDate(point.date), reach: point.reach }))
  };
}

export function getInstagramAgentSecret() {
  return process.env.INSTAGRAM_AGENT_SECRET || '';
}
