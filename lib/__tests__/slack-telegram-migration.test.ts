// lib/__tests__/slack-telegram-migration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/telegram', () => ({
  sendMessage: vi.fn().mockResolvedValue({ ok: true }),
  isTelegramConfigured: vi.fn().mockReturnValue(true),
}));

import { sendMessage } from '@/lib/telegram';
import { sendSlackMessage } from '@/lib/integrations/slack';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sendSlackMessage (Telegram migration)', () => {
  it('calls Telegram sendMessage with the text field', async () => {
    const result = await sendSlackMessage({ text: '오늘의 브리핑입니다' });
    expect(sendMessage).toHaveBeenCalledWith('오늘의 브리핑입니다');
    expect(result.ok).toBe(true);
  });

  it('ignores the blocks field — only text is forwarded', async () => {
    await sendSlackMessage({
      text: '알림',
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'ignored' } }],
    });
    // sendMessage called with text only — no second argument
    expect(sendMessage).toHaveBeenCalledWith('알림');
    expect(vi.mocked(sendMessage).mock.calls[0].length).toBe(1);
  });

  it('ignores the channel field', async () => {
    await sendSlackMessage({ text: '메시지', channel: '#general' });
    expect(sendMessage).toHaveBeenCalledWith('메시지');
  });

  it('propagates ok:false from Telegram when not configured', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce({ ok: false, error: 'not configured' });
    const result = await sendSlackMessage({ text: '메시지' });
    expect(result.ok).toBe(false);
  });
});
