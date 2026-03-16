import { prisma } from '@/lib/prisma';
import { listSeminarSessions } from '@/lib/seminar-storage';
import { listApprovalDecisions } from '@/lib/approval-actions';

export type Notification = {
  id: string;
  type: 'warning' | 'info' | 'action' | 'success';
  category: 'playbook' | 'approval' | 'seminar' | 'performance' | 'kpi' | 'draft';
  title: string;
  description: string;
  href: string;
  cta: string;
  at: string;
};

export async function computeNotifications(): Promise<Notification[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [draftPlaybooks, recentRuns, sessions, latestReach, kpiGoals, approvalDecisions] = await Promise.all([
    prisma.learningArchive.findMany({
      where: { status: 'DRAFT' },
      orderBy: { updatedAt: 'desc' },
      take: 20
    }),
    prisma.run.findMany({
      where: { createdAt: { gte: sevenDaysAgo }, deliverable: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, topic: true, createdAt: true }
    }),
    listSeminarSessions(20),
    prisma.instagramReachAnalysisRun.findFirst({ orderBy: { createdAt: 'desc' } }),
    prisma.kpiGoal.findMany({ orderBy: { updatedAt: 'desc' }, take: 20 }),
    listApprovalDecisions()
  ]);

  const notifications: Notification[] = [];
  const now = new Date().toISOString();

  if (draftPlaybooks.length > 0) {
    notifications.push({
      id: 'draft-playbooks',
      type: 'action',
      category: 'playbook',
      title: `플레이북 확정 대기 ${draftPlaybooks.length}개`,
      description: `검토 대기 중인 플레이북 후보가 ${draftPlaybooks.length}개 있습니다. 확정하면 팀 전체가 재사용할 수 있습니다.`,
      href: '/learning',
      cta: '플레이북 검토',
      at: draftPlaybooks[0].updatedAt.toISOString()
    });
  }

  if (recentRuns.length > 0) {
    notifications.push({
      id: 'runs-without-reports',
      type: 'info',
      category: 'draft',
      title: `보고서 미작성 실행 ${recentRuns.length}건`,
      description: `최근 7일 내 실행 중 보고서가 없는 항목이 ${recentRuns.length}건입니다. 자산화를 완성해 주세요.`,
      href: '/history',
      cta: '실행 아카이브',
      at: recentRuns[0].createdAt.toISOString()
    });
  }

  const runningSeminars = sessions.filter((s) => s.status === 'RUNNING');
  if (runningSeminars.length > 0) {
    notifications.push({
      id: 'running-seminars',
      type: 'info',
      category: 'seminar',
      title: `진행 중인 세미나 ${runningSeminars.length}개`,
      description: `자동 토론이 진행 중입니다. 결론을 회수할 타이밍을 잡아보세요.`,
      href: '/seminar',
      cta: '세미나 보기',
      at: runningSeminars[0].lastRunAt || runningSeminars[0].updatedAt
    });
  }

  const failedSeminars = sessions.filter((s) => s.status === 'FAILED');
  if (failedSeminars.length > 0) {
    notifications.push({
      id: 'failed-seminars',
      type: 'warning',
      category: 'seminar',
      title: `실패한 세미나 세션 ${failedSeminars.length}개`,
      description: `오류가 발생한 세미나 세션이 있습니다. 원인을 확인하고 재시작이 필요합니다.`,
      href: '/seminar',
      cta: '세미나 확인',
      at: failedSeminars[0].lastRunAt || failedSeminars[0].updatedAt
    });
  }

  if (latestReach?.trendDirection === 'DOWN') {
    notifications.push({
      id: 'reach-down',
      type: 'warning',
      category: 'performance',
      title: '도달 하락 추세 감지',
      description: `${latestReach.accountId} 계정의 리치가 하락 중입니다. 콘텐츠 전략 점검이 필요합니다.`,
      href: '/datasets',
      cta: '성과 데이터 보기',
      at: latestReach.createdAt.toISOString()
    });
  }

  const behindGoals = kpiGoals.filter((g) => g.targetValue > 0 && g.currentValue / g.targetValue < 0.4);
  if (behindGoals.length > 0) {
    notifications.push({
      id: 'kpi-behind',
      type: 'warning',
      category: 'kpi',
      title: `KPI 달성률 주의 ${behindGoals.length}개`,
      description: `달성률 40% 미만인 KPI 목표가 ${behindGoals.length}개 있습니다. 전략을 점검해 주세요.`,
      href: '/goals',
      cta: 'KPI 확인',
      at: behindGoals[0].updatedAt.toISOString()
    });
  }

  const achievedGoals = kpiGoals.filter((g) => g.targetValue > 0 && g.currentValue / g.targetValue >= 1);
  if (achievedGoals.length > 0) {
    notifications.push({
      id: 'kpi-achieved',
      type: 'success',
      category: 'kpi',
      title: `KPI 목표 달성 ${achievedGoals.length}개`,
      description: `축하합니다! ${achievedGoals.length}개의 KPI 목표를 달성했습니다.`,
      href: '/goals',
      cta: 'KPI 보기',
      at: achievedGoals[0].updatedAt.toISOString()
    });
  }

  const approvedDecisionsCount = approvalDecisions.filter((d) => d.decision === 'APPROVED').length;
  if (approvedDecisionsCount > 0) {
    notifications.push({
      id: 'approved-items',
      type: 'success',
      category: 'approval',
      title: `승인 완료 ${approvedDecisionsCount}건`,
      description: `승인 처리된 항목이 ${approvedDecisionsCount}건 있습니다.`,
      href: '/campaigns',
      cta: '캠페인 룸 보기',
      at: now
    });
  }

  const typePriority = { warning: 0, action: 1, info: 2, success: 3 };
  notifications.sort((a, b) => {
    const tDiff = typePriority[a.type] - typePriority[b.type];
    if (tDiff !== 0) return tDiff;
    return new Date(b.at).getTime() - new Date(a.at).getTime();
  });

  return notifications;
}
