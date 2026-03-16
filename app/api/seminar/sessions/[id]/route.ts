import { NextResponse } from 'next/server';
import { ensureSeminarFinalReport, startSeminarScheduler } from '@/lib/seminar-scheduler';
import { getSeminarSessionDetail } from '@/lib/seminar-storage';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  startSeminarScheduler();
  const { id } = await params;
  const detail = await getSeminarSessionDetail(id);
  if (!detail) {
    return NextResponse.json({ ok: false, error: '세션을 찾을 수 없습니다.' }, { status: 404 });
  }

  if (
    (detail.session.status === 'COMPLETED' || detail.session.status === 'STOPPED') &&
    (!detail.finalReport || !detail.finalReport.structured)
  ) {
    await ensureSeminarFinalReport(id);
    const refreshed = await getSeminarSessionDetail(id);
    if (refreshed) return NextResponse.json({ ok: true, ...refreshed });
  }

  return NextResponse.json({ ok: true, ...detail });
}
