import { NextResponse } from 'next/server';
import { z } from 'zod';
import { executeJob, listJobs } from '@/lib/job-scheduler';

export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
}

const executeSchema = z.object({
  jobId: z.string().min(1),
  runtime: z.record(z.string()).optional()
});

export async function POST(req: Request) {
  try {
    const body = executeSchema.parse(await req.json());
    const result = await executeJob(body.jobId, body.runtime as Record<string, string> | undefined);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Job execution failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
