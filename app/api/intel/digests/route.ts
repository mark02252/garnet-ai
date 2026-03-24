import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const limit = Math.min(Number(searchParams.get('limit') || '20'), 50);

  const where: Record<string, unknown> = {};
  if (type) where.type = type.toUpperCase();

  const digests = await prisma.marketingDigest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { items: { take: 5, orderBy: { relevance: 'desc' } } }
  });

  return NextResponse.json({ digests });
}
