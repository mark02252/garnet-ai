import { ToadScheduler, CronJob, AsyncTask } from 'toad-scheduler';
import type { ScheduledJobConfig, JobRunResult, JobStatus, JobRunStatus } from './types';
import { prisma } from '@/lib/prisma';
import Cron from 'croner';

const scheduler = new ToadScheduler();
const registeredJobs = new Map<string, ScheduledJobConfig>();
const jobRunning = new Set<string>();

export function registerJob(config: ScheduledJobConfig): void {
  if (registeredJobs.has(config.id)) {
    unregisterJob(config.id);
  }
  registeredJobs.set(config.id, config);
  if (!config.enabled) return;

  const task = new AsyncTask(config.id, async () => {
    if (jobRunning.has(config.id)) return;
    jobRunning.add(config.id);
    const start = Date.now();
    let status: JobRunStatus = 'SUCCESS';
    let message: string | undefined;
    let error: string | undefined;

    try {
      const result = await config.handler();
      status = result.ok ? 'SUCCESS' : 'FAILED';
      message = result.message;
      if (!result.ok) error = result.message;
    } catch (err) {
      status = 'FAILED';
      error = err instanceof Error ? err.message : 'Unknown error';
      message = error;
    } finally {
      const durationMs = Date.now() - start;
      jobRunning.delete(config.id);
      await prisma.jobRun.create({
        data: { jobId: config.id, status, message, durationMs, error }
      }).catch(() => {});
    }
  }, (err) => {
    console.error(`[Scheduler] Job ${config.id} error:`, err);
  });

  const job = new CronJob({ cronExpression: config.cron }, task, {
    id: config.id,
    preventOverrun: true,
  });

  scheduler.addCronJob(job);
}

export function unregisterJob(jobId: string): void {
  try { scheduler.removeById(jobId); } catch { /* not found */ }
  registeredJobs.delete(jobId);
  jobRunning.delete(jobId);
}

export async function executeJobNow(jobId: string): Promise<JobRunResult> {
  const config = registeredJobs.get(jobId);
  if (!config) return { ok: false, message: `Job not found: ${jobId}` };
  if (!config.enabled) return { ok: false, message: `Job disabled: ${jobId}` };

  const start = Date.now();
  try {
    const result = await config.handler();
    const durationMs = Date.now() - start;
    await prisma.jobRun.create({
      data: {
        jobId,
        status: result.ok ? 'SUCCESS' : 'FAILED',
        message: result.message,
        durationMs,
        error: result.ok ? undefined : result.message
      }
    }).catch(() => {});
    return { ...result, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    const error = err instanceof Error ? err.message : 'Unknown error';
    await prisma.jobRun.create({
      data: { jobId, status: 'FAILED', message: error, durationMs, error }
    }).catch(() => {});
    return { ok: false, message: error, durationMs };
  }
}

export async function getJobStatuses(): Promise<JobStatus[]> {
  const statuses: JobStatus[] = [];
  for (const config of registeredJobs.values()) {
    const lastRun = await prisma.jobRun.findFirst({
      where: { jobId: config.id },
      orderBy: { createdAt: 'desc' }
    });
    statuses.push({
      id: config.id,
      name: config.name,
      description: config.description,
      cron: config.cron,
      category: config.category,
      enabled: config.enabled,
      lastRunAt: lastRun?.createdAt ?? null,
      lastStatus: (lastRun?.status as JobRunStatus) ?? null,
      nextRunAt: (() => {
        try { return new Cron(config.cron).nextRun(); } catch { return null; }
      })(),
      isRunning: jobRunning.has(config.id),
    });
  }
  return statuses;
}

export function startScheduler(): void {
  console.log('[Scheduler] Started with', registeredJobs.size, 'jobs');
}

export function stopScheduler(): void {
  scheduler.stop();
  jobRunning.clear();
  console.log('[Scheduler] Stopped');
}

export function getRegisteredJobIds(): string[] {
  return Array.from(registeredJobs.keys());
}

export function getRegisteredJobConfig(jobId: string): ScheduledJobConfig | undefined {
  return registeredJobs.get(jobId);
}
