# Governor / HITL Manager 설계 문서

## 목표

에이전트가 발생시키는 모든 사이드이펙트(SNS 발행, 슬랙 전송, 캠페인 실행, 보고서 확정 등)를 단일 Governor 큐로 통과시켜, LLM이 위험도를 평가한 뒤 LOW는 자동 실행, MEDIUM/HIGH는 사람이 승인하도록 한다.

## 접근 방식

기존 `ApprovalDecision` 테이블과 `approval-panel.tsx` 흐름은 그대로 유지하고, 새 `GovernorAction` 테이블과 파이프라인을 병렬로 신설한다. 기존 액션 타입(`RUN_REPORT` 등)은 점진적으로 Governor로 흡수될 수 있다.

## 아키텍처

```
에이전트 액션 발생
      │
      ▼
lib/governor.ts :: enqueue(action)
      │  payload + kind 저장 → GovernorAction { status: PENDING_SCORE }
      ▼
lib/governor-scorer.ts :: scoreRisk(action)
      │  Anthropic Haiku 직접 호출 → { riskLevel, reason }
      │  타임아웃 10초, 실패 시 riskLevel=HIGH 폴백
      ├─ LOW  → status: PENDING_EXEC
      └─ MEDIUM/HIGH → status: PENDING_APPROVAL
                │
                ▼
         사이드패널 뱃지 + /approvals 인박스
                │  사용자 승인 → POST /api/governor/[id]/decide
                ▼
lib/governor-executor.ts :: execute(action)
      │  Registry 패턴으로 kind별 핸들러 디스패치
      └─ status: EXECUTED | FAILED
```

**LOW 경로:** `PENDING_EXEC` 액션은 스케줄러 `governor-flush` 잡 (매시간, `lib/scheduler/register-jobs.ts`)에서 `flushPendingExec()`로 일괄 처리.

**APPROVED 경로 (레이스 컨디션 방지):** `decide` API가 승인 요청을 받으면 중간 `PENDING_EXEC` 상태를 거치지 않고 `execute()`를 즉시 호출하여 `EXECUTED | FAILED`로 직행한다. `governor-flush`가 `PENDING_EXEC`만 처리하므로 중복 실행이 불가능하다.

## DB 스키마: GovernorAction

프로젝트 DB는 PostgreSQL(`prisma/schema.prisma` — `provider = "postgresql"`). `prisma.$executeRawUnsafe` + PostgreSQL 문법을 사용한다. 기존 `approval-actions.ts`가 `DATETIME`/`CURRENT_TIMESTAMP`를 쓰는 것은 PostgreSQL에서도 동작하지만, 새 테이블은 표준 PostgreSQL 타입(`TIMESTAMPTZ`, `NOW()`)을 사용한다. `deletedAt` INSERT 시 값은 ISO 8601 문자열(`new Date(...).toISOString()`)로 전달한다.

```sql
CREATE TABLE IF NOT EXISTS "GovernorAction" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "kind"        TEXT        NOT NULL,
  "payload"     JSONB       NOT NULL,
  "status"      TEXT        NOT NULL DEFAULT 'PENDING_SCORE',
  "riskLevel"   TEXT,
  "riskReason"  TEXT,
  "approvedBy"  TEXT,
  "executedAt"  TIMESTAMPTZ,
  "deletedAt"   TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "GovernorAction_status_createdAt_idx"
  ON "GovernorAction"("status", "createdAt");
```

**status 전이:**

```
PENDING_SCORE
  ├─ scorer 성공(LOW)       → PENDING_EXEC
  ├─ scorer 성공(MED/HIGH)  → PENDING_APPROVAL
  └─ scorer 실패            → PENDING_APPROVAL (riskLevel=HIGH, riskReason="자동 평가 실패")
                              * DB 갱신 자체 실패 시 → FAILED

PENDING_EXEC
  ├─ executor 성공          → EXECUTED
  └─ executor 실패          → FAILED

PENDING_APPROVAL
  ├─ 사용자 승인            → execute() 직접 호출 → EXECUTED | FAILED  (PENDING_EXEC 경유 없음)
  └─ 사용자 거절            → REJECTED (deletedAt = NOW() + 7d 설정)

EXECUTED / REJECTED / FAILED  →  terminal (변경 없음)
```

`REJECTED` 항목은 `deletedAt`을 설정하고, `lib/scheduler/maintenance.ts`의 `runMaintenanceJob`에서 `deletedAt < NOW()`인 행을 하드삭제한다. 기존 maintenance 잡(매주 일요일 03:00)에 추가한다.

## 파일 구조

| 파일 | 역할 |
|------|------|
| `lib/governor.ts` | enqueue, listPending, decide, ensureTable |
| `lib/governor-scorer.ts` | Anthropic Haiku 직접 호출로 위험도 평가 |
| `lib/governor-executor.ts` | kind별 실행 핸들러 Registry + flushPendingExec |
| `app/api/governor/queue/route.ts` | GET — PENDING_APPROVAL 목록 조회 |
| `app/api/governor/[id]/decide/route.ts` | POST — 승인/거절 처리 |
| `app/(domains)/approvals/page.tsx` | 전용 승인 인박스 페이지 |

