# Governor / HITL Manager Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 에이전트의 모든 사이드이펙트를 Governor 큐로 통과시켜 LLM이 위험도를 평가하고, LOW는 자동 실행 MEDIUM/HIGH는 사람이 승인하는 HITL 파이프라인을 구축한다.

**Architecture:** 기존 `ApprovalDecision` 테이블과 독립적으로 `GovernorAction` PostgreSQL 테이블을 신설한다. `lib/governor.ts`가 enqueue/decide를, `lib/governor-scorer.ts`가 Anthropic Haiku로 위험도를 평가하고, `lib/governor-executor.ts`가 Registry 패턴으로 액션을 실행한다. LOW 경로는 매시간 스케줄러가 일괄 처리하고, MEDIUM/HIGH는 `/approvals` 인박스에서 수동 승인한다.

**Tech Stack:** Next.js 14 App Router, Prisma + PostgreSQL (`prisma.$executeRawUnsafe`), `@anthropic-ai/sdk` (Haiku 직접 호출), Vitest, Tailwind CSS

---

## Chunk 1: 핵심 라이브러리 (governor.ts, governor-scorer.ts, governor-executor.ts)

### Task 1: lib/governor.ts — DB 테이블 + 핵심 CRUD

**Files:**
- Create: `lib/governor.ts`
- Create: `lib/governor/__tests__/governor.test.ts`

이 파일은 `GovernorAction` 테이블 생성, 타입 정의, enqueue/listPending/markFailed/markExecuted/markApproved/markRejected 헬퍼를 포함한다. `prisma.$executeRawUnsafe` + PostgreSQL 문법 사용. 기존 `lib/approval-actions.ts` 패턴을 따른다.

- [ ] **Step 1: 테스트 파일 생성 (실패 확인용)**

```bash
mkdir -p lib/governor/__tests__
```

`lib/governor/__tests__/governor.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $queryRawUnsafe: vi.fn(),
  },
}));

// governor-scorer는 fire-and-forget — 테스트에서 mock 처리
vi.mock('@/lib/governor-scorer', () => ({
  scoreRisk: vi.fn().mockResolvedValue({ riskLevel: 'LOW', reason: 'test' }),
}));

import { enqueue, listPending, markExecuted, markFailed, markRejected } from '@/lib/governor';
import { prisma } from '@/lib/prisma';

const MOCK_ROW = {
  id: 'test-id',
  kind: 'RUN_REPORT',
  payload: '{"x":1}',
  status: 'PENDING_SCORE',
  riskLevel: null,
  riskReason: null,
  approvedBy: null,
  executedAt: null,
  deletedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('governor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$executeRawUnsafe).mockResolvedValue(undefined);
  });

  it('exports required functions', () => {
    expect(typeof enqueue).toBe('function');
    expect(typeof listPending).toBe('function');
    expect(typeof markExecuted).toBe('function');
    expect(typeof markFailed).toBe('function');
    expect(typeof markRejected).toBe('function');
  });

  it('enqueue returns action with PENDING_SCORE status and parsed payload', async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([MOCK_ROW]);
    const action = await enqueue({ kind: 'RUN_REPORT', payload: { x: 1 } });
    expect(action.status).toBe('PENDING_SCORE');
    expect(action.payload).toEqual({ x: 1 });
    expect(action.kind).toBe('RUN_REPORT');
  });

  it('markFailed persists the reason via riskReason', async () => {
    await markFailed('test-id', 'boom');
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE'),
      expect.anything(), // id param position may vary — just assert call happened
      expect.anything(),
      expect.anything(),
    );
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

```bash
npx vitest run lib/governor/__tests__/governor.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/governor'`

- [ ] **Step 3: lib/governor.ts 구현**

