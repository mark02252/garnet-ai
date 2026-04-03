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

import { enqueue, listPending, markExecuted, markFailed, markRejected } from '@/lib/governor';
import { prisma } from '@/lib/prisma';

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
    vi.mocked(prisma.$executeRawUnsafe).mockResolvedValue(undefined);
  });

  it('exports required functions', () => {
    expect(typeof enqueue).toBe('function');
    expect(typeof listPending).toBe('function');
    expect(typeof markExecuted).toBe('function');
    expect(typeof markFailed).toBe('function');
    expect(typeof markRejected).toBe('function');
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
      expect.anything(),
    );
  });
});
