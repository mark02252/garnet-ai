import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const dataset = await prisma.dataset.findUnique({ where: { id } });

  if (!dataset) {
    return NextResponse.json({ error: '데이터셋을 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json(dataset);
}
