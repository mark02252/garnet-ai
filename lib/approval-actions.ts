import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';

export type ApprovalActionKind = 'RUN_REPORT' | 'SEMINAR_REPORT' | 'LEARNING_ARCHIVE';

type ApprovalDecisionRow = {
  id: string;
  itemType: ApprovalActionKind;
  itemId: string;
  decision: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApprovalDecision = {
  id: string;
  itemType: ApprovalActionKind;
  itemId: string;
  decision: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

let approvalTablesEnsured = false;

export async function ensureApprovalDecisionTable() {
  if (approvalTablesEnsured) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ApprovalDecision" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "itemType" TEXT NOT NULL,
      "itemId" TEXT NOT NULL,
      "decision" TEXT NOT NULL,
      "label" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ApprovalDecision_itemType_itemId_decision_key"
    ON "ApprovalDecision"("itemType", "itemId", "decision")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ApprovalDecision_itemType_updatedAt_idx"
    ON "ApprovalDecision"("itemType", "updatedAt")
  `);

  approvalTablesEnsured = true;
}

export async function listApprovedDecisionKeys(itemTypes: ApprovalActionKind[]) {
  await ensureApprovalDecisionTable();
  if (!itemTypes.length) return new Set<string>();

  const placeholders = itemTypes.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await prisma.$queryRawUnsafe<ApprovalDecisionRow[]>(
    `
      SELECT "itemType", "itemId"
      FROM "ApprovalDecision"
      WHERE "decision" = 'APPROVED'
        AND "itemType" IN (${placeholders})
    `,
    ...itemTypes
  );

  return new Set(rows.map((row) => `${row.itemType}:${row.itemId}`));
}

export async function listApprovalDecisions(options?: {
  itemTypes?: ApprovalActionKind[];
  itemIds?: string[];
  limit?: number;
}) {
  await ensureApprovalDecisionTable();
  if (options?.itemIds && options.itemIds.length === 0) return [];

  const filters: string[] = [];
  const params: Array<string> = [];
  let paramIndex = 1;

  if (options?.itemTypes?.length) {
    filters.push(`"itemType" IN (${options.itemTypes.map(() => `$${paramIndex++}`).join(', ')})`);
    params.push(...options.itemTypes);
  }

  if (options?.itemIds?.length) {
    filters.push(`"itemId" IN (${options.itemIds.map(() => `$${paramIndex++}`).join(', ')})`);
    params.push(...options.itemIds);
  }

  const limit = Math.max(1, Math.min(options?.limit || 40, 200));
  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const rows = await prisma.$queryRawUnsafe<ApprovalDecisionRow[]>(
    `
      SELECT "id", "itemType", "itemId", "decision", "label", "createdAt", "updatedAt"
      FROM "ApprovalDecision"
      ${whereClause}
      ORDER BY "updatedAt" DESC
      LIMIT ${limit}
    `,
    ...params
  );

  return rows.map((row) => ({
    id: row.id,
    itemType: row.itemType,
    itemId: row.itemId,
    decision: row.decision,
    label: row.label,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString()
  })) satisfies ApprovalDecision[];
}

export async function markApprovalDecisionApproved(input: {
  itemType: ApprovalActionKind;
  itemId: string;
  label?: string | null;
}) {
  await ensureApprovalDecisionTable();
  const id = randomUUID();

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "ApprovalDecision" (
        "id", "itemType", "itemId", "decision", "label", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, 'APPROVED', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT("itemType", "itemId", "decision")
      DO UPDATE SET
        "label" = excluded."label",
        "updatedAt" = CURRENT_TIMESTAMP
    `,
    id,
    input.itemType,
    input.itemId,
    input.label || null
  );
}
