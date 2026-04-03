import { NextResponse } from 'next/server';
import { listPending } from '@/lib/governor';

export async function GET() {
  try {
    const items = await listPending(['PENDING_APPROVAL', 'PENDING_SCORE']);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { items: [], error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    );
  }
}
