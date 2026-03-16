import { prisma } from '@/lib/prisma';

let ensured = false;

export async function ensureInstagramReachTables() {
  if (ensured) return;

  await prisma.$executeRawUnsafe(`
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

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "InstagramReachDaily_accountId_metricDate_key"
    ON "InstagramReachDaily"("accountId", "metricDate")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "InstagramReachDaily_metricDate_idx"
    ON "InstagramReachDaily"("metricDate")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "InstagramReachDaily_accountId_metricDate_idx"
    ON "InstagramReachDaily"("accountId", "metricDate")
  `);

  await prisma.$executeRawUnsafe(`
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

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "InstagramReachAnalysisRun_accountId_createdAt_idx"
    ON "InstagramReachAnalysisRun"("accountId", "createdAt")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "InstagramReachAnalysisRun_createdAt_idx"
    ON "InstagramReachAnalysisRun"("createdAt")
  `);

  ensured = true;
}
