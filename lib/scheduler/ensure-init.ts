import { initSchedulerSystem } from './init';

/**
 * API 라우트에서 호출하여 스케줄러가 초기화되었는지 보장한다.
 * initSchedulerSystem()은 내부적으로 idempotent하므로 중복 호출 안전.
 */
export async function ensureScheduler(): Promise<void> {
  await initSchedulerSystem();
}
