import { prisma } from '@/lib/prisma';

export type ActionRecommendation = {
  priority: 'urgent' | 'high' | 'medium' | 'low';
  type: 'kpi' | 'campaign' | 'approval' | 'content' | 'seminar';
  title: string;
  reason: string;
  actionUrl: string;
};

export async function computeRecommendations(): Promise<ActionRecommendation[]> {
  const recommendations: ActionRecommendation[] = [];

  const [kpiGoals, campaigns, pendingApprovals, recentRuns, seminarSessions] = await Promise.all([
    prisma.kpiGoal.findMany({ orderBy: { updatedAt: 'desc' }, take: 20 }),
    prisma.manualCampaignRoom.findMany({ where: { status: 'ACTIVE' }, take: 20 }),
    prisma.approvalDecision.findMany({
      where: { decision: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 10
    }),
    prisma.run.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.seminarSession.findMany({
      where: { status: { in: ['PLANNED', 'RUNNING'] } },
      take: 5
    })
  ]);

  // 1. KPI 미달 경고
  for (const goal of kpiGoals) {
    if (goal.targetValue <= 0) continue;
    const progress = (goal.currentValue / goal.targetValue) * 100;

    if (progress < 30) {
      recommendations.push({
        priority: 'urgent',
        type: 'kpi',
        title: `KPI 위험: ${goal.title} (${Math.round(progress)}%)`,
        reason: `목표 ${goal.targetValue}${goal.unit} 대비 현재 ${goal.currentValue}${goal.unit}. 긴급 전략 수정 필요.`,
        actionUrl: '/goals'
      });
    } else if (progress < 60) {
      recommendations.push({
        priority: 'high',
        type: 'kpi',
        title: `KPI 주의: ${goal.title} (${Math.round(progress)}%)`,
        reason: `달성률이 절반에 미치지 못합니다. 캠페인 강화를 검토하세요.`,
        actionUrl: '/goals'
      });
    }
  }

  // 2. 승인 대기 알림
  if (pendingApprovals.length > 0) {
    recommendations.push({
      priority: pendingApprovals.length >= 3 ? 'urgent' : 'high',
      type: 'approval',
      title: `승인 대기 ${pendingApprovals.length}건`,
      reason: `처리되지 않은 승인이 ${pendingApprovals.length}건 쌓여 있습니다. 워크플로우 병목이 될 수 있습니다.`,
      actionUrl: '/operations'
    });
  }

  // 3. 활성 캠페인 중 최근 실행 없는 캠페인
  const recentRunTopics = new Set(recentRuns.map((r) => r.topic.toLowerCase()));
  for (const campaign of campaigns) {
    const hasRecentRun = recentRunTopics.has(campaign.title.toLowerCase()) ||
      recentRuns.some((r) => r.topic.toLowerCase().includes(campaign.brand.toLowerCase()));
    if (!hasRecentRun) {
      recommendations.push({
        priority: 'medium',
        type: 'campaign',
        title: `캠페인 활동 없음: ${campaign.title}`,
        reason: `활성 상태이지만 최근 AI 회의 실행이 없습니다. 전략 점검을 권장합니다.`,
        actionUrl: `/campaigns/${campaign.id}`
      });
    }
  }

  // 4. 진행 중 세미나 확인
  for (const session of seminarSessions) {
    if (session.status === 'RUNNING') {
      recommendations.push({
        priority: 'high',
        type: 'seminar',
        title: `세미나 진행 중: ${session.title}`,
        reason: `현재 실행 중인 세미나가 있습니다. 결과를 확인하세요.`,
        actionUrl: '/seminar'
      });
    } else if (session.status === 'PLANNED') {
      recommendations.push({
        priority: 'medium',
        type: 'seminar',
        title: `예정 세미나: ${session.title}`,
        reason: `예정된 세미나가 있습니다. 준비 상태를 확인하세요.`,
        actionUrl: '/seminar'
      });
    }
  }

  // 5. 최근 실행이 전혀 없는 경우
  if (recentRuns.length === 0) {
    recommendations.push({
      priority: 'medium',
      type: 'content',
      title: '최근 AI 회의 실행 없음',
      reason: '최근 실행 기록이 없습니다. 새 캠페인 전략 회의를 시작해보세요.',
      actionUrl: '/'
    });
  }

  // 정렬: urgent → high → medium → low
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations.slice(0, 10);
}
