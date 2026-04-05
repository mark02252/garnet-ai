# Telegram Gateway 설계 문서

## 목표

텔레그램을 Garnet과 사용자 사이의 유일한 실시간 소통 창구로 만든다. Garnet은 텔레그램으로 알림을 보내고, 사용자는 텔레그램에서 승인하거나 명령을 내린다. 기존 Slack 알림은 Telegram으로 교체한다.

## 접근 방식

Slack을 호출하는 기존 코드를 건드리지 않고, `lib/integrations/slack.ts`의 `sendSlackMessage` 내부 구현만 Telegram으로 교체한다. 동시에 신규 기능(Governor 승인, 커맨드 라우터)은 `lib/telegram.ts`와 `lib/telegram-router.ts`로 독립 구현한다.

## 아키텍처

```
[Garnet → 텔레그램]
  Governor MEDIUM/HIGH  →  승인 요청 메시지 (인라인 버튼)
  긴급 인텔 알림        →  sendSlackMessage() 내부에서 Telegram 호출
  일간 다이제스트       →  sendSlackMessage() 내부에서 Telegram 호출
  일간/주간 브리핑      →  sendSlackMessage() 내부에서 Telegram 호출

[텔레그램 → Garnet]
  버튼 탭 (callback_query)  →  webhook  →  Governor decideAction()
  텍스트 메시지             →  webhook  →  커맨드 라우터
      "요약" / "성과"       →  GA4 오늘 요약
      "대기" / "승인"       →  Governor 대기 목록
      "브리핑"              →  일간 브리핑 즉시 실행
      그 외                 →  AI 코파일럿 (lib/llm.ts)
```

## 파일 구조

| 파일 | 역할 |
|------|------|
| `lib/telegram.ts` | Telegram Bot API 래퍼 (발송, 버튼, 메시지 수정) |
| `lib/telegram-router.ts` | 수신 메시지 라우터 + 커맨드 핸들러 |
| `app/api/telegram/webhook/route.ts` | 단일 webhook 엔드포인트 |
| `lib/governor.ts` 수정 | decideAction 함수 추가 + runScorer에서 sendApprovalRequest 호출 |
| `lib/integrations/slack.ts` 수정 | sendSlackMessage 내부를 Telegram으로 교체 |

## 환경변수

```
TELEGRAM_BOT_TOKEN       # BotFather에서 발급한 봇 토큰
TELEGRAM_CHAT_ID         # 봇과 대화한 내 채팅 ID (숫자)
TELEGRAM_WEBHOOK_SECRET  # webhook 위조 방지용 랜덤 문자열 (32자 이상 권장)
```

`SLACK_WEBHOOK_URL`은 제거한다.

## lib/governor.ts 수정 — decideAction 추가

webhook과 기존 `/api/governor/[id]/decide` 라우트가 공통으로 사용하는 결정 함수를 `lib/governor.ts`에 추가한다. 기존 API 라우트도 이 함수를 호출하도록 리팩터링한다.

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

`runScorer` 수정 — `PENDING_APPROVAL` 상태 업데이트 직후:

```typescript
await updateStatus(action.id, {
  status: newStatus,
  riskLevel: scored.riskLevel,
  riskReason: scored.reason,
});

// MEDIUM/HIGH → 텔레그램 승인 요청 (fire-and-forget)
if (newStatus === 'PENDING_APPROVAL') {
  void sendApprovalRequest(action).catch((err) => {
    console.error('[governor] 텔레그램 승인 요청 발송 실패', action.id, err);
  });
}
```

텔레그램 발송 실패 시 `console.error`로 관찰 가능하게 남기고, 액션은 `PENDING_APPROVAL` 상태를 유지하므로 `/approvals` 웹 페이지에서 처리 가능하다.

## lib/telegram.ts 상세

`TelegramUpdate` 타입은 별도 패키지 없이 파일 내 inline type으로 정의한다 (`node-telegram-bot-api` 같은 패키지는 추가하지 않는다).

```typescript
// inline type — Telegram Bot API Update의 필요 필드만 정의
type TelegramUpdate = {
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

// 환경변수 체크
export function isTelegramConfigured(): boolean

// 기본 메시지 발송
export async function sendMessage(
  text: string,
  options?: { parseMode?: 'HTML' | 'Markdown'; replyMarkup?: InlineKeyboard }
): Promise<{ ok: boolean; messageId?: number; error?: string }>

// Governor 승인 요청 메시지 (인라인 버튼 포함)
export async function sendApprovalRequest(action: GovernorAction): Promise<void>

// 버튼 탭 후 로딩 스피너 제거 — callback_query 처리 시 반드시 finally에서 호출
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void>

// 처리 완료 후 기존 메시지 내용 수정
// chat_id는 내부적으로 TELEGRAM_CHAT_ID 환경변수를 사용한다
export async function editMessageText(
  messageId: number,
  text: string
): Promise<void>
```

### 승인 요청 메시지 형태

```
🔴 고위험 | SNS_PUBLISH
────────────────────────
외부 채널 즉시 발행 요청입니다.

{"caption":"여름 신제품 출시...","platform":"instagram"}

[✅ 승인]   [❌ 거절]
```

- `HIGH` → 🔴, `MEDIUM` → 🟡
- `callback_data`: `"approve:{id}"` | `"reject:{id}"`
- payload는 `JSON.stringify(action.payload).slice(0, 200)` 로 잘라서 표시

## lib/telegram-router.ts 상세

```typescript
export async function handleWebhookUpdate(update: TelegramUpdate): Promise<void>
```

