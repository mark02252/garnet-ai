import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildArchiveFromRun } from '@/lib/learning-archive';

export async function POST() {
  const runs = await prisma.run.findMany({
    include: {
      meetingTurns: true,
      deliverable: true,
      memoryLog: true
    },
    orderBy: { createdAt: 'desc' },
    take: 200
  });

  let created = 0;

  for (const run of runs) {
    const exists = await prisma.learningArchive.findFirst({
      where: { runId: run.id, sourceType: 'RUN' },
      select: { id: true }
    });

    if (exists) continue;

    const data = buildArchiveFromRun(run);
    await prisma.learningArchive.create({ data });
    created += 1;
  }

  return NextResponse.json({ created, totalRuns: runs.length });
}
