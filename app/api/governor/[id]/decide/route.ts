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
