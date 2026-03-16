import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getLLMProvider } from '@/lib/env';

const QUOTA_MARKERS = ['할당량', 'quota', 'resource_exhausted', 'retry in'];
const SKIPPED_MARKER = '자동 생략되었습니다';

function getTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isQuotaRelated(content: string) {
  const normalized = content.toLowerCase();
  return QUOTA_MARKERS.some((marker) => normalized.includes(marker));
}

function getDailyLimit() {
  const raw = process.env.GEMINI_DAILY_LIMIT || '';
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return 20;
}

export async function GET() {
  const provider = getLLMProvider();
  if (provider !== 'gemini') {
    return NextResponse.json({
      available: false,
      reason: 'LLM_PROVIDER_NOT_GEMINI',
      message: `현재 LLM_PROVIDER가 ${provider}라 Gemini 요청 예측치를 사용하지 않습니다.`
    });
  }

  try {
    const startOfDay = getTodayStart();
    const turns = await prisma.meetingTurn.findMany({
      where: {
        createdAt: {
          gte: startOfDay
        }
      },
      select: {
        runId: true,
        content: true
      }
    });

    const runMap = new Map<string, { nonSkippedTurns: number; quotaDetected: boolean }>();

    for (const turn of turns) {
      const current = runMap.get(turn.runId) || { nonSkippedTurns: 0, quotaDetected: false };
      if (!turn.content.includes(SKIPPED_MARKER)) {
        current.nonSkippedTurns += 1;
      }
      if (isQuotaRelated(turn.content)) {
        current.quotaDetected = true;
      }
      runMap.set(turn.runId, current);
    }

    let estimatedUsed = 0;
    let runsWithPostSteps = 0;
    for (const runStat of runMap.values()) {
      estimatedUsed += runStat.nonSkippedTurns;
      if (!runStat.quotaDetected) {
        runsWithPostSteps += 1;
      }
    }

    estimatedUsed += runsWithPostSteps * 2;

    const dailyLimit = getDailyLimit();
    const estimatedRemaining = Math.max(0, dailyLimit - estimatedUsed);
    const usageRatePct = Number(((Math.min(estimatedUsed, dailyLimit) / dailyLimit) * 100).toFixed(1));

    return NextResponse.json({
      available: true,
      provider: 'gemini',
      estimatedUsed,
      dailyLimit,
      estimatedRemaining,
      usageRatePct,
      basedOnRuns: runMap.size,
      checkedAt: new Date().toISOString(),
      note: '실제 API 콘솔 값이 아닌, 오늘 생성된 회의 로그 기반 예측치입니다.'
    });
  } catch (error) {
    return NextResponse.json({
      available: false,
      reason: 'GEMINI_USAGE_ESTIMATION_FAILED',
      message: error instanceof Error ? error.message : '요청 예측치를 계산하지 못했습니다.'
    });
  }
}
