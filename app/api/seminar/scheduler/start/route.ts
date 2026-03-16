import { NextResponse } from 'next/server';
import { startSeminarScheduler } from '@/lib/seminar-scheduler';

export async function POST() {
  startSeminarScheduler();
  return NextResponse.json({ ok: true });
}

