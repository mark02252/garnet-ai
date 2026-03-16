import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const createSchema = z.object({
  situation: z.string().min(1),
  recommendedResponse: z.string().min(1),
  reasoning: z.string().min(1),
  signals: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  status: z.enum(['DRAFT', 'CONFIRMED', 'ARCHIVED']).default('DRAFT')
});

function safeJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() || '';
  const status = searchParams.get('status')?.trim() || '';

  const items = await prisma.learningArchive.findMany({
    where: {
      status: status ? (status as 'DRAFT' | 'CONFIRMED' | 'ARCHIVED') : undefined,
      OR: q
        ? [
            { situation: { contains: q } },
            { recommendedResponse: { contains: q } },
            { reasoning: { contains: q } }
          ]
        : undefined
    },
    include: {
      run: {
        select: { id: true, topic: true, createdAt: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 300
  });

  return NextResponse.json(
    items.map((item) => ({
      ...item,
      tags: safeJson(item.tags),
      signals: safeJson(item.signals)
    }))
  );
}

export async function POST(req: Request) {
  try {
    const body = createSchema.parse(await req.json());
    const created = await prisma.learningArchive.create({
      data: {
        sourceType: 'MANUAL',
        situation: body.situation,
        recommendedResponse: body.recommendedResponse,
        reasoning: body.reasoning,
        signals: JSON.stringify(body.signals),
        tags: JSON.stringify(body.tags),
        status: body.status
      }
    });

    return NextResponse.json(created);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '학습 아카이브 생성에 실패했습니다.' },
      { status: 400 }
    );
  }
}
