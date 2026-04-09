import { NextResponse } from 'next/server';
import { z } from 'zod';
import { decideAction, markRejected, getById } from '@/lib/governor';

const decideSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'DEFERRED']),
  reason: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = decideSchema.parse(await req.json());

    if (body.decision === 'DEFERRED') {
      // 보류 — 아이디어는 좋지만 지금은 안 됨
      const action = await getById(id);
      if (!action) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

      await markRejected(id); // DB에서는 REJECTED로 처리 (다시 제안되지 않도록)

      // Human Feedback: 보류 학습 (anti-pattern 아님)
      try {
        const { onActionDeferred } = await import('@/lib/agent-loop/human-feedback');
        const meta = typeof action.payload === 'object' && action.payload !== null
          ? (action.payload as Record<string, unknown>)._agentLoop as Record<string, string> | undefined
          : undefined;
        await onActionDeferred({
          actionKind: action.kind,
          title: meta?.title || action.kind,
          rationale: meta?.rationale || '',
          reason: (body.reason || 'good_idea_later') as 'no_budget' | 'prerequisite' | 'too_early' | 'external_dependency' | 'good_idea_later',
        });
      } catch { /* non-critical */ }

      return NextResponse.json({ ok: true, status: 'deferred' });
    }

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
