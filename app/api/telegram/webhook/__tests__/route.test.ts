// app/api/telegram/webhook/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/telegram-router', () => ({
  handleWebhookUpdate: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '@/app/api/telegram/webhook/route';
import { handleWebhookUpdate } from '@/lib/telegram-router';

const VALID_SECRET = 'my-webhook-secret';
const VALID_CHAT_ID = 123456789;

function makeRequest(
  body: unknown,
  secret: string | null = VALID_SECRET
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (secret) headers.set('X-Telegram-Bot-Api-Secret-Token', secret);
  return new Request('https://garnet.app/api/telegram/webhook', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELEGRAM_WEBHOOK_SECRET = VALID_SECRET;
  process.env.TELEGRAM_CHAT_ID = String(VALID_CHAT_ID);
});

describe('POST /api/telegram/webhook', () => {
  it('returns 200 and calls handleWebhookUpdate for valid message', async () => {
    const update = {
      message: { message_id: 1, chat: { id: VALID_CHAT_ID }, text: '요약' },
    };
    const res = await POST(makeRequest(update));
    expect(res.status).toBe(200);
    expect(handleWebhookUpdate).toHaveBeenCalledWith(update);
  });

  it('returns 200 without calling handler when secret is wrong', async () => {
    const res = await POST(makeRequest({ message: {} }, 'wrong-secret'));
    expect(res.status).toBe(200);
    expect(handleWebhookUpdate).not.toHaveBeenCalled();
  });

  it('returns 200 without calling handler when secret is missing', async () => {
    const res = await POST(makeRequest({ message: {} }, null));
    expect(res.status).toBe(200);
    expect(handleWebhookUpdate).not.toHaveBeenCalled();
  });

  it('returns 200 without calling handler when chat_id does not match (message)', async () => {
    const update = {
      message: { message_id: 1, chat: { id: 999999 }, text: '요약' },
    };
    const res = await POST(makeRequest(update));
    expect(res.status).toBe(200);
    expect(handleWebhookUpdate).not.toHaveBeenCalled();
  });

  it('returns 200 without calling handler when chat_id does not match (callback_query)', async () => {
    const update = {
      callback_query: { id: 'cq-1', from: { id: 999999 }, data: 'approve:abc' },
    };
    const res = await POST(makeRequest(update));
    expect(res.status).toBe(200);
    expect(handleWebhookUpdate).not.toHaveBeenCalled();
  });

  it('returns 200 even when handleWebhookUpdate throws', async () => {
    vi.mocked(handleWebhookUpdate).mockRejectedValueOnce(new Error('crash'));
    const update = {
      message: { message_id: 1, chat: { id: VALID_CHAT_ID }, text: '요약' },
    };
    const res = await POST(makeRequest(update));
    expect(res.status).toBe(200);
  });
});
