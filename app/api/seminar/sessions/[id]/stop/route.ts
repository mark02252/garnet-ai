import { NextResponse } from 'next/server';
import { ensureSeminarFinalReport } from '@/lib/seminar-scheduler';
import { getSeminarSession, stopSeminarSession } from '@/lib/seminar-storage';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSeminarSession(id);
  if (!session) {
    return NextResponse.json({ ok: false, error: '세션을 찾을 수 없습니다.' }, { status: 404 });
  }

  await stopSeminarSession(id);
  await ensureSeminarFinalReport(id);
  return NextResponse.json({ ok: true });
}
