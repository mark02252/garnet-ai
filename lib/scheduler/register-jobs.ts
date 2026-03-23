import { registerJob } from './engine';
import type { ScheduledJobConfig } from './types';
import {
  runDailyBriefingJob,
  runWeeklyKpiReviewJob,
  runGA4AnalysisJob,
  runUrgentRecommendationsJob
} from '@/lib/job-scheduler';
import { runCollectionJob } from '@/lib/collectors/orchestrator';
import { analyzeRecentIntel } from '@/lib/intel/analyzer';
import { detectAndAlertUrgent } from '@/lib/intel/urgent-detector';
import { buildDailyDigest } from '@/lib/intel/digest-builder';
import { runMaintenanceJob } from './maintenance';
import { resetAllQuotas } from '@/lib/collectors/quota-tracker';
import { initCollectors } from '@/lib/collectors/init';

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

const COLLECTION_JOBS: ScheduledJobConfig[] = [
  {
    id: 'collect-twitter',
    name: 'Twitter/X 수집',
    description: '매시간 Twitter에서 마케팅 관련 트윗을 수집합니다.',
    cron: '0 * * * *',
    category: 'collect',
    enabled: true,
    handler: async () => {
      const result = await runCollectionJob('twitter');
      if (result.ok) { await analyzeRecentIntel(); await detectAndAlertUrgent(); }
      return result;
    }
  },
  {
    id: 'collect-serper',
    name: '웹/뉴스 수집',
    description: '2시간마다 웹과 뉴스에서 마케팅 자료를 수집합니다.',
    cron: '0 */2 * * *',
    category: 'collect',
    enabled: true,
    handler: async () => {
      const result = await runCollectionJob('serper');
      if (result.ok) { await analyzeRecentIntel(); await detectAndAlertUrgent(); }
      return result;
    }
  },
  {
    id: 'collect-naver',
    name: '네이버 수집',
    description: '3시간마다 네이버 블로그/뉴스를 수집합니다.',
    cron: '0 */3 * * *',
    category: 'collect',
    enabled: true,
    handler: async () => {
      const result = await runCollectionJob('naver');
      if (result.ok) { await analyzeRecentIntel(); await detectAndAlertUrgent(); }
      return result;
    }
  },
  {
    id: 'collect-youtube',
    name: 'YouTube 수집',
    description: '6시간마다 YouTube에서 관련 영상을 수집합니다.',
    cron: '0 */6 * * *',
    category: 'collect',
    enabled: true,
    handler: async () => {
      const result = await runCollectionJob('youtube');
      if (result.ok) { await analyzeRecentIntel(); await detectAndAlertUrgent(); }
      return result;
    }
  },
  {
    id: 'collect-reddit',
    name: 'Reddit 수집',
    description: '6시간마다 Reddit에서 관련 토론을 수집합니다.',
    cron: '0 */6 * * *',
    category: 'collect',
    enabled: true,
    handler: async () => {
      const result = await runCollectionJob('reddit');
      if (result.ok) { await analyzeRecentIntel(); await detectAndAlertUrgent(); }
      return result;
    }
  },
  {
    id: 'daily-digest',
    name: '마케팅 인텔 다이제스트',
    description: '매일 아침 7시 수집된 인텔리전스를 AI가 종합 분석합니다.',
    cron: '0 7 * * *',
    category: 'report',
    enabled: true,
    handler: buildDailyDigest
  },
  {
    id: 'maintenance',
    name: '데이터 정리',
    description: '매주 일요일 새벽 오래된 데이터를 정리합니다.',
    cron: '0 3 * * 0',
    category: 'system',
    enabled: true,
    handler: runMaintenanceJob
  },
  {
    id: 'quota-reset',
    name: 'API 쿼터 리셋',
    description: '매일 자정 API 사용량 카운터를 리셋합니다.',
    cron: '0 0 * * *',
    category: 'system',
    enabled: true,
    handler: async () => { resetAllQuotas(); return { ok: true, message: 'API 쿼터 리셋 완료' }; }
  }
];

export function registerBuiltinJobs(): void {
  initCollectors();
  for (const job of [...BUILTIN_JOBS, ...COLLECTION_JOBS]) {
    registerJob(job);
  }
}
