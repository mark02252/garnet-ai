import {
  listApprovalDecisions,
  listApprovedDecisionKeys,
  type ApprovalActionKind
} from '@/lib/approval-actions';
import { prisma } from '@/lib/prisma';
import { parseStructuredDeliverable } from '@/lib/deliverable';
import { listSeminarSessions } from '@/lib/seminar-storage';

export type CampaignRoomStatus = 'ACTIVE' | 'NEEDS_REVIEW' | 'READY';

export type CampaignRoomApproval = {
  label: string;
  description: string;
  href: string;
  actionKind: ApprovalActionKind;
  targetId: string;
  actionLabel: string;
};

export type CampaignRoom = {
  id: string;
  title: string;
  brand: string;
  region: string;
  objective: string;
  summary: string;
  status: CampaignRoomStatus;
  statusLabel: string;
  latestActivityAt: string;
  latestActivityLabel: string;
  counts: {
    briefs: number;
    reports: number;
    simulations: number;
    playbooks: number;
  };
  completion: {
    reporting: number;
    playbook: number;
  };
  approvals: CampaignRoomApproval[];
  signalTags: string[];
  nextAction: string;
  primaryHref: string;
  reportHref?: string;
  seminarHref?: string;
};

export type CampaignRoomLinkedRun = {
  id: string;
  title: string;
  summary: string;
  href: string;
  reportHref?: string;
  hasReport: boolean;
  createdAt: string;
  createdAtLabel: string;
  attachmentCount: number;
  sourceCount: number;
  signalTags: string[];
};

export type CampaignRoomLinkedSession = {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  summary: string;
  href: string;
  updatedAt: string;
  updatedAtLabel: string;
  roundLabel: string;
};

export type CampaignRoomLinkedPlaybook = {
  id: string;
  title: string;
  status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';
  statusLabel: string;
  summary: string;
  href: string;
  updatedAt: string;
  updatedAtLabel: string;
  tags: string[];
};

export type CampaignRoomApprovalHistoryItem = {
  id: string;
  itemType: ApprovalActionKind;
  label: string;
  targetTitle: string;
  href: string;
  updatedAt: string;
  updatedAtLabel: string;
};

export type CampaignRoomTimelineItem = {
  id: string;
  type: 'run' | 'report' | 'seminar' | 'playbook' | 'approval';
  label: string;
  title: string;
  summary: string;
  href: string;
  at: string;
  atLabel: string;
};

export type CampaignRoomDetail = CampaignRoom & {
  linkedRuns: CampaignRoomLinkedRun[];
  linkedSessions: CampaignRoomLinkedSession[];
  linkedPlaybooks: CampaignRoomLinkedPlaybook[];
  approvalHistory: CampaignRoomApprovalHistoryItem[];
  timeline: CampaignRoomTimelineItem[];
};

type MutableCampaignRoom = CampaignRoom & {
  _latestTimestamp: number;
  _confirmedPlaybooks: number;
  _tagCounts: Map<string, number>;
};

function compactText(value: string | null | undefined, max = 120) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeKeyPart(value: string | null | undefined) {
  return String(value || '')
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value: string) {
  return normalizeKeyPart(value).replace(/\s+/g, '-').replace(/^-+|-+$/g, '') || 'campaign-room';
}

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

function clampPct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function buildCampaignTitle(input: {
  brand?: string | null;
  region?: string | null;
  goal?: string | null;
  topic?: string | null;
  campaignName?: string | null;
}) {
  const campaignName = compactText(input.campaignName, 52);
  if (campaignName) return campaignName;

  const brand = compactText(input.brand, 20);
  const region = compactText(input.region, 20);
  const descriptor = compactText(input.goal || input.topic, 40);
  return [brand, region, descriptor].filter(Boolean).join(' ') || '새 캠페인 룸';
}

function buildCampaignRoomId(input: {
  brand?: string | null;
  region?: string | null;
  goal?: string | null;
  topic?: string | null;
  campaignName?: string | null;
}) {
  return slugify(
    buildCampaignKey({
      brand: input.brand,
      region: input.region,
      goal: input.goal,
      topic: input.topic,
      campaignName: input.campaignName
    })
  );
}

