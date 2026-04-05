# Telegram Gateway Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Slack with Telegram as Garnet's sole real-time communication channel — bidirectional: Garnet sends notifications/approvals to Telegram, and the user controls Garnet via Telegram text commands and inline button taps.

**Architecture:** `lib/telegram.ts` wraps the Telegram Bot API (no external packages). `lib/telegram-router.ts` handles inbound updates (callback_query for approvals, text commands for control). A single webhook endpoint at `app/api/telegram/webhook/route.ts` receives all inbound events. `lib/governor.ts` gains `decideAction()` shared by the webhook and the existing HTTP route. `lib/integrations/slack.ts` `sendSlackMessage` internal is swapped to call Telegram — all callers unchanged.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Telegram Bot API (via raw fetch), existing `lib/governor.ts` / `lib/governor-executor.ts` / `lib/llm.ts`

---

## Chunk 1: Core Telegram wrapper + Governor decideAction

### Task 1: `lib/telegram.ts` — Telegram Bot API wrapper

**Files:**
- Create: `lib/telegram.ts`
- Create: `lib/__tests__/telegram.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/rnr/Documents/New project"
npx vitest run lib/__tests__/telegram.test.ts
```

Expected: FAIL — `lib/telegram.ts` does not exist

- [ ] **Step 3: Implement `lib/telegram.ts`**

```typescript
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
    await fetch(apiUrl('editMessageText'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        message_id: messageId,
        text,
      }),
    });
  } catch (err) {
    console.error('[telegram] editMessageText fetch failed', err);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/__tests__/telegram.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/telegram.ts lib/__tests__/telegram.test.ts
git commit -m "feat(telegram): add Bot API wrapper (sendMessage, sendApprovalRequest, answerCallbackQuery, editMessageText)"
```

---

### Task 2: `lib/governor.ts` — add `decideAction` + refactor decide route

**Files:**
- Modify: `lib/governor.ts` (add `decideAction` export)
- Modify: `app/api/governor/[id]/decide/route.ts` (call `decideAction`)
- Modify: `lib/governor/__tests__/governor.test.ts` (add decideAction tests)

- [ ] **Step 1: Write failing tests for `decideAction`**

Add to `lib/governor/__tests__/governor.test.ts` — add these mocks at the top alongside existing ones and add test cases:

```typescript
// Add at top with other vi.mock calls:
vi.mock('@/lib/governor-executor', () => ({
  execute: vi.fn().mockResolvedValue(undefined),
}));

// Add import at top:
import { execute } from '@/lib/governor-executor';

// Add inside describe('governor'):
describe('decideAction', () => {
  it('exports decideAction function', () => {
    // Already exported check — covered by import passing without error
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
    expect(execute).toHaveBeenCalled();
  });
});
```

Also add `decideAction` to the import line at line 15:

```typescript
import { enqueue, listPending, markExecuted, markFailed, markRejected, ensureGovernorTable, listByStatus, updateStatus, getById, resetTableEnsuredForTests, decideAction } from '@/lib/governor';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/governor/__tests__/governor.test.ts
```

Expected: FAIL — `decideAction` not exported

- [ ] **Step 3: Add `decideAction` to `lib/governor.ts`**

Add after the `markRejected` function (around line 164):

```typescript
export async function decideAction(
  id: string,
  decision: 'APPROVED' | 'REJECTED'
): Promise<void> {
  const action = await getById(id);
  if (!action) throw new Error(`GovernorAction not found: ${id}`);
  if (['EXECUTED', 'REJECTED', 'FAILED'].includes(action.status)) {
    throw new Error(`Action ${id} is already in terminal status: ${action.status}`);
  }

  if (decision === 'REJECTED') {
    await markRejected(id);
    return;
  }

  // APPROVED: status는 변경하지 않고 approvedBy만 기록 후 즉시 execute() 호출
  // execute() 내부에서 markExecuted() 또는 markFailed()가 최종 status를 결정한다
  // (PENDING_EXEC 경유 없이 직행하므로 governor-flush와 중복 실행 불가)
  await updateStatus(id, { status: action.status, approvedBy: 'user' });
  const { execute } = await import('@/lib/governor-executor');
  await execute({ ...action, approvedBy: 'user' });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/governor/__tests__/governor.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Refactor `app/api/governor/[id]/decide/route.ts`**

Replace the entire file:

```typescript
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { decideAction } from '@/lib/governor';

const decideSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = decideSchema.parse(await req.json());
    await decideAction(id, body.decision);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '처리 실패';
    const status = message.includes('not found') ? 404
      : message.includes('terminal') ? 400
      : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
```

- [ ] **Step 6: Run full governor test suite**

```bash
npx vitest run lib/governor/__tests__/
```

Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add lib/governor.ts lib/governor/__tests__/governor.test.ts app/api/governor/[id]/decide/route.ts
git commit -m "feat(governor): add decideAction() shared function + refactor decide route to use it"
```

