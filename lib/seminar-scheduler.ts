import { DeliverableType, MeetingRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { runMarketingMeeting } from '@/lib/pipeline';
import {
  beginSeminarRound,
  claimDueSeminarSessions,
  completeSeminarRound,
  getSeminarRounds,
  getSeminarSession,
  releaseSeminarSessionProcessing,
  resetStaleSeminarLocks,
  touchSeminarSession,
  upsertSeminarFinalReport
} from '@/lib/seminar-storage';
import {
  buildStructuredSeminarFinalReportText,
  type StructuredSeminarFinalReport
} from '@/lib/report-visuals';
import type { MeetingExecutionOptions, RuntimeConfig } from '@/lib/types';

declare global {
  // eslint-disable-next-line no-var
  var seminarSchedulerState:
    | {
        started: boolean;
        timer: NodeJS.Timeout | null;
        ticking: boolean;
      }
    | undefined;
}

const DEFAULT_TICK_MS = 45_000;

function getTickMs() {
  const parsed = Number(process.env.SEMINAR_TICK_MS || '');
  if (Number.isFinite(parsed) && parsed >= 5000) return parsed;
  return DEFAULT_TICK_MS;
}

function summarizeDeliverable(type: DeliverableType, raw: string) {
  try {
    const parsed = JSON.parse(raw) as {
      campaignName?: string;
      objective?: string;
      coreMessage?: string;
      nextActions?: string[];
    };
    const actions = (parsed.nextActions || []).slice(0, 2).join(' / ');
    return [
      `산출물: ${type}`,
      parsed.campaignName ? `캠페인: ${parsed.campaignName}` : '',
      parsed.objective ? `목표: ${parsed.objective}` : '',
      parsed.coreMessage ? `메시지: ${parsed.coreMessage}` : '',
      actions ? `즉시 액션: ${actions}` : ''
    ]
      .filter(Boolean)
      .join('\n');
  } catch {
    return `산출물: ${type}`;
  }
}

async function buildRoundSummary(runId: string, roundNumber: number) {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      deliverable: true,
      meetingTurns: {
        where: { role: MeetingRole.PM },
        orderBy: { createdAt: 'desc' },
        take: 1
      },
      memoryLog: true
    }
  });
  if (!run) return `라운드 ${roundNumber}: 실행 요약 생성 실패`;

  const pm = run.meetingTurns[0]?.content
    ?.split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' / ');

  const deliverableSummary = run.deliverable
    ? summarizeDeliverable(run.deliverable.type, run.deliverable.content)
    : '산출물 없음';

  const memoryLine = run.memoryLog
    ? `메모리 방향: ${run.memoryLog.direction.slice(0, 120)}`
    : '메모리 로그 없음';

  return [
    `라운드 ${roundNumber}`,
    pm ? `PM 결정: ${pm}` : 'PM 결정: 확인 필요',
    deliverableSummary,
    memoryLine
  ].join('\n');
}

async function buildMorningBriefing(sessionId: string, topic: string, completedRounds: number) {
  const rounds = await getSeminarRounds(sessionId);
  const doneRounds = rounds.filter((round) => round.status === 'DONE').sort((a, b) => a.roundNumber - b.roundNumber);
  const highlights = doneRounds
    .slice(-4)
    .map((round) => `- R${round.roundNumber}: ${(round.summary || '').replace(/\s+/g, ' ').slice(0, 220)}`)
    .join('\n');

  const latest = doneRounds[doneRounds.length - 1];
  return [
    '[올나잇 세미나 아침 브리핑]',
    `주제: ${topic}`,
    `완료 라운드: ${completedRounds}회`,
    '',
    '핵심 인사이트',
    highlights || '- 핵심 인사이트 수집 전',
    '',
    '오늘 즉시 실행 항목',
    '1. 최신 라운드 산출물 기준으로 채널별 실행 담당자 확정',
    '2. KPI 대시보드 기준선(기존 성과) 업데이트',
    '3. 48시간 후 점검 회의에서 가설 유지/폐기 의사결정',
    '',
    latest?.summary ? `최종 라운드 결론 요약\n${latest.summary.slice(0, 500)}` : '최종 라운드 결론: 아직 없음'
  ].join('\n');
}

