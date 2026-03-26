import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    hasVideoGeneration: Boolean(process.env.FAL_KEY),
    provider: process.env.FAL_KEY ? 'LTX-2.3 (Fal.ai)' : 'Script only',
  });
}
