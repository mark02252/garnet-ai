import { NextResponse } from 'next/server';
import { analyzeRecentIntel } from '@/lib/intel/analyzer';

export async function POST() {
  try {
    const count = await analyzeRecentIntel(20);
    return NextResponse.json({ ok: true, analyzed: count });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
