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
  const action = parseRow(rows[0]);
  // fire-and-forget scorer — added in Task 9
  return action;
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
