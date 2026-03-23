import { registerJob } from './engine';
import type { ScheduledJobConfig } from './types';
import {
  runDailyBriefingJob,
  runWeeklyKpiReviewJob,
  runGA4AnalysisJob,
  runUrgentRecommendationsJob
} from '@/lib/job-scheduler';

const BUILTIN_JOBS: ScheduledJobConfig[] = [
  {
    id: 'daily-briefing',
    name: '일간 브리핑',
    description: '매일 아침 운영 현황을 요약하고 Slack으로 발송합니다.',
    cron: '15 7 * * *',
    category: 'report',
    enabled: true,
    handler: runDailyBriefingJob
  },
  {
    id: 'weekly-kpi-review',
    name: '주간 KPI 리뷰',
    description: '매주 월요일 KPI 달성 현황을 분석합니다.',
    cron: '0 9 * * 1',
    category: 'analysis',
    enabled: true,
    handler: runWeeklyKpiReviewJob
  },
  {
    id: 'ga4-analysis',
    name: 'GA4 성과 분석',
    description: '매일 GA4 데이터를 수집하고 AI 인사이트를 생성합니다.',
    cron: '0 8 * * *',
    category: 'analysis',
    enabled: true,
    handler: runGA4AnalysisJob
  },
  {
    id: 'urgent-recommendations',
    name: '긴급 추천 알림',
    description: '매시간 긴급 수준의 추천 사항을 점검합니다.',
    cron: '0 * * * *',
    category: 'system',
    enabled: true,
    handler: () => runUrgentRecommendationsJob()
  }
];

export function registerBuiltinJobs(): void {
  for (const job of BUILTIN_JOBS) {
    registerJob(job);
  }
}
