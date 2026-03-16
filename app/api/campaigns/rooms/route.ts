import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, brand, region, goal, objective, notes } = body;

    if (!title?.trim() || !brand?.trim() || !region?.trim() || !goal?.trim()) {
      return NextResponse.json({ error: '필수 항목을 입력해 주세요.' }, { status: 400 });
    }

    const room = await prisma.manualCampaignRoom.create({
      data: {
        title: title.trim(),
        brand: brand.trim(),
        region: region.trim(),
        goal: goal.trim(),
        objective: objective?.trim() || null,
        notes: notes?.trim() || null
      }
    });

    return NextResponse.json({ room }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '캠페인 룸 생성에 실패했습니다.' }, { status: 500 });
  }
}
