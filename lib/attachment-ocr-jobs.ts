import crypto from 'node:crypto';

type OcrJobState = 'queued' | 'processing' | 'completed' | 'failed';

export type OcrJob = {
  id: string;
  status: OcrJobState;
  name: string;
  mimeType: string;
  sourceType: 'IMAGE';
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  content?: string;
  note?: string;
  error?: string;
};

type OcrJobStore = Map<string, OcrJob>;

function getStore(): OcrJobStore {
  const g = globalThis as unknown as { __aimd_ocr_jobs__?: OcrJobStore };
  if (!g.__aimd_ocr_jobs__) {
    g.__aimd_ocr_jobs__ = new Map<string, OcrJob>();
  }
  return g.__aimd_ocr_jobs__;
}

export function getOcrJob(id: string) {
  return getStore().get(id);
}

function updateJob(id: string, patch: Partial<OcrJob>) {
  const store = getStore();
  const current = store.get(id);
  if (!current) return;
  store.set(id, {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  });
}

export function createOcrJob(params: {
  name: string;
  mimeType: string;
  maxAttempts?: number;
  run: (attempt: number) => Promise<{ content: string; note?: string }>;
}) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const maxAttempts = Math.max(1, Math.min(3, Number(params.maxAttempts) || 2));
  const job: OcrJob = {
    id,
    status: 'queued',
    name: params.name,
    mimeType: params.mimeType,
    sourceType: 'IMAGE',
    attempts: 0,
    maxAttempts,
    createdAt: now,
    updatedAt: now
  };
  const store = getStore();
  store.set(id, job);

  void (async () => {
    let lastError = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      updateJob(id, { status: 'processing', attempts: attempt, error: undefined });
      try {
        const result = await params.run(attempt);
        updateJob(id, {
          status: 'completed',
          attempts: attempt,
          content: result.content,
          note: result.note
        });
        setTimeout(() => store.delete(id), 60 * 60 * 1000);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'OCR 처리 실패';
      }
    }

    updateJob(id, {
      status: 'failed',
      error: lastError || 'OCR 처리에 실패했습니다.'
    });
    setTimeout(() => store.delete(id), 30 * 60 * 1000);
  })();

  return job;
}