---

## Chunk 2: Telegram router + webhook endpoint

### Task 3: `lib/telegram-router.ts` — inbound update handler

**Files:**
- Create: `lib/telegram-router.ts`
- Create: `lib/__tests__/telegram-router.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
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

// GA4 모듈은 아직 구현 전 — virtual: true로 선언
vi.mock('@/lib/analytics/ga4', () => ({
  getTodaySummary: vi.fn().mockResolvedValue('오늘 방문자 100명, 세션 150건, 전환율 3.2%'),
}), { virtual: true });

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/__tests__/telegram-router.test.ts
```

Expected: FAIL — `lib/telegram-router.ts` does not exist

- [ ] **Step 3: Implement `lib/telegram-router.ts`**

```typescript
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
  const messageId = cq.message?.message_id;
  let resultText = '';
  let decided = false;
  try {
    const [action, id] = parseCallbackData(cq.data);
    // 알 수 없는 callback_data 형식 → 조용히 무시 (answerCallbackQuery 생략)
    if (!action || !id) return;

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
    const response = await runLLM(text);
    await sendMessage(response);
  } catch (err) {
    console.error('[telegram] copilot failed', err);
    await sendMessage('⚠️ 처리 중 오류가 발생했습니다');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/__tests__/telegram-router.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/telegram-router.ts lib/__tests__/telegram-router.test.ts
git commit -m "feat(telegram): add inbound router (callback_query approval flow + text command handler)"
```

---

### Task 4: `app/api/telegram/webhook/route.ts` — webhook endpoint

**Files:**
- Create: `app/api/telegram/webhook/route.ts`
- Create: `app/api/telegram/webhook/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run "app/api/telegram/webhook/__tests__/route.test.ts"
```

Expected: FAIL — route file does not exist

- [ ] **Step 3: Create directory and implement the route**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run "app/api/telegram/webhook/__tests__/route.test.ts"
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/telegram/webhook/route.ts "app/api/telegram/webhook/__tests__/route.test.ts"
git commit -m "feat(telegram): add webhook endpoint with secret + chat_id verification"
```

---

## Chunk 3: Governor wiring + Slack migration

### Task 5: Governor `runScorer` Telegram wiring + `lib/integrations/slack.ts` migration

**Files:**
- Modify: `lib/governor.ts` (add `sendApprovalRequest` call in `runScorer`)
- Modify: `lib/integrations/slack.ts` (replace `sendSlackMessage` internals)
- Modify: `lib/governor/__tests__/governor.test.ts` (add approval request wiring test)
- Create: `lib/__tests__/slack-telegram-migration.test.ts`

- [ ] **Step 1: Write failing tests for Slack → Telegram migration**

```typescript
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
```

- [ ] **Step 2: Write failing test for Governor approval request wiring**

Add to `lib/governor/__tests__/governor.test.ts` (alongside existing mocks at the top):

```typescript
// Add mock at top with other vi.mock calls:
vi.mock('@/lib/telegram', () => ({
  sendApprovalRequest: vi.fn().mockResolvedValue(undefined),
}));

// Add import:
import { sendApprovalRequest } from '@/lib/telegram';

