import { describe, it, expect, vi, beforeEach } from 'vitest';

// Anthropic SDK mock
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn(function () {
    this.messages = { create: vi.fn() };
  });
  return { default: MockAnthropic };
});

import Anthropic from '@anthropic-ai/sdk';
import { scoreRisk } from '@/lib/governor-scorer';
import type { GovernorAction } from '@/lib/governor';

function makeAction(kind: string, payload: unknown): GovernorAction {
  return {
    id: 'test-id',
    kind,
    payload,
    status: 'PENDING_SCORE',
    riskLevel: null,
    riskReason: null,
    approvedBy: null,
    executedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('scoreRisk', () => {
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate = vi.fn();
    vi.mocked(Anthropic).mockImplementation(function (this: unknown) {
      (this as { messages: { create: typeof mockCreate } }).messages = { create: mockCreate };
    });
  });

  it('parses LOW correctly', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"riskLevel":"LOW","reason":"내부 초안"}' }]
    });
    const result = await scoreRisk(makeAction('RUN_REPORT', { id: '1' }));
    expect(result.riskLevel).toBe('LOW');
    expect(result.reason).toBe('내부 초안');
  });

  it('parses MEDIUM correctly', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"riskLevel":"MEDIUM","reason":"예약 발행"}' }]
    });
    const result = await scoreRisk(makeAction('SNS_PUBLISH', { scheduled: true }));
    expect(result.riskLevel).toBe('MEDIUM');
  });

  it('parses HIGH correctly', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"riskLevel":"HIGH","reason":"즉시 발행"}' }]
    });
    const result = await scoreRisk(makeAction('SNS_PUBLISH', { postId: '1' }));
    expect(result.riskLevel).toBe('HIGH');
  });

  it('falls back to HIGH on invalid JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'invalid json' }]
    });
    const result = await scoreRisk(makeAction('SNS_PUBLISH', {}));
    expect(result.riskLevel).toBe('HIGH');
    expect(result.reason).toMatch(/자동 평가 실패/);
  });

  it('falls back to HIGH on API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network error'));
    const result = await scoreRisk(makeAction('SNS_PUBLISH', {}));
    expect(result.riskLevel).toBe('HIGH');
  });
});
