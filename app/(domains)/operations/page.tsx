import Link from 'next/link';
import { PageTransition } from '@/components/page-transition';
import { ApprovalActionList } from '@/components/approval-action-list';
import { CollapsibleSection } from '@/components/collapsible-section';
import { NotionPublishButton } from '@/components/notion-publish-button';
import { SlackNotifyButton } from '@/components/slack-notify-button';
import { RecommendationsPanel } from '@/components/recommendations-panel';
import { GarnetGemLazy } from '@/components/garnet-gem-lazy';
import { getCampaignRooms } from '@/lib/campaign-rooms';
import { prisma } from '@/lib/prisma';
import { listSeminarSessions, type SeminarSession } from '@/lib/seminar-storage';

export const dynamic = 'force-dynamic';

type TimelineItem = {
  id: string;
  type: 'run' | 'seminar' | 'dataset' | 'learning' | 'reach';
  title: string;
  meta: string;
  href: string;
  at: string;
};

function safeParseTags(raw: string | null | undefined) {
  try {
    return JSON.parse(raw || '[]') as string[];
  } catch {
    return [];
  }
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return '기록 없음';
  try {
    const date = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(date);
  } catch {
    return typeof value === 'string' ? value : value.toISOString();
  }
}

function percentage(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function seminarTone(status: SeminarSession['status']) {
  if (status === 'RUNNING') return 'bg-[var(--status-active-bg)] text-[var(--status-active)]';
  if (status === 'COMPLETED') return 'bg-[var(--status-completed-bg)] text-[var(--status-completed)]';
  if (status === 'PLANNED') return 'bg-[var(--status-paused-bg)] text-[var(--status-paused)]';
  if (status === 'FAILED') return 'bg-[var(--status-failed-bg)] text-[var(--status-failed)]';
  return 'bg-[var(--status-draft-bg)] text-[var(--status-draft)]';
}

function seminarLabel(status: SeminarSession['status']) {
  if (status === 'RUNNING') return '진행 중';
  if (status === 'COMPLETED') return '완료';
  if (status === 'PLANNED') return '예약됨';
  if (status === 'FAILED') return '실패';
  return '중지됨';
}

function timelineBadge(type: TimelineItem['type']) {
  if (type === 'run') return '브리프';
  if (type === 'seminar') return '전략 시뮬레이션';
  if (type === 'dataset') return '데이터';
  if (type === 'learning') return '플레이북';
  return '성과 신호';
}

function timelineTone(type: TimelineItem['type']) {
  if (type === 'run') return 'bg-[var(--accent-soft)] text-[var(--accent-text)]';
  if (type === 'seminar') return 'bg-emerald-900/40 text-emerald-300';
  if (type === 'dataset') return 'bg-violet-900/40 text-violet-300';
  if (type === 'learning') return 'bg-amber-900/40 text-amber-300';
  return 'bg-rose-900/40 text-rose-300';
}

function reachSummary(direction: 'UP' | 'DOWN' | 'FLAT' | null | undefined) {
  if (direction === 'UP') return { label: '상승 추세', tone: 'text-emerald-400' };
  if (direction === 'DOWN') return { label: '하락 추세', tone: 'text-rose-400' };
  return { label: '보합 추세', tone: 'text-[#7aaccc]' };
}

export default async function OperationsPage() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalRuns,
    recentRunCount,
    deliverableCount,
    recentRuns,
    totalDatasets,
    analyzedDatasets,
    recentDatasets,
    totalLearning,
    confirmedLearning,
    draftLearning,
    recentLearning,
    learningTagRows,
    memoryTagRows,
    sessions,
    latestReachAnalysis,
  ] = await Promise.all([
    prisma.run.count().catch(() => 0),
    prisma.run.count({ where: { createdAt: { gte: sevenDaysAgo } } }).catch(() => 0),
    prisma.deliverable.count().catch(() => 0),
    prisma.run.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        deliverable: { select: { id: true, type: true } },
        memoryLog: { select: { tags: true } },
        _count: { select: { attachments: true, webSources: true } }
      }
    }).catch(() => []),
    prisma.dataset.count().catch(() => 0),
    prisma.dataset.count({ where: { analysis: { not: null } } }).catch(() => 0),
    prisma.dataset.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: { id: true, name: true, type: true, analysis: true, updatedAt: true }
    }).catch(() => []),
    prisma.learningArchive.count().catch(() => 0),
    prisma.learningArchive.count({ where: { status: 'CONFIRMED' } }).catch(() => 0),
    prisma.learningArchive.count({ where: { status: 'DRAFT' } }).catch(() => 0),
    prisma.learningArchive.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 6,
      include: { run: { select: { id: true, topic: true } } }
    }).catch(() => []),
    prisma.learningArchive.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 40,
      select: { tags: true }
    }).catch(() => []),
    prisma.memoryLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { tags: true }
    }).catch(() => []),
    listSeminarSessions(12).catch(() => []),
    prisma.instagramReachAnalysisRun.findFirst({ orderBy: { createdAt: 'desc' } }).catch(() => null),
  ]);

  const campaignRooms = await getCampaignRooms(4).catch(() => []);

  const activeSeminars = sessions.filter((session) => session.status === 'RUNNING' || session.status === 'PLANNED');
  const runningSeminars = sessions.filter((session) => session.status === 'RUNNING');
  const completedSeminars = sessions.filter((session) => session.status === 'COMPLETED');
  const failedSeminars = sessions.filter((session) => session.status === 'FAILED');
  const latestSeminar = sessions[0] || null;
  const latestRun = recentRuns[0] || null;
  const latestDataset = recentDatasets[0] || null;
  const latestKnowledge = recentLearning[0] || null;
  const datasetBacklog = Math.max(0, totalDatasets - analyzedDatasets);
  const reportBacklog = recentRuns.filter((run) => !run.deliverable).length;
  const deliverableCoverage = percentage(deliverableCount, totalRuns);
  const datasetCoverage = percentage(analyzedDatasets, totalDatasets);
  const learningCoverage = percentage(confirmedLearning, totalLearning);
  const seminarCoverage = percentage(completedSeminars.length, sessions.length);
  const reachSignal = reachSummary(latestReachAnalysis?.trendDirection);

  const tagMap = new Map<string, number>();
  for (const row of learningTagRows) {
    for (const tag of safeParseTags(row.tags)) {
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
    }
  }
  for (const row of memoryTagRows) {
    for (const tag of safeParseTags(row.tags)) {
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
    }
  }
  const topSignals = [...tagMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const leadSignal = topSignals[0]?.[0] || '실행 자산화';
  const approvalQueue = campaignRooms
    .flatMap((room) =>
      room.approvals.map((approval) => ({
        id: `${room.id}-${approval.actionKind}-${approval.targetId}`,
        roomTitle: room.title,
        label: approval.label,
        description: approval.description,
        href: approval.href,
        actionKind: approval.actionKind,
        targetId: approval.targetId,
        actionLabel: approval.actionLabel
      }))
    )
    .slice(0, 6);

  const priorities = [
    runningSeminars.length > 0
      ? {
          tag: '지금 확인',
          title: `${runningSeminars.length}개의 전략 시뮬레이션이 진행 중입니다`,
          description: '토론 라운드가 쌓이는 동안 최신 브리핑을 확인하고, 어느 시점에 결론을 회수할지 판단해 주세요.',
          href: '/seminar',
          cta: '세미나 보기'
        }
      : null,
    latestReachAnalysis?.trendDirection === 'DOWN'
      ? {
          tag: '성과 경고',
          title: '도달 추세가 하락 중인 채널이 있습니다',
          description: '최근 리치 분석을 바탕으로 메시지, 소재, 타이밍을 다시 점검하는 안건을 우선 올리는 편이 좋습니다.',
          href: '/datasets',
          cta: '성과 신호 보기'
        }
      : null,
    reportBacklog > 0
      ? {
          tag: '자산화',
          title: `최근 실행 ${reportBacklog}건이 아직 보고서로 정리되지 않았습니다`,
          description: '좋은 회의 결과가 흩어지지 않도록 실행 상세를 보고서와 플레이북으로 연결하는 루프를 이어가는 것이 중요합니다.',
          href: '/history',
          cta: '실행 아카이브 열기'
        }
      : null,
    draftLearning > 0
      ? {
          tag: '검토 필요',
          title: `확정 대기 중인 플레이북 후보가 ${draftLearning}개 있습니다`,
          description: '반복된 좋은 응답 패턴을 확정 카드로 바꾸면 팀 전체의 응답 품질과 속도가 같이 올라갑니다.',
          href: '/learning',
          cta: '플레이북 검토'
        }
      : null
  ].filter(Boolean) as Array<{ tag: string; title: string; description: string; href: string; cta: string }>;

  const quickCommandCards = [
    {
      tag: '리스크',
      title: '이번 주 가장 시급한 리스크 보여줘',
      description: '하락 신호와 승인 대기를 함께 묶어 봅니다.',
      href: '/operations'
    },
    {
      tag: '성과',
      title: '도달 하락 원인을 정리해줘',
      description: '채널과 메시지 우선 점검 지점을 빠르게 확인합니다.',
      href: '/datasets'
    },
    {
      tag: '세미나',
      title: '세미나 결과를 실행안으로 바꿔줘',
      description: '토론 결과를 액션과 보고서 흐름으로 넘깁니다.',
      href: '/seminar'
    },
    {
      tag: '플레이북',
      title: '반복되는 응답 패턴을 플레이북으로 묶어줘',
      description: '반복 패턴을 재사용 자산으로 정리합니다.',
      href: '/learning'
    }
  ];

  const focusBoard = [
    latestRun
      ? {
          eyebrow: '브리프 트랙',
          title: latestRun.topic,
          status: latestRun.brand || '브랜드 미입력',
          note: latestRun.goal || `웹 근거 ${latestRun._count.webSources}개와 첨부 ${latestRun._count.attachments}개가 연결된 최신 실행입니다.`,
          href: `/runs/${latestRun.id}`,
          cta: '전략 이어보기'
        }
      : null,
    latestSeminar
      ? {
          eyebrow: '전략 시뮬레이션',
          title: latestSeminar.title || latestSeminar.topic,
          status: `${seminarLabel(latestSeminar.status)} · ${latestSeminar.completedRounds}/${latestSeminar.maxRounds} rounds`,
          note: latestSeminar.morningBriefing || '자동 토론으로 전략 방향을 수렴 중인 세션입니다.',
          href: latestSeminar.status === 'COMPLETED' ? `/seminar/sessions/${latestSeminar.id}/report` : '/seminar',
          cta: '세션 열기'
        }
      : null,
    latestReachAnalysis
      ? {
          eyebrow: '성과 신호',
          title: `${latestReachAnalysis.accountId} 리치 흐름`,
          status: `${latestReachAnalysis.days}일 기준 ${reachSignal.label}`,
          note: latestReachAnalysis.summary,
          href: '/datasets',
          cta: '데이터 보기'
        }
      : null,
    latestKnowledge
      ? {
          eyebrow: '플레이북',
          title: latestKnowledge.situation,
          status: `${latestKnowledge.status} · ${latestKnowledge.run?.topic || latestKnowledge.sourceType}`,
          note: latestKnowledge.recommendedResponse,
          href: '/learning',
          cta: '플레이북 열기'
        }
      : null
  ].filter(Boolean) as Array<{ eyebrow: string; title: string; status: string; note: string; href: string; cta: string }>;

  const assistantSummary = [
    runningSeminars.length > 0
      ? `현재 ${runningSeminars.length}개의 자동 세미나가 진행 중이므로, 오늘은 토론 결과를 회수할 타이밍을 먼저 잡는 것이 좋습니다.`
      : `최근 7일 동안 ${recentRunCount}개의 전략 회의가 실행됐고, 지금은 실행 결과를 자산화하는 속도를 높이는 단계에 가깝습니다.`,
    latestReachAnalysis
      ? `최신 성과 신호는 ${reachSignal.label}이며, 데이터 쪽에서는 ${datasetBacklog}개의 분석 대기 항목이 남아 있습니다.`
      : `아직 연결된 성과 분석 기록은 많지 않지만, 데이터 스튜디오에 쌓인 ${datasetBacklog}개의 후보를 먼저 읽기 시작하면 좋습니다.`,
    draftLearning > 0
      ? `${draftLearning}개의 플레이북 후보가 검토를 기다리고 있어, 이번 주에는 팀 노하우를 확정 자산으로 전환하는 작업도 함께 가져가는 편이 좋습니다.`
      : `학습 카드 검토 병목은 크지 않아서, 이번에는 실행과 보고서 품질 쪽에 더 집중해도 괜찮습니다.`
  ];

  const timeline: TimelineItem[] = [
    ...recentRuns.map((run) => ({
      id: `run-${run.id}`,
      type: 'run' as const,
      title: run.topic,
      meta: `${run.brand || '브랜드 미입력'} · 웹 근거 ${run._count.webSources}개 · 산출물 ${
        run.deliverable ? '연결됨' : '미연결'
      }`,
      href: `/runs/${run.id}`,
      at: run.createdAt.toISOString()
    })),
    ...sessions.slice(0, 5).map((session) => ({
      id: `seminar-${session.id}`,
      type: 'seminar' as const,
      title: session.title || session.topic,
      meta: `${seminarLabel(session.status)} · ${session.completedRounds}/${session.maxRounds} rounds`,
      href: session.status === 'COMPLETED' ? `/seminar/sessions/${session.id}/report` : '/seminar',
      at: session.lastRunAt || session.updatedAt
    })),
    ...recentDatasets.map((dataset) => ({
      id: `dataset-${dataset.id}`,
      type: 'dataset' as const,
      title: dataset.name,
      meta: `${dataset.type} · ${dataset.analysis ? 'AI 분석 완료' : '분석 대기'}`,
      href: '/datasets',
      at: dataset.updatedAt.toISOString()
    })),
    ...recentLearning.map((item) => ({
      id: `learning-${item.id}`,
      type: 'learning' as const,
      title: item.situation,
      meta: `${item.status} · ${item.run?.topic || item.sourceType}`,
      href: '/learning',
      at: item.updatedAt.toISOString()
    })),
    ...(latestReachAnalysis
      ? [
          {
            id: `reach-${latestReachAnalysis.id}`,
            type: 'reach' as const,
            title: `${latestReachAnalysis.accountId} 도달 분석`,
            meta: `${latestReachAnalysis.days}일 구간 · ${reachSignal.label}`,
            href: '/datasets',
            at: latestReachAnalysis.createdAt.toISOString()
          }
        ]
      : [])
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 10);

  const briefingContent = [
    `[오늘의 브리핑 — ${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}]`,
    '',
    `■ 실행 현황`,
    `• 전체 실행: ${totalRuns}건 (최근 7일 ${recentRunCount}건)`,
    `• 보고서 연결률: ${deliverableCoverage}% (${deliverableCount}/${totalRuns})`,
    runningSeminars.length > 0 ? `• 진행 중 세미나: ${runningSeminars.length}개` : null,
    '',
    `■ 성과 신호`,
    latestReachAnalysis
      ? `• ${latestReachAnalysis.accountId}: ${reachSignal.label} (${latestReachAnalysis.days}일 기준)`
      : '• 성과 신호 데이터 없음',
    latestReachAnalysis?.summary ? `  ${latestReachAnalysis.summary}` : null,
    '',
    `■ 자산화 현황`,
    `• 데이터 분석률: ${datasetCoverage}% (${analyzedDatasets}/${totalDatasets})`,
    `• 플레이북 확정률: ${learningCoverage}% (${confirmedLearning}/${totalLearning})`,
    draftLearning > 0 ? `• 검토 대기 플레이북: ${draftLearning}개` : null,
    '',
    priorities.length > 0
      ? [`■ 오늘 먼저 볼 일`, ...priorities.map(p => `• [${p.tag}] ${p.title}`)].join('\n')
      : '■ 긴급 병목 없음 — 자산화 작업에 집중해도 좋습니다.',
    '',
    leadSignal ? `■ 주요 신호 태그: #${leadSignal}` : null
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const dateLabel = new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const coverageItems = [
    { label: '보고서 연결', value: deliverableCoverage, raw: `${deliverableCount}/${totalRuns}` },
    { label: '세미나 완료', value: seminarCoverage, raw: `${completedSeminars.length}/${sessions.length}` },
    { label: '데이터 분석', value: datasetCoverage, raw: `${analyzedDatasets}/${totalDatasets}` },
    { label: '플레이북 확정', value: learningCoverage, raw: `${confirmedLearning}/${totalLearning}` },
  ];

  const priorityColors = ['#f43f5e', '#f59e0b', 'var(--accent)', '#6366f1'];

  return (
    <PageTransition>
    <div className="space-y-3">

      {/* ═══ ZONE 1 — Header Bar ═══ */}
      <header className="ops-zone relative overflow-hidden">
        <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden sm:block">
          <GarnetGemLazy size={0.8} className="h-20 w-20 opacity-80" />
        </div>
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between relative z-10">
          <div className="min-w-0">
            <p className="ops-zone-label">Garnet Operations</p>
            <h1 className="mt-1 text-lg font-bold tracking-tight text-[var(--text-strong)]">{dateLabel}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/campaigns" className="button-primary px-3 py-2 text-xs">캠페인</Link>
            <Link href="/seminar" className="button-secondary px-3 py-2 text-xs">세미나</Link>
            <Link href="/history" className="button-secondary px-3 py-2 text-xs">아카이브</Link>
            <NotionPublishButton
              title={`오늘의 브리핑 — ${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}`}
              content={briefingContent}
              contentType="briefing"
            />
            <SlackNotifyButton
              title={`오늘의 브리핑 — ${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}`}
              content={briefingContent}
              emoji="📋"
            />
          </div>
        </div>
      </header>

      {/* ═══ ZONE 2 — KPI Strip ═══ */}
      <div className="ops-kpi-grid">
        <div className="ops-kpi-cell" style={{ '--kpi-accent': '#f43f5e' } as React.CSSProperties}>
          <p className="ops-kpi-val">{priorities.length || 1}</p>
          <p className="ops-kpi-label">즉시 대응</p>
          <p className="ops-kpi-sub">오늘 우선순위</p>
        </div>
        <div className="ops-kpi-cell" style={{ '--kpi-accent': '#f59e0b' } as React.CSSProperties}>
          <p className="ops-kpi-val">{approvalQueue.length}</p>
          <p className="ops-kpi-label">승인 대기</p>
          <p className="ops-kpi-sub">전환 대기 항목</p>
        </div>
        <div className="ops-kpi-cell">
          <p className="ops-kpi-val">{activeSeminars.length + Math.min(reportBacklog, 3)}</p>
          <p className="ops-kpi-label">진행 중</p>
          <p className="ops-kpi-sub">마무리 필요 트랙</p>
        </div>
        <div className="ops-kpi-cell" style={{ '--kpi-accent': '#10b981' } as React.CSSProperties}>
          <p className="ops-kpi-val">{confirmedLearning}</p>
          <p className="ops-kpi-label">확정 플레이북</p>
          <p className="ops-kpi-sub">재사용 자산</p>
        </div>
      </div>

      {/* ═══ ZONE 3 — Briefing ═══ */}
      <section className="ops-zone">
        <div className="ops-zone-head">
          <div className="flex items-center gap-2">
            <span className="ops-dot bg-[var(--accent)]" style={{ marginTop: 0 }} />
            <span className="ops-zone-label">Morning Briefing</span>
          </div>
          <span className="accent-pill">#{leadSignal}</span>
        </div>
        <div className="px-5 py-4">
          <p className="text-[15px] font-semibold leading-7 text-[var(--text-strong)]">
            실행 결과를 회수하고 다음 액션으로 넘기는 속도가 중요합니다.
          </p>
          <div className="mt-3 space-y-1.5">
            {assistantSummary.map((line) => (
              <p key={line} className="text-[13px] leading-6 text-[var(--text-base)]">{line}</p>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ ZONE 4 — Two-column workspace ═══ */}
      <div className="grid gap-3 xl:grid-cols-[1fr_300px]">

        {/* ── Main column ── */}
        <div className="space-y-3">

          {/* Priorities */}
          <section className="ops-zone" id="overview">
            <div className="ops-zone-head">
              <span className="ops-zone-label">오늘 먼저 볼 일</span>
              <span className="text-[10px] font-semibold tabular-nums text-[var(--text-disabled)]">{priorities.length} items</span>
            </div>
            <div className="ops-zone-body">
              {priorities.length === 0 ? (
                <div className="px-4 py-3">
                  <p className="text-[13px] text-emerald-400 font-semibold">긴급 병목 없음</p>
                  <p className="mt-1 text-[12px] text-[var(--text-muted)]">자산화 작업에 집중해도 좋습니다.</p>
                </div>
              ) : (
                priorities.map((item, i) => (
                  <Link key={item.title} href={item.href} className="ops-row">
                    <span className="ops-dot" style={{ backgroundColor: priorityColors[i % priorityColors.length] }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                          style={{ backgroundColor: `${priorityColors[i % priorityColors.length]}18`, color: priorityColors[i % priorityColors.length] }}
                        >
                          {item.tag}
                        </span>
                        <p className="truncate text-[13px] font-semibold text-[var(--text-strong)]">{item.title}</p>
                      </div>
                      <p className="mt-0.5 text-[12px] leading-5 text-[var(--text-muted)] line-clamp-1">{item.description}</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-[var(--accent-text)]">{item.cta}</span>
                  </Link>
                ))
              )}
            </div>
          </section>

          {/* Campaign Rooms */}
          <section className="ops-zone" id="campaigns">
            <div className="ops-zone-head">
              <span className="ops-zone-label">캠페인 흐름</span>
              <Link href="/campaigns" className="text-[10px] font-semibold text-[var(--accent-text)] hover:underline">전체 보기</Link>
            </div>
            <div className="grid gap-px bg-[var(--surface-border)] md:grid-cols-2">
              {campaignRooms.map((room) => (
                <article key={room.id} className="ops-campaign bg-[var(--surface)] rounded-none border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        room.status === 'ACTIVE'
                          ? 'bg-emerald-900/40 text-emerald-300'
                          : room.status === 'NEEDS_REVIEW'
                            ? 'bg-amber-900/40 text-amber-300'
                            : 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                      }`}
                    >
                      {room.statusLabel}
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px] tabular-nums text-[var(--text-disabled)]">
                      <span>{room.counts.briefs}B</span>
                      <span className="text-[var(--surface-border)]">/</span>
                      <span>{room.counts.reports}R</span>
                      <span className="text-[var(--surface-border)]">/</span>
                      <span>{room.counts.playbooks}P</span>
                    </div>
                  </div>
                  <p className="mt-2 text-[13px] font-semibold leading-5 text-[var(--text-strong)] line-clamp-1">{room.title}</p>
                  <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)] line-clamp-2">{room.summary}</p>
                  <div className="mt-2 flex gap-2">
                    <Link href={room.primaryHref} className="text-[10px] font-semibold text-[var(--accent-text)] hover:underline">최신 흐름</Link>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Approval Inbox */}
          <section className="ops-zone">
            <div className="ops-zone-head">
              <span className="ops-zone-label">승인 대기</span>
              <span className="text-[10px] font-semibold tabular-nums text-[var(--text-disabled)]">{approvalQueue.length}</span>
            </div>
            <div className="p-3">
              <ApprovalActionList
                items={approvalQueue}
                showRoomTitle
                compact
                emptyMessage="승인 대기 항목 없음 — 다음 브리프를 시작하거나 데이터를 읽어보세요."
              />
            </div>
          </section>

          {/* Focus Board */}
          <CollapsibleSection title="집중 트랙" defaultOpen={false} trailing={<Link href="/history" className="text-[10px] font-semibold text-[var(--accent-text)] hover:underline">전체 실행</Link>}>
            <div className="grid gap-px bg-[var(--surface-border)] rounded-lg overflow-hidden md:grid-cols-2">
              {focusBoard.map((item) => (
                <Link key={`${item.eyebrow}-${item.title}`} href={item.href} className="block bg-[var(--surface)] p-3 transition-colors hover:bg-[var(--surface-sub)]">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-disabled)]">{item.eyebrow}</p>
                  <p className="mt-1.5 text-[13px] font-semibold leading-5 text-[var(--text-strong)] line-clamp-1">{item.title}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{item.status}</p>
                  <p className="mt-1.5 text-[11px] leading-4 text-[var(--text-base)] line-clamp-2">{item.note}</p>
                </Link>
              ))}
            </div>
          </CollapsibleSection>

          {/* Timeline */}
          <section className="ops-zone" id="timeline">
            <div className="ops-zone-head">
              <span className="ops-zone-label">최근 활동</span>
              <span className="text-[10px] font-semibold tabular-nums text-[var(--text-disabled)]">{timeline.length} events</span>
            </div>
            <div className="ops-zone-body">
              {timeline.map((item) => (
                <Link key={item.id} href={item.href} className="ops-timeline-row">
                  <span className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${timelineTone(item.type)}`}>
                    {timelineBadge(item.type)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-[var(--text-strong)]">{item.title}</p>
                    <p className="truncate text-[11px] text-[var(--text-muted)]">{item.meta}</p>
                  </div>
                  <span className="whitespace-nowrap text-[10px] tabular-nums text-[var(--text-disabled)]">{formatDate(item.at)}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* ── Right sidebar ── */}
        <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start">

          {/* Coverage */}
          <div className="ops-zone">
            <div className="ops-zone-head">
              <span className="ops-zone-label">자산화 진행률</span>
              <Link href="/learning" className="text-[10px] font-semibold text-[var(--accent-text)] hover:underline">상세</Link>
            </div>
            <div className="px-4 py-3 space-y-3">
              {coverageItems.map((item) => (
                <div key={item.label}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-medium text-[var(--text-base)]">{item.label}</span>
                    <span className="text-[11px] font-bold tabular-nums text-[var(--text-strong)]">{item.value}%</span>
                  </div>
                  <div className="mt-1 ops-bar-track">
                    <div className="ops-bar-fill" style={{ width: `${Math.max(4, item.value)}%` }} />
                  </div>
                  <p className="mt-0.5 text-[9px] tabular-nums text-[var(--text-disabled)]">{item.raw}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Signals */}
          <div className="ops-zone">
            <div className="ops-zone-head">
              <span className="ops-zone-label">반복 신호</span>
            </div>
            <div className="px-4 py-3">
              {topSignals.length === 0 ? (
                <p className="text-[11px] text-[var(--text-muted)]">아직 반복 신호가 충분하지 않습니다.</p>
              ) : (
                <div className="space-y-2">
                  {topSignals.map(([tag, count]) => (
                    <div key={tag} className="ops-signal-row">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-[var(--text-base)]">#{tag}</span>
                          <span className="text-[10px] tabular-nums text-[var(--text-disabled)]">{count}</span>
                        </div>
                        <div className="mt-1 ops-bar-track">
                          <div className="ops-bar-fill" style={{ width: `${Math.max(8, Math.min(100, count * 12))}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Latest Assets */}
          <div className="ops-zone">
            <div className="ops-zone-head">
              <span className="ops-zone-label">최근 자산</span>
            </div>
            <div className="ops-zone-body">
              {latestSeminar && (
                <Link
                  href={latestSeminar.status === 'COMPLETED' ? `/seminar/sessions/${latestSeminar.id}/report` : '/seminar'}
                  className="ops-asset"
                >
                  <span className="ops-asset-type">SIM</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-[var(--text-strong)]">{latestSeminar.title || latestSeminar.topic}</p>
                    <p className="text-[10px] text-[var(--text-disabled)]">{formatDate(latestSeminar.lastRunAt || latestSeminar.updatedAt)}</p>
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${seminarTone(latestSeminar.status)}`}>
                    {seminarLabel(latestSeminar.status)}
                  </span>
                </Link>
              )}
              {latestRun && (
                <Link href={`/runs/${latestRun.id}`} className="ops-asset">
                  <span className="ops-asset-type">BRIEF</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-[var(--text-strong)]">{latestRun.topic}</p>
                    <p className="text-[10px] text-[var(--text-disabled)]">{formatDate(latestRun.createdAt)}</p>
                  </div>
                </Link>
              )}
              {latestDataset && (
                <Link href="/datasets" className="ops-asset">
                  <span className="ops-asset-type">DATA</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-[var(--text-strong)]">{latestDataset.name}</p>
                    <p className="text-[10px] text-[var(--text-disabled)]">{formatDate(latestDataset.updatedAt)}</p>
                  </div>
                </Link>
              )}
              {latestKnowledge && (
                <Link href="/learning" className="ops-asset">
                  <span className="ops-asset-type">PLAY</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-[var(--text-strong)]">{latestKnowledge.situation}</p>
                    <p className="text-[10px] text-[var(--text-disabled)]">{formatDate(latestKnowledge.updatedAt)}</p>
                  </div>
                </Link>
              )}
              {latestReachAnalysis && (
                <Link href="/datasets" className="ops-asset">
                  <span className="ops-asset-type">PERF</span>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[12px] font-medium ${reachSignal.tone}`}>{latestReachAnalysis.accountId}</p>
                    <p className="text-[10px] text-[var(--text-disabled)]">{reachSignal.label} · {formatDate(latestReachAnalysis.createdAt)}</p>
                  </div>
                </Link>
              )}
            </div>
          </div>

          {/* Failed Sessions */}
          {failedSeminars.length > 0 && (
            <div className="ops-zone">
              <div className="ops-zone-head">
                <span className="ops-zone-label text-rose-400">오류 세션</span>
                <span className="text-[10px] font-bold tabular-nums text-rose-400">{failedSeminars.length}</span>
              </div>
              <div className="ops-zone-body">
                {failedSeminars.slice(0, 3).map((session) => (
                  <Link key={session.id} href="/seminar" className="ops-row">
                    <span className="ops-dot bg-rose-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-[var(--text-strong)]">{session.title || session.topic}</p>
                      <p className="text-[10px] text-[var(--text-muted)] line-clamp-1">{session.lastError || '오류 원인을 확인해 주세요.'}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="ops-zone">
            <div className="ops-zone-head">
              <span className="ops-zone-label">빠른 질문</span>
            </div>
            <div className="ops-zone-body">
              {quickCommandCards.map((item) => (
                <Link key={item.title} href={item.href} className="ops-row">
                  <span className="ops-dot bg-[var(--accent)]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-[var(--text-strong)] line-clamp-1">{item.title}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{item.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* ═══ ZONE 5 — Recommendations ═══ */}
      <section className="ops-zone" id="recommendations">
        <div className="ops-zone-head">
          <span className="ops-zone-label">추천 액션</span>
          <span className="text-[10px] text-[var(--text-disabled)]">KPI · 승인 · 캠페인 종합 분석</span>
        </div>
        <div className="p-4">
          <RecommendationsPanel />
        </div>
      </section>
    </div>
    </PageTransition>
  );
}
