import { NextResponse } from 'next/server';
import { z } from 'zod';
import { decideAction } from '@/lib/governor';

const decideSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = decideSchema.parse(await req.json());
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
