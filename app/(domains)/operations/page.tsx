import Link from 'next/link';
import { ApprovalActionList } from '@/components/approval-action-list';
import { CollapsibleSection } from '@/components/collapsible-section';
import { NotionPublishButton } from '@/components/notion-publish-button';
import { SlackNotifyButton } from '@/components/slack-notify-button';
import { PageSectionTabs } from '@/components/page-section-tabs';
import { RecommendationsPanel } from '@/components/recommendations-panel';
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
  if (type === 'run') return 'bg-[var(--accent-soft)] text-[var(--accent)]';
  if (type === 'seminar') return 'bg-emerald-100 text-emerald-700';
  if (type === 'dataset') return 'bg-violet-100 text-violet-700';
  if (type === 'learning') return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
}

function reachSummary(direction: 'UP' | 'DOWN' | 'FLAT' | null | undefined) {
  if (direction === 'UP') return { label: '상승 추세', tone: 'text-emerald-700' };
  if (direction === 'DOWN') return { label: '하락 추세', tone: 'text-rose-700' };
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
    campaignRooms
  ] = await Promise.all([
    prisma.run.count(),
    prisma.run.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.deliverable.count(),
    prisma.run.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        deliverable: { select: { id: true, type: true } },
        memoryLog: { select: { tags: true } },
        _count: { select: { attachments: true, webSources: true } }
      }
    }),
    prisma.dataset.count(),
    prisma.dataset.count({ where: { analysis: { not: null } } }),
    prisma.dataset.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: { id: true, name: true, type: true, analysis: true, updatedAt: true }
    }),
    prisma.learningArchive.count(),
    prisma.learningArchive.count({ where: { status: 'CONFIRMED' } }),
    prisma.learningArchive.count({ where: { status: 'DRAFT' } }),
    prisma.learningArchive.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 6,
      include: { run: { select: { id: true, topic: true } } }
    }),
    prisma.learningArchive.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 160,
      select: { tags: true }
    }),
    prisma.memoryLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 160,
      select: { tags: true }
    }),
    listSeminarSessions(12),
    prisma.instagramReachAnalysisRun.findFirst({ orderBy: { createdAt: 'desc' } }),
    getCampaignRooms(4)
  ]);

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

  return (
    <div className="space-y-5">
      {/* ── Hero ── */}
      <section className="dashboard-hero">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <p className="dashboard-eyebrow">Morning Briefing</p>
            <h1 className="dashboard-title">오늘의 브리핑</h1>
            <p className="dashboard-copy">전체 실행 흐름과 지금 당장 처리할 일을 한 화면에서 파악합니다.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link href="/campaigns" className="button-primary">캠페인 스튜디오</Link>
              <Link href="/seminar" className="button-secondary">세미나 스튜디오</Link>
              <Link href="/history" className="button-secondary">실행 아카이브</Link>
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
            <PageSectionTabs
              items={[
                { label: '상태 요약', href: '#overview' },
                { label: '빠른 질문', href: '#questions' },
                { label: '캠페인', href: '#campaigns' },
                { label: '타임라인', href: '#timeline' },
                { label: '추천 액션', href: '#recommendations' }
              ]}
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="accent-pill">#{leadSignal}</span>
              <span className="pill-option">즉시 대응 {priorities.length || 1}건</span>
              <span className="pill-option">승인 대기 {approvalQueue.length}건</span>
            </div>
          </div>

          {/* Assistant summary panel */}
          <div className="soft-card">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">오늘 포인트</p>
              <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
            </div>
            <p className="mt-3 text-base font-semibold leading-7 text-[var(--text-strong)]">
              실행 결과를 회수하고 다음 액션으로 넘기는 속도가 중요합니다.
            </p>
            <div className="mt-4 space-y-2">
              {assistantSummary.slice(0, 2).map((line) => (
                <div key={line} className="soft-panel">
                  <p className="text-sm leading-6 text-[var(--text-base)]">{line}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── KPI Tiles ── */}
      <section id="overview" className="scroll-mt-24">
        <CollapsibleSection title="상태 요약" defaultOpen={true}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="metric-card" style={{ borderTop: '4px solid #f43f5e' }}>
              <p className="metric-label">즉시 대응</p>
              <p className="metric-value">{priorities.length || 1}건</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">오늘 바로 열어봐야 할 우선순위</p>
            </div>
            <div className="metric-card" style={{ borderTop: '4px solid #f59e0b' }}>
              <p className="metric-label">승인 대기</p>
              <p className="metric-value">{approvalQueue.length}건</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">보고서, 플레이북, 분석 전환 대기</p>
            </div>
            <div className="metric-card" style={{ borderTop: '4px solid var(--accent)' }}>
              <p className="metric-label">진행 중 흐름</p>
              <p className="metric-value">{activeSeminars.length + Math.min(reportBacklog, 3)}개</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">실행 후 아직 마무리되지 않은 트랙</p>
            </div>
            <div className="metric-card" style={{ borderTop: '4px solid #10b981' }}>
              <p className="metric-label">누적 플레이북</p>
              <p className="metric-value">{confirmedLearning}개</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">바로 재사용 가능한 확정 자산</p>
            </div>
          </div>
        </CollapsibleSection>
      </section>

      {/* ── Quick Commands ── */}
      <section id="questions" className="scroll-mt-24">
        <CollapsibleSection title="바로 열기" defaultOpen={true}>
          <p className="mb-3 text-sm text-[var(--text-muted)]">자주 보는 흐름만 빠르게 이동합니다.</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {quickCommandCards.map((item) => (
              <Link key={item.title} href={item.href} className="list-card block">
                <span className="inline-flex rounded-full bg-[var(--surface-sub)] border border-[var(--surface-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
                  {item.tag}
                </span>
                <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-strong)]">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{item.description}</p>
              </Link>
            ))}
          </div>
        </CollapsibleSection>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.28fr)_340px]">
        <div className="space-y-5">
          {/* ── Today's Priorities ── */}
          <section id="campaigns" className="scroll-mt-24">
            <CollapsibleSection title="오늘 먼저 볼 일" defaultOpen={true} badge={<span className="accent-pill">{priorities.length || 1} items</span>}>
              {priorities.length === 0 ? (
                <div className="soft-card" style={{ borderLeft: '4px solid #10b981' }}>
                  <strong className="text-emerald-700">긴급 병목은 크지 않습니다.</strong>
                  <p className="mt-1 text-sm text-[var(--text-base)]">오늘은 최신 실행을 보고서와 플레이북으로 정리하는 자산화 작업에 집중해도 좋습니다.</p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {priorities.map((item, i) => {
                    const priorityColors = ['#f43f5e', '#f59e0b', 'var(--accent)', '#6366f1'];
                    const borderColor = priorityColors[i % priorityColors.length];
                    return (
                      <Link key={item.title} href={item.href} className="list-card block" style={{ borderLeft: `4px solid ${borderColor}` }}>
                        <span
                          className="inline-flex rounded-full px-3 py-1 text-[11px] font-semibold"
                          style={{ backgroundColor: `${borderColor}20`, color: borderColor }}
                        >
                          {item.tag}
                        </span>
                        <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-strong)]">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{item.description}</p>
                        <span className="mt-4 inline-flex rounded-full bg-[var(--accent-soft)] border border-[rgba(49,130,246,0.18)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
                          {item.cta}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CollapsibleSection>
          </section>

          {/* ── Campaign Rooms ── */}
          <section id="timeline" className="scroll-mt-24">
            <CollapsibleSection title="지금 관리 중인 캠페인 흐름" defaultOpen={true} trailing={<Link href="/campaigns" className="button-secondary">전체 캠페인 룸 보기</Link>}>
              <div className="grid gap-3 md:grid-cols-2">
                {campaignRooms.map((room) => (
                  <article key={room.id} className="list-card">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          room.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-700'
                            : room.status === 'NEEDS_REVIEW'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-[var(--accent-soft)] text-[var(--accent)]'
                        }`}
                      >
                        {room.statusLabel}
                      </span>
                      <span className="pill-option">{room.approvals.length} approvals</span>
                    </div>
                    <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-strong)]">{room.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{room.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="pill-option">브리프 {room.counts.briefs}</span>
                      <span className="pill-option">보고서 {room.counts.reports}</span>
                      <span className="pill-option">플레이북 {room.counts.playbooks}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={room.primaryHref} className="button-secondary px-3 py-2 text-xs">최신 흐름</Link>
                      <Link href="/campaigns" className="button-secondary px-3 py-2 text-xs">캠페인 룸</Link>
                    </div>
                  </article>
                ))}
              </div>
            </CollapsibleSection>
          </section>

          {/* ── Approval Inbox ── */}
          <CollapsibleSection title="승인 대기함" defaultOpen={true} badge={<span className="accent-pill">{approvalQueue.length} approvals</span>}>
            <ApprovalActionList
              items={approvalQueue}
              showRoomTitle
              emptyMessage="지금은 승인 대기 항목이 많지 않습니다. 다음 브리프를 시작하거나, 이번 주 데이터를 더 깊게 읽어도 좋습니다."
            />
          </CollapsibleSection>

          {/* ── Focus Board ── */}
          <CollapsibleSection title="지금 집중 중인 흐름" defaultOpen={false} trailing={<Link href="/history" className="button-secondary">전체 실행 보기</Link>}>
            <div className="grid gap-3 md:grid-cols-2">
              {focusBoard.map((item) => (
                <Link key={`${item.eyebrow}-${item.title}`} href={item.href} className="list-card block">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{item.eyebrow}</p>
                  <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-strong)]">{item.title}</p>
                  <p className="mt-2 text-xs font-medium text-[var(--text-muted)]">{item.status}</p>
                  <p className="mt-3 line-clamp-4 text-sm leading-6 text-[var(--text-base)]">{item.note}</p>
                  <span className="mt-4 inline-flex rounded-full bg-[var(--surface-sub)] border border-[var(--surface-border)] px-3 py-1 text-xs font-semibold text-[var(--text-base)]">
                    {item.cta}
                  </span>
                </Link>
              ))}
            </div>
          </CollapsibleSection>

          {/* ── Coverage Board ── */}
          <CollapsibleSection title="운영 자산화 진행률" defaultOpen={false} trailing={<Link href="/learning" className="button-secondary">플레이북 보기</Link>}>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                { label: '보고서 연결률', value: deliverableCoverage, helper: `${deliverableCount}/${totalRuns} runs` },
                { label: '세미나 완료율', value: seminarCoverage, helper: `${completedSeminars.length}/${sessions.length} sessions` },
                { label: '데이터 분석률', value: datasetCoverage, helper: `${analyzedDatasets}/${totalDatasets} datasets` },
                { label: '플레이북 확정률', value: learningCoverage, helper: `${confirmedLearning}/${totalLearning} cards` }
              ].map((item) => (
                <div key={item.label} className="soft-panel">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--text-strong)]">{item.label}</p>
                    <span className="pill-option">{item.value}%</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-[var(--surface-border)]">
                    <div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(6, item.value)}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">{item.helper}</p>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* ── Recent Flow / Timeline ── */}
          <CollapsibleSection title="최근 운영 흐름" defaultOpen={false} badge={<span className="pill-option">{timeline.length} events</span>}>
            <div className="grid gap-3">
              {timeline.map((item) => (
                <Link key={item.id} href={item.href} className="list-card block">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${timelineTone(item.type)}`}>
                        {timelineBadge(item.type)}
                      </span>
                      <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-strong)]">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{item.meta}</p>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">{formatDate(item.at)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </CollapsibleSection>
        </div>

        {/* ── Right Sidebar ── */}
        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          {/* Decision Rail */}
          <CollapsibleSection title="오늘의 결정 메모" defaultOpen={false}>
            <div className="surface-note">
              <strong>핵심 키워드:</strong> #{leadSignal}
              <br />
              지금 가장 먼저 해야 할 일은 실행 결과를 다음 액션과 자산으로 이어붙이는 것입니다.
            </div>
            <div className="mt-3 grid gap-3">
              <div className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">추천 1</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">세미나와 캠페인 스튜디오를 바로 연결하세요</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">토론이 끝난 세션부터 실행 브리프와 보고서로 넘겨야 전략이 사라지지 않습니다.</p>
              </div>
              <div className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">추천 2</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">검증된 답변을 플레이북으로 확정하세요</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">재사용 패턴이 쌓일수록 사내 대응 속도와 일관성이 함께 올라갑니다.</p>
              </div>
              <div className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">추천 3</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">데이터 해석을 회의 안건으로 올리세요</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">분석 대기 데이터는 인사이트가 붙는 순간 전략 회의의 질을 크게 높여줍니다.</p>
              </div>
            </div>
          </CollapsibleSection>

          {/* Signal Tags */}
          <CollapsibleSection title="반복되는 질문과 신호" defaultOpen={false}>
            {topSignals.length === 0 ? (
              <div className="soft-panel text-sm text-[var(--text-muted)]">아직 반복 신호가 충분하지 않습니다.</div>
            ) : (
              <div className="space-y-3">
                {topSignals.map(([tag, count]) => (
                  <div key={tag} className="soft-panel">
                    <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-base)]">
                      <span>#{tag}</span>
                      <span>{count}회</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--surface-border)]">
                      <div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(10, Math.min(100, count * 10))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Latest Assets */}
          <CollapsibleSection title="방금 업데이트된 자산" defaultOpen={false}>
            <div className="space-y-3">
              {latestSeminar && (
                <Link
                  href={latestSeminar.status === 'COMPLETED' ? `/seminar/sessions/${latestSeminar.id}/report` : '/seminar'}
                  className="list-card block"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Simulation</p>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${seminarTone(latestSeminar.status)}`}>
                      {seminarLabel(latestSeminar.status)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-strong)]">{latestSeminar.title || latestSeminar.topic}</p>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">{formatDate(latestSeminar.lastRunAt || latestSeminar.updatedAt)}</p>
                </Link>
              )}
              {latestRun && (
                <Link href={`/runs/${latestRun.id}`} className="list-card block">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Brief</p>
                  <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-strong)]">{latestRun.topic}</p>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">{formatDate(latestRun.createdAt)}</p>
                </Link>
              )}
              {latestDataset && (
                <Link href="/datasets" className="list-card block">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Data</p>
                  <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-strong)]">{latestDataset.name}</p>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">{formatDate(latestDataset.updatedAt)}</p>
                </Link>
              )}
              {latestKnowledge && (
                <Link href="/learning" className="list-card block">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Playbook</p>
                  <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-strong)]">{latestKnowledge.situation}</p>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">{formatDate(latestKnowledge.updatedAt)}</p>
                </Link>
              )}
              {latestReachAnalysis && (
                <Link href="/datasets" className="list-card block">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Performance</p>
                  <p className={`mt-3 text-sm font-semibold leading-6 ${reachSignal.tone}`}>{latestReachAnalysis.accountId}</p>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    {reachSignal.label} · {formatDate(latestReachAnalysis.createdAt)}
                  </p>
                </Link>
              )}
            </div>
          </CollapsibleSection>

          {/* Failed Sessions */}
          {failedSeminars.length > 0 && (
            <CollapsibleSection title="확인 필요한 세션" defaultOpen={true}>
              <div className="space-y-3">
                {failedSeminars.slice(0, 3).map((session) => (
                  <Link key={session.id} href="/seminar" className="list-card block">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text-strong)]">{session.title || session.topic}</p>
                      <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">실패</span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">{session.lastError || '오류 원인을 확인해 주세요.'}</p>
                  </Link>
                ))}
              </div>
            </CollapsibleSection>
          )}
        </aside>
      </div>

      {/* ── Recommendations ── */}
      <section id="recommendations" className="mt-6">
        <h2 className="text-base font-bold text-[var(--text-strong)] mb-3">추천 액션</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">KPI 달성률, 승인 대기, 캠페인 상태를 종합 분석한 다음 행동 추천입니다.</p>
        <RecommendationsPanel />
      </section>
    </div>
  );
}
