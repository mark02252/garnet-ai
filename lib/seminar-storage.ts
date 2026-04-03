import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { StructuredSeminarFinalReport } from '@/lib/report-visuals';
import type { RuntimeConfig } from '@/lib/types';

export type SeminarSessionStatus = 'PLANNED' | 'RUNNING' | 'STOPPED' | 'COMPLETED' | 'FAILED';
export type SeminarRoundStatus = 'RUNNING' | 'DONE' | 'FAILED';

type SessionRow = {
  id: string;
  title: string | null;
  topic: string;
  brand: string | null;
  region: string | null;
  goal: string | null;
  status: SeminarSessionStatus;
  startsAt: string;
  endsAt: string;
  intervalMinutes: number;
  maxRounds: number;
  completedRounds: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  morningBriefing: string | null;
  runtimeConfig: string | null;
  lastError: string | null;
  isProcessing: number;
  processingStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RoundRow = {
  id: string;
  sessionId: string;
  roundNumber: number;
  scheduledAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: SeminarRoundStatus;
  runId: string | null;
  summary: string | null;
  error: string | null;
  createdAt: string;
};

type FinalReportRow = {
  id: string;
  sessionId: string;
  content: string;
  structured: string | null;
  createdAt: string;
  updatedAt: string;
};

type TableInfoRow = {
  name: string;
};

export type SeminarSession = {
  id: string;
  title: string | null;
  topic: string;
  brand: string | null;
  region: string | null;
  goal: string | null;
  status: SeminarSessionStatus;
  startsAt: string;
  endsAt: string;
  intervalMinutes: number;
  maxRounds: number;
  completedRounds: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  morningBriefing: string | null;
  runtimeConfig: RuntimeConfig | null;
  lastError: string | null;
  isProcessing: boolean;
  processingStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SeminarRound = {
  id: string;
  sessionId: string;
  roundNumber: number;
  scheduledAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: SeminarRoundStatus;
  runId: string | null;
  summary: string | null;
  error: string | null;
  createdAt: string;
};

export type SeminarFinalReport = {
  id: string;
  sessionId: string;
  content: string;
  structured: StructuredSeminarFinalReport | null;
  createdAt: string;
  updatedAt: string;
};

let seminarTablesEnsured = false;

function toIso(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseRuntimeConfig(raw: string | null): RuntimeConfig | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RuntimeConfig;
  } catch {
    return null;
  }
}

function mapSession(row: SessionRow): SeminarSession {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    brand: row.brand,
    region: row.region,
    goal: row.goal,
    status: row.status,
    startsAt: toIso(row.startsAt) || new Date().toISOString(),
    endsAt: toIso(row.endsAt) || new Date().toISOString(),
    intervalMinutes: Number(row.intervalMinutes || 60),
    maxRounds: Number(row.maxRounds || 1),
    completedRounds: Number(row.completedRounds || 0),
    nextRunAt: toIso(row.nextRunAt),
    lastRunAt: toIso(row.lastRunAt),
    morningBriefing: row.morningBriefing,
    runtimeConfig: parseRuntimeConfig(row.runtimeConfig),
    lastError: row.lastError,
    isProcessing: Boolean(row.isProcessing),
    processingStartedAt: toIso(row.processingStartedAt),
    createdAt: toIso(row.createdAt) || new Date().toISOString(),
    updatedAt: toIso(row.updatedAt) || new Date().toISOString()
  };
}

function mapRound(row: RoundRow): SeminarRound {
  return {
    id: row.id,
    sessionId: row.sessionId,
    roundNumber: Number(row.roundNumber || 0),
    scheduledAt: toIso(row.scheduledAt) || new Date().toISOString(),
    startedAt: toIso(row.startedAt),
    finishedAt: toIso(row.finishedAt),
    status: row.status,
    runId: row.runId,
    summary: row.summary,
    error: row.error,
    createdAt: toIso(row.createdAt) || new Date().toISOString()
  };
}