// Add test block inside describe('governor'):
describe('runScorer → Telegram wiring', () => {
  it('calls sendApprovalRequest for PENDING_APPROVAL actions (MEDIUM/HIGH)', async () => {
    // scoreRisk returns MEDIUM → status becomes PENDING_APPROVAL
    vi.mocked(scoreRisk).mockResolvedValueOnce({ riskLevel: 'MEDIUM', reason: '예약 발행' });
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([MOCK_ROW]);

    await enqueue({ kind: 'SNS_PUBLISH', payload: {} });

    // fire-and-forget — wait one tick for async to complete
    await new Promise((r) => setTimeout(r, 0));

    expect(sendApprovalRequest).toHaveBeenCalled();
  });

  it('does NOT call sendApprovalRequest for LOW risk (PENDING_EXEC)', async () => {
    vi.mocked(scoreRisk).mockResolvedValueOnce({ riskLevel: 'LOW', reason: '내부 초안' });
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([MOCK_ROW]);

    await enqueue({ kind: 'RUN_REPORT', payload: {} });

    await new Promise((r) => setTimeout(r, 0));

    expect(sendApprovalRequest).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run lib/__tests__/slack-telegram-migration.test.ts
npx vitest run lib/governor/__tests__/governor.test.ts
```

Expected: Both FAIL

- [ ] **Step 4: Update `lib/integrations/slack.ts` — replace `sendSlackMessage` internals**

Replace the `sendSlackMessage` function and add the import. Keep all builder functions unchanged:

```typescript
// lib/integrations/slack.ts
import { sendMessage } from '@/lib/telegram';

export async function sendSlackMessage(params: {
  text: string;
  channel?: string;
  blocks?: Array<Record<string, unknown>>;
}): Promise<{ ok: boolean; error?: string }> {
  // blocks는 Telegram에서 지원하지 않음 — text만 사용
  return sendMessage(params.text);
}

// Pre-built message templates — unchanged below this line
```

> **Important:** Keep all existing builder functions (`buildPublishNotification`, `buildPerformanceAlert`, `buildApprovalNotification`, `buildRecommendationAlert`, `buildDailyBriefing`) exactly as-is. Delete the old `SLACK_WEBHOOK_URL` fetch logic and replace only `sendSlackMessage`.

- [ ] **Step 5: Update `lib/governor.ts` `runScorer` — add `sendApprovalRequest` call**

In `lib/governor.ts`, find the `runScorer` function and replace it entirely:

```typescript
async function runScorer(action: GovernorAction): Promise<void> {
  // scoreRisk 자체는 절대 throw하지 않음 — LLM/파싱 오류 시 HIGH 폴백 반환
  // 여기서 catch되는 예외는 updateStatus DB 갱신 실패뿐
  try {
    const { scoreRisk } = await import('@/lib/governor-scorer');
    const scored = await scoreRisk(action);
    const newStatus: GovernorStatus = scored.riskLevel === 'LOW' ? 'PENDING_EXEC' : 'PENDING_APPROVAL';
    await updateStatus(action.id, {
      status: newStatus,
      riskLevel: scored.riskLevel,
      riskReason: scored.reason,
    });

    // MEDIUM/HIGH → 텔레그램 승인 요청 (fire-and-forget)
    // IIFE가 필요한 이유: lib/telegram.ts가 GovernorAction 타입을 lib/governor.ts에서 import하므로
    // 파일 최상위에서 import하면 순환 의존성이 발생한다. dynamic import로 런타임에 로딩해야 한다.
    if (newStatus === 'PENDING_APPROVAL') {
      const updatedAction = {
        ...action,
        status: newStatus,
        riskLevel: scored.riskLevel,
        riskReason: scored.reason,
      };
      void (async () => {
        const { sendApprovalRequest } = await import('@/lib/telegram');
        await sendApprovalRequest(updatedAction);
      })().catch((err) => {
        console.error('[governor] 텔레그램 승인 요청 발송 실패', action.id, err);
      });
    }
  } catch (err) {
    // DB 갱신 실패 → FAILED 표시
    console.error('[governor] runScorer DB update failed for', action.id, err);
    try { await updateStatus(action.id, { status: 'FAILED' }); } catch { /* already logged above */ }
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run lib/__tests__/slack-telegram-migration.test.ts
npx vitest run lib/governor/__tests__/governor.test.ts
```

Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add lib/integrations/slack.ts lib/governor.ts lib/__tests__/slack-telegram-migration.test.ts lib/governor/__tests__/governor.test.ts
git commit -m "feat(telegram): wire sendApprovalRequest in runScorer + migrate sendSlackMessage to Telegram"
```

---

## Chunk 4: Final verification

### Task 6: Full TypeScript + test suite verification

**Files:** No new files — verification only

- [ ] **Step 1: Run full test suite**

```bash
cd "/Users/rnr/Documents/New project"
npx vitest run
```

Expected: All tests PASS with 0 failures

- [ ] **Step 2: TypeScript type check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Verify new files exist**

```bash
ls lib/telegram.ts lib/telegram-router.ts lib/__tests__/telegram.test.ts lib/__tests__/telegram-router.test.ts lib/__tests__/slack-telegram-migration.test.ts app/api/telegram/webhook/route.ts "app/api/telegram/webhook/__tests__/route.test.ts"
```

Expected: All 7 files listed

- [ ] **Step 4: Final commit if any minor fixes needed**

```bash
git add -p
git commit -m "fix(telegram): address TypeScript and test issues from full verification"
```

---

## Environment Variables (post-deploy setup)

After merging, add to Vercel environment:

```
TELEGRAM_BOT_TOKEN       # BotFather에서 발급한 봇 토큰 (OpenClaw 봇 재사용)
TELEGRAM_CHAT_ID         # 봇과 대화한 내 채팅 ID (숫자)
TELEGRAM_WEBHOOK_SECRET  # 랜덤 문자열 32자 이상 (openssl rand -hex 32)
```

Remove: `SLACK_WEBHOOK_URL`

## Webhook Registration (post-deploy, one-time)

```
https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook?url=https://garnet-two.vercel.app/api/telegram/webhook&secret_token={TELEGRAM_WEBHOOK_SECRET}
```

Verify: `https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getWebhookInfo`
