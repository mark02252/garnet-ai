import type { RuntimeConfig } from '@/lib/types';

export type JobRunStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface ScheduledJobConfig {
  id: string;
  name: string;
  description: string;
  cron: string;
  category: 'system' | 'collect' | 'analysis' | 'report';
  enabled: boolean;
  handler: (runtime?: RuntimeConfig) => Promise<JobRunResult>;
}

export interface JobRunResult {
  ok: boolean;
  message: string;
  data?: unknown;
  durationMs?: number;
}

export interface JobStatus {
  id: string;
  name: string;
  description: string;
  cron: string;
  category: string;
  enabled: boolean;
  lastRunAt: Date | null;
  lastStatus: JobRunStatus | null;
  nextRunAt: Date | null;
  isRunning: boolean;
}