function buildCampaignKey(input: {
  brand?: string | null;
  region?: string | null;
  goal?: string | null;
  topic?: string | null;
  campaignName?: string | null;
}) {
  const identity = [
    normalizeKeyPart(input.brand),
    normalizeKeyPart(input.region),
    normalizeKeyPart(input.goal || input.campaignName || input.topic)
  ]
    .filter(Boolean)
    .join('|');

  return identity || normalizeKeyPart(input.topic) || slugify(buildCampaignTitle(input));
}

function statusLabel(status: CampaignRoomStatus) {
  if (status === 'ACTIVE') return '지금 진행 중';
  if (status === 'NEEDS_REVIEW') return '검토 필요';
  return '안정 운영';
}

function learningStatusLabel(status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED') {
  if (status === 'CONFIRMED') return '확정됨';
  if (status === 'ARCHIVED') return '보관됨';
  return '검토 대기';
}

function seminarStatusLabel(status: string) {
  if (status === 'RUNNING') return '진행 중';
  if (status === 'COMPLETED') return '완료';
  if (status === 'PLANNED') return '예약됨';
  if (status === 'FAILED') return '실패';
  return '중지됨';
}

function addSignalTags(room: MutableCampaignRoom, tags: string[]) {
  for (const tag of tags) {
    const normalized = String(tag || '').trim();
    if (!normalized) continue;
    room._tagCounts.set(normalized, (room._tagCounts.get(normalized) || 0) + 1);
  }
}

function pushApproval(room: MutableCampaignRoom, approval: CampaignRoomApproval) {
  if (room.approvals.some((item) => item.label === approval.label && item.href === approval.href)) return;
  room.approvals.push(approval);
}

function ensureRoom(
  map: Map<string, MutableCampaignRoom>,
  input: {
    title: string;
    brand?: string | null;
    region?: string | null;
    objective?: string | null;
    summary?: string | null;
    href: string;
    activityAt: string | Date;
  }
) {
  const key = buildCampaignKey({
    brand: input.brand,
    region: input.region,
    goal: input.objective,
    topic: input.title,
    campaignName: input.title
  });
  const timestamp = new Date(input.activityAt).getTime();
  if (!map.has(key)) {
    map.set(key, {
      id: buildCampaignRoomId({
        brand: input.brand,
        region: input.region,
        goal: input.objective,
        topic: input.title,
        campaignName: input.title
      }),
      title: input.title || '새 캠페인 룸',
      brand: compactText(input.brand, 24) || '브랜드 미입력',
      region: compactText(input.region, 24) || '지역 미입력',
      objective: compactText(input.objective, 80) || '목표 정리 필요',
      summary: compactText(input.summary, 160) || '최근 실행과 토론 결과를 바탕으로 전략 방향을 정리 중입니다.',
      status: 'READY',
      statusLabel: statusLabel('READY'),
      latestActivityAt: typeof input.activityAt === 'string' ? input.activityAt : input.activityAt.toISOString(),
      latestActivityLabel: formatDate(input.activityAt),
      counts: { briefs: 0, reports: 0, simulations: 0, playbooks: 0 },
      completion: { reporting: 0, playbook: 0 },
      approvals: [],
      signalTags: [],
      nextAction: '다음 브리프와 데이터를 연결해 전략 흐름을 이어가세요.',
      primaryHref: input.href,
      _latestTimestamp: Number.isFinite(timestamp) ? timestamp : 0,
      _confirmedPlaybooks: 0,
      _tagCounts: new Map<string, number>()
    });
  }

  const room = map.get(key)!;
  if (Number.isFinite(timestamp) && timestamp >= room._latestTimestamp) {
    room._latestTimestamp = timestamp;
    room.latestActivityAt = typeof input.activityAt === 'string' ? input.activityAt : input.activityAt.toISOString();
    room.latestActivityLabel = formatDate(input.activityAt);
    room.primaryHref = input.href || room.primaryHref;
    room.summary = compactText(input.summary, 160) || room.summary;
    room.objective = compactText(input.objective, 80) || room.objective;
    room.title = compactText(input.title, 56) || room.title;
    room.brand = compactText(input.brand, 24) || room.brand;
    room.region = compactText(input.region, 24) || room.region;
  }
  return room;
}

