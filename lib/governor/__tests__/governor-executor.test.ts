import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/governor', () => ({
  markExecuted: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  listByStatus: vi.fn().mockResolvedValue([]),
}));

import { execute, registerHandler, clearHandlers, flushPendingExec } from '@/lib/governor-executor';
import { markExecuted, markFailed } from '@/lib/governor';
import type { GovernorAction } from '@/lib/governor';

function makeAction(kind: string): GovernorAction {
  return {
    id: 'exec-test-id',
    kind,
    payload: {},
    status: 'PENDING_EXEC',
    riskLevel: 'LOW',
    riskReason: null,
    approvedBy: null,
    executedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('execute', () => {
  afterEach(() => { clearHandlers(); });

  it('calls registered handler and marks EXECUTED', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerHandler('TEST_ACTION', handler);
    await execute(makeAction('TEST_ACTION'));
    expect(handler).toHaveBeenCalledWith({});
    expect(markExecuted).toHaveBeenCalledWith('exec-test-id');
  });

  it('marks FAILED on handler error', async () => {
    registerHandler('FAIL_ACTION', vi.fn().mockRejectedValue(new Error('boom')));
    await execute(makeAction('FAIL_ACTION'));
    expect(markFailed).toHaveBeenCalledWith('exec-test-id', 'Error: boom');
  });

  it('marks FAILED for unknown kind', async () => {
    await execute(makeAction('UNKNOWN_KIND_XYZ'));
    expect(markFailed).toHaveBeenCalledWith('exec-test-id', 'Unknown kind: UNKNOWN_KIND_XYZ');
  });
});

describe('flushPendingExec', () => {
  it('runs without error when queue is empty', async () => {
    await expect(flushPendingExec()).resolves.not.toThrow();
  });
});
