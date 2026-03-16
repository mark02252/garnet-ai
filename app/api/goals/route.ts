import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const goals = await prisma.kpiGoal.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json(goals);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, brand, region, metric, targetValue, currentValue, unit, period, notes } = body;

    if (!title?.trim() || !metric?.trim() || targetValue == null) {
      return NextResponse.json({ error: '제목, 지표명, 목표값은 필수입니다.' }, { status: 400 });
    }

    const goal = await prisma.kpiGoal.create({
      data: {
        title: title.trim(),
        brand: brand?.trim() || null,
        region: region?.trim() || null,
        metric: metric.trim(),
        targetValue: Number(targetValue),
        currentValue: Number(currentValue ?? 0),
        unit: unit?.trim() || '',
        period: period || 'MONTHLY',
        notes: notes?.trim() || null
      }
    });

    return NextResponse.json(goal, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'KPI 목표 생성에 실패했습니다.' }, { status: 500 });
  }
}
