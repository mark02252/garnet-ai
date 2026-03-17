import { buildStepStates, getRunProgress, RUN_PROGRESS_STEPS } from '@/lib/run-progress';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 800;
const MAX_DURATION_MS = 15 * 60 * 1000; // 15분 타임아웃

function fallbackProgressFromArtifacts(params: {
  meetingTurnCount: number;
  hasDeliverable: boolean;
  hasMemory: boolean;
  webSourceCount: number;
}) {
  if (params.hasMemory) {
    return { status: 'COMPLETED' as const, stepKey: 'completed' as const, stepLabel: '회의 실행이 완료되었습니다.', progressPct: 100, message: undefined };
  }
  if (params.hasDeliverable) {
    return { status: 'RUNNING' as const, stepKey: 'memory' as const, stepLabel: '마케팅 메모리 로그 저장 중', progressPct: 88, message: undefined };
  }
  if (params.meetingTurnCount > 0) {
    const ratio = Math.max(0, Math.min(1, params.meetingTurnCount / 13));
    return { status: 'RUNNING' as const, stepKey: 'meeting' as const, stepLabel: '역할별 회의 시뮬레이션 중', progressPct: Math.max(35, Math.round(35 + ratio * 35)), message: undefined };
  }
  if (params.webSourceCount > 0) {
    return { status: 'RUNNING' as const, stepKey: 'meeting' as const, stepLabel: '역할별 회의 준비 중', progressPct: 30, message: undefined };
  }
  return { status: 'PENDING' as const, stepKey: 'web_research' as const, stepLabel: '웹 리서치 준비 중', progressPct: 10, message: undefined };
}

async function readProgress(id: string) {
  const run = await prisma.run.findUnique({
    where: { id },
    include: {
      _count: { select: { webSources: true, meetingTurns: true } },
      deliverable: { select: { id: true } },
      memoryLog: { select: { id: true } }
    }
  });

  if (!run) return null;

  const dbProgress = await getRunProgress(id);
  const progress = dbProgress
    ? {
        status: dbProgress.status,
        stepKey: dbProgress.stepKey,
        stepLabel: dbProgress.stepLabel,
        progressPct: Number(dbProgress.progressPct || 0),
        message: dbProgress.message || undefined,
        startedAt: dbProgress.startedAt,
        updatedAt: dbProgress.updatedAt,
        finishedAt: dbProgress.finishedAt
      }
    : fallbackProgressFromArtifacts({
        meetingTurnCount: run._count.meetingTurns,
        hasDeliverable: Boolean(run.deliverable),
        hasMemory: Boolean(run.memoryLog),
        webSourceCount: run._count.webSources
      });

  const steps = buildStepStates({
    status: progress.status,
    stepKey: progress.stepKey === 'completed' ? 'memory' : (progress.stepKey as 'web_research' | 'meeting' | 'deliverable' | 'memory')
  });

  return {
    runId: id,
    status: progress.status,
    stepKey: progress.stepKey,
    stepLabel: progress.stepLabel,
    progressPct: progress.progressPct,
    message: progress.message,
    steps,
    counts: {
      webSources: run._count.webSources,
      meetingTurns: run._count.meetingTurns,
      hasDeliverable: Boolean(run.deliverable),
      hasMemoryLog: Boolean(run.memoryLog)
    },
    startedAt: (progress as { startedAt?: string | null }).startedAt,
    updatedAt: (progress as { updatedAt?: string | null }).updatedAt,
    finishedAt: (progress as { finishedAt?: string | null }).finishedAt,
    stepCatalog: RUN_PROGRESS_STEPS
  };
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: unknown) {
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      async function tick() {
        try {
          const progress = await readProgress(id);
          if (!progress) {
            send({ error: '실행 기록을 찾을 수 없습니다.' });
            controller.close();
            return;
          }

          send(progress);

          const terminal = progress.status === 'COMPLETED' || progress.status === 'FAILED';
          const timedOut = Date.now() - startedAt > MAX_DURATION_MS;

          if (terminal || timedOut) {
            controller.close();
            return;
          }

          await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          await tick();
        } catch {
          try { controller.close(); } catch { /* already closed */ }
        }
      }

      await tick();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}