function finalizeRoom(room: MutableCampaignRoom): CampaignRoom {
  const reportCoverage = clampPct(room.counts.reports, room.counts.briefs);
  const playbookCoverage = clampPct(room._confirmedPlaybooks, room.counts.playbooks);

  let status: CampaignRoomStatus = 'READY';
  if (room.counts.simulations > 0 || room.approvals.length > 0) {
    status = room.counts.simulations > 0 ? 'ACTIVE' : 'NEEDS_REVIEW';
  }

  let nextAction = '다음 브리프를 시작하고 성과 해석을 이 캠페인 룸으로 연결하세요.';
  if (room.counts.simulations > 0) {
    nextAction = '진행 중인 시뮬레이션 결과를 회수해 실행안과 보고서로 전환하세요.';
  } else if (room.counts.reports < room.counts.briefs) {
    nextAction = '최신 브리프를 보고서와 의사결정 메모로 정리해 자산화를 마무리하세요.';
  } else if (room.approvals.length > 0) {
    nextAction = '승인 대기 항목부터 정리해 플레이북과 보고서의 확정 속도를 높이세요.';
  } else if (room._confirmedPlaybooks < room.counts.playbooks) {
    nextAction = '검증된 답변 패턴을 플레이북으로 확정해 팀 공용 자산으로 전환하세요.';
  }

  const topTags = [...room._tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tag]) => tag);

  return {
    id: room.id,
    title: room.title,
    brand: room.brand,
    region: room.region,
    objective: room.objective,
    summary: room.summary,
    status,
    statusLabel: statusLabel(status),
    latestActivityAt: room.latestActivityAt,
    latestActivityLabel: room.latestActivityLabel,
    counts: room.counts,
    completion: {
      reporting: reportCoverage,
      playbook: playbookCoverage
    },
    approvals: room.approvals.slice(0, 4),
    signalTags: topTags,
    nextAction,
    primaryHref: room.primaryHref,
    reportHref: room.reportHref,
    seminarHref: room.seminarHref
  };
}