function parseTags(raw: string | null | undefined) {
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function parseDeliverableMeta(raw: string | null | undefined) {
  if (!raw) return { campaignName: '', objective: '', nextActions: [] as string[] };
  try {
    const parsed = JSON.parse(raw) as {
      campaignName?: string;
      objective?: string;
      nextActions?: unknown;
    };
    const nextActions = Array.isArray(parsed.nextActions)
      ? parsed.nextActions.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    return {
      campaignName: String(parsed.campaignName || '').trim(),
      objective: String(parsed.objective || '').trim(),
      nextActions
    };
  } catch {
    return { campaignName: '', objective: '', nextActions: [] as string[] };
  }
}

function topEntriesFromMap(counter: Map<string, number>, limit: number) {
  return Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function buildFallbackActionItems() {
  return [
    { title: '최신 라운드 산출물 기준으로 실행 우선순위 재정렬', priority: 'NOW', source: 'fallback' },
    { title: 'KPI 기준선 업데이트 후 48시간 재점검', priority: 'NEXT', source: 'fallback' },
    { title: '보류 가설 폐기/유지 의사결정', priority: 'LATER', source: 'fallback' }
  ] as StructuredSeminarFinalReport['actions'];
}

function buildEmptyStructuredReport(input: {
  sessionName: string;
  topic: string;
  operationWindow: string;
  maxRounds: number;
  intervalMinutes: number;
  debateCycles: number;
  message: string;
}) {
  const structured: StructuredSeminarFinalReport = {
    schemaVersion: '2026-03-13',
    sessionName: input.sessionName,
    topic: input.topic,
    operationWindow: input.operationWindow,
    completedRounds: 0,
    maxRounds: input.maxRounds,
    completedRoundsLabel: `0/${input.maxRounds}`,
    intervalMinutes: input.intervalMinutes,
    debateCycles: input.debateCycles,
    summaryHeadline: input.message,
    strategy: [{ label: '최종 전략 방향', value: input.message }],
    deliverableMix: [],
    topTags: [],
    topSources: [],
    actions: buildFallbackActionItems(),
    roundLogs: [],
    totalSourceReferences: 0,
    totalUniqueSources: 0,
    totalUniqueTags: 0,
    totalDeliverableTypes: 0
  };

  return {
    structured,
    content: buildStructuredSeminarFinalReportText(structured)
  };
}

async function buildSessionFinalReport(sessionId: string) {
  const [session, rounds] = await Promise.all([getSeminarSession(sessionId), getSeminarRounds(sessionId)]);
  if (!session) {
    return buildEmptyStructuredReport({
      sessionName: '세션 정보 없음',
      topic: '세션 정보를 찾을 수 없습니다.',
      operationWindow: '운영 정보 없음',
      maxRounds: 1,
      intervalMinutes: 60,
      debateCycles: 1,
      message: '세션 정보를 찾을 수 없습니다.'
    });
  }

  const doneRounds = rounds.filter((round) => round.status === 'DONE').sort((a, b) => a.roundNumber - b.roundNumber);
  const runIds = doneRounds.map((round) => round.runId).filter((id): id is string => Boolean(id));
  const debateCycles = Math.max(1, Math.min(3, Math.floor(Number(session.runtimeConfig?.seminarDebateCycles ?? 1) || 1)));
  const operationWindow = `${new Date(session.startsAt).toLocaleString('ko-KR')} ~ ${new Date(session.endsAt).toLocaleString('ko-KR')}`;
  if (runIds.length === 0) {
    return buildEmptyStructuredReport({
      sessionName: session.title || session.topic,
      topic: session.topic,
      operationWindow,
      maxRounds: session.maxRounds,
      intervalMinutes: session.intervalMinutes,
      debateCycles,
      message: '완료된 실행 라운드가 없어 통합 분석을 생성하지 못했습니다.'
    });
  }

  const runs = await prisma.run.findMany({
    where: { id: { in: runIds } },
    include: {
      deliverable: true,
      memoryLog: true,
      webSources: true,
      meetingTurns: {
        where: { role: MeetingRole.PM },
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  });
  const runMap = new Map(runs.map((run) => [run.id, run]));

  const deliverableCounter = new Map<string, number>();
  const tagCounter = new Map<string, number>();
  const sourceCounter = new Map<string, { title: string; count: number }>();
  const roundLogs: StructuredSeminarFinalReport['roundLogs'] = [];

  for (const round of doneRounds) {
    if (!round.runId) {
      roundLogs.push({
        roundNumber: round.roundNumber,
        pmSummary: round.summary || '라운드 데이터 없음',
        deliverableType: 'NONE',
        objective: '',
        campaignName: '',
        direction: '',
        expectedImpact: '',
        risks: '',
        actions: [],
        tags: []
      });
      continue;
    }
    const run = runMap.get(round.runId);
    if (!run) {
      roundLogs.push({
        roundNumber: round.roundNumber,
        pmSummary: round.summary || '실행 결과를 찾지 못했습니다.',
        deliverableType: 'NONE',
        objective: '',
        campaignName: '',
        direction: '',
        expectedImpact: '',
        risks: '',
        actions: [],
        tags: []
      });
      continue;
    }

    const pmLine = run.meetingTurns[0]?.content
      ?.split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(' / ');
    const deliverableType = run.deliverable?.type || 'NONE';
    const deliverableMeta = parseDeliverableMeta(run.deliverable?.content);
    const tags = parseTags(run.memoryLog?.tags);

    deliverableCounter.set(deliverableType, (deliverableCounter.get(deliverableType) || 0) + 1);
    for (const tag of tags) {
      tagCounter.set(tag, (tagCounter.get(tag) || 0) + 1);
    }
    for (const source of run.webSources) {
      const current = sourceCounter.get(source.url);
      if (current) {
        sourceCounter.set(source.url, { ...current, count: current.count + 1 });
      } else {
        sourceCounter.set(source.url, { title: source.title, count: 1 });
      }
    }

    roundLogs.push({
      roundNumber: round.roundNumber,
      pmSummary: pmLine || 'PM 요약 없음',
      deliverableType,
      objective: deliverableMeta.objective,
      campaignName: deliverableMeta.campaignName,
      direction: run.memoryLog?.direction || '',
      expectedImpact: run.memoryLog?.expectedImpact || '',
      risks: run.memoryLog?.risks || '',
      actions: deliverableMeta.nextActions.slice(0, 4),
      tags: tags.slice(0, 4)
    });
  }

  const latestRound = doneRounds[doneRounds.length - 1];
  const latestRun = latestRound?.runId ? runMap.get(latestRound.runId) : null;
  const latestMeta = parseDeliverableMeta(latestRun?.deliverable?.content);
  const latestMemory = latestRun?.memoryLog;

  const deliverableMixLines =
    topEntriesFromMap(deliverableCounter, 5).map(([key, count]) => ({ label: key, count })) || [];
  const topTagLines = topEntriesFromMap(tagCounter, 8).map(([tag, count]) => ({ label: tag, count }));
  const topSourceLines = Array.from(sourceCounter.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([url, info]) => ({
      title: info.title.slice(0, 80),
      url,
      count: info.count
    }));

  const actionTitles = latestMeta.nextActions.length
    ? latestMeta.nextActions.slice(0, 6)
    : buildFallbackActionItems().map((item) => item.title);
  const actions = actionTitles.map((title, idx) => ({
    title,
    priority: idx < 2 ? 'NOW' : idx < 4 ? 'NEXT' : 'LATER',
    source: latestMeta.nextActions.length ? 'latest-deliverable' : 'fallback'
  })) as StructuredSeminarFinalReport['actions'];

  const structured: StructuredSeminarFinalReport = {
    schemaVersion: '2026-03-13',
    sessionName: session.title || session.topic,
    topic: session.topic,
    operationWindow,
    completedRounds: doneRounds.length,
    maxRounds: session.maxRounds,
    completedRoundsLabel: `${doneRounds.length}/${session.maxRounds}`,
    intervalMinutes: session.intervalMinutes,
    debateCycles,
    summaryHeadline:
      latestMemory?.direction ||
      latestMeta.objective ||
      latestRound?.summary?.replace(/\s+/g, ' ').slice(0, 140) ||
      '전략 요약 데이터 없음',
    strategy: [
      { label: '최종 전략 방향', value: latestMemory?.direction || '요약 데이터 없음' },
      { label: '최종 가설', value: latestMemory?.hypothesis || '요약 데이터 없음' },
      { label: '예상 KPI 영향', value: latestMemory?.expectedImpact || '요약 데이터 없음' },
      { label: '주요 리스크', value: latestMemory?.risks || '요약 데이터 없음' }
    ],
    deliverableMix: deliverableMixLines,
    topTags: topTagLines,
    topSources: topSourceLines,
    actions,
    roundLogs,
    totalSourceReferences: Array.from(sourceCounter.values()).reduce((sum, item) => sum + item.count, 0),
    totalUniqueSources: sourceCounter.size,
    totalUniqueTags: tagCounter.size,
    totalDeliverableTypes: deliverableCounter.size
  };

  return {
    structured,
    content: buildStructuredSeminarFinalReportText(structured)
  };
}

export async function ensureSeminarFinalReport(sessionId: string) {
  const finalReport = await buildSessionFinalReport(sessionId);
  await upsertSeminarFinalReport(sessionId, finalReport.content, finalReport.structured);
  return finalReport.content;
}

async function buildAndStoreSessionFinalArtifacts(sessionId: string, topic: string, completedRounds: number) {
  const briefing = await buildMorningBriefing(sessionId, topic, completedRounds);
  await ensureSeminarFinalReport(sessionId);
  return briefing;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return '세미나 라운드 실행 중 알 수 없는 오류가 발생했습니다.';
}

function looksFatal(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('키가 없습니다') ||
    normalized.includes('api key') ||
    normalized.includes('required') ||
    normalized.includes('unauthorized') ||
    normalized.includes('invalid')
  );
}

async function runSingleSessionRound(sessionId: string) {
  const session = await getSeminarSession(sessionId);
  if (!session) return;

  const now = new Date();
  const endsAt = new Date(session.endsAt);
  const shouldCompleteBeforeRun = session.completedRounds >= session.maxRounds || now.getTime() > endsAt.getTime();
  if (shouldCompleteBeforeRun) {
    const briefing = await buildAndStoreSessionFinalArtifacts(session.id, session.topic, session.completedRounds);
    await touchSeminarSession(session.id, {
      status: 'COMPLETED',
      nextRunAt: null,
      morningBriefing: briefing,
      lastRunAt: now,
      lastError: null
    });
    return;
  }

  const roundNumber = session.completedRounds + 1;
  const roundId = await beginSeminarRound({
    sessionId: session.id,
    roundNumber,
    scheduledAt: session.nextRunAt ? new Date(session.nextRunAt) : now
  });

  try {
    const recentRounds = (await getSeminarRounds(session.id))
      .filter((round) => round.status === 'DONE')
      .sort((a, b) => a.roundNumber - b.roundNumber)
      .slice(-3);

    const contextBlock =
      recentRounds.length > 0
        ? `\n\n[이전 라운드 요약]\n${recentRounds
            .map((round) => `R${round.roundNumber}: ${(round.summary || '').replace(/\s+/g, ' ').slice(0, 220)}`)
            .join('\n')}`
        : '';

    const runtimeConfig = (session.runtimeConfig || undefined) as RuntimeConfig | undefined;
    const seminarDebateCycles = Math.max(
      1,
      Math.min(3, Math.floor(Number(runtimeConfig?.seminarDebateCycles ?? 1) || 1))
    );
    const executionOptions: MeetingExecutionOptions = { mode: 'deliberation', reviewCycles: seminarDebateCycles };
    const runId = await runMarketingMeeting(
      {
        topic: `${session.topic}\n\n[올나잇 세미나 라운드 ${roundNumber}]${contextBlock}`,
        brand: session.brand || undefined,
        region: session.region || undefined,
        goal: session.goal || undefined,
        domainAgentPoolConfig: runtimeConfig?.domainAgentPoolConfig,
        businessContext: runtimeConfig?.businessContext,
        agentExecution: runtimeConfig?.agentExecution
      },
      runtimeConfig,
      executionOptions
    );

    const summary = await buildRoundSummary(runId, roundNumber);
    await completeSeminarRound({
      roundId,
      status: 'DONE',
      runId,
      summary
    });

    const completedRounds = roundNumber;
    const nextRunAt = new Date(now.getTime() + session.intervalMinutes * 60 * 1000);
    const shouldComplete = completedRounds >= session.maxRounds || nextRunAt.getTime() > endsAt.getTime();

    if (shouldComplete) {
      const briefing = await buildAndStoreSessionFinalArtifacts(session.id, session.topic, completedRounds);
      await touchSeminarSession(session.id, {
        status: 'COMPLETED',
        completedRounds,
        nextRunAt: null,
        lastRunAt: now,
        morningBriefing: briefing,
        lastError: null
      });
    } else {
      await touchSeminarSession(session.id, {
        status: 'RUNNING',
        completedRounds,
        nextRunAt,
        lastRunAt: now,
        lastError: null
      });
    }
  } catch (error) {
    const message = toErrorMessage(error);
    await completeSeminarRound({
      roundId,
      status: 'FAILED',
      error: message
    });

    const fatal = looksFatal(message);
    const completedRounds = roundNumber;
    if (fatal) {
      await touchSeminarSession(session.id, {
        status: 'FAILED',
        completedRounds,
        nextRunAt: null,
        lastRunAt: now,
        lastError: message
      });
    } else {
      const nextRunAt = new Date(now.getTime() + session.intervalMinutes * 60 * 1000);
      const shouldComplete = completedRounds >= session.maxRounds || nextRunAt.getTime() > endsAt.getTime();
      if (shouldComplete) {
        const briefing = await buildAndStoreSessionFinalArtifacts(session.id, session.topic, completedRounds);
        await touchSeminarSession(session.id, {
          status: 'COMPLETED',
          completedRounds,
          nextRunAt: null,
          lastRunAt: now,
          morningBriefing: briefing,
          lastError: message
        });
      } else {
        await touchSeminarSession(session.id, {
          status: 'RUNNING',
          completedRounds,
          nextRunAt,
          lastRunAt: now,
          lastError: message
        });
      }
    }
  } finally {
    await releaseSeminarSessionProcessing(session.id);
  }
}

export async function runSeminarSchedulerTick() {
  if (!global.seminarSchedulerState) {
    global.seminarSchedulerState = {
      started: false,
      timer: null,
      ticking: false
    };
  }
  if (global.seminarSchedulerState.ticking) return;

  global.seminarSchedulerState.ticking = true;
  try {
    await resetStaleSeminarLocks();
    const dueSessionIds = await claimDueSeminarSessions(new Date(), 4);
    for (const sessionId of dueSessionIds) {
      await runSingleSessionRound(sessionId);
    }
  } finally {
    global.seminarSchedulerState.ticking = false;
  }
}

export function startSeminarScheduler() {
  if (!global.seminarSchedulerState) {
    global.seminarSchedulerState = {
      started: false,
      timer: null,
      ticking: false
    };
  }
  if (global.seminarSchedulerState.started) return;

  const tickMs = getTickMs();
  global.seminarSchedulerState.timer = setInterval(() => {
    void runSeminarSchedulerTick();
  }, tickMs);
  global.seminarSchedulerState.started = true;
  void runSeminarSchedulerTick();
}
