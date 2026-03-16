import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const payloadSchema = z.object({
  tags: z.array(z.string().min(1)).min(1).max(10).optional(),
  outcome: z.string().max(1000).optional(),
  failureReason: z.string().max(1000).optional()
})
  .refine((value) => value.tags || value.outcome !== undefined || value.failureReason !== undefined, {
    message: '수정할 값(tags/outcome/failureReason)을 하나 이상 전달해 주세요.'
  });

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const payload = payloadSchema.parse(await req.json());
    const updateData: {
      tags?: string;
      outcome?: string;
      failureReason?: string;
    } = {};
    if (payload.tags) {
      updateData.tags = JSON.stringify(payload.tags);
    }
    if (payload.outcome !== undefined) {
      updateData.outcome = payload.outcome.trim();
    }
    if (payload.failureReason !== undefined) {
      updateData.failureReason = payload.failureReason.trim();
    }

    const updated = await prisma.memoryLog.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({
      id: updated.id,
      tags: JSON.parse(updated.tags),
      outcome: updated.outcome || '',
      failureReason: updated.failureReason || ''
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '태그 업데이트에 실패했습니다.' },
      { status: 400 }
    );
  }
}
