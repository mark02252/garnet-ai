import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // dynamic import로 GA4 모듈 체인 로딩을 이 라우트에만 격리
    const { initSchedulerSystem } = await import('@/lib/scheduler/init');
    await initSchedulerSystem();
    return NextResponse.json({ ok: true, message: 'Scheduler started' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scheduler init failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
