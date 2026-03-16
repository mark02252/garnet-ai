import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function normalizeOpenAIError(error: unknown) {
  if (error && typeof error === 'object') {
    const e = error as { status?: number; code?: string; message?: string };
    if (e.status === 429 && e.code === 'insufficient_quota') {
      return 'OpenAI 할당량이 초과되었습니다. 결제/플랜 상태를 확인해 주세요.';
    }
    if (e.status === 401) {
      return 'OpenAI API 키가 유효하지 않습니다.';
    }
    if (e.status === 403) {
      return 'OpenAI API 권한이 부족합니다.';
    }
    if (e.message) return `OpenAI 오류: ${e.message}`;
  }
  return 'OpenAI 연결 오류가 발생했습니다.';
}

export async function runLLM(systemPrompt: string, userPrompt: string, temperature = 0.4) {
  try {
    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      temperature,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const output = response.output_text?.trim();
    if (!output) {
      throw new Error('LLM 응답이 비어 있습니다.');
    }

    return output;
  } catch (error) {
    throw new Error(normalizeOpenAIError(error));
  }
}
