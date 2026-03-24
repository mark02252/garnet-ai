import { NextResponse } from 'next/server';
import { getVideoGeneration } from '@/lib/video/generate';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await getVideoGeneration(id);
  if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(video);
}