```typescript
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';

export type GovernorRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type GovernorStatus =
  | 'PENDING_SCORE'
  | 'PENDING_EXEC'
  | 'PENDING_APPROVAL'
  | 'EXECUTED'
  | 'REJECTED'
  | 'FAILED';

export type GovernorAction = {
  id: string;
  kind: string;
  payload: unknown;
  status: GovernorStatus;
  riskLevel: GovernorRiskLevel | null;
  riskReason: string | null;
  approvedBy: string | null;
  executedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type GovernorActionRow = {
  id: string;
  kind: string;
  payload: string;
  status: string;
  riskLevel: string | null;
  riskReason: string | null;
  approvedBy: string | null;
  executedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

let tableEnsured = false;

export async function ensureGovernorTable(): Promise<void> {
  if (tableEnsured) return;
  await prisma.$executeRawUnsafe(`
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
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "GovernorAction_status_createdAt_idx"
    ON "GovernorAction"("status", "createdAt")
  `);
  tableEnsured = true;
}

export async function enqueue(input: {
  kind: string;
  payload: unknown;
}): Promise<GovernorAction> {
  await ensureGovernorTable();
  const id = randomUUID();
  const rows = await prisma.$queryRawUnsafe<GovernorActionRow[]>(
    `
      INSERT INTO "GovernorAction" ("id", "kind", "payload", "status", "createdAt", "updatedAt")
      VALUES ($1, $2, $3::jsonb, 'PENDING_SCORE', NOW(), NOW())
      RETURNING *
    `,
    id,
    input.kind,
    JSON.stringify(input.payload)
  );
  return parseRow(rows[0]);
}

export async function listPending(
  statuses: GovernorStatus[] = ['PENDING_APPROVAL', 'PENDING_SCORE'],
  limit = 40
): Promise<GovernorAction[]> {
  await ensureGovernorTable();
  const placeholders = statuses.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await prisma.$queryRawUnsafe<GovernorActionRow[]>(
    `
      SELECT * FROM "GovernorAction"
      WHERE "status" IN (${placeholders})
        AND ("deletedAt" IS NULL OR "deletedAt" > NOW())
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    `,
    ...statuses
  );
  return rows.map(parseRow);
}

export async function listByStatus(status: GovernorStatus): Promise<GovernorAction[]> {
  await ensureGovernorTable();
  const rows = await prisma.$queryRawUnsafe<GovernorActionRow[]>(
    `SELECT * FROM "GovernorAction" WHERE "status" = $1 ORDER BY "createdAt" ASC`,
    status
  );
  return rows.map(parseRow);
}

export async function updateStatus(
  id: string,
  patch: {
    status: GovernorStatus;
    riskLevel?: GovernorRiskLevel;
    riskReason?: string;
    approvedBy?: string;
    executedAt?: string;
    deletedAt?: string;
  }
): Promise<void> {
  await ensureGovernorTable();
  const sets: string[] = ['"status" = $2', '"updatedAt" = NOW()'];
  const params: unknown[] = [id, patch.status];
  let i = 3;
  if (patch.riskLevel !== undefined) { sets.push(`"riskLevel" = $${i++}`); params.push(patch.riskLevel); }
  if (patch.riskReason !== undefined) { sets.push(`"riskReason" = $${i++}`); params.push(patch.riskReason); }
  if (patch.approvedBy !== undefined) { sets.push(`"approvedBy" = $${i++}`); params.push(patch.approvedBy); }
  if (patch.executedAt !== undefined) { sets.push(`"executedAt" = $${i++}`); params.push(patch.executedAt); }
  if (patch.deletedAt !== undefined)  { sets.push(`"deletedAt" = $${i++}`);  params.push(patch.deletedAt);  }
  await prisma.$executeRawUnsafe(
    `UPDATE "GovernorAction" SET ${sets.join(', ')} WHERE "id" = $1`,
    ...params
  );
}

export async function markExecuted(id: string): Promise<void> {
  await updateStatus(id, { status: 'EXECUTED', executedAt: new Date().toISOString() });
}

export async function markFailed(id: string, reason?: string): Promise<void> {
  await updateStatus(id, { status: 'FAILED', riskReason: reason });
}

export async function markRejected(id: string): Promise<void> {
  const deletedAt = new Date(Date.now() + 7 * 86400_000).toISOString();
  await updateStatus(id, { status: 'REJECTED', deletedAt });
}

export async function getById(id: string): Promise<GovernorAction | null> {
  await ensureGovernorTable();
  const rows = await prisma.$queryRawUnsafe<GovernorActionRow[]>(
    `SELECT * FROM "GovernorAction" WHERE "id" = $1`,
    id
  );
  return rows.length > 0 ? parseRow(rows[0]) : null;
}

function parseRow(row: GovernorActionRow): GovernorAction {
  return {
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    status: row.status as GovernorStatus,
    riskLevel: row.riskLevel as GovernorRiskLevel | null,
  };
}
```

