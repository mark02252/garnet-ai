import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generatePptxBuffer } from '@/lib/slide-export';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const run = await prisma.run.findUnique({
    where: { id },
    include: { deliverable: true }
  });

  if (!run) {
    return NextResponse.json({ error: '실행 기록을 찾을 수 없습니다.' }, { status: 404 });
  }

  if (!run.deliverable) {
    return NextResponse.json({ error: '산출물이 없습니다.' }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let structured: any = null;
  try {
    structured = JSON.parse(run.deliverable.content);
  } catch {
    return NextResponse.json({ error: '산출물을 파싱할 수 없습니다.' }, { status: 400 });
  }

  try {
    const buffer = await generatePptxBuffer({
      title: structured.title || run.topic,
      campaignName: structured.campaignName || run.topic,
      objective: structured.objective || '',
      target: structured.target || '',
      coreMessage: structured.coreMessage || '',
      executiveSummary: structured.executiveSummary || [],
      channelPlan: structured.channelPlan || [],
      kpiTable: structured.kpiTable || [],
      timeline: structured.timeline || [],
      riskMatrix: structured.riskMatrix || [],
      nextActions: structured.nextActions || []
    });

    const filename = `garnet-${run.topic.slice(0, 30).replace(/[^a-zA-Z0-9가-힣]/g, '_')}-${id.slice(0, 8)}.pptx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PPTX 생성 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
