import { prisma } from '@/lib/prisma';

export type RunProgressStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type RunProgressStepKey = 'web_research' | 'meeting' | 'deliverable' | 'memory' | 'completed';

export type RunProgressRow = {
  runId: string;
  status: RunProgressStatus;
  stepKey: RunProgressStepKey;
  stepLabel: string;
  progressPct: number;
  message: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
};

export const RUN_PROGRESS_STEPS: Array<{ key: Exclude<RunProgressStepKey, 'completed'>; label: string }> = [
  { key: 'web_research', label: '웹 리서치' },
  { key: 'meeting', label: '역할별 회의' },
  { key: 'deliverable', label: '최종 산출물' },
  { key: 'memory', label: '메모리 로그' }
];

let ensured = false;
let ensurePromise: Promise<void> | null = null;

async function ensureRunProgressTable() {
  if (ensured) return;
  if (ensurePromise) {
    await ensurePromise;
    return;
  }

  ensurePromise = (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RunProgress" (
        "runId" TEXT NOT NULL PRIMARY KEY,
        "status" TEXT NOT NULL,
        "stepKey" TEXT NOT NULL,
        "stepLabel" TEXT NOT NULL,
        "progressPct" INTEGER NOT NULL DEFAULT 0,
        "message" TEXT,
        "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "finishedAt" DATETIME,
        FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RunProgress_status_updatedAt_idx"
      ON "RunProgress"("status", "updatedAt")
    `);
    ensured = true;
  })();

  try {
    await ensurePromise;
  } catch (error) {
    ensurePromise = null;
    throw error;
  }
}

export async function upsertRunProgress(input: {
  runId: string;
  status: RunProgressStatus;
  stepKey: RunProgressStepKey;
  stepLabel: string;
  progressPct: number;
  message?: string;
  finishedAt?: string | null;
}) {
  await ensureRunProgressTable();
  const progressPct = Math.max(0, Math.min(100, Math.round(input.progressPct)));

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "RunProgress"
      ("runId", "status", "stepKey", "stepLabel", "progressPct", "message", "startedAt", "updatedAt", "finishedAt")
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
      ON CONFLICT("runId") DO UPDATE SET
        "status" = excluded."status",
        "stepKey" = excluded."stepKey",
        "stepLabel" = excluded."stepLabel",
        "progressPct" = excluded."progressPct",
        "message" = excluded."message",
        "updatedAt" = CURRENT_TIMESTAMP,
        "finishedAt" = excluded."finishedAt"
    `,
    input.runId,
    input.status,
    input.stepKey,
    input.stepLabel,
    progressPct,
    input.message ?? null,
    input.finishedAt ?? null
  );
}

export async function getRunProgress(runId: string): Promise<RunProgressRow | null> {
  await ensureRunProgressTable();
  const rows = await prisma.$queryRawUnsafe<RunProgressRow[]>(
    `
      SELECT
        "runId",
        "status",
        "stepKey",
        "stepLabel",
        "progressPct",
        "message",
        "startedAt",
        "updatedAt",
        "finishedAt"
      FROM "RunProgress"
      WHERE "runId" = ?
      LIMIT 1
    `,
    runId
  );
  return rows[0] || null;
}

export async function listRunProgressRows(limit = 200): Promise<RunProgressRow[]> {
  await ensureRunProgressTable();
  const safeLimit = Math.max(1, Math.min(limit, 1000));
  return prisma.$queryRawUnsafe<RunProgressRow[]>(
    `
      SELECT
        "runId",
        "status",
        "stepKey",
        "stepLabel",
        "progressPct",
        "message",
        "startedAt",
        "updatedAt",
        "finishedAt"
      FROM "RunProgress"
      ORDER BY "updatedAt" DESC
      LIMIT ${safeLimit}
    `
  );
}

export function buildStepStates(params: {
  status: RunProgressStatus;
  stepKey: RunProgressStepKey;
}): Array<{ key: string; label: string; state: 'pending' | 'running' | 'completed' | 'failed' }> {
  const stepIndex = RUN_PROGRESS_STEPS.findIndex((step) => step.key === params.stepKey);
  return RUN_PROGRESS_STEPS.map((step, idx) => {
    if (params.status === 'COMPLETED') {
      return { ...step, state: 'completed' as const };
    }
    if (params.status === 'FAILED') {
      if (idx < stepIndex) return { ...step, state: 'completed' as const };
      if (idx === stepIndex) return { ...step, state: 'failed' as const };
      return { ...step, state: 'pending' as const };
    }
    if (idx < stepIndex) return { ...step, state: 'completed' as const };
    if (idx === stepIndex) return { ...step, state: 'running' as const };
    return { ...step, state: 'pending' as const };
  });
}
