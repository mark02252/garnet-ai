import { prisma } from '@/lib/prisma';
import { runLLM } from '@/lib/llm';
import { sendSlackMessage } from '@/lib/integrations/slack';
import type { RuntimeConfig } from '@/lib/types';
import type { JobRunResult } from '@/lib/scheduler/types';

export async function buildDailyDigest(runtime?: RuntimeConfig): Promise<JobRunResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const items = await prisma.marketingIntel.findMany({
    where: { createdAt: { gte: since }, relevance: { gte: 0.3 } },
    orderBy: { relevance: 'desc' },
    take: 50,
  });

  if (items.length === 0) {
    return { ok: true, message: '지난 24시간 수집된 관련 인텔 없음' };
  }

  const summary = items
    .map((item) => `[${item.platform}/${item.urgency}] ${item.title}: ${item.snippet.slice(0, 100)}`)
    .join('\n');

  const analysis = await runLLM(
    '마케팅 전략 분석가입니다. 한국어로 간결하게 분석하세요.',
    `지난 24시간 수집된 마케팅 인텔리전스를 분석하세요:\n\n${summary}\n\n아래 JSON 형식으로 답변하세요:\n{\n  "headline": "한 줄 핵심 요약",\n  "insights": [{"category": "카테고리", "summary": "요약", "source_count": N}],\n  "actions": [{"priority": "NOW|NEXT|LATER", "title": "추천 액션"}]\n}\n\nJSON만 출력하세요.`,
    0.3, 2000, runtime
  );

  let parsed: { headline: string; insights: unknown[]; actions: unknown[] };
  try {
    const match = analysis.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : { headline: '분석 실패', insights: [], actions: [] };
  } catch {
    parsed = { headline: analysis.slice(0, 100), insights: [], actions: [] };
  }

  const digest = await prisma.marketingDigest.create({
    data: {
      type: 'DAILY',
      headline: parsed.headline,
      summary: analysis,
      insights: JSON.stringify(parsed.insights),
      actions: JSON.stringify(parsed.actions),
      itemCount: items.length,
    }
  });

  await prisma.marketingIntel.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: { digestId: digest.id }
  });

  if (process.env.SLACK_WEBHOOK_URL) {
    await sendSlackMessage({
      text: `*[Garnet 데일리 마케팅 인텔]*\n\n*${parsed.headline}*\n\n수집: ${items.length}건\n${analysis.slice(0, 800)}`
    });
    await prisma.marketingDigest.update({
      where: { id: digest.id }, data: { notifiedAt: new Date() }
    });
  }

  return { ok: true, message: parsed.headline, data: { digestId: digest.id, itemCount: items.length } };
}
