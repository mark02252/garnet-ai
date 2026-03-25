import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.watchKeyword.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
