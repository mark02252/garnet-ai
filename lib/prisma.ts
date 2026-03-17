import { PrismaClient } from '@prisma/client';
import path from 'node:path';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

type PrismaWithBootstrap = PrismaClient & { __bootstrapMiddlewareAttached?: boolean };

let bootstrapPromise: Promise<void> | null = null;
let bootstrapDone = false;

const prismaClient =
  (global.prismaGlobal ||
    new PrismaClient({
      datasourceUrl: (() => {
        const url = process.env.DATABASE_URL;
        if (!url) return undefined;
        if (url.startsWith('file:./')) {
          const relative = url.replace('file:./', '');
          // Prisma CLI resolves file:. relative to schema dir (prisma/)
          // so we match that convention here
          return `file:${path.join(process.cwd(), 'prisma', relative)}`;
        }
        return url;
      })(),
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
    })) as PrismaWithBootstrap;

async function ensureBaseTables(client: PrismaClient) {
  if (bootstrapDone) return;
  if (bootstrapPromise) {
    await bootstrapPromise;
    return;
  }

  bootstrapPromise = (async () => {
    await client.$executeRawUnsafe('PRAGMA foreign_keys = ON');

    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Run" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "topic" TEXT NOT NULL,
        "brand" TEXT,
        "region" TEXT,
        "goal" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Run_createdAt_idx" ON "Run"("createdAt")
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Run_topic_idx" ON "Run"("topic")
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Run_brand_idx" ON "Run"("brand")
    `);

    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WebSource" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "runId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "snippet" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "fetchedAt" DATETIME NOT NULL,
        FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WebSource_runId_idx" ON "WebSource"("runId")
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WebSource_fetchedAt_idx" ON "WebSource"("fetchedAt")
    `);

    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MeetingTurn" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "runId" TEXT NOT NULL,
        "role" TEXT NOT NULL,
        "nickname" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "MeetingTurn_runId_createdAt_idx" ON "MeetingTurn"("runId", "createdAt")
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "MeetingTurn_role_idx" ON "MeetingTurn"("role")
    `);

    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RunAttachment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "runId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "mimeType" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RunAttachment_runId_createdAt_idx" ON "RunAttachment"("runId", "createdAt")
    `);

    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Deliverable" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "runId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await client.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "Deliverable_runId_key" ON "Deliverable"("runId")
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Deliverable_type_idx" ON "Deliverable"("type")
    `);

    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MemoryLog" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "runId" TEXT NOT NULL,
        "hypothesis" TEXT NOT NULL,
        "direction" TEXT NOT NULL,
        "expectedImpact" TEXT NOT NULL,
        "risks" TEXT NOT NULL,
        "outcome" TEXT,
        "failureReason" TEXT,
        "tags" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await client.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "MemoryLog_runId_key" ON "MemoryLog"("runId")
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "MemoryLog_createdAt_idx" ON "MemoryLog"("createdAt")
    `);

    const memoryColumns = (await client.$queryRawUnsafe<Array<{ name: string }>>(
      `PRAGMA table_info("MemoryLog")`
    )) || [];
    if (!memoryColumns.some((col) => col.name === 'outcome')) {
      await client.$executeRawUnsafe(`ALTER TABLE "MemoryLog" ADD COLUMN "outcome" TEXT`);
    }
    if (!memoryColumns.some((col) => col.name === 'failureReason')) {
      await client.$executeRawUnsafe(`ALTER TABLE "MemoryLog" ADD COLUMN "failureReason" TEXT`);
    }

    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Dataset" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "notes" TEXT,
        "rawData" TEXT NOT NULL,
        "analysis" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Dataset_createdAt_idx" ON "Dataset"("createdAt")
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Dataset_name_idx" ON "Dataset"("name")
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Dataset_type_idx" ON "Dataset"("type")
    `);

    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LearningArchive" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "runId" TEXT,
        "sourceType" TEXT NOT NULL,
        "situation" TEXT NOT NULL,
        "recommendedResponse" TEXT NOT NULL,
        "reasoning" TEXT NOT NULL,
        "signals" TEXT NOT NULL,
        "tags" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'DRAFT',
        "lastUsedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "LearningArchive_runId_idx" ON "LearningArchive"("runId")
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "LearningArchive_status_idx" ON "LearningArchive"("status")
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "LearningArchive_createdAt_idx" ON "LearningArchive"("createdAt")
    `);

    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "InstagramReachDaily" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "accountId" TEXT NOT NULL,
        "metricDate" DATETIME NOT NULL,
        "reach" INTEGER NOT NULL,
        "rawValue" TEXT,
        "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "InstagramReachDaily_accountId_metricDate_key"
      ON "InstagramReachDaily"("accountId", "metricDate")
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "InstagramReachDaily_metricDate_idx"
      ON "InstagramReachDaily"("metricDate")
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "InstagramReachDaily_accountId_metricDate_idx"
      ON "InstagramReachDaily"("accountId", "metricDate")
    `);

    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "InstagramReachAnalysisRun" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "accountId" TEXT NOT NULL,
        "since" DATETIME NOT NULL,
        "until" DATETIME NOT NULL,
        "days" INTEGER NOT NULL,
        "averageReach" REAL NOT NULL,
        "latestReach" INTEGER NOT NULL,
        "previousReach" INTEGER,
        "dayOverDayChangePct" REAL,
        "sevenDayAverage" REAL,
        "trendDirection" TEXT NOT NULL,
        "anomalyCount" INTEGER NOT NULL DEFAULT 0,
        "summary" TEXT NOT NULL,
        "rawJson" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "InstagramReachAnalysisRun_accountId_createdAt_idx"
      ON "InstagramReachAnalysisRun"("accountId", "createdAt")
    `);
    await client.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "InstagramReachAnalysisRun_createdAt_idx"
      ON "InstagramReachAnalysisRun"("createdAt")
    `);

    bootstrapDone = true;
  })();

  try {
    await bootstrapPromise;
  } catch (error) {
    bootstrapPromise = null;
    throw error;
  }
}

if (!prismaClient.__bootstrapMiddlewareAttached) {
  prismaClient.$use(async (params, next) => {
    if (params.model && !bootstrapDone) {
      await ensureBaseTables(prismaClient);
    }
    return next(params);
  });
  prismaClient.__bootstrapMiddlewareAttached = true;
}

export const prisma = prismaClient;

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prismaClient;
}
