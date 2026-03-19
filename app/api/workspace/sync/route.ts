import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildSharedBootstrapPayload } from '@/lib/shared-sync/local-export';
import { syncAllToSupabase } from '@/lib/supabase/workspace-sync';
import { authenticateRequest, unauthorizedResponse } from '@/lib/supabase/auth-middleware';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  accessToken: z.string().min(1),
  limit: z.number().int().min(1).max(500).optional()
});

export async function POST(req: NextRequest) {
  try {
    // Verify authentication (anonymous allowed in dev / when Supabase not configured)
    const auth = await authenticateRequest(req);
    if (!auth.authenticated) {
      return unauthorizedResponse();
    }

    const body = bodySchema.parse(await req.json());

    const payload = await buildSharedBootstrapPayload(body.limit);

    const result = await syncAllToSupabase(
      body.organizationId,
      body.accessToken,
      body.userId,
      {
        runs: payload.runs,
        learningArchives: payload.learningArchives,
        approvalDecisions: payload.approvalDecisions,
        runProgress: payload.runProgress
      }
    );

    return NextResponse.json({
      ok: result.ok,
      syncedAt: new Date().toISOString(),
      counts: result.counts,
      errors: result.errors
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '동기화 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