export async function getCampaignRooms(limit = 8) {
  const [runs, learningArchives, sessions, approvedDecisionKeys, manualRooms] = await Promise.all([
    prisma.run.findMany({
      orderBy: { createdAt: 'desc' },
      take: 72,
      include: {
        deliverable: { select: { id: true, type: true, content: true } },
        memoryLog: { select: { tags: true } },
        _count: { select: { attachments: true, webSources: true } }
      }
    }),
    prisma.learningArchive.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 120,
      include: {
        run: {
          select: {
            id: true,
            topic: true,
            brand: true,
            region: true,
            goal: true
          }
        }
      }
    }),
    listSeminarSessions(32),
    listApprovedDecisionKeys(['RUN_REPORT', 'SEMINAR_REPORT']),
    prisma.manualCampaignRoom.findMany({ orderBy: { createdAt: 'desc' }, take: 24 })
  ]);

  const rooms = new Map<string, MutableCampaignRoom>();

  for (const run of runs) {
    const structured = parseStructuredDeliverable(run.deliverable?.content);
    const room = ensureRoom(rooms, {
      title: buildCampaignTitle({
        brand: run.brand,
        region: run.region,
        goal: run.goal,
        topic: run.topic,
        campaignName: structured?.campaignName
      }),
      brand: run.brand,
      region: run.region,
      objective: structured?.objective || run.goal || run.topic,
      summary:
        structured?.executiveSummary?.[0] ||
        structured?.coreMessage ||
        run.goal ||
        `${run.topic} 실행에서 웹 근거 ${run._count.webSources}개와 첨부 ${run._count.attachments}개가 연결됐습니다.`,
      href: run.deliverable ? `/runs/${run.id}/report` : `/runs/${run.id}`,
      activityAt: run.createdAt
    });

    room.counts.briefs += 1;
    if (run.deliverable) {
      room.counts.reports += 1;
      room.reportHref = `/runs/${run.id}/report`;
      if (!approvedDecisionKeys.has(`RUN_REPORT:${run.id}`)) {
        pushApproval(room, {
          label: '보고서 확정',
          description: '최종 산출물을 검토하고 이 캠페인의 공유용 보고서로 확정합니다.',
          href: `/runs/${run.id}/report`,
          actionKind: 'RUN_REPORT',
          targetId: run.id,
          actionLabel: '보고서 확정'
        });
      }
    }

    addSignalTags(room, safeParseTags(run.memoryLog?.tags));
  }

  for (const session of sessions) {
    const room = ensureRoom(rooms, {
      title: buildCampaignTitle({
        brand: session.brand,
        region: session.region,
        goal: session.goal,
        topic: session.topic,
        campaignName: session.title
      }),
      brand: session.brand,
      region: session.region,
      objective: session.goal || session.topic,
      summary: session.morningBriefing || `${session.completedRounds}/${session.maxRounds} 라운드가 누적된 전략 시뮬레이션입니다.`,
      href: session.status === 'COMPLETED' ? `/seminar/sessions/${session.id}/report` : '/seminar',
      activityAt: session.lastRunAt || session.updatedAt
    });

    if (session.status === 'RUNNING' || session.status === 'PLANNED') {
      room.counts.simulations += 1;
      room.seminarHref = '/seminar';
    }

    if (session.status === 'COMPLETED') {
      if (!approvedDecisionKeys.has(`SEMINAR_REPORT:${session.id}`)) {
        pushApproval(room, {
          label: '세미나 결과 회수',
          description: '완료된 토론 결과를 실행안과 팀 액션으로 넘기기 전에 한 번 더 확정합니다.',
          href: `/seminar/sessions/${session.id}/report`,
          actionKind: 'SEMINAR_REPORT',
          targetId: session.id,
          actionLabel: '결과 회수'
        });
      }
      room.seminarHref = `/seminar/sessions/${session.id}/report`;
    }
  }

  for (const archive of learningArchives) {
    if (!archive.run) continue;
    const room = ensureRoom(rooms, {
      title: buildCampaignTitle({
        brand: archive.run.brand,
        region: archive.run.region,
        goal: archive.run.goal,
        topic: archive.run.topic
      }),
      brand: archive.run.brand,
      region: archive.run.region,
      objective: archive.run.goal || archive.run.topic,
      summary: archive.recommendedResponse || archive.situation,
      href: '/learning',
      activityAt: archive.updatedAt
    });

    room.counts.playbooks += 1;
    if (archive.status === 'CONFIRMED') {
      room._confirmedPlaybooks += 1;
    }
    if (archive.status === 'DRAFT') {
      pushApproval(room, {
        label: '플레이북 후보 확정',
        description: '좋은 응답 패턴을 확정 카드로 승격해 다음 실행에 재사용하세요.',
        href: '/learning',
        actionKind: 'LEARNING_ARCHIVE',
        targetId: archive.id,
        actionLabel: '플레이북 확정'
      });
    }
    addSignalTags(room, safeParseTags(archive.tags));
  }

  // Inject manually created rooms that don't already appear in the auto-aggregated map
  for (const manual of manualRooms) {
    const key = buildCampaignKey({
      brand: manual.brand,
      region: manual.region,
      goal: manual.goal,
      campaignName: manual.title
    });
    if (!rooms.has(key)) {
      const room: MutableCampaignRoom = {
        id: `manual-${manual.id}`,
        title: manual.title,
        brand: manual.brand,
        region: manual.region,
        objective: manual.objective || manual.goal,
        summary: manual.notes || `${manual.brand} · ${manual.region} · ${manual.goal}`,
        status: 'READY',
        statusLabel: statusLabel('READY'),
        latestActivityAt: manual.createdAt.toISOString(),
        latestActivityLabel: formatDate(manual.createdAt),
        counts: { briefs: 0, reports: 0, simulations: 0, playbooks: 0 },
        completion: { reporting: 0, playbook: 0 },
        approvals: [],
        signalTags: [],
        nextAction: '첫 번째 브리프를 생성해 이 캠페인 룸을 채워 나가세요.',
        primaryHref: '/',
        _latestTimestamp: manual.createdAt.getTime(),
        _confirmedPlaybooks: 0,
        _tagCounts: new Map<string, number>()
      };
      rooms.set(key, room);
    }
  }

  return [...rooms.values()]
    .map(finalizeRoom)
    .sort((a, b) => {
      const timeDiff = new Date(b.latestActivityAt).getTime() - new Date(a.latestActivityAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.approvals.length - a.approvals.length;
    })
    .slice(0, Math.max(1, Math.min(limit, 24)));
}

