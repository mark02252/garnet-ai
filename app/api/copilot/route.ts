import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runLLM } from '@/lib/llm';

const schema = z.object({
  message: z.string().min(1),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());

    const historyText = (body.history || [])
      .map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
      .join('\n');

    const prompt = historyText
      ? `이전 대화:\n${historyText}\n\n사용자: ${body.message}`
      : body.message;

    const reply = await runLLM(
      `당신은 Garnet AI 마케팅 코파일럿입니다. 마케팅 전략, 캠페인 분석, 콘텐츠 제안, 성과 분석 등을 도와줍니다.
한국어로 간결하고 실행 가능한 답변을 제공하세요.
가능하면 구체적인 액션 아이템을 제시하세요.`,
      prompt,
      0.7,
      1500
    );

    return NextResponse.json({ reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Copilot error';
    return NextResponse.json({ reply: `오류: ${message}` }, { status: 500 });
  }
}
