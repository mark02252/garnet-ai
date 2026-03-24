import { prisma } from '@/lib/prisma';
import { runLLM } from '@/lib/llm';
import type { RuntimeConfig } from '@/lib/types';

// 기본 LLM provider 사용 (env의 LLM_PROVIDER, 현재 gemini)
const ANALYSIS_RUNTIME: RuntimeConfig = {} as RuntimeConfig;

interface AnalysisItem {
  i: number;
  relevance: number;
  urgency: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
  tags: string[];
}

export async function debugAnalyze() {
  const items = await prisma.marketingIntel.findMany({
    where: { relevance: 0 },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });
  if (items.length === 0) return { step: 'query', itemCount: 0, message: 'No unanalyzed items found' };

  const kws = (await prisma.watchKeyword.findMany({ where: { isActive: true }, select: { keyword: true } }))
    .map(k => k.keyword).join(', ');

  const summary = items.map((item, i) => `[${i}] ${item.platform} | ${item.title}`).join('\n');
  const prompt = `분석: ${kws || '(없음)'}\n${summary}\n\nJSON: [{"i":0,"relevance":0.5,"urgency":"NORMAL","tags":["test"]}]`;

  try {
    const raw = await runLLM('JSON만 출력.', prompt, 0.2, 1000);
    return { step: 'llm', itemCount: items.length, rawResponse: raw.slice(0, 500) };
  } catch (err) {
    return { step: 'llm-error', itemCount: items.length, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function analyzeRecentIntel(batchSize: number = 20): Promise<number> {
  const items = await prisma.marketingIntel.findMany({
    where: { relevance: { lte: 0 } },
    orderBy: { createdAt: 'desc' },
    take: batchSize,
  });

  console.log(`[Analyzer] Found ${items.length} unanalyzed items`);
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
    const rawLLMResponse = await runLLM(
      '마케팅 인텔리전스 분석가. 반드시 유효한 JSON 배열만 출력. 마크다운 코드블록 사용 금지.',
      prompt, 0.2, 4000, undefined
    );
    // ```json ... ``` 블록 제거 후 JSON 배열 추출
    const cleaned = rawLLMResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const match = cleaned.match(/\[[\s\S]*?\]/);
    if (match) {
      try {
        results = JSON.parse(match[0]) as AnalysisItem[];
      } catch {
        // JSON 깨진 경우: 개별 항목 단위로 파싱 시도
        const itemMatches = cleaned.matchAll(/\{[^}]+\}/g);
        for (const m of itemMatches) {
          try { results.push(JSON.parse(m[0]) as AnalysisItem); } catch { /* skip */ }
        }
      }
    }
    console.log(`[Analyzer] parsed ${results.length} items from LLM response`);
  } catch (err) {
    console.error('[Analyzer] LLM error:', err instanceof Error ? err.message : err);
    return 0;
  }

  console.log(`[Analyzer] parsed ${results.length} results for ${items.length} items`);

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
