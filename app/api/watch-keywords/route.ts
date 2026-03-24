import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const keywords = await prisma.watchKeyword.findMany({
    orderBy: { createdAt: 'desc' }
  });
  return NextResponse.json({ keywords });
}

const createSchema = z.object({
  keyword: z.string().min(1),
  category: z.enum(['BRAND', 'COMPETITOR', 'TREND', 'GENERAL']).optional(),
  platforms: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  try {
    const body = createSchema.parse(await req.json());
    const keyword = await prisma.watchKeyword.create({
      data: {
        keyword: body.keyword,
        category: body.category || 'GENERAL',
        platforms: JSON.stringify(body.platforms || []),
      }
    });
    return NextResponse.json({ keyword });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
