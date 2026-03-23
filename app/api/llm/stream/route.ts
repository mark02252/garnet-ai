import { z } from 'zod';
import { streamLLM } from '@/lib/llm';

const bodySchema = z.object({
  systemPrompt: z.string().min(1),
  userPrompt: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.35),
  maxTokens: z.number().min(1).max(16000).default(2400),
  runtime: z
    .object({
      llmProvider: z.string().optional(),
      openaiApiKey: z.string().optional(),
      openaiModel: z.string().optional(),
      geminiApiKey: z.string().optional(),
      geminiModel: z.string().optional(),
      groqApiKey: z.string().optional(),
      groqModel: z.string().optional(),
      anthropicApiKey: z.string().optional(),
      anthropicModel: z.string().optional()
    })
    .optional()
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamLLM(
            body.systemPrompt,
            body.userPrompt,
            body.temperature,
            body.maxTokens,
            body.runtime as Record<string, string> | undefined
          )) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Stream failed';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
