import { NextResponse } from 'next/server';
import { runSeminarSchedulerTick, startSeminarScheduler } from '@/lib/seminar-scheduler';
import { getSeminarSession, touchSeminarSession } from '@/lib/seminar-storage';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSeminarSession(id);
  if (!session) {
    return NextResponse.json({ ok: false, error: '세션을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (session.status === 'STOPPED' || session.status === 'COMPLETED') {
    return NextResponse.json({ ok: false, error: '현재 상태에서는 수동 라운드를 실행할 수 없습니다.' }, { status: 400 });
  }

  await touchSeminarSession(id, {
    status: 'RUNNING',
    nextRunAt: new Date(),
    lastError: null
  });
  startSeminarScheduler();
  await runSeminarSchedulerTick();
  return NextResponse.json({ ok: true });
}

