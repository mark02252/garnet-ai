import { markExecuted, markFailed, listByStatus } from '@/lib/governor';
import type { GovernorAction } from '@/lib/governor';

type ActionHandler = (payload: unknown) => Promise<void>;

const handlers: Map<string, ActionHandler> = new Map();

export function registerHandler(kind: string, handler: ActionHandler): void {
  handlers.set(kind, handler);
}

/** 테스트 격리용 — 프로덕션 코드에서는 호출하지 않는다 */
export function clearHandlers(): void {
  handlers.clear();
}

export async function execute(action: GovernorAction): Promise<void> {
  const handler = handlers.get(action.kind);
  if (!handler) {
    await markFailed(action.id, `Unknown kind: ${action.kind}`);
    return;
  }
  try {
    await handler(action.payload);
    await markExecuted(action.id);
  } catch (err) {
    await markFailed(action.id, String(err));
  }
}

export async function flushPendingExec(): Promise<void> {
  const actions = await listByStatus('PENDING_EXEC');
  for (const action of actions) {
    await execute(action);
  }
}
