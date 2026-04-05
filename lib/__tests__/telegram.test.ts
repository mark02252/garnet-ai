// lib/__tests__/telegram.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original env
const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules(); // prevent stale module cache across env mutations
  vi.resetAllMocks();
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = '123456789';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe('isTelegramConfigured', () => {
  it('returns true when both env vars are set', async () => {
    const { isTelegramConfigured } = await import('@/lib/telegram');
    expect(isTelegramConfigured()).toBe(true);
  });

  it('returns false when TELEGRAM_BOT_TOKEN is missing', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const { isTelegramConfigured } = await import('@/lib/telegram');
    expect(isTelegramConfigured()).toBe(false);
  });

  it('returns false when TELEGRAM_CHAT_ID is missing', async () => {
    delete process.env.TELEGRAM_CHAT_ID;
    const { isTelegramConfigured } = await import('@/lib/telegram');
    expect(isTelegramConfigured()).toBe(false);
  });
});

describe('sendMessage', () => {
  it('returns ok:false and skips fetch when not configured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const { sendMessage } = await import('@/lib/telegram');
    const result = await sendMessage('hello');
    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('calls Telegram sendMessage API with correct payload', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 })
    );
    const { sendMessage } = await import('@/lib/telegram');
    const result = await sendMessage('hello world');
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe(42);
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain('sendMessage');
    const body = JSON.parse(call[1]?.body as string);
    expect(body.chat_id).toBe('123456789');
    expect(body.text).toBe('hello world');
  });

  it('returns ok:false on Telegram API error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, description: 'Bad Request' }), { status: 200 })
    );
    const { sendMessage } = await import('@/lib/telegram');
    const result = await sendMessage('hello');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Bad Request/);
  });

  it('returns ok:false on network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'));
    const { sendMessage } = await import('@/lib/telegram');
    const result = await sendMessage('hello');
    expect(result.ok).toBe(false);
  });
});

describe('sendApprovalRequest', () => {
  it('sends message with approve/reject inline keyboard', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), { status: 200 })
    );
    const { sendApprovalRequest } = await import('@/lib/telegram');
    await sendApprovalRequest({
      id: 'action-123',
      kind: 'SNS_PUBLISH',
      payload: { caption: '여름 신제품' },
      status: 'PENDING_APPROVAL',
      riskLevel: 'HIGH',
      riskReason: '즉시 발행',
      approvedBy: null,
      executedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.text).toContain('🔴');
    expect(body.text).toContain('SNS_PUBLISH');
    // payload preview present and bounded
    expect(body.text).toContain('여름 신제품');
    const keyboard = body.reply_markup.inline_keyboard[0];
    expect(keyboard[0].callback_data).toBe('approve:action-123');
    expect(keyboard[1].callback_data).toBe('reject:action-123');
  });

  it('uses 🟡 for MEDIUM risk', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 })
    );
    const { sendApprovalRequest } = await import('@/lib/telegram');
    await sendApprovalRequest({
      id: 'action-456',
      kind: 'CAMPAIGN_EXEC',
      payload: {},
      status: 'PENDING_APPROVAL',
      riskLevel: 'MEDIUM',
      riskReason: '예약 발행',
      approvedBy: null,
      executedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.text).toContain('🟡');
  });

  it('truncates payload preview to 200 characters', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 })
    );
    const { sendApprovalRequest } = await import('@/lib/telegram');
    const largePayload = { data: 'x'.repeat(500) };
    await sendApprovalRequest({
      id: 'action-789',
      kind: 'SNS_PUBLISH',
      payload: largePayload,
      status: 'PENDING_APPROVAL',
      riskLevel: 'HIGH',
      riskReason: null,
      approvedBy: null,
      executedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    // The payload preview portion must be ≤200 chars
    const payloadLine = body.text.split('\n').find((l: string) => l.includes('"data"'));
    expect(payloadLine.length).toBeLessThanOrEqual(200);
  });
});

describe('answerCallbackQuery', () => {
  it('calls answerCallbackQuery API', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const { answerCallbackQuery } = await import('@/lib/telegram');
    await answerCallbackQuery('cq-id-123', '✅ 승인됨');
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain('answerCallbackQuery');
    const body = JSON.parse(call[1]?.body as string);
    expect(body.callback_query_id).toBe('cq-id-123');
    expect(body.text).toBe('✅ 승인됨');
  });

  it('does not throw on network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'));
    const { answerCallbackQuery } = await import('@/lib/telegram');
    await expect(answerCallbackQuery('cq-id', 'text')).resolves.not.toThrow();
  });
});

describe('editMessageText', () => {
  it('does not throw on network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'));
    const { editMessageText } = await import('@/lib/telegram');
    await expect(editMessageText(42, 'text')).resolves.not.toThrow();
  });

  it('calls editMessageText API with TELEGRAM_CHAT_ID', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const { editMessageText } = await import('@/lib/telegram');
    await editMessageText(42, '✅ 승인됨');
    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain('editMessageText');
    const body = JSON.parse(call[1]?.body as string);
    expect(body.chat_id).toBe('123456789');
    expect(body.message_id).toBe(42);
    expect(body.text).toBe('✅ 승인됨');
  });
});
