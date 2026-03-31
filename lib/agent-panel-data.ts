// lib/agent-panel-data.ts
// Fetches live data for each panel type and maps to canvas-store.ts data shapes.
import { prisma } from '@/lib/prisma';
import { isGA4Configured, fetchDailyTraffic } from '@/lib/ga4-client';
import type {
  GA4SummaryData,
  SeminarStatusData,
  IntelBriefData,
  VideoStatusData,
  ApprovalData,
} from '@/lib/canvas-store';

export async function fetchGA4Data(): Promise<GA4SummaryData> {
  if (!isGA4Configured()) {
    return { metric: 'Sessions (미설정)', value: 0, wow: 0 };
  }
  const [recent, prior] = await Promise.all([
    fetchDailyTraffic('7daysAgo', 'today'),
    fetchDailyTraffic('14daysAgo', '8daysAgo'),
  ]);
  const recentSessions = recent.reduce((s, d) => s + (d.sessions ?? 0), 0);
  const priorSessions  = prior.reduce((s, d) => s + (d.sessions ?? 0), 0);
  const wow = priorSessions > 0
    ? Math.round(((recentSessions - priorSessions) / priorSessions) * 100)
    : 0;
  return { metric: 'Sessions (7d)', value: recentSessions, wow };
}

export async function fetchSeminarData(): Promise<SeminarStatusData> {
  const session = await prisma.seminarSession.findFirst({
    where: { status: { in: ['RUNNING', 'PAUSED', 'SCHEDULED'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, completedRounds: true, maxRounds: true, status: true },
  });
  if (!session) {
    return { sessionId: '', round: 0, maxRounds: 0, status: '진행 중인 세미나 없음' };
  }
  return {
    sessionId: session.id,
    round: session.completedRounds,
    maxRounds: session.maxRounds,
    status: session.status,
  };
}

export async function fetchIntelData(): Promise<IntelBriefData> {
  const items = await prisma.marketingIntel.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    select: { title: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const summary = items.length > 0 ? items[0].title : '최근 인텔 없음';
  return { trendCount: items.length, summary };
}

export async function fetchVideoData(): Promise<VideoStatusData> {
  const job = await prisma.videoGeneration.findFirst({
    where: { status: { in: ['PENDING', 'GENERATING', 'EDITING'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, videoUrl: true },
  });
  if (!job) return { jobId: '', progress: 0 };
  const progress =
    job.status === 'EDITING' ? 75 : job.status === 'GENERATING' ? 40 : 0;
  return { jobId: job.id, progress, url: job.videoUrl ?? undefined };
}

export async function fetchApprovalData(): Promise<ApprovalData> {
  const decisions = await prisma.approvalDecision.findMany({
    select: { id: true, itemType: true, itemId: true, label: true },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });
  return {
    items: decisions.map((d) => ({
      id: d.id,
      label: d.label ?? d.itemType,
      type: d.itemType,
    })),
  };
}
