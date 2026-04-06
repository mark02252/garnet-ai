// lib/telegram-router.ts
import {
  answerCallbackQuery,
  editMessageText,
  sendMessage,
  type TelegramUpdate,
} from '@/lib/telegram';
import { decideAction, listByStatus } from '@/lib/governor';

export async function handleWebhookUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }
  if (update.message?.text) {
    await handleTextCommand(update.message.text);
    return;
  }
  // edited_message, channel_post 등 지원하지 않는 타입 — 조용히 무시
}

function parseCallbackData(data?: string): [string | null, string | null] {
  if (!data) return [null, null];
  const colonIdx = data.indexOf(':');
  if (colonIdx === -1) return [null, null];
  const action = data.slice(0, colonIdx);
  const id = data.slice(colonIdx + 1);
  if (!['approve', 'reject'].includes(action) || !id) return [null, null];
  return [action, id];
}

async function handleCallbackQuery(
  cq: NonNullable<TelegramUpdate['callback_query']>
): Promise<void> {
  const [action, id] = parseCallbackData(cq.data);
  // 알 수 없는 callback_data 형식 → 조용히 무시 (answerCallbackQuery 생략)
  if (!action || !id) return;

  const messageId = cq.message?.message_id;
  let resultText = '';
  let decided = false;
  try {
    await decideAction(id, action === 'approve' ? 'APPROVED' : 'REJECTED');
    resultText = action === 'approve' ? '✅ 승인됨' : '❌ 거절됨';
    decided = true;
  } catch (err) {
    resultText = '⚠️ 처리 중 오류가 발생했습니다';
    console.error('[telegram] callback 처리 실패', err);
  } finally {
    await answerCallbackQuery(cq.id, resultText);
    // editMessageText는 decide 성공 시에만 호출
    // 실패 시에는 원본 카드(버튼 포함)를 그대로 유지하여 /approvals 웹에서 재처리 가능
    if (decided && messageId) {
      await editMessageText(messageId, resultText).catch((e) =>
        console.error('[telegram] editMessageText 실패', e)
      );
    }
  }
}

async function handleTextCommand(text: string): Promise<void> {
  const trimmed = text.trim();

  // 요약 / 성과 / /summary — GA4 오늘 방문자·세션·전환율 3줄 요약
  if (['요약', '성과', '/summary'].includes(trimmed)) {
    await handleSummaryCommand();
    return;
  }

  // 대기 / 승인 / /pending — Governor PENDING_APPROVAL 목록 (최대 5건)
  if (['대기', '승인', '/pending'].includes(trimmed)) {
    await handlePendingCommand();
    return;
  }

  // 브리핑 / /briefing — 일간 브리핑 즉시 실행
  if (['브리핑', '/briefing'].includes(trimmed)) {
    await handleBriefingCommand();
    return;
  }

  // 그 외 — AI 코파일럿
  await handleCopilot(trimmed);
}

async function handleSummaryCommand(): Promise<void> {
  try {
    // GA4 모듈이 구현되면 실제 방문자·세션·전환율 데이터를 반환한다.
    // 미구현 시 dynamic import가 실패하므로 catch에서 Governor 현황으로 폴백한다.
    const { getTodaySummary } = await import('@/lib/analytics/ga4');
    const summary = await getTodaySummary();
    await sendMessage(`📊 오늘 요약\n${summary}`);
  } catch (err) {
    console.error('[telegram] summary command failed', err);
    // GA4 미구현 시 Governor 대기 현황으로 폴백
    try {
      const pending = await listByStatus('PENDING_APPROVAL');
      await sendMessage(`📊 현황 요약\n승인 대기: ${pending.length}건`);
    } catch {
      await sendMessage('⚠️ 요약 조회 중 오류가 발생했습니다');
    }
  }
}

async function handlePendingCommand(): Promise<void> {
  try {
    const pending = await listByStatus('PENDING_APPROVAL');
    if (pending.length === 0) {
      await sendMessage('대기 중인 승인 요청이 없습니다.');
      return;
    }
    const lines = pending.slice(0, 5).map((a, i) => {
      const risk = a.riskLevel === 'HIGH' ? '🔴' : '🟡';
      return `${i + 1}. ${risk} ${a.kind} — ${a.id.slice(0, 8)}`;
    });
    const suffix = pending.length > 5 ? `\n외 ${pending.length - 5}건` : '';
    await sendMessage(`📋 승인 대기 목록\n${lines.join('\n')}${suffix}`);
  } catch (err) {
    console.error('[telegram] pending command failed', err);
    await sendMessage('⚠️ 대기 목록 조회 중 오류가 발생했습니다');
  }
}

async function handleBriefingCommand(): Promise<void> {
  try {
    const { buildDailyDigest } = await import('@/lib/intel/digest-builder');
    const result = await buildDailyDigest();
    await sendMessage(typeof result === 'string' ? result : '브리핑이 완료되었습니다.');
  } catch (err) {
    console.error('[telegram] briefing command failed', err);
    await sendMessage('⚠️ 브리핑 생성 중 오류가 발생했습니다');
  }
}

async function handleCopilot(text: string): Promise<void> {
  try {
    const { runLLM } = await import('@/lib/llm');
    const systemPrompt = '당신은 Garnet 비즈니스 인텔리전스 시스템의 AI 코파일럿입니다. 간결하고 실용적으로 답변해주세요.';
    const response = await runLLM(systemPrompt, text);
    await sendMessage(response);
  } catch (err) {
    console.error('[telegram] copilot failed', err);
    await sendMessage('⚠️ 처리 중 오류가 발생했습니다');
  }
}