export async function getCampaignRoomDetail(id: string) {
  const [campaignRooms, runs, learningArchives, sessions] = await Promise.all([
    getCampaignRooms(24),
    prisma.run.findMany({
      orderBy: { createdAt: 'desc' },
      take: 72,
      include: {
        deliverable: { select: { id: true, type: true, content: true } },
        memoryLog: { select: { tags: true } },
        _count: { select: { attachments: true, webSources: true } }
      }
    }),
    prisma.learningArchive.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 120,
      include: {
        run: {
          select: {
            id: true,
            topic: true,
            brand: true,
            region: true,
            goal: true
          }
        }
      }
    }),
    listSeminarSessions(32)
  ]);

  const room = campaignRooms.find((item) => item.id === id);
  if (!room) return null;

  const linkedRuns = runs
    .filter((run) => {
      const structured = parseStructuredDeliverable(run.deliverable?.content);
      const title = buildCampaignTitle({
        brand: run.brand,
        region: run.region,
        goal: run.goal,
        topic: run.topic,
        campaignName: structured?.campaignName
      });
      const objective = structured?.objective || run.goal || run.topic;
      return (
        buildCampaignRoomId({
          brand: run.brand,
          region: run.region,
          goal: objective,
          topic: title,
          campaignName: title
        }) === id
      );
    })
    .map((run) => {
      const structured = parseStructuredDeliverable(run.deliverable?.content);
      const summary =
        structured?.executiveSummary?.[0] ||
        structured?.coreMessage ||
        run.goal ||
        `${run.topic} 실행에서 웹 근거 ${run._count.webSources}개가 연결됐습니다.`;

      return {
        id: run.id,
        title: buildCampaignTitle({
          brand: run.brand,
          region: run.region,
          goal: run.goal,
          topic: run.topic,
          campaignName: structured?.campaignName
        }),
        summary: compactText(summary, 160),
        href: `/runs/${run.id}`,
        reportHref: run.deliverable ? `/runs/${run.id}/report` : undefined,
        hasReport: Boolean(run.deliverable),
        createdAt: run.createdAt.toISOString(),
        createdAtLabel: formatDate(run.createdAt),
        attachmentCount: run._count.attachments,
        sourceCount: run._count.webSources,
        signalTags: safeParseTags(run.memoryLog?.tags).slice(0, 4)
      } satisfies CampaignRoomLinkedRun;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const linkedSessions = sessions
    .filter((session) => {
      const title = buildCampaignTitle({
        brand: session.brand,
        region: session.region,
        goal: session.goal,
        topic: session.topic,
        campaignName: session.title
      });
      const objective = session.goal || session.topic;
      return (
        buildCampaignRoomId({
          brand: session.brand,
          region: session.region,
          goal: objective,
          topic: title,
          campaignName: title
        }) === id
      );
    })
    .map((session) => ({
      id: session.id,
      title: buildCampaignTitle({
        brand: session.brand,
        region: session.region,
        goal: session.goal,
        topic: session.topic,
        campaignName: session.title
      }),
      status: session.status,
      statusLabel: seminarStatusLabel(session.status),
      summary: compactText(
        session.morningBriefing || `${session.completedRounds}/${session.maxRounds} 라운드가 누적된 전략 시뮬레이션입니다.`,
        180
      ),
      href: session.status === 'COMPLETED' ? `/seminar/sessions/${session.id}/report` : '/seminar',
      updatedAt: session.lastRunAt || session.updatedAt,
      updatedAtLabel: formatDate(session.lastRunAt || session.updatedAt),
      roundLabel: `${session.completedRounds}/${session.maxRounds} 라운드`
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const linkedPlaybooks = learningArchives
    .filter((archive) => {
      if (!archive.run) return false;
      const title = buildCampaignTitle({
        brand: archive.run.brand,
        region: archive.run.region,
        goal: archive.run.goal,
        topic: archive.run.topic
      });
      const objective = archive.run.goal || archive.run.topic;
      return (
        buildCampaignRoomId({
          brand: archive.run.brand,
          region: archive.run.region,
          goal: objective,
          topic: title,
          campaignName: title
        }) === id
      );
    })
    .map((archive) => ({
      id: archive.id,
      title: compactText(archive.situation, 72) || '플레이북 후보',
      status: archive.status,
      statusLabel: learningStatusLabel(archive.status),
      summary: compactText(archive.recommendedResponse || archive.reasoning || archive.situation, 180),
      href: '/learning',
      updatedAt: archive.updatedAt.toISOString(),
      updatedAtLabel: formatDate(archive.updatedAt),
      tags: safeParseTags(archive.tags).slice(0, 5)
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const approvalHistoryRows = await listApprovalDecisions({
    itemTypes: ['RUN_REPORT', 'SEMINAR_REPORT', 'LEARNING_ARCHIVE'],
    itemIds: [...linkedRuns.map((item) => item.id), ...linkedSessions.map((item) => item.id), ...linkedPlaybooks.map((item) => item.id)],
    limit: 24
  });

  const runMap = new Map(linkedRuns.map((item) => [item.id, item]));
  const sessionMap = new Map(linkedSessions.map((item) => [item.id, item]));
  const playbookMap = new Map(linkedPlaybooks.map((item) => [item.id, item]));

  const approvalHistory = approvalHistoryRows.map((item) => {
    const targetTitle =
      item.itemType === 'RUN_REPORT'
        ? runMap.get(item.itemId)?.title || '실행 보고서'
        : item.itemType === 'SEMINAR_REPORT'
          ? sessionMap.get(item.itemId)?.title || '세미나 결과'
          : playbookMap.get(item.itemId)?.title || '플레이북 카드';

    const href =
      item.itemType === 'RUN_REPORT'
        ? runMap.get(item.itemId)?.reportHref || runMap.get(item.itemId)?.href || '/history'
        : item.itemType === 'SEMINAR_REPORT'
          ? sessionMap.get(item.itemId)?.href || '/seminar'
          : playbookMap.get(item.itemId)?.href || '/learning';

    return {
      id: item.id,
      itemType: item.itemType,
      label: item.label || '승인 처리',
      targetTitle,
      href,
      updatedAt: item.updatedAt,
      updatedAtLabel: formatDate(item.updatedAt)
    } satisfies CampaignRoomApprovalHistoryItem;
  });

  const timeline = [
    ...linkedRuns.map((item) => ({
      id: `run-${item.id}`,
      type: item.hasReport ? ('report' as const) : ('run' as const),
      label: item.hasReport ? '보고서 생성' : '브리프 실행',
      title: item.title,
      summary: item.summary,
      href: item.reportHref || item.href,
      at: item.createdAt,
      atLabel: item.createdAtLabel
    })),
    ...linkedSessions.map((item) => ({
      id: `seminar-${item.id}`,
      type: 'seminar' as const,
      label: item.statusLabel,
      title: item.title,
      summary: item.summary,
      href: item.href,
      at: item.updatedAt,
      atLabel: item.updatedAtLabel
    })),
    ...linkedPlaybooks.map((item) => ({
      id: `playbook-${item.id}`,
      type: 'playbook' as const,
      label: item.statusLabel,
      title: item.title,
      summary: item.summary,
      href: item.href,
      at: item.updatedAt,
      atLabel: item.updatedAtLabel
    })),
    ...approvalHistory.map((item) => ({
      id: `approval-${item.id}`,
      type: 'approval' as const,
      label: '승인 완료',
      title: item.targetTitle,
      summary: item.label,
      href: item.href,
      at: item.updatedAt,
      atLabel: item.updatedAtLabel
    }))
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 16);

  return {
    ...room,
    linkedRuns,
    linkedSessions,
    linkedPlaybooks,
    approvalHistory,
    timeline
  } satisfies CampaignRoomDetail;
}
