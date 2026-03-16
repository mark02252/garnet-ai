import { NextResponse } from 'next/server';
import { buildSharedBootstrapPayload } from '@/lib/shared-sync/local-export';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limitRaw = searchParams.get('limit')?.trim() || '';
  const limit = limitRaw ? Number(limitRaw) : undefined;

  try {
    const payload = await buildSharedBootstrapPayload(
      Number.isFinite(limit) && typeof limit === 'number' ? Math.max(1, Math.min(limit, 300)) : undefined
    );
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '공유 데이터 export에 실패했습니다.' },
      { status: 500 }
    );
  }
}
