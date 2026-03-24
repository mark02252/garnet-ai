import { startScheduler, stopScheduler } from './engine';
import { registerBuiltinJobs } from './register-jobs';
import { startSeminarScheduler } from '@/lib/seminar-scheduler';
import { runCatchUp } from './catch-up';

let initialized = false;

export async function initSchedulerSystem(): Promise<void> {
  if (initialized) return;
  initialized = true;

  registerBuiltinJobs();
  startScheduler();
  startSeminarScheduler();
  await runCatchUp();

  console.log('[Garnet] Scheduler system initialized');
}

export function shutdownSchedulerSystem(): void {
  stopScheduler();
  initialized = false;
  console.log('[Garnet] Scheduler system shut down');
}
