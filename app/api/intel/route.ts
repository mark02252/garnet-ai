import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get('platform');
  const urgency = searchParams.get('urgency');
  const limit = Math.min(Number(searchParams.get('limit') || '50'), 100);

  const where: Record<string, unknown> = {};
  if (platform) where.platform = platform.toUpperCase();
  if (urgency) where.urgency = urgency.toUpperCase();

  const items = await prisma.marketingIntel.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}
