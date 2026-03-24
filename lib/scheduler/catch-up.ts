import Cron from 'croner';
import { prisma } from '@/lib/prisma';
import { executeJobNow, getRegisteredJobIds, getRegisteredJobConfig } from './engine';

function estimateIntervalMs(cronExpr: string): number {
  try {
    const runs = new Cron(cronExpr, { paused: true }).nextRuns(2);
    if (runs.length === 2) {
      return runs[1].getTime() - runs[0].getTime();
    }
  } catch { /* fallthrough */ }
  return 60 * 60 * 1000;
}

export function shouldCatchUp(lastRunAt: Date | null, cronExpr: string): boolean {
  if (!lastRunAt) return true;
  const interval = estimateIntervalMs(cronExpr);
  const elapsed = Date.now() - lastRunAt.getTime();
  return elapsed > interval;
}

export async function runCatchUp(): Promise<string[]> {
  const jobIds = getRegisteredJobIds();
  const caughtUp: string[] = [];

  for (const jobId of jobIds) {
    const config = getRegisteredJobConfig(jobId);
    if (!config || !config.enabled) continue;

    const lastRun = await prisma.jobRun.findFirst({
      where: { jobId, status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' }
    });

    if (shouldCatchUp(lastRun?.createdAt ?? null, config.cron)) {
      await executeJobNow(jobId);
      caughtUp.push(jobId);
    }
  }

  return caughtUp;
}
