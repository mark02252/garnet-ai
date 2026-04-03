import Anthropic from '@anthropic-ai/sdk';
import type { GovernorAction, GovernorRiskLevel } from '@/lib/governor';

export type ScoreResult = {
  riskLevel: GovernorRiskLevel;
  reason: string;
};

const FALLBACK: ScoreResult = {
  riskLevel: 'HIGH',
  reason: '자동 평가 실패 — 수동 검토 필요',
};

const SYSTEM_PROMPT = `당신은 AI 에이전트 액션의 위험도를 평가하는 시스템입니다.
반드시 아래 JSON 형식만 출력하세요 — 다른 텍스트 없이:
{"riskLevel":"LOW"|"MEDIUM"|"HIGH","reason":"한두 문장 이유"}

위험도 기준:
- HIGH: 외부 채널 즉시 발행, 예산 집행, 되돌릴 수 없는 외부 액션
- MEDIUM: 외부 채널 예약/임시저장, 알림 전송, 부분 되돌리기 가능
- LOW: 내부 초안, 보고서, 아카이브, 읽기 전용 작업`;

export async function scoreRisk(action: GovernorAction): Promise<ScoreResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const userMessage = `액션 kind: ${action.kind}\npayload: ${JSON.stringify(action.payload).slice(0, 500)}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }, { signal: AbortSignal.timeout(10_000) });

    const text = response.content.find((b) => b.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text) as { riskLevel: string; reason: string };

    if (!['LOW', 'MEDIUM', 'HIGH'].includes(parsed.riskLevel)) return FALLBACK;
    return { riskLevel: parsed.riskLevel as GovernorRiskLevel, reason: parsed.reason };
  } catch {
    return FALLBACK;
  }
}