function mapFinalReport(row: FinalReportRow): SeminarFinalReport {
  let structured: StructuredSeminarFinalReport | null = null;
  if (row.structured) {
    try {
      structured = JSON.parse(row.structured) as StructuredSeminarFinalReport;
    } catch {
      structured = null;
    }
  }

  return {
    id: row.id,
    sessionId: row.sessionId,
    content: row.content,
    structured,
    createdAt: toIso(row.createdAt) || new Date().toISOString(),
    updatedAt: toIso(row.updatedAt) || new Date().toISOString()
  };
}

export async function ensureSeminarTables() {
  if (seminarTablesEnsured) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SeminarSession" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT,
      "topic" TEXT NOT NULL,
      "brand" TEXT,
      "region" TEXT,
      "goal" TEXT,
      "status" TEXT NOT NULL,
      "startsAt" DATETIME NOT NULL,
      "endsAt" DATETIME NOT NULL,
      "intervalMinutes" INTEGER NOT NULL,
      "maxRounds" INTEGER NOT NULL,
      "completedRounds" INTEGER NOT NULL DEFAULT 0,
      "nextRunAt" DATETIME,
      "lastRunAt" DATETIME,
      "morningBriefing" TEXT,
      "runtimeConfig" TEXT,
      "lastError" TEXT,
      "isProcessing" INTEGER NOT NULL DEFAULT 0,
      "processingStartedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "SeminarSession_status_nextRunAt_idx"
    ON "SeminarSession"("status", "nextRunAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "SeminarSession_createdAt_idx"
    ON "SeminarSession"("createdAt")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SeminarRound" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "sessionId" TEXT NOT NULL,
      "roundNumber" INTEGER NOT NULL,
      "scheduledAt" DATETIME NOT NULL,
      "startedAt" DATETIME,
      "finishedAt" DATETIME,
      "status" TEXT NOT NULL,
      "runId" TEXT,
      "summary" TEXT,
      "error" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("sessionId") REFERENCES "SeminarSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "SeminarRound_sessionId_roundNumber_key"
    ON "SeminarRound"("sessionId", "roundNumber")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "SeminarRound_sessionId_status_idx"
    ON "SeminarRound"("sessionId", "status")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "SeminarRound_createdAt_idx"
    ON "SeminarRound"("createdAt")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SeminarFinalReport" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "sessionId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "structured" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("sessionId") REFERENCES "SeminarSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  const finalReportColumns = await prisma.$queryRawUnsafe<TableInfoRow[]>(
    `SELECT column_name as name FROM information_schema.columns WHERE table_name = 'SeminarFinalReport' AND table_schema = 'public'`
  );
  if (!finalReportColumns.some((column) => column.name === 'structured')) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "SeminarFinalReport"
      ADD COLUMN "structured" TEXT
    `);
  }
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "SeminarFinalReport_sessionId_key"
    ON "SeminarFinalReport"("sessionId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "SeminarFinalReport_updatedAt_idx"
    ON "SeminarFinalReport"("updatedAt")
  `);

  seminarTablesEnsured = true;
}

export async function createSeminarSession(input: {
  title?: string;
  topic: string;
  brand?: string;
  region?: string;
  goal?: string;
  startsAt: Date;
  endsAt: Date;
  intervalMinutes: number;
  maxRounds: number;
  runtimeConfig?: RuntimeConfig | null;
}) {
  await ensureSeminarTables();
  const now = new Date();
  const sessionId = randomUUID();
  const startsAtIso = input.startsAt.toISOString();
  const endsAtIso = input.endsAt.toISOString();
  const status: SeminarSessionStatus = input.startsAt.getTime() > now.getTime() ? 'PLANNED' : 'RUNNING';
  const nextRunAtIso = status === 'RUNNING' ? now.toISOString() : startsAtIso;
  const runtime = input.runtimeConfig ? JSON.stringify(input.runtimeConfig) : null;

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "SeminarSession" (
        "id", "title", "topic", "brand", "region", "goal",
        "status", "startsAt", "endsAt", "intervalMinutes", "maxRounds",
        "completedRounds", "nextRunAt", "runtimeConfig", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    sessionId,
    input.title || null,
    input.topic,
    input.brand || null,
    input.region || null,
    input.goal || null,
    status,
    startsAtIso,
    endsAtIso,
    input.intervalMinutes,
    input.maxRounds,
    0,
    nextRunAtIso,
    runtime
  );

  return getSeminarSession(sessionId);
}

