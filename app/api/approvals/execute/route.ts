import { NextResponse } from 'next/server';
import { z } from 'zod';
import { markApprovalDecisionApproved, type ApprovalActionKind } from '@/lib/approval-actions';
import { prisma } from '@/lib/prisma';
import { ensureSeminarFinalReport } from '@/lib/seminar-scheduler';

const executeSchema = z.object({
  kind: z.enum(['RUN_REPORT', 'SEMINAR_REPORT', 'LEARNING_ARCHIVE']),
  targetId: z.string().min(1),
  label: z.string().optional()
});

async function approveDecision(kind: ApprovalActionKind, targetId: string, label?: string) {
  if (kind === 'RUN_REPORT') {
    const run = await prisma.run.findUnique({
      where: { id: targetId },
      select: { id: true, deliverable: { select: { id: true } } }
    });
    if (!run?.deliverable) {
      throw new Error('확정할 보고서를 찾을 수 없습니다.');
    }
    await markApprovalDecisionApproved({ itemType: 'RUN_REPORT', itemId: targetId, label });
    return;
  }

  if (kind === 'SEMINAR_REPORT') {
    await ensureSeminarFinalReport(targetId);
    await markApprovalDecisionApproved({ itemType: 'SEMINAR_REPORT', itemId: targetId, label });
    return;
  }

  await prisma.learningArchive.update({
    where: { id: targetId },
    data: { status: 'CONFIRMED' }
  });
}

export async function POST(req: Request) {
  try {
    const body = executeSchema.parse(await req.json());
    await approveDecision(body.kind, body.targetId, body.label);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '승인 처리에 실패했습니다.' },
      { status: 400 }
    );
  }
}
