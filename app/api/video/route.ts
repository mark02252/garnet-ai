import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createVideoGeneration, listVideoGenerations } from '@/lib/video/generate';

export async function GET() {
  const videos = await listVideoGenerations();
  return NextResponse.json({ videos });
}

const createSchema = z.object({
  prompt: z.string().min(1),
  format: z.enum(['REELS_9_16', 'SHORTS_9_16', 'TIKTOK_9_16', 'SQUARE_1_1', 'LANDSCAPE_16_9']).optional(),
  platform: z.string().optional(),
  duration: z.number().optional(),
});

export async function POST(req: Request) {
  try {
    const body = createSchema.parse(await req.json());
    const result = await createVideoGeneration({
      prompt: body.prompt,
      format: body.format || 'REELS_9_16',
      platform: body.platform || 'instagram',
      duration: body.duration,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