export async function listSeminarSessions(limit = 30) {
  await ensureSeminarTables();
  const rows = await prisma.$queryRawUnsafe<SessionRow[]>(
    `
      SELECT *
      FROM "SeminarSession"
      ORDER BY "createdAt" DESC
      LIMIT $1
    `,
    Math.max(1, Math.min(limit, 200))
  );
  return rows.map(mapSession);
}

export async function getSeminarSession(sessionId: string) {
  await ensureSeminarTables();
  const rows = await prisma.$queryRawUnsafe<SessionRow[]>(
    `
      SELECT *
      FROM "SeminarSession"
      WHERE "id" = $1
      LIMIT 1
    `,
    sessionId
  );
  if (!rows.length) return null;
  return mapSession(rows[0]);
}

export async function getSeminarRounds(sessionId: string) {
  await ensureSeminarTables();
  const rows = await prisma.$queryRawUnsafe<RoundRow[]>(
    `
      SELECT *
      FROM "SeminarRound"
      WHERE "sessionId" = $1
      ORDER BY "roundNumber" DESC
    `,
    sessionId
  );
  return rows.map(mapRound);
}

export async function getSeminarSessionDetail(sessionId: string) {
  const [session, rounds, finalReport] = await Promise.all([
    getSeminarSession(sessionId),
    getSeminarRounds(sessionId),
    getSeminarFinalReport(sessionId)
  ]);
  if (!session) return null;
  return { session, rounds, finalReport };
}

export async function getSeminarFinalReport(sessionId: string) {
  await ensureSeminarTables();
  const rows = await prisma.$queryRawUnsafe<FinalReportRow[]>(
    `
      SELECT *
      FROM "SeminarFinalReport"
      WHERE "sessionId" = $1
      LIMIT 1
    `,
    sessionId
  );
  if (!rows.length) return null;
  return mapFinalReport(rows[0]);
}

export async function upsertSeminarFinalReport(
  sessionId: string,
  content: string,
  structured?: StructuredSeminarFinalReport | null
) {
  await ensureSeminarTables();
  const existing = await getSeminarFinalReport(sessionId);
  if (!existing) {
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "SeminarFinalReport" (
          "id", "sessionId", "content", "structured", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      id,
      sessionId,
      content,
      structured ? JSON.stringify(structured) : null
    );
    return getSeminarFinalReport(sessionId);
  }

  await prisma.$executeRawUnsafe(
    `
      UPDATE "SeminarFinalReport"
      SET "content" = $1, "structured" = $2, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "sessionId" = $3
    `,
    content,
    structured ? JSON.stringify(structured) : null,
    sessionId
  );
  return getSeminarFinalReport(sessionId);
}

export async function claimDueSeminarSessions(now = new Date(), limit = 3) {
  await ensureSeminarTables();
  const nowIso = now.toISOString();
  const candidates = await prisma.$queryRawUnsafe<SessionRow[]>(
    `
      SELECT *
      FROM "SeminarSession"
      WHERE "status" IN ('RUNNING', 'PLANNED')
        AND "nextRunAt" IS NOT NULL
        AND "nextRunAt" <= $1::timestamptz
      ORDER BY "nextRunAt" ASC
      LIMIT $2
    `,
    nowIso,
    Math.max(1, Math.min(limit, 20))
  );

  const claimedIds: string[] = [];
  for (const candidate of candidates) {
    const updated = await prisma.$executeRawUnsafe(
      `
        UPDATE "SeminarSession"
        SET
          "isProcessing" = true,
          "processingStartedAt" = $1::timestamptz,
          "status" = CASE WHEN "status" = 'PLANNED' THEN 'RUNNING' ELSE "status" END,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $2
          AND "isProcessing" = false
          AND "status" IN ('RUNNING', 'PLANNED')
      `,
      nowIso,
      candidate.id
    );
    if (updated > 0) claimedIds.push(candidate.id);
  }

  return claimedIds;
}

export async function releaseSeminarSessionProcessing(sessionId: string) {
  await ensureSeminarTables();
  await prisma.$executeRawUnsafe(
    `
      UPDATE "SeminarSession"
      SET "isProcessing" = false, "processingStartedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = $1
    `,
    sessionId
  );
}