기존 파일 수정:
- `lib/scheduler/register-jobs.ts` — `governor-flush` 잡 등록 (`cron: '0 * * * *'`), `JobRunResult` 래퍼 포함:
  ```typescript
  handler: async () => { await flushPendingExec(); return { ok: true, message: 'governor-flush 완료' }; }
  ```
- `lib/scheduler/maintenance.ts` — `runMaintenanceJob`에 Governor 거절 항목 정리 추가
- `components/panels/approval-panel.tsx` — Governor 대기 수 통합, `/approvals` 링크

## 스코어러 상세

`lib/governor-scorer.ts`는 `lib/llm.ts`의 `runClaude`를 사용하지 않고, `@anthropic-ai/sdk`의 `Anthropic` 클라이언트를 직접 인스턴스화하여 모델과 응답 형식을 독립적으로 제어한다.

```typescript
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
```

- 모델: `claude-haiku-4-5-20251001`
- JSON 응답은 시스템 프롬프트에 "반드시 아래 JSON 형식만 출력하세요: `{\"riskLevel\":\"LOW\"|\"MEDIUM\"|\"HIGH\",\"reason\":\"...\"}` — 다른 텍스트 없이" 지시로 강제
- 응답 파싱 실패 시 HIGH 폴백
- 타임아웃: `signal: AbortSignal.timeout(10_000)`

위험도 가이드라인 (시스템 프롬프트 포함):
- 외부 채널 즉시 발행, 예산 집행 → HIGH
- 외부 채널 예약/임시저장, 알림 전송 → MEDIUM
- 내부 초안, 보고서, 아카이브 → LOW

## 익스큐터 상세

```typescript
// lib/governor-executor.ts
const handlers: Record<string, (payload: unknown) => Promise<void>> = {
  SNS_PUBLISH:   snsPublishHandler,
  SLACK_SEND:    slackSendHandler,
  CAMPAIGN_EXEC: campaignExecHandler,
  RUN_REPORT:    runReportHandler,
};

export async function execute(action: GovernorAction): Promise<void> {
  const handler = handlers[action.kind];
  if (!handler) {
    await markFailed(action.id, `Unknown kind: ${action.kind}`);
    return;
  }
  try {
    await handler(action.payload);
    await markExecuted(action.id);
  } catch (err) {
    await markFailed(action.id, String(err));
  }
}

export async function flushPendingExec(): Promise<void> {
  const actions = await listByStatus('PENDING_EXEC');
  for (const action of actions) {
    await execute(action);
  }
}
```

재시도 없음 — `FAILED` 상태 항목은 사람이 재승인해야 재실행된다.

## API 계약

### GET /api/governor/queue

응답: `{ items: GovernorActionSummary[] }` — status = `PENDING_APPROVAL` 또는 `PENDING_SCORE`인 항목, 최신순 40개.

### POST /api/governor/[id]/decide

요청:
```typescript
{ decision: 'APPROVED' | 'REJECTED' }
```

- `APPROVED`: `PENDING_EXEC` 경유 없이 `execute()` 직접 호출, `approvedBy = 'user'`, 결과 `EXECUTED | FAILED`
- `REJECTED`: `status → REJECTED`, `deletedAt = new Date(Date.now() + 7 * 86400_000).toISOString()`
- 응답: `{ ok: true }` 또는 `{ ok: false, error: string }` (400)

## UI 상세

### 사이드패널 (기존 ApprovalPanel 확장)

- 30초마다 `/api/governor/queue` 폴링
- `PENDING_APPROVAL` 수를 기존 ApprovalData와 합산하여 "승인 대기 N" 뱃지
- 클릭 시 `/approvals` 이동

### /approvals 인박스 페이지

카드 정보:
- 위험도 뱃지: HIGH=rose, MEDIUM=amber (LOW는 자동 실행이므로 미표시)
- `kind` + 발생 시각
- payload 요약 (사람이 읽을 수 있는 형태)
- `riskReason` (LLM 판단 근거 1-2문장)
- `PENDING_SCORE` 상태: "위험도 평가 중…" 스피너
- [거절] [승인] 버튼 → `POST /api/governor/[id]/decide` → 낙관적 UI 업데이트

## 에러 처리 요약

| 단계 | 실패 | 결과 |
|------|------|------|
| enqueue DB 저장 | 예외 | 에이전트 액션 차단 (실행 안 함) |
| scorer LLM 호출 | 타임아웃/파싱 오류 | riskLevel=HIGH, PENDING_APPROVAL |
| scorer DB 갱신 | 예외 | FAILED |
| executor 핸들러 | 예외 | FAILED (재시도 없음) |
| decide API | 잘못된 입력 | 400 에러 |

## 테스트 전략

- `lib/governor.ts`: enqueue → scoreRisk mock → status 전환 단위 테스트
- `lib/governor-scorer.ts`: Anthropic SDK mock, 타임아웃/파싱 실패 케이스
- `lib/governor-executor.ts`: 핸들러 mock, unknown kind, FAILED 전환
- `/api/governor` 라우트: 기존 `lib/scheduler/__tests__/integration.test.ts` 패턴 참고 — 실제 PostgreSQL 테스트 DB 사용, 각 테스트 후 `GovernorAction` 테이블 초기화
- `/approvals` 페이지: 렌더링 + 승인 플로우 (msw로 API mock)