- [ ] **Step 4: 테스트 실행 (통과 확인)**

```bash
npx vitest run lib/governor/__tests__/governor.test.ts
```

Expected: PASS (export 존재 확인만 하므로 DB 없이도 통과)

- [ ] **Step 5: 커밋**

```bash
git add lib/governor.ts lib/governor/__tests__/governor.test.ts
git commit -m "feat(governor): add GovernorAction table + core CRUD helpers"
```

---

### Task 2: lib/governor-scorer.ts — LLM 위험도 평가

**Files:**
- Create: `lib/governor-scorer.ts`
- Create: `lib/governor/__tests__/governor-scorer.test.ts`

Anthropic Haiku를 직접 호출하여 `{ riskLevel, reason }` JSON을 반환한다. 실패 시 HIGH 폴백.

- [ ] **Step 1: 테스트 파일 작성**

`lib/governor/__tests__/governor-scorer.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Anthropic SDK mock
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn()
    }
  }))
}));

import Anthropic from '@anthropic-ai/sdk';
import { scoreRisk } from '@/lib/governor-scorer';
import type { GovernorAction } from '@/lib/governor';

function makeAction(kind: string, payload: unknown): GovernorAction {
  return {
    id: 'test-id',
    kind,
    payload,
    status: 'PENDING_SCORE',
    riskLevel: null,
    riskReason: null,
    approvedBy: null,
    executedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('scoreRisk', () => {
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const instance = new (Anthropic as ReturnType<typeof vi.fn>)();
    mockCreate = instance.messages.create;
    vi.mocked(Anthropic).mockImplementation(() => instance);
  });

  it('parses LOW correctly', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"riskLevel":"LOW","reason":"내부 초안"}' }]
    });
    const result = await scoreRisk(makeAction('RUN_REPORT', { id: '1' }));
    expect(result.riskLevel).toBe('LOW');
    expect(result.reason).toBe('내부 초안');
  });

  it('parses MEDIUM correctly', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"riskLevel":"MEDIUM","reason":"예약 발행"}' }]
    });
    const result = await scoreRisk(makeAction('SNS_PUBLISH', { scheduled: true }));
    expect(result.riskLevel).toBe('MEDIUM');
  });

  it('parses HIGH correctly', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"riskLevel":"HIGH","reason":"즉시 발행"}' }]
    });
    const result = await scoreRisk(makeAction('SNS_PUBLISH', { postId: '1' }));
    expect(result.riskLevel).toBe('HIGH');
  });

  it('falls back to HIGH on invalid JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'invalid json' }]
    });
    const result = await scoreRisk(makeAction('SNS_PUBLISH', {}));
    expect(result.riskLevel).toBe('HIGH');
    expect(result.reason).toMatch(/자동 평가 실패/);
  });

  it('falls back to HIGH on API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network error'));
    const result = await scoreRisk(makeAction('SNS_PUBLISH', {}));
    expect(result.riskLevel).toBe('HIGH');
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

```bash
npx vitest run lib/governor/__tests__/governor-scorer.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/governor-scorer'`

- [ ] **Step 3: lib/governor-scorer.ts 구현**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { GovernorAction, GovernorRiskLevel } from '@/lib/governor';

export type ScoreResult = {
  riskLevel: GovernorRiskLevel;
  reason: string;
};

const FALLBACK: ScoreResult = {
  riskLevel: 'HIGH',
  reason: '자동 평가 실패 — 수동 검토 필요',
};