export async function touchSeminarSession(sessionId: string, patch: {
  status?: SeminarSessionStatus;
  completedRounds?: number;
  nextRunAt?: Date | null;
  lastRunAt?: Date | null;
  morningBriefing?: string | null;
  lastError?: string | null;
}) {
  await ensureSeminarTables();
  const hasNextRunAt = patch.nextRunAt !== undefined;
  const hasMorningBriefing = patch.morningBriefing !== undefined;
  const hasLastError = patch.lastError !== undefined;
  await prisma.$executeRawUnsafe(
    `
      UPDATE "SeminarSession"
      SET
        "status" = COALESCE($1, "status"),
        "completedRounds" = COALESCE($2::integer, "completedRounds"),
        "nextRunAt" = CASE WHEN $3 = 1 THEN $4::timestamptz ELSE "nextRunAt" END,
        "lastRunAt" = COALESCE($5::timestamptz, "lastRunAt"),
        "morningBriefing" = CASE WHEN $6 = 1 THEN $7 ELSE "morningBriefing" END,
        "lastError" = CASE WHEN $8 = 1 THEN $9 ELSE "lastError" END,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = $10
    `,
    patch.status ?? null,
    patch.completedRounds ?? null,
    hasNextRunAt ? 1 : 0,
    patch.nextRunAt ? patch.nextRunAt.toISOString() : null,
    patch.lastRunAt ? patch.lastRunAt.toISOString() : null,
    hasMorningBriefing ? 1 : 0,
    patch.morningBriefing ?? null,
    hasLastError ? 1 : 0,
    patch.lastError ?? null,
    sessionId
  );
}

export async function startSeminarSession(sessionId: string) {
  await ensureSeminarTables();
  const nowIso = new Date().toISOString();
  await prisma.$executeRawUnsafe(
    `
      UPDATE "SeminarSession"
      SET
        "status" = 'RUNNING',
        "nextRunAt" = $1::timestamptz,
        "lastError" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = $2
    `,
    nowIso,
    sessionId
  );
}

export async function stopSeminarSession(sessionId: string) {
  await ensureSeminarTables();
  await prisma.$executeRawUnsafe(
    `
      UPDATE "SeminarSession"
      SET
        "status" = 'STOPPED',
        "nextRunAt" = NULL,
        "isProcessing" = false,
        "processingStartedAt" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = $1
    `,
    sessionId
  );
}

export async function beginSeminarRound(input: {
  sessionId: string;
  roundNumber: number;
  scheduledAt: Date;
}) {
  await ensureSeminarTables();
  const roundId = randomUUID();
  const scheduledAtIso = input.scheduledAt.toISOString();
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "SeminarRound" (
        "id", "sessionId", "roundNumber", "scheduledAt", "startedAt", "status", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, 'RUNNING', CURRENT_TIMESTAMP)
    `,
    roundId,
    input.sessionId,
    input.roundNumber,
    scheduledAtIso,
    new Date().toISOString()
  );
  return roundId;
}

export async function completeSeminarRound(input: {
  roundId: string;
  status: SeminarRoundStatus;
  runId?: string | null;
  summary?: string | null;
  error?: string | null;
}) {
  await ensureSeminarTables();
  await prisma.$executeRawUnsafe(
    `
      UPDATE "SeminarRound"
      SET
        "status" = $1,
        "runId" = $2,
        "summary" = $3,
        "error" = $4,
        "finishedAt" = $5::timestamptz
      WHERE "id" = $6
    `,
    input.status,
    input.runId || null,
    input.summary || null,
    input.error || null,
    new Date().toISOString(),
    input.roundId
  );
}

export async function resetStaleSeminarLocks(staleMinutes = 20) {
  await ensureSeminarTables();
  const staleAt = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();
  await prisma.$executeRawUnsafe(
    `
      UPDATE "SeminarSession"
      SET
        "isProcessing" = false,
        "processingStartedAt" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "isProcessing" = true
        AND "processingStartedAt" IS NOT NULL
        AND "processingStartedAt" < $1::timestamptz
    `,
    staleAt
  );
}
