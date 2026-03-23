import { NextResponse } from 'next/server';
import { computeRecommendations } from '@/lib/recommendations';

export async function GET() {
  try {
    const recommendations = await computeRecommendations();
    return NextResponse.json({ recommendations });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Recommendations failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
