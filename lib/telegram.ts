// lib/telegram.ts
import type { GovernorAction } from '@/lib/governor';

// Telegram Bot API Update의 필요 필드만 정의 — 외부 패키지 없음
export type TelegramUpdate = {
  callback_query?: {
    id: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number };
    text?: string;
  };
};

type InlineKeyboard = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

export function isTelegramConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;
}

export async function sendMessage(
  text: string,
  options?: { parseMode?: 'HTML' | 'Markdown'; replyMarkup?: InlineKeyboard }
): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  if (!isTelegramConfigured()) {
    return { ok: false, error: 'Telegram not configured' };
  }
  try {
    const body: Record<string, unknown> = {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
    };
    if (options?.parseMode) body.parse_mode = options.parseMode;
    if (options?.replyMarkup) body.reply_markup = options.replyMarkup;

    const res = await fetch(apiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
    if (!json.ok) return { ok: false, error: json.description ?? 'Telegram API error' };
    return { ok: true, messageId: json.result?.message_id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'fetch failed' };
  }
}

export async function sendApprovalRequest(action: GovernorAction): Promise<void> {
  const riskEmoji = action.riskLevel === 'HIGH' ? '🔴' : '🟡';
  const riskLabel = action.riskLevel === 'HIGH' ? '고위험' : '중위험';
  // slice(0, 200) per spec — prevents oversized messages
  const payloadPreview = JSON.stringify(action.payload).slice(0, 200);
  const text = [
    `${riskEmoji} ${riskLabel} | ${action.kind}`,
    '────────────────────────',
    action.riskReason ?? '',
    '',
    payloadPreview,
  ].join('\n');

  await sendMessage(text, {
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '✅ 승인', callback_data: `approve:${action.id}` },
          { text: '❌ 거절', callback_data: `reject:${action.id}` },
        ],
      ],
    },
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  if (!isTelegramConfigured()) return;
  try {
    await fetch(apiUrl('answerCallbackQuery'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch (err) {
    // fire-and-forget — 실패해도 사용자 플로우를 막지 않음
    console.warn('[telegram] answerCallbackQuery failed', err);
  }
}

export async function editMessageText(
  messageId: number,
  text: string
): Promise<void> {
  if (!isTelegramConfigured()) return;
  // 스펙 에러 테이블: "editMessageText 오류 — console.error만, 예외 전파 안 함"
  // decide가 이미 성공한 후 호출되므로 실패해도 사용자 액션에 영향 없음
  try {
    const res = await fetch(apiUrl('editMessageText'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        message_id: messageId,
        text,
      }),
    });
    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!json.ok) {
      console.error('[telegram] editMessageText API error', json.description);
    }
  } catch (err) {
    console.error('[telegram] editMessageText fetch failed', err);
  }
}
