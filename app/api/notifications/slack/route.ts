import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  sendSlackMessage,
  buildApprovalNotification,
  buildRecommendationAlert
} from '@/lib/integrations/slack';
import { computeRecommendations } from '@/lib/recommendations';

const bodySchema = z.object({
  type: z.enum(['approval', 'recommendations', 'custom']),
  // for approval
  itemType: z.string().optional(),
  itemId: z.string().optional(),
  label: z.string().optional(),
  // for custom
  text: z.string().optional()
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());

    if (body.type === 'approval') {
      const pendingCount = await prisma.approvalDecision.count({
        where: { decision: 'PENDING' }
      });

      const result = await sendSlackMessage(
        buildApprovalNotification({
          itemType: body.itemType || 'unknown',
          itemId: body.itemId || '',
          label: body.label || '새 승인 요청',
          pendingCount
        })
      );

      return NextResponse.json(result);
    }

    if (body.type === 'recommendations') {
      const recommendations = await computeRecommendations();
      const urgent = recommendations.filter((r) => r.priority === 'urgent' || r.priority === 'high');

      if (urgent.length === 0) {
        return NextResponse.json({ ok: true, message: '긴급 추천 사항이 없습니다.' });
      }

      const results = [];
      for (const rec of urgent.slice(0, 3)) {
        const result = await sendSlackMessage(
          buildRecommendationAlert(rec.title, rec.reason, rec.priority)
        );
        results.push(result);
      }

      return NextResponse.json({ ok: true, sent: results.length });
    }

    if (body.type === 'custom' && body.text) {
      const result = await sendSlackMessage({ text: body.text });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Slack notification failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
