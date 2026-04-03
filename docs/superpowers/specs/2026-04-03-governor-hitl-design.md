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
      │  LLM(Haiku) 호출 → { riskLevel, reason }
      │  타임아웃 10초, 실패 시 HIGH 폴백
      ├─ LOW  → status: PENDING_EXEC
      └─ MEDIUM/HIGH → status: PENDING_APPROVAL
                │
                ▼
         사이드패널 뱃지 + /approvals 인박스
                │  사용자 승인
                ▼
lib/governor-executor.ts :: execute(action)
      │  Registry 패턴으로 kind별 핸들러 디스패치
      └─ status: EXECUTED | FAILED
```

LOW 위험 `PENDING_EXEC` 액션은 기존 `agent-scheduler` 다음 사이클에 `flushPendingExec()`로 일괄 처리된다.

## DB 스키마: GovernorAction

```sql
CREATE TABLE IF NOT EXISTS "GovernorAction" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "kind"        TEXT        NOT NULL,
  "payload"     JSONB       NOT NULL,
  "status"      TEXT        NOT NULL DEFAULT 'PENDING_SCORE',
  "riskLevel"   TEXT,
  "riskReason"  TEXT,
  "executedAt"  TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- status: PENDING_SCORE | PENDING_APPROVAL | PENDING_EXEC | EXECUTED | REJECTED | FAILED
-- riskLevel: LOW | MEDIUM | HIGH
```

## 파일 구조

| 파일 | 역할 |
|------|------|
| `lib/governor.ts` | enqueue, listPending, decide |
| `lib/governor-scorer.ts` | LLM 위험도 평가 (Haiku, JSON mode) |
| `lib/governor-executor.ts` | 액션 kind별 실행 핸들러 Registry |
| `app/api/governor/queue/route.ts` | PENDING_APPROVAL 목록 조회 |
| `app/api/governor/[id]/decide/route.ts` | 승인/거절 처리 |
| `app/(domains)/approvals/page.tsx` | 전용 승인 인박스 페이지 |

기존 파일 수정:
- `lib/agent-scheduler.ts` — `flushPendingExec()` 호출 추가
- `components/panels/approval-panel.tsx` — Governor 대기 수 통합, `/approvals` 링크

## 스코어러 상세

- 모델: `claude-haiku-4-5-20251001`
- 입력: `kind`, `payload` 요약, 위험도 가이드라인
  - 외부 채널 즉시 발행 → HIGH
  - 외부 채널 예약/임시저장 → MEDIUM
  - 내부 초안/보고서 → LOW
- 출력: `{ riskLevel: "LOW"|"MEDIUM"|"HIGH", reason: string }` (JSON mode)
- 실패 처리: 타임아웃 10초, 예외 시 `riskLevel = "HIGH"` 폴백

## 익스큐터 상세

Registry 패턴으로 kind별 핸들러를 등록한다.

```typescript
const handlers: Record<string, (payload: unknown) => Promise<void>> = {
  SNS_PUBLISH:   snsPublishHandler,
  SLACK_SEND:    slackSendHandler,
  CAMPAIGN_EXEC: campaignExecHandler,
  RUN_REPORT:    runReportHandler,  // 기존 로직 이전
};
```

알 수 없는 kind → 에러 로그 + `FAILED` 상태 기록 (미처리 상태로 방치하지 않음).

## UI 상세

### 사이드패널 (기존 ApprovalPanel 확장)

- 30초마다 `/api/governor/queue` 폴링
- `PENDING_APPROVAL` 수를 기존 ApprovalData와 합산하여 뱃지 표시
- "승인 대기 N" 텍스트 + 클릭 시 `/approvals` 이동

### /approvals 인박스 페이지

카드 정보:
- 위험도 뱃지: HIGH=rose, MEDIUM=amber (LOW는 자동 실행이므로 미표시)
- `kind` + 발생 시각
- payload 요약 (사람이 읽을 수 있는 형태)
- `riskReason` (LLM 판단 근거 1-2문장)
- `PENDING_SCORE` 상태: "위험도 평가 중…" 스피너
- [거절] [승인] 버튼 → `POST /api/governor/[id]/decide` → 낙관적 UI 업데이트

거절 항목: 7일 후 자동 삭제 (soft-delete, `deletedAt` 컬럼).

## 에러 처리

- Scorer 실패 → HIGH 폴백, `riskReason` = "자동 평가 실패 — 수동 검토 필요"
- Executor 실패 → status = `FAILED`, 재시도 없음 (사람이 재승인)
- DB 오류 → enqueue 자체 실패 시 에이전트 액션 차단 (실행보다 안전 우선)

## 테스트 전략

- `governor.ts`: enqueue → scoreRisk → status 전환 단위 테스트
- `governor-scorer.ts`: LLM 호출 mock, 타임아웃/실패 케이스
- `governor-executor.ts`: 각 핸들러 mock, unknown kind 처리
- `/api/governor` 라우트: 통합 테스트 (실제 DB 사용)
- `/approvals` 페이지: 렌더링 + 승인 플로우 E2E
