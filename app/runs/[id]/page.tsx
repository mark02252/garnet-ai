import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { RunDetailClient } from '@/components/run-detail-client';

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  if (!run) notFound();

  const memoryTags = JSON.parse(run.memoryLog?.tags || '[]') as string[];
  const tagKeyword = memoryTags[0] || '';
  const relatedLearnings = await prisma.learningArchive.findMany({
    where: {
      OR: [
        { situation: { contains: run.topic } },
        ...(tagKeyword ? [{ tags: { contains: tagKeyword } }] : [])
      ]
    },
    orderBy: { updatedAt: 'desc' },
    take: 4
  });

  const payload = {
    ...run,
    createdAt: run.createdAt.toISOString(),
    webSources: run.webSources.map((src) => ({
      ...src,
      fetchedAt: src.fetchedAt.toISOString()
    })),
    meetingTurns: run.meetingTurns.map((turn) => ({
      ...turn,
      createdAt: turn.createdAt.toISOString()
    })),
    attachments: run.attachments.map((attachment) => ({
      ...attachment,
      createdAt: attachment.createdAt.toISOString()
    })),
    deliverable: run.deliverable
      ? {
          ...run.deliverable,
          createdAt: run.deliverable.createdAt.toISOString()
        }
      : null,
    memoryLog: run.memoryLog
      ? {
          ...run.memoryLog,
          createdAt: run.memoryLog.createdAt.toISOString()
        }
      : null,
    tags: memoryTags,
    relatedLearnings: relatedLearnings.map((item) => ({
      id: item.id,
      situation: item.situation,
      recommendedResponse: item.recommendedResponse,
      status: item.status
    }))
  };

  return <RunDetailClient run={payload} />;
}
