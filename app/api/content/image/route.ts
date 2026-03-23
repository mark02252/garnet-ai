import { NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';

const bodySchema = z.object({
  prompt: z.string().min(1).max(4000),
  style: z.enum(['natural', 'vivid']).default('natural'),
  size: z.enum(['1024x1024', '1024x1792', '1792x1024']).default('1024x1024'),
  quality: z.enum(['standard', 'hd']).default('standard'),
  provider: z.enum(['openai', 'gemini']).default('openai')
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());

    if (body.provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }, { status: 400 });
      }

      const client = new OpenAI({ apiKey });
      const response = await client.images.generate({
        model: 'dall-e-3',
        prompt: body.prompt,
        n: 1,
        size: body.size,
        style: body.style,
        quality: body.quality
      });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) {
        return NextResponse.json({ error: '이미지 생성에 실패했습니다.' }, { status: 500 });
      }

      return NextResponse.json({
        url: imageUrl,
        revisedPrompt: response.data?.[0]?.revised_prompt,
        provider: 'openai',
        model: 'dall-e-3'
      });
    }

    if (body.provider === 'gemini') {
      // Gemini 이미지 생성은 기존 lib/sns/image-generator.ts 활용
      const { generateSlideImage } = await import('@/lib/sns/image-generator');
      const result = await generateSlideImage(body.prompt);
      return NextResponse.json({
        url: result.url,
        provider: 'gemini',
        model: 'gemini-2.5-flash-image'
      });
    }

    return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '이미지 생성 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
