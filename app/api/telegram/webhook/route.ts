// app/api/telegram/webhook/route.ts
import { handleWebhookUpdate } from '@/lib/telegram-router';
import type { TelegramUpdate } from '@/lib/telegram';

export async function POST(req: Request): Promise<Response> {
  // 1. Secret token 검증 — 불일치 시 200 반환 (공격자에게 정보 주지 않음)
  const secret = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('ok', { status: 200 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return new Response('ok', { status: 200 });
  }

  // 2. Chat ID 검증 — 내 계정에서 온 요청만 처리
  const expectedChatId = Number(process.env.TELEGRAM_CHAT_ID);
  const incomingId =
    update.message?.chat.id ?? update.callback_query?.from.id;
  if (incomingId !== expectedChatId) {
    return new Response('ok', { status: 200 });
  }

  // 3. 처리 — 항상 200 반환 (Telegram 재전송 방지)
  try {
    await handleWebhookUpdate(update);
  } catch (err) {
    console.error('[webhook] handleWebhookUpdate threw', err);
  }

  return new Response('ok', { status: 200 });
}