내부 분기:
1. `update.callback_query` → 승인/거절 처리
2. `update.message?.text` → 커맨드 라우터
3. 그 외 모든 update 타입 (edited_message, channel_post 등) → 즉시 반환 (무시)

### 커맨드 라우터

| 입력 패턴 | 동작 |
|-----------|------|
| `요약`, `성과`, `/summary` | GA4 오늘 방문자·세션·전환율 3줄 요약 |
| `대기`, `승인`, `/pending` | Governor PENDING_APPROVAL 목록 (최대 5건) |
| `브리핑`, `/briefing` | buildDailyDigest() 즉시 실행 후 결과 전송 |
| 그 외 자유 입력 | `runLLM()`으로 AI 코파일럿 답변 |

### callback_query 처리 흐름

`answerCallbackQuery`는 반드시 `finally` 블록에서 호출한다. Telegram은 약 10초 타임아웃을 적용하므로, DB 오류 등으로 처리가 실패해도 사용자 폰의 로딩 스피너가 반드시 제거되어야 한다.

```typescript
async function handleCallbackQuery(cq: TelegramUpdate['callback_query']) {
  const messageId = cq.message?.message_id;
  let resultText = '';
  let decided = false;
  try {
    const [action, id] = parseCallbackData(cq.data); // "approve:{id}" | "reject:{id}"
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
```

## app/api/telegram/webhook/route.ts 상세

```typescript
export async function POST(req: Request): Promise<Response>
```

처리 순서:
1. `X-Telegram-Bot-Api-Secret-Token` 헤더 검증 → 불일치 시 200 반환 (공격자에게 정보 주지 않음)
2. `update.message?.chat.id` 또는 `update.callback_query?.from.id`가 `TELEGRAM_CHAT_ID`와 일치하는지 확인 → 불일치 시 200 반환
3. `handleWebhookUpdate(update)` 호출
4. 항상 `200 OK` 반환 (Telegram 재전송 방지)

**보안 원칙:** 검증 실패 시에도 200을 반환해 공격자가 webhook 존재를 확인하지 못하게 한다.

## lib/integrations/slack.ts 수정 상세

기존 `sendSlackMessage` 호출자들(`lib/intel/urgent-detector.ts`, `lib/intel/digest-builder.ts`, `lib/job-scheduler.ts`)은 `buildApprovalNotification`, `buildRecommendationAlert`, `buildDailyBriefing` 등의 빌더 함수를 통해 `{ text, blocks }` 구조를 전달한다. 이 빌더 함수들의 `text` 필드는 원래 Slack fallback용으로 작성됐으나 텔레그램에서도 그대로 사용 가능한 수준의 한국어 평문이다. `blocks`는 Telegram에서 사용하지 않으므로 무시한다.

```typescript
export async function sendSlackMessage(params: {
  text: string;
  channel?: string;
  blocks?: Array<Record<string, unknown>>;
}): Promise<{ ok: boolean; error?: string }> {
  // blocks는 Telegram에서 지원하지 않음 — text만 사용
  return sendMessage(params.text);
}
```

기존 `buildApprovalNotification`, `buildRecommendationAlert`, `buildDailyBriefing` 등 빌더 함수는 그대로 유지한다. 이 함수들의 `text` 필드를 Telegram 포맷에 맞게 개선하는 것은 이번 스프린트 범위 밖이다.

## webhook 등록 방법

Vercel 배포 후 아래 URL을 한 번만 호출한다:

```
https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook
  ?url=https://garnet-two.vercel.app/api/telegram/webhook
  &secret_token={TELEGRAM_WEBHOOK_SECRET}
```

등록 확인은 `getWebhookInfo`로 검증한다:
```
https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getWebhookInfo
```
`url` 필드가 Garnet 도메인과 일치하고 `last_error_message`가 없으면 정상이다.

## 에러 처리

| 단계 | 실패 | 결과 |
|------|------|------|
| sendApprovalRequest | 네트워크 오류 | console.error 기록 — 액션은 PENDING_APPROVAL 유지, /approvals에서 처리 가능 |
| sendSlackMessage (→ Telegram) | 미설정 | isTelegramConfigured() false → 조용히 스킵 |
| webhook — 검증 실패 | 잘못된 토큰/chat ID | 200 반환, 처리 없음 |
| webhook — callback_data 형식 불일치 | 알 수 없는 포맷 | 조용히 무시, answerCallbackQuery 생략 |
| webhook — decide 오류 | DB 오류 | finally에서 answerCallbackQuery("오류 발생"), console.error |
| editMessageText 오류 | decide 완료 후 | console.error만, 예외 전파 안 함 (decide는 이미 성공) |
| 커맨드 — AI 코파일럿 | LLM 오류 | "처리 중 오류가 발생했습니다" 메시지 전송 |

## 테스트 전략

- `lib/telegram.ts`: Telegram Bot API fetch mock, `isTelegramConfigured` false 케이스
- `lib/telegram-router.ts`:
  - callback_query 정상 승인/거절
  - 알 수 없는 callback_data 형식 → 조용히 무시
  - editMessageText 실패 → decide는 완료, 에러 전파 안 함
  - 각 커맨드 (요약/대기/브리핑)
  - 자유 입력 → AI 코파일럿 분기
  - 지원하지 않는 update 타입 → 즉시 반환
- `app/api/telegram/webhook/route.ts`: 잘못된 secret, 다른 chat ID, 정상 흐름
- `lib/governor.ts` (decideAction): 정상 승인, 정상 거절, 존재하지 않는 ID, 이미 terminal 상태
- `lib/integrations/slack.ts`: sendSlackMessage가 Telegram sendMessage를 호출하는지 확인
