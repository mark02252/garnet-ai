import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $queryRawUnsafe: vi.fn(),
  },
}));

// governor-scorer는 fire-and-forget — 테스트에서 mock 처리
vi.mock('@/lib/governor-scorer', () => ({
  scoreRisk: vi.fn().mockResolvedValue({ riskLevel: 'LOW', reason: 'test' }),
}));

vi.mock('@/lib/governor-executor', () => ({
  execute: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/telegram', () => ({
  sendApprovalRequest: vi.fn().mockResolvedValue(undefined),
}));

import { enqueue, listPending, markExecuted, markFailed, markRejected, ensureGovernorTable, listByStatus, updateStatus, getById, resetTableEnsuredForTests, decideAction } from '@/lib/governor';
import { prisma } from '@/lib/prisma';
import { execute } from '@/lib/governor-executor';
import { sendApprovalRequest } from '@/lib/telegram';

const MOCK_ROW = {
  id: 'test-id',
  kind: 'RUN_REPORT',
  payload: '{"x":1}',
  status: 'PENDING_SCORE',
  riskLevel: null,
  riskReason: null,
  approvedBy: null,
  executedAt: null,
  deletedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('governor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTableEnsuredForTests();
    vi.mocked(prisma.$executeRawUnsafe).mockResolvedValue(0);
  });

  it('exports required functions', () => {
    expect(typeof enqueue).toBe('function');
    expect(typeof listPending).toBe('function');
    expect(typeof markExecuted).toBe('function');
    expect(typeof markFailed).toBe('function');
    expect(typeof markRejected).toBe('function');
    expect(typeof ensureGovernorTable).toBe('function');
    expect(typeof listByStatus).toBe('function');
    expect(typeof updateStatus).toBe('function');
    expect(typeof getById).toBe('function');
  });

  it('enqueue returns action with PENDING_SCORE status and parsed payload', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([MOCK_ROW]);
    const action = await enqueue({ kind: 'RUN_REPORT', payload: { x: 1 } });
    expect(action.status).toBe('PENDING_SCORE');
    expect(action.payload).toEqual({ x: 1 });
    expect(action.kind).toBe('RUN_REPORT');
  });

  it('markFailed persists the reason via riskReason', async () => {
    await markFailed('test-id', 'boom');
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE'),
      expect.anything(),
      expect.anything(),
      expect.stringContaining('boom'),
    );
  });

  describe('decideAction', () => {
    it('exports decideAction function', () => {
      expect(typeof decideAction).toBe('function');
    });

    it('throws when action not found', async () => {
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([]);
      await expect(decideAction('no-such-id', 'APPROVED')).rejects.toThrow('not found');
    });

    it('throws when action is already in terminal status', async () => {
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([
        { ...MOCK_ROW, status: 'EXECUTED' },
      ]);
      await expect(decideAction('test-id', 'APPROVED')).rejects.toThrow('terminal');
    });

    it('calls markRejected (not execute) on REJECTED decision', async () => {
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([
        { ...MOCK_ROW, status: 'PENDING_APPROVAL' },
      ]);
      await decideAction('test-id', 'REJECTED');
      // execute must NOT be called for rejected actions
      expect(execute).not.toHaveBeenCalled();
      // markRejected is updateStatus with REJECTED — verify via prisma mock
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.anything(),
        'REJECTED',
        expect.anything()
      );
    });

    it('calls execute on APPROVED decision', async () => {
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([
        { ...MOCK_ROW, status: 'PENDING_APPROVAL' },
      ]);
      await decideAction('test-id', 'APPROVED');
      // updateStatus가 먼저 호출되어 approvedBy가 기록되어야 함
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.anything(),
        expect.anything(),
        expect.stringContaining('user')
      );
      expect(execute).toHaveBeenCalled();
    });
  });

  describe('runScorer → Telegram wiring', () => {
    it('calls sendApprovalRequest for PENDING_APPROVAL actions (MEDIUM/HIGH)', async () => {
      // scoreRisk returns MEDIUM → status becomes PENDING_APPROVAL
      const { scoreRisk } = await import('@/lib/governor-scorer');
      vi.mocked(scoreRisk).mockResolvedValueOnce({ riskLevel: 'MEDIUM', reason: '예약 발행' });
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([MOCK_ROW]);

      await enqueue({ kind: 'SNS_PUBLISH', payload: {} });

      // fire-and-forget — wait one tick for async to complete
      await new Promise((r) => setTimeout(r, 0));

      expect(sendApprovalRequest).toHaveBeenCalled();
    });

    it('does NOT call sendApprovalRequest for LOW risk (PENDING_EXEC)', async () => {
      const { scoreRisk } = await import('@/lib/governor-scorer');
      vi.mocked(scoreRisk).mockResolvedValueOnce({ riskLevel: 'LOW', reason: '내부 초안' });
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([MOCK_ROW]);

      await enqueue({ kind: 'RUN_REPORT', payload: {} });

      await new Promise((r) => setTimeout(r, 0));

      expect(sendApprovalRequest).not.toHaveBeenCalled();
    });
  });
});
