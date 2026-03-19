import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function safeParseTags(raw?: string | null) {
  try {
    return JSON.parse(raw || '[]') as string[];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() || '';
  const tag = searchParams.get('tag')?.trim() || '';
  const dateFrom = searchParams.get('dateFrom')?.trim() || '';

  const runs = await prisma.run.findMany({
    where: {
      OR: q
        ? [
            { topic: { contains: q } },
            { brand: { contains: q } },
            { goal: { contains: q } }
          ]
        : undefined,
      createdAt: dateFrom ? { gte: new Date(dateFrom) } : undefined
    },
    orderBy: { createdAt: 'desc' },
    include: {
      memoryLog: true
    },
    take: 50
  });

  const filtered = tag
    ? runs.filter((run) => {
        const tags = safeParseTags(run.memoryLog?.tags);
        return tags.some((t) => t.toLowerCase().includes(tag.toLowerCase()));
      })
    : runs;

  return NextResponse.json(
    filtered.map((run) => ({
      id: run.id,
      topic: run.topic,
      brand: run.brand,
      region: run.region,
      goal: run.goal,
      createdAt: run.createdAt,
      tags: safeParseTags(run.memoryLog?.tags)
    }))
  );
}
