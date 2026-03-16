import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getMissingEnvKeys, getLLMProvider } from '@/lib/env';
import { analyzeDataset } from '@/lib/dataset-analysis';

const bodySchema = z.object({
  question: z.string().optional()
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const provider = getLLMProvider();
  const providerKeys: Record<string, string[]> = {
    openai: ['OPENAI_API_KEY'],
    gemini: ['GEMINI_API_KEY', 'GEMINI_MODEL'],
    groq: ['GROQ_API_KEY'],
    openclaw: [],
    local: ['LOCAL_LLM_BASE_URL', 'LOCAL_LLM_MODEL']
  };
  const expected = providerKeys[provider] || providerKeys.openai;
  const missing = getMissingEnvKeys().filter((key) => expected.includes(key));
  if (missing.length) {
    return NextResponse.json(
      { error: `${provider.toUpperCase()} 분석 실행에 필요한 키가 없습니다: ${missing.join(', ')}` },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  const dataset = await prisma.dataset.findUnique({ where: { id } });

  if (!dataset) {
    return NextResponse.json({ error: '데이터셋을 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    const body = bodySchema.parse(await req.json());
    const analysis = await analyzeDataset({
      name: dataset.name,
      type: dataset.type,
      notes: dataset.notes || undefined,
      rawData: dataset.rawData,
      question: body.question
    });

    const updated = await prisma.dataset.update({
      where: { id },
      data: { analysis }
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '데이터 분석에 실패했습니다.' },
      { status: 500 }
    );
  }
}
