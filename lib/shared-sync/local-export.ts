import os from 'node:os';
import { prisma } from '@/lib/prisma';
import { listApprovalDecisions } from '@/lib/approval-actions';
import { listRunProgressRows } from '@/lib/run-progress';
import type {
  SharedApprovalDecisionRecord,
  SharedBootstrapPayload,
  SharedLearningArchiveRecord,
  SharedRunProgressRecord,
  SharedRunRecord
} from '@/lib/shared-sync/contracts';

function safeJsonArray(raw: string | null | undefined) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function toIso(value: string | Date | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function latestTimestamp(candidates: Array<string | Date | null | undefined>) {
  const values = candidates
    .map((value) => {
      if (!value) return 0;
      const next = value instanceof Date ? value.getTime() : new Date(value).getTime();
      return Number.isFinite(next) ? next : 0;
    })
    .filter(Boolean);

  return values.length ? new Date(Math.max(...values)).toISOString() : new Date(0).toISOString();
}

export async function listRunsForSharedSync(limit = 150): Promise<SharedRunRecord[]> {
  const runs = await prisma.run.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(limit, 500)),
    include: {
      webSources: { orderBy: { fetchedAt: 'desc' } },
      meetingTurns: { orderBy: { createdAt: 'asc' } },
      attachments: { orderBy: { createdAt: 'asc' } },
      deliverable: true,
      memoryLog: true
    }
  });

  const sourceDevice = os.hostname();

  return runs.map((run) => ({
    id: run.id,
    topic: run.topic,
    brand: run.brand,
    region: run.region,
    goal: run.goal,
    createdAt: run.createdAt.toISOString(),
    updatedAt: latestTimestamp([
      run.createdAt,
      ...run.webSources.map((item) => item.fetchedAt),
      ...run.meetingTurns.map((item) => item.createdAt),
      ...run.attachments.map((item) => item.createdAt),
      run.deliverable?.createdAt,
      run.memoryLog?.createdAt
    ]),
    webSources: run.webSources.map((item) => ({
      id: item.id,
      title: item.title,
      snippet: item.snippet,
      url: item.url,
      provider: item.provider,
      fetchedAt: item.fetchedAt.toISOString()
    })),
    meetingTurns: run.meetingTurns.map((item) => ({
      id: item.id,
      role: item.role,
      nickname: item.nickname,
      content: item.content,
      createdAt: item.createdAt.toISOString()
    })),
    attachments: run.attachments.map((item) => ({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      content: item.content,
      createdAt: item.createdAt.toISOString()
    })),
    deliverable: run.deliverable
      ? {
          id: run.deliverable.id,
          type: run.deliverable.type,
          content: run.deliverable.content,
          createdAt: run.deliverable.createdAt.toISOString()
        }
      : null,
    memoryLog: run.memoryLog
      ? {
          id: run.memoryLog.id,
          hypothesis: run.memoryLog.hypothesis,
          direction: run.memoryLog.direction,
          expectedImpact: run.memoryLog.expectedImpact,
          risks: run.memoryLog.risks,
          outcome: run.memoryLog.outcome,
          failureReason: run.memoryLog.failureReason,
          tags: safeJsonArray(run.memoryLog.tags),
          createdAt: run.memoryLog.createdAt.toISOString()
        }
      : null,
    sourceDevice
  }));
}

export async function listLearningArchivesForSharedSync(limit = 300): Promise<SharedLearningArchiveRecord[]> {
  const items = await prisma.learningArchive.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(limit, 1000))
  });

  return items.map((item) => ({
    id: item.id,
    runId: item.runId,
    sourceType: item.sourceType,
    situation: item.situation,
    recommendedResponse: item.recommendedResponse,
    reasoning: item.reasoning,
    signals: safeJsonArray(item.signals),
    tags: safeJsonArray(item.tags),
    status: item.status,
    lastUsedAt: toIso(item.lastUsedAt),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  }));
}

export async function listApprovalDecisionsForSharedSync(limit = 300): Promise<SharedApprovalDecisionRecord[]> {
  const items = await listApprovalDecisions({ limit });
  return items.map((item) => ({
    id: item.id,
    itemType: item.itemType,
    itemId: item.itemId,
    decision: item.decision,
    label: item.label,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }));
}

export async function listRunProgressForSharedSync(limit = 300): Promise<SharedRunProgressRecord[]> {
  const items = await listRunProgressRows(limit);
  return items.map((item) => ({
    runId: item.runId,
    status: item.status,
    stepKey: item.stepKey,
    stepLabel: item.stepLabel,
    progressPct: item.progressPct,
    message: item.message,
    startedAt: toIso(item.startedAt),
    updatedAt: toIso(item.updatedAt),
    finishedAt: toIso(item.finishedAt)
  }));
}

export async function buildSharedBootstrapPayload(limit?: number): Promise<SharedBootstrapPayload> {
  const [runs, learningArchives, approvalDecisions, runProgress] = await Promise.all([
    listRunsForSharedSync(limit),
    listLearningArchivesForSharedSync(limit ? Math.max(limit, 100) : undefined),
    listApprovalDecisionsForSharedSync(limit ? Math.max(limit, 100) : undefined),
    listRunProgressForSharedSync(limit ? Math.max(limit, 100) : undefined)
  ]);

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      runs: runs.length,
      learningArchives: learningArchives.length,
      approvalDecisions: approvalDecisions.length,
      runProgress: runProgress.length
    },
    runs,
    learningArchives,
    approvalDecisions,
    runProgress
  };
}
