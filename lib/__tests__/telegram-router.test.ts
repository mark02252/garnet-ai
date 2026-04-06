// lib/__tests__/telegram-router.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/telegram', () => ({
  answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
  editMessageText: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/lib/governor', () => ({
  decideAction: vi.fn().mockResolvedValue(undefined),
  listByStatus: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/llm', () => ({
  runLLM: vi.fn().mockResolvedValue('AI 응답'),
}));

// GA4 모듈은 아직 구현 전 — 모듈 선언
vi.mock('@/lib/analytics/ga4', () => ({
  getTodaySummary: vi.fn().mockResolvedValue('오늘 방문자 100명, 세션 150건, 전환율 3.2%'),
}));

vi.mock('@/lib/intel/digest-builder', () => ({
  buildDailyDigest: vi.fn().mockResolvedValue('브리핑 내용'),
}));

import {
  answerCallbackQuery,
  editMessageText,
  sendMessage,
} from '@/lib/telegram';
import { decideAction } from '@/lib/governor';
import { handleWebhookUpdate } from '@/lib/telegram-router';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('handleWebhookUpdate — unsupported update types', () => {
  it('returns immediately for edited_message without calling anything', async () => {
    await handleWebhookUpdate({ edited_message: { message_id: 1, chat: { id: 1 } } } as never);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(answerCallbackQuery).not.toHaveBeenCalled();
  });
});

describe('handleWebhookUpdate — callback_query', () => {
  const baseCq = {
    id: 'cq-123',
    from: { id: 111 },
    message: { message_id: 42, chat: { id: 111 } },
  };

  it('calls decideAction(APPROVED) and editMessageText on approve', async () => {
    await handleWebhookUpdate({
      callback_query: { ...baseCq, data: 'approve:action-abc' },
    });
    expect(decideAction).toHaveBeenCalledWith('action-abc', 'APPROVED');
    expect(editMessageText).toHaveBeenCalledWith(42, '✅ 승인됨');
    expect(answerCallbackQuery).toHaveBeenCalledWith('cq-123', '✅ 승인됨');
  });

  it('calls decideAction(REJECTED) and editMessageText on reject', async () => {
    await handleWebhookUpdate({
      callback_query: { ...baseCq, data: 'reject:action-xyz' },
    });
    expect(decideAction).toHaveBeenCalledWith('action-xyz', 'REJECTED');
    expect(editMessageText).toHaveBeenCalledWith(42, '❌ 거절됨');
  });

  it('ignores unknown callback_data format silently', async () => {
    await handleWebhookUpdate({
      callback_query: { ...baseCq, data: 'unknown:format' },
    });
    expect(decideAction).not.toHaveBeenCalled();
    expect(answerCallbackQuery).not.toHaveBeenCalled();
  });

  it('calls answerCallbackQuery with error text when decideAction throws', async () => {
    vi.mocked(decideAction).mockRejectedValueOnce(new Error('DB error'));
    await handleWebhookUpdate({
      callback_query: { ...baseCq, data: 'approve:action-fail' },
    });
    expect(answerCallbackQuery).toHaveBeenCalledWith('cq-123', expect.stringContaining('오류'));
    // editMessageText should NOT be called on failure — original card with buttons preserved
    expect(editMessageText).not.toHaveBeenCalled();
  });

  it('does not propagate editMessageText errors', async () => {
    vi.mocked(editMessageText).mockRejectedValueOnce(new Error('edit failed'));
    await expect(
      handleWebhookUpdate({
        callback_query: { ...baseCq, data: 'approve:action-edit-fail' },
      })
    ).resolves.not.toThrow();
  });
});

describe('handleWebhookUpdate — text commands', () => {
  const baseMsg = (text: string) => ({
    message: {
      message_id: 1,
      chat: { id: 111 },
      from: { id: 111 },
      text,
    },
  });

  it('handles 요약 command — calls GA4 and sends summary', async () => {
    const { getTodaySummary } = await import('@/lib/analytics/ga4');
    await handleWebhookUpdate(baseMsg('요약'));
    expect(getTodaySummary).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('방문자')
    );
  });

  it('handles /summary command', async () => {
    const { getTodaySummary } = await import('@/lib/analytics/ga4');
    await handleWebhookUpdate(baseMsg('/summary'));
    expect(getTodaySummary).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalled();
  });

  it('handles 대기 command — lists pending actions', async () => {
    await handleWebhookUpdate(baseMsg('대기'));
    expect(sendMessage).toHaveBeenCalled();
  });

  it('handles 브리핑 command', async () => {
    const { buildDailyDigest } = await import('@/lib/intel/digest-builder');
    await handleWebhookUpdate(baseMsg('브리핑'));
    expect(buildDailyDigest).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalled();
  });

  it('sends AI copilot response for free-form text', async () => {
    const { runLLM } = await import('@/lib/llm');
    await handleWebhookUpdate(baseMsg('오늘 매출 어때?'));
    expect(runLLM).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalled();
  });

  it('sends error message when AI copilot throws', async () => {
    const { runLLM } = await import('@/lib/llm');
    vi.mocked(runLLM).mockRejectedValueOnce(new Error('LLM error'));
    await handleWebhookUpdate(baseMsg('질문'));
    expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('오류'));
  });
});
