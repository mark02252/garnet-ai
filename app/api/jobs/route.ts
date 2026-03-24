import { NextResponse } from 'next/server';
import { z } from 'zod';
import { executeJobNow, getJobStatuses } from '@/lib/scheduler/engine';
import { initSchedulerSystem } from '@/lib/scheduler/init';

export async function GET() {
  try { await initSchedulerSystem(); } catch { /* init 실패해도 API는 응답 */ }
  const statuses = await getJobStatuses();
  return NextResponse.json({ jobs: statuses });
}

const executeSchema = z.object({
  jobId: z.string().min(1),
  runtime: z.record(z.string()).optional()
});

export async function POST(req: Request) {
  try {
    const body = executeSchema.parse(await req.json());
    const result = await executeJobNow(body.jobId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Job execution failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
