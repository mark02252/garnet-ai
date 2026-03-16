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
      webSources: true,
      meetingTurns: true,
      attachments: true,
      deliverable: true,
      memoryLog: true
    }
  });

  if (!run) {
    return NextResponse.json({ error: '실행 기록을 찾을 수 없습니다.' }, { status: 404 });
  }

  return new NextResponse(JSON.stringify(run, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename=run-${id}.json`
    }
  });
}
