import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title, brand, region, metric, targetValue, currentValue, unit, period, notes } = body;

    const data: Record<string, unknown> = {};
    if (title != null) data.title = title.trim();
    if (brand != null) data.brand = brand.trim() || null;
    if (region != null) data.region = region.trim() || null;
    if (metric != null) data.metric = metric.trim();
    if (targetValue != null) data.targetValue = Number(targetValue);
    if (currentValue != null) data.currentValue = Number(currentValue);
    if (unit != null) data.unit = unit.trim();
    if (period != null) data.period = period;
    if (notes != null) data.notes = notes.trim() || null;

    const goal = await prisma.kpiGoal.update({ where: { id }, data });
    return NextResponse.json(goal);
  } catch {
    return NextResponse.json({ error: '업데이트에 실패했습니다.' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.kpiGoal.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }
}
