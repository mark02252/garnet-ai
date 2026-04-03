import { prisma } from '@/lib/prisma';
import type { JobRunResult } from './types';

export async function runMaintenanceJob(): Promise<JobRunResult> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  const deletedJobRuns = await prisma.jobRun.deleteMany({
    where: { createdAt: { lt: ninetyDaysAgo } }
  });

  const clearedRaw = await prisma.marketingIntel.updateMany({
    where: { createdAt: { lt: thirtyDaysAgo }, raw: { not: null } },
    data: { raw: null }
  });

  const deletedIntel = await prisma.marketingIntel.deleteMany({
    where: { createdAt: { lt: oneEightyDaysAgo }, relevance: { lt: 0.1 } }
  });

  // $executeRawUnsafe는 PostgreSQL에서 DML 시 affected row count(number)를 반환한다
  const deletedGovernorCount = (await prisma.$executeRawUnsafe(
    `DELETE FROM "GovernorAction" WHERE "deletedAt" IS NOT NULL AND "deletedAt" < NOW()`
  )) as number;

  return {
    ok: true,
    message: `정리 완료: JobRun ${deletedJobRuns.count}건, raw ${clearedRaw.count}건, Intel ${deletedIntel.count}건, Governor ${deletedGovernorCount}건 삭제`
  };
}
