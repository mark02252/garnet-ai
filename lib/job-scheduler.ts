import { prisma } from '@/lib/prisma';
import { runLLM } from '@/lib/llm';
import { computeRecommendations } from '@/lib/recommendations';
import { sendSlackMessage, buildDailyBriefing, buildRecommendationAlert } from '@/lib/integrations/slack';
import { fetchDailyTraffic, fetchChannelBreakdown, analyzeGA4WithAI, isGA4Configured } from '@/lib/ga4-client';
import type { RuntimeConfig } from '@/lib/types';

export type ScheduledJob = {
  id: string;
  name: string;
  description: string;
  cronLike: string; // 'daily' | 'weekly' | 'hourly'
  enabled: boolean;
  lastRunAt?: Date;
  handler: (runtime?: RuntimeConfig) => Promise<JobResult>;
};

export type JobResult = {
  ok: boolean;
  message: string;
  data?: unknown;
};

// ── Job: 일간 브리핑 자동 생성 ──

async function runDailyBriefingJob(runtime?: RuntimeConfig): Promise<JobResult> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [pendingApprovals, todayRuns, activeCampaigns, recommendations] = await Promise.all([
    prisma.approvalDecision.count({ where: { decision: 'PENDING' } }),
    prisma.run.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.manualCampaignRoom.count({ where: { status: 'ACTIVE' } }),
    computeRecommendations()
  ]);

  const urgentCount = recommendations.filter((r) => r.priority === 'urgent').length;
  const highCount = recommendations.filter((r) => r.priority === 'high').length;

  const briefingPrompt = `오늘의 마케팅 운영 브리핑을 생성하세요:
- 오늘 실행된 AI 회의: ${todayRuns}건
- 활성 캠페인: ${activeCampaigns}개
- 승인 대기: ${pendingApprovals}건
- 긴급 추천: ${urgentCount}건, 높음 추천: ${highCount}건
${recommendations.slice(0, 3).map((r) => `  - [${r.priority}] ${r.title}: ${r.reason}`).join('\n')}

3문장 이내로 핵심만 간결하게 요약하세요.`;

  const summary = await runLLM(
    '당신은 마케팅 운영 비서입니다. 간결한 한국어로 브리핑을 작성하세요.',
    briefingPrompt,
    0.3,
    500,
    runtime
  );

  // Slack 발송 (설정된 경우)
  if (process.env.SLACK_WEBHOOK_URL) {
    await sendSlackMessage({
      text: `*[Garnet 일간 브리핑]*\n${summary}`
    });
  }

  return { ok: true, message: summary };
}

// ── Job: 주간 KPI 리뷰 ──

async function runWeeklyKpiReviewJob(runtime?: RuntimeConfig): Promise<JobResult> {
  const goals = await prisma.kpiGoal.findMany({ take: 20 });

  if (goals.length === 0) {
    return { ok: true, message: '등록된 KPI 목표가 없습니다.' };
  }

  const kpiSummary = goals.map((g) => {
    const progress = g.targetValue > 0 ? Math.round((g.currentValue / g.targetValue) * 100) : 0;
    return `- ${g.title}: ${g.currentValue}/${g.targetValue}${g.unit} (${progress}%)`;
  }).join('\n');

  const review = await runLLM(
    '당신은 KPI 분석가입니다. 주간 KPI 현황을 분석하고 개선 방안을 제시하세요. 한국어로 간결하게 답변하세요.',
    `이번 주 KPI 현황:\n${kpiSummary}\n\n각 KPI의 달성 상태를 평가하고, 위험 항목에 대한 개선 권고를 3개 이내로 제시하세요.`,
    0.3,
    1000,
    runtime
  );

  if (process.env.SLACK_WEBHOOK_URL) {
    await sendSlackMessage({ text: `*[Garnet 주간 KPI 리뷰]*\n${review}` });
  }

  return { ok: true, message: review };
}

// ── Job: GA4 성과 자동 분석 ──

async function runGA4AnalysisJob(runtime?: RuntimeConfig): Promise<JobResult> {
  if (!isGA4Configured()) {
    return { ok: false, message: 'GA4가 설정되지 않았습니다.' };
  }

  const [traffic, channels] = await Promise.all([
    fetchDailyTraffic('7daysAgo', 'today'),
    fetchChannelBreakdown('7daysAgo', 'today')
  ]);

  const insight = await analyzeGA4WithAI(traffic, channels, [], runtime);

  if (process.env.SLACK_WEBHOOK_URL && insight.anomalies.length > 0) {
    await sendSlackMessage({
      text: `*[Garnet GA4 이상 탐지]*\n${insight.anomalies.join('\n')}`
    });
  }

  return { ok: true, message: insight.summary, data: insight };
}

// ── Job: 추천 액션 긴급 알림 ──

async function runUrgentRecommendationsJob(): Promise<JobResult> {
  const recommendations = await computeRecommendations();
  const urgent = recommendations.filter((r) => r.priority === 'urgent');

  if (urgent.length === 0) {
    return { ok: true, message: '긴급 추천 사항 없음' };
  }

  if (process.env.SLACK_WEBHOOK_URL) {
    for (const rec of urgent.slice(0, 3)) {
      await sendSlackMessage(buildRecommendationAlert(rec.title, rec.reason, rec.priority));
    }
  }

  return { ok: true, message: `긴급 추천 ${urgent.length}건 알림 발송`, data: urgent };
}

// ── 스케줄러 레지스트리 ──

export const REGISTERED_JOBS: ScheduledJob[] = [
  {
    id: 'daily-briefing',
    name: '일간 브리핑',
    description: '매일 아침 운영 현황을 요약하고 Slack으로 발송합니다.',
    cronLike: 'daily',
    enabled: true,
    handler: runDailyBriefingJob
  },
  {
    id: 'weekly-kpi-review',
    name: '주간 KPI 리뷰',
    description: '매주 KPI 달성 현황을 분석하고 개선 권고를 생성합니다.',
    cronLike: 'weekly',
    enabled: true,
    handler: runWeeklyKpiReviewJob
  },
  {
    id: 'ga4-analysis',
    name: 'GA4 성과 분석',
    description: 'GA4 주간 데이터를 수집하고 AI 인사이트를 생성합니다.',
    cronLike: 'weekly',
    enabled: true,
    handler: runGA4AnalysisJob
  },
  {
    id: 'urgent-recommendations',
    name: '긴급 추천 알림',
    description: '긴급 수준의 추천 사항을 Slack으로 즉시 알립니다.',
    cronLike: 'hourly',
    enabled: true,
    handler: runUrgentRecommendationsJob
  }
];

export async function executeJob(jobId: string, runtime?: RuntimeConfig): Promise<JobResult> {
  const job = REGISTERED_JOBS.find((j) => j.id === jobId);
  if (!job) return { ok: false, message: `Job not found: ${jobId}` };
  if (!job.enabled) return { ok: false, message: `Job disabled: ${jobId}` };

  const result = await job.handler(runtime);
  job.lastRunAt = new Date();
  return result;
}

export function listJobs() {
  return REGISTERED_JOBS.map((j) => ({
    id: j.id,
    name: j.name,
    description: j.description,
    cronLike: j.cronLike,
    enabled: j.enabled,
    lastRunAt: j.lastRunAt
  }));
}
