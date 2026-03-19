import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['CSV', 'XLSX', 'JSON', 'TEXT']),
  notes: z.string().optional(),
  rawData: z.string().min(1)
});

export async function GET() {
  const datasets = await prisma.dataset.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  return NextResponse.json(datasets);
}

export async function POST(req: Request) {
  try {
    const payload = createSchema.parse(await req.json());
    const created = await prisma.dataset.create({
      data: {
        name: payload.name,
        type: payload.type,
        notes: payload.notes,
        rawData: payload.rawData
      }
    });

    return NextResponse.json(created);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '데이터셋 생성에 실패했습니다.' },
      { status: 400 }
    );
  }
}