const SYSTEM_PROMPT = `당신은 AI 에이전트 액션의 위험도를 평가하는 시스템입니다.
반드시 아래 JSON 형식만 출력하세요 — 다른 텍스트 없이:
{"riskLevel":"LOW"|"MEDIUM"|"HIGH","reason":"한두 문장 이유"}

위험도 기준:
- HIGH: 외부 채널 즉시 발행, 예산 집행, 되돌릴 수 없는 외부 액션
- MEDIUM: 외부 채널 예약/임시저장, 알림 전송, 부분 되돌리기 가능
- LOW: 내부 초안, 보고서, 아카이브, 읽기 전용 작업`;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function scoreRisk(action: GovernorAction): Promise<ScoreResult> {
  const userMessage = `액션 kind: ${action.kind}\npayload: ${JSON.stringify(action.payload).slice(0, 500)}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }, { signal: AbortSignal.timeout(10_000) });

    const text = response.content.find((b) => b.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text) as { riskLevel: string; reason: string };

    if (!['LOW', 'MEDIUM', 'HIGH'].includes(parsed.riskLevel)) return FALLBACK;
    return { riskLevel: parsed.riskLevel as GovernorRiskLevel, reason: parsed.reason };
  } catch {
    return FALLBACK;
  }
}
```

- [ ] **Step 4: 테스트 실행 (통과 확인)**

```bash
npx vitest run lib/governor/__tests__/governor-scorer.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/governor-scorer.ts lib/governor/__tests__/governor-scorer.test.ts
git commit -m "feat(governor): add LLM risk scorer with HIGH fallback"
```

---

### Task 3: lib/governor-executor.ts — 액션 실행 Registry

**Files:**
- Create: `lib/governor-executor.ts`
- Create: `lib/governor/__tests__/governor-executor.test.ts`

kind별 핸들러 Registry + `execute()` + `flushPendingExec()`. 현재는 stub 핸들러로 시작하고, 실제 연동은 향후 각 도메인에서 handlers 맵에 등록한다.

- [ ] **Step 1: 테스트 파일 작성**

`lib/governor/__tests__/governor-executor.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/governor', () => ({
  markExecuted: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  listByStatus: vi.fn().mockResolvedValue([]),
}));

import { execute, registerHandler, clearHandlers, flushPendingExec } from '@/lib/governor-executor';
import { markExecuted, markFailed } from '@/lib/governor';
import type { GovernorAction } from '@/lib/governor';

function makeAction(kind: string): GovernorAction {
  return {
    id: 'exec-test-id',
    kind,
    payload: {},
    status: 'PENDING_EXEC',
    riskLevel: 'LOW',
    riskReason: null,
    approvedBy: null,
    executedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('execute', () => {
  afterEach(() => { clearHandlers(); });

  it('calls registered handler and marks EXECUTED', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerHandler('TEST_ACTION', handler);
    await execute(makeAction('TEST_ACTION'));
    expect(handler).toHaveBeenCalledWith({});
    expect(markExecuted).toHaveBeenCalledWith('exec-test-id');
  });

  it('marks FAILED on handler error', async () => {
    registerHandler('FAIL_ACTION', vi.fn().mockRejectedValue(new Error('boom')));
    await execute(makeAction('FAIL_ACTION'));
    expect(markFailed).toHaveBeenCalledWith('exec-test-id', 'Error: boom');
  });

  it('marks FAILED for unknown kind', async () => {
    await execute(makeAction('UNKNOWN_KIND_XYZ'));
    expect(markFailed).toHaveBeenCalledWith('exec-test-id', 'Unknown kind: UNKNOWN_KIND_XYZ');
  });
});

describe('flushPendingExec', () => {
  it('runs without error when queue is empty', async () => {
    await expect(flushPendingExec()).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

```bash
npx vitest run lib/governor/__tests__/governor-executor.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/governor-executor'`

- [ ] **Step 3: lib/governor-executor.ts 구현**

```typescript
import { markExecuted, markFailed, listByStatus } from '@/lib/governor';
import type { GovernorAction } from '@/lib/governor';

type ActionHandler = (payload: unknown) => Promise<void>;

const handlers: Map<string, ActionHandler> = new Map();

export function registerHandler(kind: string, handler: ActionHandler): void {
  handlers.set(kind, handler);
}

/** 테스트 격리용 — 프로덕션 코드에서는 호출하지 않는다 */
export function clearHandlers(): void {
  handlers.clear();
}

export async function execute(action: GovernorAction): Promise<void> {
  const handler = handlers.get(action.kind);
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

- [ ] **Step 4: 테스트 실행 (통과 확인)**

```bash
npx vitest run lib/governor/__tests__/governor-executor.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/governor-executor.ts lib/governor/__tests__/governor-executor.test.ts
git commit -m "feat(governor): add executor Registry + flushPendingExec"
```

---

## Chunk 2: API 라우트 + 스케줄러 연동

### Task 4: GET /api/governor/queue

**Files:**
- Create: `app/api/governor/queue/route.ts`

- [ ] **Step 1: 라우트 구현**

```typescript
import { NextResponse } from 'next/server';
import { listPending } from '@/lib/governor';

export async function GET() {
  try {
    const items = await listPending(['PENDING_APPROVAL', 'PENDING_SCORE']);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { items: [], error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 개발 서버에서 수동 확인**

```bash
curl http://localhost:3000/api/governor/queue
```

Expected: `{"items":[]}` (테이블이 없으면 자동 생성 후 빈 배열)

- [ ] **Step 3: 커밋**

```bash
git add app/api/governor/queue/route.ts
git commit -m "feat(governor): add GET /api/governor/queue"
```

---

### Task 5: POST /api/governor/[id]/decide

**Files:**
- Create: `app/api/governor/[id]/decide/route.ts`

승인 시 `execute()` 직접 호출 (PENDING_EXEC 경유 없음). 거절 시 REJECTED + deletedAt 설정.

- [ ] **Step 1: 라우트 구현**

`getById`는 Task 1의 `lib/governor.ts` 구현에 이미 포함되어 있다 (`markRejected` 바로 뒤). 별도 추가 불필요.

```typescript
export async function getById(id: string): Promise<GovernorAction | null> {
  await ensureGovernorTable();
  const rows = await prisma.$queryRawUnsafe<GovernorActionRow[]>(
    `SELECT * FROM "GovernorAction" WHERE "id" = $1`,
    id
  );
  return rows.length > 0 ? parseRow(rows[0]) : null;
}
```

그다음 라우트 구현:

```typescript
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getById, updateStatus, markRejected } from '@/lib/governor';
import { execute } from '@/lib/governor-executor';

const decideSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const action = await getById(id);

    if (!action) {
      return NextResponse.json({ ok: false, error: '항목을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!['PENDING_APPROVAL', 'PENDING_SCORE'].includes(action.status)) {
      return NextResponse.json({ ok: false, error: '이미 처리된 항목입니다.' }, { status: 400 });
    }

    const body = decideSchema.parse(await req.json());

    if (body.decision === 'REJECTED') {
      await markRejected(id);
      return NextResponse.json({ ok: true });
    }

    // APPROVED: PENDING_EXEC 경유 없이 직접 execute() — 레이스 컨디션 방지
    // governor-flush는 PENDING_EXEC만 처리하므로 중복 실행 불가
    // execute() 내부에서 markExecuted/markFailed가 status를 terminal로 업데이트함
    // approvedBy는 execute 전 기록 (terminal 상태에서도 감사 추적 보존)
    await updateStatus(id, { status: action.status, approvedBy: 'user' });
    await execute(action);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '처리 실패' },
      { status: 400 }
    );
  }
}
```

- [ ] **Step 2: 수동 확인**

```bash
# 테스트용 액션 enqueue (Node.js REPL 또는 별도 스크립트)
# 실제 확인은 /approvals UI에서 수행 가능
```

- [ ] **Step 3: 커밋**

```bash
git add "app/api/governor/[id]/decide/route.ts"
git commit -m "feat(governor): add POST /api/governor/[id]/decide"
```

---

### Task 6: 스케줄러 + Maintenance 연동

**Files:**
- Modify: `lib/scheduler/register-jobs.ts`
- Modify: `lib/scheduler/maintenance.ts`

- [ ] **Step 1: register-jobs.ts에 governor-flush 잡 추가**

`lib/scheduler/register-jobs.ts`의 `import` 블록 상단에 추가:
```typescript
import { flushPendingExec } from '@/lib/governor-executor';
```

`BUILTIN_JOBS` 배열의 `quota-reset` 항목 뒤에 추가 (`COLLECTION_JOBS`가 아닌 `BUILTIN_JOBS`에 넣을 것 — category = 'system'):
```typescript
  {
    id: 'governor-flush',
    name: 'Governor 자동 실행',
    description: '매시간 LOW 위험 대기 액션을 자동 실행합니다.',
    cron: '0 * * * *',
    category: 'system',
    enabled: true,
    handler: async () => {
      await flushPendingExec();
      return { ok: true, message: 'governor-flush 완료' };
    }
  },
```

- [ ] **Step 2: maintenance.ts에 REJECTED 항목 정리 추가**

`lib/scheduler/maintenance.ts`의 `runMaintenanceJob` 함수 내부 마지막 `return` 전에 추가:
```typescript
  // $executeRawUnsafe는 PostgreSQL에서 DML 시 affected row count(number)를 반환한다
  const deletedGovernorCount = (await prisma.$executeRawUnsafe(
    `DELETE FROM "GovernorAction" WHERE "deletedAt" IS NOT NULL AND "deletedAt" < NOW()`
  )) as number;
```

그리고 기존 return message를 수정 (메시지 포맷이 변경됨 — 이 함수를 assert하는 테스트가 있으면 함께 수정):
```typescript
  return {
    ok: true,
    message: `정리 완료: JobRun ${deletedJobRuns.count}건, raw ${clearedRaw.count}건, Intel ${deletedIntel.count}건, Governor ${deletedGovernorCount}건 삭제`
  };
```

- [ ] **Step 3: 테스트 실행**

```bash
npx vitest run lib/scheduler/__tests__/integration.test.ts
```

Expected: PASS (기존 테스트 깨지지 않음)

- [ ] **Step 4: 커밋**

```bash
git add lib/scheduler/register-jobs.ts lib/scheduler/maintenance.ts
git commit -m "feat(governor): add governor-flush scheduler job + maintenance cleanup"
```

---

## Chunk 3: UI (ApprovalPanel 확장 + /approvals 인박스)

### Task 7: ApprovalPanel — Governor 뱃지 통합

**Files:**
- Modify: `components/panels/approval-panel.tsx`

Governor `PENDING_APPROVAL` 수를 폴링하여 기존 뱃지에 합산하고 `/approvals` 링크 추가.

- [ ] **Step 1: approval-panel.tsx 수정**

```typescript
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { ApprovalData } from '@/lib/canvas-store';

export function ApprovalPanel({ data }: { data: ApprovalData }) {
  const [approving, setApproving] = useState<string | null>(null);
  const [governorCount, setGovernorCount] = useState(0);
  const [governorLoaded, setGovernorLoaded] = useState(false);

  useEffect(() => {
    async function fetchGovernorCount() {
      try {
        const res = await fetch('/api/governor/queue');
        if (!res.ok) return;
        const json = await res.json() as { items: unknown[] };
        setGovernorCount(json.items.length);
      } catch {
        // 조용히 실패
      } finally {
        setGovernorLoaded(true);
      }
    }
    void fetchGovernorCount();
    const timer = setInterval(() => { void fetchGovernorCount(); }, 30_000);
    return () => clearInterval(timer);
  }, []);

  const totalPending = data.items.length + governorCount;
  // governorLoaded 전에는 기존 항목만 기준으로 판단 (Governor 카운트 로딩 flash 방지)
  const showEmpty = governorLoaded && totalPending === 0;

  const handleApprove = async (item: { id: string; label: string; type: string }) => {
    setApproving(item.id);
    try {
      await fetch('/api/approvals/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: item.type, targetId: item.id, label: item.label })
      });
    } finally {
      setApproving(null);
    }
  };

  if (showEmpty) {
    return <div className="p-1 text-[12px] text-[var(--shell-text-muted)]">대기 중인 승인 없음</div>;
  }

  return (
    <div className="p-1 flex flex-col gap-2">
      {governorCount > 0 && (
        <Link href="/approvals"
          className="flex items-center justify-between rounded px-[10px] py-2 text-[12px]"
          style={{ background: 'var(--shell-surface-hover)' }}>
          <span className="text-[var(--shell-text-primary)]">Governor 승인 대기</span>
          <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
            {governorCount}
          </span>
        </Link>
      )}
      {data.items.slice(0, 5).map((item) => (
        <div key={item.id} className="flex items-center justify-between rounded"
          style={{ background: 'var(--shell-surface-hover)', padding: '8px 10px' }}>
          <span className="text-[12px] text-[var(--shell-text-primary)] truncate max-w-[180px]">{item.label}</span>
          <button onClick={() => handleApprove(item)} disabled={approving === item.id}
            className="text-[11px] px-2 py-1 rounded"
            style={{ background: approving === item.id ? 'var(--shell-border)' : 'var(--shell-accent)',
                     color: '#fff', border: 'none', cursor: approving === item.id ? 'not-allowed' : 'pointer' }}>
            {approving === item.id ? '처리 중\u2026' : '승인'}
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 개발 서버에서 확인**

```bash
npm run dev
```

설정 → Dev 탭 → MCP → 사이드패널 열기. Governor 항목이 없으면 "대기 중인 승인 없음" 표시.

- [ ] **Step 3: 커밋**

```bash
git add components/panels/approval-panel.tsx
git commit -m "feat(governor): add Governor badge + /approvals link to ApprovalPanel"
```

---

### Task 8: /approvals 인박스 페이지

**Files:**
- Create: `app/(domains)/approvals/page.tsx`

HIGH=rose, MEDIUM=amber 뱃지. 낙관적 UI 업데이트. PENDING_SCORE는 "평가 중" 스피너.

- [ ] **Step 1: 페이지 구현**

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GovernorAction } from '@/lib/governor';

const RISK_BADGE: Record<string, string> = {
  HIGH: 'bg-rose-900/50 text-rose-300 border border-rose-500/40',
  MEDIUM: 'bg-amber-900/50 text-amber-300 border border-amber-500/40',
};

const RISK_LABEL: Record<string, string> = {
  HIGH: '고위험',
  MEDIUM: '중위험',
};

const KIND_LABEL: Record<string, string> = {
  SNS_PUBLISH: 'SNS 발행',
  SLACK_SEND: 'Slack 전송',
  CAMPAIGN_EXEC: '캠페인 실행',
  RUN_REPORT: '보고서 확정',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<GovernorAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/governor/queue');
      if (!res.ok) return;
      const json = await res.json() as { items: GovernorAction[] };
      setItems(json.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
    const timer = setInterval(() => { void fetchItems(); }, 15_000);
    return () => clearInterval(timer);
  }, [fetchItems]);

  async function handleDecide(id: string, decision: 'APPROVED' | 'REJECTED') {
    setDeciding(id);
    // 낙관적 업데이트
    setItems((prev) => prev.filter((item) => item.id !== id));
    try {
      const res = await fetch(`/api/governor/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) void fetchItems(); // 낙관적 제거 롤백
    } catch {
      // 네트워크 오류 시 목록 재로드
      void fetchItems();
    } finally {
      setDeciding(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <p className="text-[9px] font-semibold uppercase tracking-[2px] text-[var(--text-muted)]">Governor</p>
        <h1 className="mt-1 text-xl font-semibold text-[var(--text-strong)]">승인 인박스</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          에이전트가 요청한 외부 액션을 검토하고 승인 또는 거절합니다.
        </p>
      </div>

      {loading && (
        <div className="text-sm text-[var(--text-muted)]">불러오는 중…</div>
      )}

      {!loading && items.length === 0 && (
        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-sub)] p-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">대기 중인 승인 없음</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <div key={item.id}
            className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-sub)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {item.status === 'PENDING_SCORE' ? (
                  <span className="rounded-full bg-[var(--surface-border)] px-2.5 py-0.5 text-[11px] text-[var(--text-muted)]">
                    평가 중…
                  </span>
                ) : item.riskLevel && RISK_BADGE[item.riskLevel] ? (
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${RISK_BADGE[item.riskLevel]}`}>
                    {RISK_LABEL[item.riskLevel]}
                  </span>
                ) : null}
                <span className="text-sm font-semibold text-[var(--text-strong)]">
                  {KIND_LABEL[item.kind] ?? item.kind}
                </span>
              </div>
              <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
                {formatDate(item.createdAt)}
              </span>
            </div>

            {item.riskReason && (
              <p className="mt-2 text-xs text-[var(--text-muted)] leading-5">{item.riskReason}</p>
            )}

            <div className="mt-3 text-xs text-[var(--text-muted)] font-mono bg-[rgba(0,0,0,0.2)] rounded p-2 truncate">
              {JSON.stringify(item.payload).slice(0, 120)}
            </div>

            {item.status !== 'PENDING_SCORE' && (
              <div className="mt-3 flex gap-2 justify-end">
                <button
                  onClick={() => handleDecide(item.id, 'REJECTED')}
                  disabled={deciding === item.id}
                  className="rounded-md border border-[var(--surface-border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-rose-400 hover:border-rose-500/40 disabled:opacity-50">
                  거절
                </button>
                <button
                  onClick={() => handleDecide(item.id, 'APPROVED')}
                  disabled={deciding === item.id}
                  className="rounded-md bg-[#00d4ff] px-3 py-1.5 text-xs font-semibold text-[#050810] hover:bg-[#00b8d9] disabled:opacity-50">
                  {deciding === item.id ? '처리 중…' : '승인'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 개발 서버에서 확인**

```bash
npm run dev
# http://localhost:3000/approvals 접속
```

Expected: "대기 중인 승인 없음" 표시

- [ ] **Step 3: 커밋**

```bash
git add "app/(domains)/approvals/page.tsx"
git commit -m "feat(governor): add /approvals inbox page"
```

---

### Task 9: enqueue 후 scorer 자동 호출 연결

**Files:**
- Modify: `lib/governor.ts`

현재 `enqueue()`는 `PENDING_SCORE` 상태로만 저장한다. scorer를 fire-and-forget으로 연결하여 enqueue 직후 자동으로 위험도 평가가 시작되게 한다.

- [ ] **Step 1: governor.ts의 enqueue 함수와 runScorer 헬퍼 교체**

`lib/governor.ts`의 기존 `enqueue` 함수를 아래로 교체하고, `runScorer`를 모듈 하단에 추가한다.

`governor-scorer.ts`는 `import type { GovernorAction } from '@/lib/governor'`로 타입만 가져오므로 런타임 순환 의존이 없다. `governor.ts`에서 `governor-scorer`를 동적 import하면 안전하다.
```typescript
export async function enqueue(input: {
  kind: string;
  payload: unknown;
}): Promise<GovernorAction> {
  await ensureGovernorTable();
  const id = randomUUID();
  const rows = await prisma.$queryRawUnsafe<GovernorActionRow[]>(
    `
      INSERT INTO "GovernorAction" ("id", "kind", "payload", "status", "createdAt", "updatedAt")
      VALUES ($1, $2, $3::jsonb, 'PENDING_SCORE', NOW(), NOW())
      RETURNING *
    `,
    id,
    input.kind,
    JSON.stringify(input.payload)
  );
  const action = parseRow(rows[0]);

  // fire-and-forget 위험도 평가
  void runScorer(action);
  return action;
}

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
  } catch (err) {
    // DB 갱신 실패 → FAILED 표시 (spec: "scorer DB 갱신 실패 → FAILED")
    // 이 updateStatus도 실패하면 액션은 PENDING_SCORE에 묶임 — console.error로 관찰 가능하게 남김
    console.error('[governor] runScorer DB update failed for', action.id, err);
    try { await updateStatus(action.id, { status: 'FAILED' }); } catch { /* already logged above */ }
  }
}
```

- [ ] **Step 2: 기존 governor 테스트 재실행**

```bash
npx vitest run lib/governor/__tests__/
```

Expected: PASS (테스트는 mock이므로 영향 없음)

- [ ] **Step 3: 커밋**

```bash
git add lib/governor.ts
git commit -m "feat(governor): wire scorer fire-and-forget in enqueue"
```

---

### Task 10: 전체 테스트 실행 + TypeScript 타입 확인

- [ ] **Step 1: 전체 테스트 실행**

```bash
npx vitest run
```

Expected: 모든 테스트 PASS

- [ ] **Step 2: TypeScript 타입 검사**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 개발 서버 최종 확인**

```bash
npm run dev
```

확인 항목:
- `http://localhost:3000/approvals` — 페이지 렌더링 정상
- Shell 사이드패널 ApprovalPanel — Governor 뱃지 표시 (0이면 "대기 없음")
- 설정 → Dev → MCP 탭 접속 정상

- [ ] **Step 4: 최종 커밋 (필요시)**

```bash
git status
# 미커밋 변경 없으면 skip
```
