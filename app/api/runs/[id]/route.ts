import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const run = await prisma.run.findUnique({
    where: { id },
    include: {
      webSources: { orderBy: { fetchedAt: 'desc' } },
      meetingTurns: { orderBy: { createdAt: 'asc' } },
      attachments: { orderBy: { createdAt: 'asc' } },
      deliverable: true,
      memoryLog: true
    }
  });

  if (!run) {
    return NextResponse.json({ error: '실행 기록을 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({
    ...run,
    tags: JSON.parse(run.memoryLog?.tags || '[]')
  });
}
