import { prisma } from '@/lib/prisma';
import { runLLM } from '@/lib/llm';
import type { RuntimeConfig } from '@/lib/types';

const FREE_RUNTIME: RuntimeConfig = { llmProvider: 'groq' } as RuntimeConfig;

interface AnalysisItem {
  i: number;
  relevance: number;
  urgency: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
  tags: string[];
}

export async function analyzeRecentIntel(batchSize: number = 20): Promise<number> {
  const items = await prisma.marketingIntel.findMany({
    where: { relevance: 0 },
    orderBy: { createdAt: 'desc' },
    take: batchSize,
  });

  if (items.length === 0) return 0;

  const [campaigns, keywords] = await Promise.all([
    prisma.manualCampaignRoom.findMany({ where: { status: 'ACTIVE' }, select: { brand: true } }),
    prisma.watchKeyword.findMany({ where: { isActive: true }, select: { keyword: true } }),
  ]);

  const brands = campaigns.map((c) => c.brand).join(', ');
  const kws = keywords.map((k) => k.keyword).join(', ');

  const itemsSummary = items.map((item, i) =>
    `[${i}] ${item.platform} | ${item.title} | ${item.snippet.slice(0, 150)}`
  ).join('\n');

  const prompt = `아래 수집된 마케팅 콘텐츠를 분석하세요.
현재 활성 브랜드: ${brands || '(없음)'}
감시 키워드: ${kws || '(없음)'}

${itemsSummary}

각 항목 [번호]에 대해 JSON 배열로 답하세요:
[{"i":0,"relevance":0.8,"urgency":"HIGH","tags":["경쟁사","캠페인"]}, ...]

- relevance (0~1): 마케팅 전략 관련도
- urgency: CRITICAL(즉시 대응), HIGH(24시간 내), NORMAL, LOW
- tags: 관련 태그 2~4개

JSON 배열만 출력하세요.`;

  let results: AnalysisItem[] = [];
  try {
    const raw = await runLLM(
      '마케팅 인텔리전스 분석가입니다. JSON만 출력하세요.',
      prompt, 0.2, 2000, FREE_RUNTIME
    );
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) results = JSON.parse(match[0]) as AnalysisItem[];
  } catch {
    return 0;
  }

  let updated = 0;
  for (const r of results) {
    const item = items[r.i];
    if (!item) continue;
    const validUrgency = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'].includes(r.urgency) ? r.urgency : 'NORMAL';
    await prisma.marketingIntel.update({
      where: { id: item.id },
      data: {
        relevance: Math.max(0, Math.min(1, r.relevance || 0)),
        urgency: validUrgency as 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW',
        tags: JSON.stringify(r.tags || []),
      }
    });
    updated++;
  }

  return updated;
}
