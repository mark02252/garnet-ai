import { NextResponse } from 'next/server';
import { getOcrJob } from '@/lib/attachment-ocr-jobs';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getOcrJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: 'OCR 작업을 찾을 수 없습니다.' }, { status: 404 });
  }

  if (job.status === 'completed') {
    return NextResponse.json({
      ok: true,
      status: 'completed',
      name: job.name,
      mimeType: job.mimeType,
      sourceType: job.sourceType,
      content: job.content || '',
      note: job.note,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts
    });
  }

  if (job.status === 'failed') {
    return NextResponse.json(
      {
        ok: false,
        status: 'failed',
        error: job.error || 'OCR 작업이 실패했습니다.',
        attempts: job.attempts,
        maxAttempts: job.maxAttempts
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    note: `OCR 처리 중 (${job.attempts}/${job.maxAttempts})`
  });
}
