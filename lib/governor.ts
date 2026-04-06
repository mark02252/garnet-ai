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

export type GovernorActionRow = {
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

let tableEnsuredPromise: Promise<void> | null = null;

export async function ensureGovernorTable(): Promise<void> {
  if (tableEnsuredPromise) return tableEnsuredPromise;
  tableEnsuredPromise = (async () => {
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
  })();
  return tableEnsuredPromise;
}

/** Test isolation helper — do not call in production code */
export function resetTableEnsuredForTests(): void {
  tableEnsuredPromise = null;
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
  const action = parseRow(rows[0]);

  // fire-and-forget 위험도 평가
  void runScorer(action);
  return action;
}

export async function listPending(
  statuses: GovernorStatus[] = ['PENDING_APPROVAL', 'PENDING_SCORE'],
  limit = 40
): Promise<GovernorAction[]> {
  const safeLimit = Math.max(1, Math.min(Number.isInteger(limit) ? limit : 40, 200));
  await ensureGovernorTable();
  const placeholders = statuses.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await prisma.$queryRawUnsafe<GovernorActionRow[]>(
    `
      SELECT * FROM "GovernorAction"
      WHERE "status" IN (${placeholders})
        AND ("deletedAt" IS NULL OR "deletedAt" > NOW())
      ORDER BY "createdAt" DESC
      LIMIT ${safeLimit}
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
