import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const patchSchema = z.object({
  situation: z.string().min(1).optional(),
  recommendedResponse: z.string().min(1).optional(),
  reasoning: z.string().min(1).optional(),
  signals: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['DRAFT', 'CONFIRMED', 'ARCHIVED']).optional(),
  markUsed: z.boolean().optional()
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const body = patchSchema.parse(await req.json());

    const updated = await prisma.learningArchive.update({
      where: { id },
      data: {
        situation: body.situation,
        recommendedResponse: body.recommendedResponse,
        reasoning: body.reasoning,
        signals: body.signals ? JSON.stringify(body.signals) : undefined,
        tags: body.tags ? JSON.stringify(body.tags) : undefined,
        status: body.status,
        lastUsedAt: body.markUsed ? new Date() : undefined
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '학습 아카이브 수정에 실패했습니다.' },
      { status: 400 }
    );
  }
}
