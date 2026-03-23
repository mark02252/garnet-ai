# Cron 스케줄러 + 마케팅 인텔리전스 — 백엔드 구현 플랜

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garnet의 잡 스케줄러를 croner+toad-scheduler 기반 프로덕션급 Cron 엔진으로 교체하고, 멀티 플랫폼 마케팅 인텔리전스 자동 수집/분석/알림 파이프라인을 구축한다.

**Architecture:** toad-scheduler가 잡 라이프사이클을 관리하고 croner가 Cron 표현식을 파싱한다. 각 플랫폼 수집기는 `ICollector` 인터페이스를 구현하는 독립 모듈이다. 수집 결과는 Prisma `MarketingIntel`에 저장되고, AI 분석 후 urgency별로 즉시 알림 또는 데일리 다이제스트로 집계된다.

**Tech Stack:** croner, toad-scheduler, Prisma (SQLite), Vitest, 기존 runLLM(), Serper.dev, YouTube Data API v3, Twitter API v2, Reddit API, Naver Search API

**Spec:** `docs/superpowers/specs/2026-03-24-cron-scheduler-marketing-intel-design.md`

---

## Chunk 1: 스케줄링 엔진 (Phase 1)

### Task 1: 패키지 설치 + 타입 정의

**Files:**
- Create: `lib/scheduler/types.ts`

- [ ] **Step 1: 패키지 설치**

```bash
cd "/Users/rnr/Documents/New project"
npm install croner toad-scheduler
```

- [ ] **Step 2: 타입 정의 파일 작성**

```typescript
// lib/scheduler/types.ts
import type { RuntimeConfig } from '@/lib/types';

export type JobRunStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface ScheduledJobConfig {
  id: string;
  name: string;
  description: string;
  cron: string;                          // croner 호환 Cron 표현식
  category: 'system' | 'collect' | 'analysis' | 'report';
  enabled: boolean;
  handler: (runtime?: RuntimeConfig) => Promise<JobRunResult>;
}

export interface JobRunResult {
  ok: boolean;
  message: string;
  data?: unknown;
  durationMs?: number;
}

export interface JobStatus {
  id: string;
  name: string;
  description: string;
  cron: string;
  category: string;
  enabled: boolean;
  lastRunAt: Date | null;
  lastStatus: JobRunStatus | null;
  nextRunAt: Date | null;
  isRunning: boolean;
}
```

- [ ] **Step 3: 커밋**

```bash
git add lib/scheduler/types.ts package.json package-lock.json
git commit -m "feat(scheduler): add croner + toad-scheduler, define scheduler types"
```

---

### Task 2: Prisma JobRun 모델

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: JobRun 모델 추가**

`prisma/schema.prisma` 파일 끝에 추가:

```prisma
enum JobRunStatus {
  SUCCESS
  FAILED
  SKIPPED
}

model JobRun {
  id          String       @id @default(cuid())
  jobId       String
  status      JobRunStatus
  message     String?
  durationMs  Int?
  error       String?
  createdAt   DateTime     @default(now())

  @@index([jobId, createdAt])
}
```

- [ ] **Step 2: 마이그레이션 실행**

```bash
npx prisma migrate dev --name add_job_run
```

- [ ] **Step 3: 커밋**

```bash
git add prisma/
git commit -m "feat(schema): add JobRun model for job execution history"
```

---

### Task 3: 스케줄러 엔진 — 테스트

**Files:**
- Create: `lib/scheduler/__tests__/engine.test.ts`

- [ ] **Step 1: 엔진 테스트 작성**

```typescript
// lib/scheduler/__tests__/engine.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// engine은 아직 없으므로 테스트 먼저 작성
describe('SchedulerEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should export start and stop functions', async () => {
    const engine = await import('@/lib/scheduler/engine');
    expect(typeof engine.startScheduler).toBe('function');
    expect(typeof engine.stopScheduler).toBe('function');
  });

  it('should export registerJob and unregisterJob', async () => {
    const engine = await import('@/lib/scheduler/engine');
    expect(typeof engine.registerJob).toBe('function');
    expect(typeof engine.unregisterJob).toBe('function');
  });

  it('should export getJobStatuses', async () => {
    const engine = await import('@/lib/scheduler/engine');
    expect(typeof engine.getJobStatuses).toBe('function');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run lib/scheduler/__tests__/engine.test.ts
```
Expected: FAIL — module not found

---

### Task 4: 스케줄러 엔진 — 구현

**Files:**
- Create: `lib/scheduler/engine.ts`

- [ ] **Step 1: 엔진 구현**

```typescript
// lib/scheduler/engine.ts
import { ToadScheduler, CronJob, AsyncTask } from 'toad-scheduler';
import type { ScheduledJobConfig, JobRunResult, JobStatus, JobRunStatus } from './types';
import { prisma } from '@/lib/prisma';
import Cron from 'croner';

const scheduler = new ToadScheduler();
const registeredJobs = new Map<string, ScheduledJobConfig>();
const jobRunning = new Set<string>();

export function registerJob(config: ScheduledJobConfig): void {
  if (registeredJobs.has(config.id)) {
    unregisterJob(config.id);
  }
  registeredJobs.set(config.id, config);

  if (!config.enabled) return;

  const task = new AsyncTask(config.id, async () => {
    if (jobRunning.has(config.id)) return; // overrun protection
    jobRunning.add(config.id);
    const start = Date.now();
    let status: JobRunStatus = 'SUCCESS';
    let message: string | undefined;
    let error: string | undefined;

    try {
      const result = await config.handler();
      status = result.ok ? 'SUCCESS' : 'FAILED';
      message = result.message;
      if (!result.ok) error = result.message;
    } catch (err) {
      status = 'FAILED';
      error = err instanceof Error ? err.message : 'Unknown error';
      message = error;
    } finally {
      const durationMs = Date.now() - start;
      jobRunning.delete(config.id);
      await prisma.jobRun.create({
        data: { jobId: config.id, status, message, durationMs, error }
      }).catch(() => {}); // DB 저장 실패해도 잡 자체는 계속
    }
  }, (err) => {
    console.error(`[Scheduler] Job ${config.id} error:`, err);
  });

  const job = new CronJob({ cronExpression: config.cron }, task, {
    id: config.id,
    preventOverrun: true,
  });

  scheduler.addCronJob(job);
}

export function unregisterJob(jobId: string): void {
  try { scheduler.removeById(jobId); } catch { /* not found */ }
  registeredJobs.delete(jobId);
  jobRunning.delete(jobId);
}

export async function executeJobNow(jobId: string): Promise<JobRunResult> {
  const config = registeredJobs.get(jobId);
  if (!config) return { ok: false, message: `Job not found: ${jobId}` };
  if (!config.enabled) return { ok: false, message: `Job disabled: ${jobId}` };

  const start = Date.now();
  try {
    const result = await config.handler();
    const durationMs = Date.now() - start;
    await prisma.jobRun.create({
      data: {
        jobId,
        status: result.ok ? 'SUCCESS' : 'FAILED',
        message: result.message,
        durationMs,
        error: result.ok ? undefined : result.message
      }
    }).catch(() => {});
    return { ...result, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    const error = err instanceof Error ? err.message : 'Unknown error';
    await prisma.jobRun.create({
      data: { jobId, status: 'FAILED', message: error, durationMs, error }
    }).catch(() => {});
    return { ok: false, message: error, durationMs };
  }
}

export async function getJobStatuses(): Promise<JobStatus[]> {
  const statuses: JobStatus[] = [];

  for (const config of registeredJobs.values()) {
    const lastRun = await prisma.jobRun.findFirst({
      where: { jobId: config.id },
      orderBy: { createdAt: 'desc' }
    });

    statuses.push({
      id: config.id,
      name: config.name,
      description: config.description,
      cron: config.cron,
      category: config.category,
      enabled: config.enabled,
      lastRunAt: lastRun?.createdAt ?? null,
      lastStatus: (lastRun?.status as JobRunStatus) ?? null,
      nextRunAt: (() => {
        try { return new Cron(config.cron).nextRun(); } catch { return null; }
      })()
      isRunning: jobRunning.has(config.id),
    });
  }

  return statuses;
}

export function startScheduler(): void {
  // 등록된 잡이 이미 스케줄러에 있으므로 별도 start 불필요
  // toad-scheduler는 addCronJob 시 자동 시작
  console.log('[Scheduler] Started with', registeredJobs.size, 'jobs');
}

export function stopScheduler(): void {
  scheduler.stop();
  jobRunning.clear();
  console.log('[Scheduler] Stopped');
}

export function getRegisteredJobIds(): string[] {
  return Array.from(registeredJobs.keys());
}

export function getRegisteredJobConfig(jobId: string): ScheduledJobConfig | undefined {
  return registeredJobs.get(jobId);
}
```

- [ ] **Step 2: 테스트 통과 확인**

```bash
npx vitest run lib/scheduler/__tests__/engine.test.ts
```
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add lib/scheduler/engine.ts lib/scheduler/__tests__/engine.test.ts
git commit -m "feat(scheduler): implement cron engine with toad-scheduler + croner"
```

---

### Task 5: catch-up 로직

**Files:**
- Create: `lib/scheduler/catch-up.ts`
- Create: `lib/scheduler/__tests__/catch-up.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// lib/scheduler/__tests__/catch-up.test.ts
import { describe, it, expect } from 'vitest';

describe('shouldCatchUp', () => {
  it('should return true when last run is older than interval', async () => {
    const { shouldCatchUp } = await import('@/lib/scheduler/catch-up');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(shouldCatchUp(twoHoursAgo, '0 * * * *')).toBe(true); // hourly job, 2h ago
  });

  it('should return false when last run is recent', async () => {
    const { shouldCatchUp } = await import('@/lib/scheduler/catch-up');
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(shouldCatchUp(fiveMinAgo, '0 * * * *')).toBe(false); // hourly job, 5m ago
  });

  it('should return true when never run', async () => {
    const { shouldCatchUp } = await import('@/lib/scheduler/catch-up');
    expect(shouldCatchUp(null, '0 * * * *')).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run lib/scheduler/__tests__/catch-up.test.ts
```

- [ ] **Step 3: 구현**

```typescript
// lib/scheduler/catch-up.ts
import Cron from 'croner';
import { prisma } from '@/lib/prisma';
import { executeJobNow, getRegisteredJobIds, getRegisteredJobConfig } from './engine';

/**
 * Cron 표현식으로부터 대략적인 간격(ms)을 추정한다.
 */
function estimateIntervalMs(cronExpr: string): number {
  try {
    const runs = new Cron(cronExpr, { paused: true }).nextRuns(2);
    if (runs.length === 2) {
      return runs[1].getTime() - runs[0].getTime();
    }
  } catch { /* fallthrough */ }
  return 60 * 60 * 1000; // 기본 1시간
}

export function shouldCatchUp(lastRunAt: Date | null, cronExpr: string): boolean {
  if (!lastRunAt) return true;
  const interval = estimateIntervalMs(cronExpr);
  const elapsed = Date.now() - lastRunAt.getTime();
  return elapsed > interval;
}

/**
 * 앱 재시작 시 호출. 놓친 잡을 최대 1회씩 보충 실행한다.
 */
export async function runCatchUp(): Promise<string[]> {
  const jobIds = getRegisteredJobIds();
  const caughtUp: string[] = [];

  for (const jobId of jobIds) {
    const config = getRegisteredJobConfig(jobId);
    if (!config || !config.enabled) continue;

    const lastRun = await prisma.jobRun.findFirst({
      where: { jobId, status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' }
    });

    if (shouldCatchUp(lastRun?.createdAt ?? null, config.cron)) {
      await executeJobNow(jobId);
      caughtUp.push(jobId);
    }
  }

  return caughtUp;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run lib/scheduler/__tests__/catch-up.test.ts
```

- [ ] **Step 5: 커밋**

```bash
git add lib/scheduler/catch-up.ts lib/scheduler/__tests__/catch-up.test.ts
git commit -m "feat(scheduler): add catch-up logic for missed jobs on restart"
```

---

### Task 6: 기존 4개 잡 마이그레이션

**Files:**
- Modify: `lib/job-scheduler.ts`
- Create: `lib/scheduler/register-jobs.ts`
- Modify: `app/api/jobs/route.ts`

- [ ] **Step 1: 잡 등록 모듈 작성**

```typescript
// lib/scheduler/register-jobs.ts
import { registerJob } from './engine';
import type { ScheduledJobConfig } from './types';
import type { RuntimeConfig } from '@/lib/types';

// 기존 job-scheduler.ts에서 핸들러를 import
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
    cron: '15 7 * * *',   // 07:15 (다이제스트 후 15분)
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
    handler: (runtime?: RuntimeConfig) => runUrgentRecommendationsJob()
  }
];

export function registerBuiltinJobs(): void {
  for (const job of BUILTIN_JOBS) {
    registerJob(job);
  }
}
```

- [ ] **Step 2: 기존 job-scheduler.ts에서 핸들러 export 추가**

`lib/job-scheduler.ts`에서 다음 4개 함수 선언에 `export` 키워드를 추가한다:

- 라인 26: `async function runDailyBriefingJob` → `export async function runDailyBriefingJob`
- 라인 69: `async function runWeeklyKpiReviewJob` → `export async function runWeeklyKpiReviewJob`
- 라인 98: `async function runGA4AnalysisJob` → `export async function runGA4AnalysisJob`
- 라인 121: `async function runUrgentRecommendationsJob` → `export async function runUrgentRecommendationsJob`

- [ ] **Step 3: API 라우트 업데이트**

```typescript
// app/api/jobs/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { executeJobNow, getJobStatuses } from '@/lib/scheduler/engine';

export async function GET() {
  const statuses = await getJobStatuses();
  return NextResponse.json({ jobs: statuses });
}

const executeSchema = z.object({
  jobId: z.string().min(1),
  runtime: z.record(z.string()).optional()
});

export async function POST(req: Request) {
  try {
    const body = executeSchema.parse(await req.json());
    const result = await executeJobNow(body.jobId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Job execution failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: 커밋**

```bash
git add lib/scheduler/register-jobs.ts lib/job-scheduler.ts app/api/jobs/route.ts
git commit -m "feat(scheduler): migrate 4 builtin jobs to cron engine"
```

---

### Task 7: 세미나 스케줄러 라이프사이클 연결

**Files:**
- Create: `lib/scheduler/init.ts`

- [ ] **Step 1: 통합 초기화 모듈 작성**

```typescript
// lib/scheduler/init.ts
import { startScheduler, stopScheduler } from './engine';
import { registerBuiltinJobs } from './register-jobs';
import { startSeminarScheduler } from '@/lib/seminar-scheduler';
import { runCatchUp } from './catch-up';

let initialized = false;

export async function initSchedulerSystem(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // 1. Cron 잡 등록
  registerBuiltinJobs();

  // 2. 스케줄러 시작
  startScheduler();

  // 3. 세미나 스케줄러 시작 (별도 setInterval 기반, cron 변환 안 함)
  startSeminarScheduler();

  // 4. 놓친 잡 보충 실행
  await runCatchUp();

  console.log('[Garnet] Scheduler system initialized');
}

export function shutdownSchedulerSystem(): void {
  stopScheduler();
  initialized = false;
  console.log('[Garnet] Scheduler system shut down');
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/scheduler/init.ts
git commit -m "feat(scheduler): add unified init module with seminar lifecycle"
```

---

## Chunk 2: 수집 파이프라인 (Phase 2)

### Task 8: Prisma 수집 모델 추가

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: MarketingIntel, MarketingDigest, WatchKeyword 모델 추가**

`prisma/schema.prisma` 파일에 추가:

```prisma
enum IntelPlatform {
  YOUTUBE
  TWITTER
  REDDIT
  SERPER
  NAVER
}

enum IntelUrgency {
  CRITICAL
  HIGH
  NORMAL
  LOW
}

enum DigestType {
  DAILY
  URGENT
  WEEKLY
}

enum WatchCategory {
  BRAND
  COMPETITOR
  TREND
  GENERAL
}

model MarketingIntel {
  id           String        @id @default(cuid())
  platform     IntelPlatform
  query        String
  title        String
  snippet      String
  url          String
  publishedAt  DateTime?
  views        Int?
  likes        Int?
  comments     Int?
  shares       Int?
  relevance    Float         @default(0)
  urgency      IntelUrgency  @default(NORMAL)
  tags         String        @default("[]")
  raw          String?
  campaignId   String?
  digestId     String?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @default(now()) @updatedAt
  digest       MarketingDigest? @relation(fields: [digestId], references: [id])

  @@unique([platform, url])
  @@index([platform, createdAt])
  @@index([urgency, createdAt])
  @@index([relevance])
  @@index([campaignId])
}

model MarketingDigest {
  id           String           @id @default(cuid())
  type         DigestType
  headline     String
  summary      String
  insights     String
  actions      String
  itemCount    Int              @default(0)
  notifiedAt   DateTime?
  createdAt    DateTime         @default(now())
  items        MarketingIntel[]

  @@index([type, createdAt])
}

model WatchKeyword {
  id          String        @id @default(cuid())
  keyword     String
  category    WatchCategory @default(GENERAL)
  platforms   String        @default("[]")
  isActive    Boolean       @default(true)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([isActive])
}
```

> **참고**: `MarketingIntel.campaignId`는 `ManualCampaignRoom`과의 관계를 나타내지만, SQLite에서 optional FK는 복잡성을 추가하므로 application-level 참조로 유지한다.

- [ ] **Step 2: 마이그레이션**

```bash
npx prisma migrate dev --name add_marketing_intel
```

- [ ] **Step 3: 커밋**

```bash
git add prisma/
git commit -m "feat(schema): add MarketingIntel, MarketingDigest, WatchKeyword models"
```

---

### Task 9: 수집기 타입 + 레지스트리

**Files:**
- Create: `lib/collectors/types.ts`
- Create: `lib/collectors/registry.ts`
- Create: `lib/collectors/__tests__/registry.test.ts`

- [ ] **Step 1: 수집기 타입 정의**

```typescript
// lib/collectors/types.ts

export interface IntelItem {
  title: string;
  snippet: string;
  url: string;
  platform: string;
  publishedAt?: Date;
  engagement?: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  };
  raw?: unknown;
}

export interface CollectorResult {
  items: IntelItem[];
  meta: {
    query: string;
    source: string;
    fetchedAt: Date;
    count: number;
  };
}

export interface ICollector {
  id: string;
  name: string;
  platform: string;
  collect(query: string): Promise<CollectorResult>;
  isConfigured(): boolean;
}

export type CollectorErrorCode =
  | 'MISSING_CONFIG'
  | 'AUTH'
  | 'QUOTA'
  | 'RATE_LIMIT'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'UNKNOWN';

export class CollectorError extends Error {
  constructor(
    public code: CollectorErrorCode,
    message: string,
    public platform: string
  ) {
    super(message);
    this.name = 'CollectorError';
  }
}
```

- [ ] **Step 2: 레지스트리 테스트 작성**

```typescript
// lib/collectors/__tests__/registry.test.ts
import { describe, it, expect } from 'vitest';
import { CollectorRegistry } from '@/lib/collectors/registry';
import type { ICollector, CollectorResult } from '@/lib/collectors/types';

function makeFakeCollector(id: string, configured: boolean): ICollector {
  return {
    id,
    name: `Fake ${id}`,
    platform: id,
    isConfigured: () => configured,
    collect: async (query: string): Promise<CollectorResult> => ({
      items: [{ title: 'test', snippet: 'test', url: 'https://test.com', platform: id }],
      meta: { query, source: id, fetchedAt: new Date(), count: 1 }
    })
  };
}

describe('CollectorRegistry', () => {
  it('should register and retrieve a collector', () => {
    const registry = new CollectorRegistry();
    const collector = makeFakeCollector('test', true);
    registry.register(collector);
    expect(registry.get('test')).toBe(collector);
  });

  it('should list only configured collectors', () => {
    const registry = new CollectorRegistry();
    registry.register(makeFakeCollector('a', true));
    registry.register(makeFakeCollector('b', false));
    const configured = registry.getConfigured();
    expect(configured).toHaveLength(1);
    expect(configured[0].id).toBe('a');
  });

  it('should return undefined for unknown collector', () => {
    const registry = new CollectorRegistry();
    expect(registry.get('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
npx vitest run lib/collectors/__tests__/registry.test.ts
```

- [ ] **Step 4: 레지스트리 구현**

```typescript
// lib/collectors/registry.ts
import type { ICollector } from './types';

export class CollectorRegistry {
  private collectors = new Map<string, ICollector>();

  register(collector: ICollector): void {
    this.collectors.set(collector.id, collector);
  }

  get(id: string): ICollector | undefined {
    return this.collectors.get(id);
  }

  getAll(): ICollector[] {
    return Array.from(this.collectors.values());
  }

  getConfigured(): ICollector[] {
    return this.getAll().filter((c) => c.isConfigured());
  }
}

export const collectorRegistry = new CollectorRegistry();
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npx vitest run lib/collectors/__tests__/registry.test.ts
```

- [ ] **Step 6: 커밋**

```bash
git add lib/collectors/
git commit -m "feat(collectors): add collector types, error class, and registry"
```

---

### Task 10: 검색어 생성기 (query-builder)

**Files:**
- Create: `lib/collectors/query-builder.ts`
- Create: `lib/collectors/__tests__/query-builder.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// lib/collectors/__tests__/query-builder.test.ts
import { describe, it, expect } from 'vitest';
import { buildQueriesForPlatform, optimizeForPlatform } from '@/lib/collectors/query-builder';

describe('optimizeForPlatform', () => {
  it('should add hashtag for twitter', () => {
    const result = optimizeForPlatform('나이키', 'twitter');
    expect(result).toContain('#나이키');
  });

  it('should add review suffix for youtube', () => {
    const result = optimizeForPlatform('나이키', 'youtube');
    expect(result).toContain('리뷰');
  });

  it('should return keyword as-is for serper', () => {
    const result = optimizeForPlatform('나이키', 'serper');
    expect(result).toBe('나이키');
  });
});

describe('buildQueriesForPlatform', () => {
  it('should deduplicate and limit queries', () => {
    const keywords = Array.from({ length: 20 }, (_, i) => `keyword${i}`);
    const result = buildQueriesForPlatform(keywords, 'serper', 10);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('should deduplicate identical keywords', () => {
    const result = buildQueriesForPlatform(['test', 'test', 'TEST'], 'serper', 10);
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run lib/collectors/__tests__/query-builder.test.ts
```

- [ ] **Step 3: 구현**

```typescript
// lib/collectors/query-builder.ts
import { prisma } from '@/lib/prisma';

export function optimizeForPlatform(keyword: string, platform: string): string {
  switch (platform) {
    case 'twitter':
      return `${keyword} #${keyword.replace(/\s+/g, '')} lang:ko`;
    case 'youtube':
      return `${keyword} 리뷰`;
    case 'naver':
      return keyword; // 네이버는 자체 한국어 최적화
    case 'reddit':
      return keyword;
    case 'serper':
    default:
      return keyword;
  }
}

export function buildQueriesForPlatform(
  keywords: string[],
  platform: string,
  maxQueries: number = 10
): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];

  for (const kw of keywords) {
    const normalized = kw.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    queries.push(optimizeForPlatform(kw.trim(), platform));
    if (queries.length >= maxQueries) break;
  }

  return queries;
}

/**
 * DB에서 활성 캠페인 + 워치리스트 키워드를 로드하여
 * 플랫폼별 검색어 목록을 생성한다.
 */
export async function loadKeywordsForPlatform(platform: string): Promise<string[]> {
  const [campaigns, watchKeywords] = await Promise.all([
    prisma.manualCampaignRoom.findMany({
      where: { status: 'ACTIVE' },
      select: { brand: true, goal: true }
    }),
    prisma.watchKeyword.findMany({
      where: { isActive: true }
    })
  ]);

  const keywords: string[] = [];

  // 캠페인에서 추출
  for (const c of campaigns) {
    if (c.brand) keywords.push(c.brand);
    if (c.goal) keywords.push(c.goal);
  }

  // 워치리스트에서 추출 (플랫폼 필터 적용)
  for (const wk of watchKeywords) {
    const platforms: string[] = JSON.parse(wk.platforms || '[]');
    if (platforms.length === 0 || platforms.includes(platform.toUpperCase())) {
      keywords.push(wk.keyword);
    }
  }

  return buildQueriesForPlatform(keywords, platform);
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run lib/collectors/__tests__/query-builder.test.ts
```

- [ ] **Step 5: 커밋**

```bash
git add lib/collectors/query-builder.ts lib/collectors/__tests__/query-builder.test.ts
git commit -m "feat(collectors): add query builder with platform optimization"
```

---

### Task 11: Serper 수집기

**Files:**
- Create: `lib/collectors/serper-collector.ts`
- Create: `lib/collectors/__tests__/serper-collector.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// lib/collectors/__tests__/serper-collector.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('SerperCollector', () => {
  it('should report isConfigured=false when SEARCH_API_KEY missing', async () => {
    vi.stubEnv('SEARCH_API_KEY', '');
    // 모듈 캐시 때문에 fresh import
    const mod = await import('@/lib/collectors/serper-collector');
    const collector = new mod.SerperCollector();
    expect(collector.isConfigured()).toBe(false);
    vi.unstubAllEnvs();
  });

  it('should have correct id and platform', async () => {
    const mod = await import('@/lib/collectors/serper-collector');
    const collector = new mod.SerperCollector();
    expect(collector.id).toBe('serper');
    expect(collector.platform).toBe('SERPER');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npx vitest run lib/collectors/__tests__/serper-collector.test.ts
```

- [ ] **Step 3: 구현**

```typescript
// lib/collectors/serper-collector.ts
import type { ICollector, CollectorResult, IntelItem } from './types';
import { CollectorError } from './types';

interface SerperOrganicResult {
  title?: string;
  snippet?: string;
  link?: string;
  date?: string;
}

interface SerperResponse {
  organic?: SerperOrganicResult[];
}

export class SerperCollector implements ICollector {
  id = 'serper';
  name = 'Serper 웹/뉴스 검색';
  platform = 'SERPER';

  isConfigured(): boolean {
    return Boolean(process.env.SEARCH_API_KEY);
  }

  async collect(query: string): Promise<CollectorResult> {
    const apiKey = process.env.SEARCH_API_KEY;
    if (!apiKey) throw new CollectorError('MISSING_CONFIG', 'SEARCH_API_KEY가 설정되지 않았습니다.', this.platform);

    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 10, gl: 'kr', hl: 'ko' })
    });

    if (response.status === 429) throw new CollectorError('RATE_LIMIT', 'Serper rate limit', this.platform);
    if (response.status === 401) throw new CollectorError('AUTH', 'Serper auth failed', this.platform);
    if (!response.ok) throw new CollectorError('UNKNOWN', `Serper ${response.status}`, this.platform);

    const json = (await response.json()) as SerperResponse;
    const items: IntelItem[] = (json.organic || []).map((r) => ({
      title: r.title || '',
      snippet: r.snippet || '',
      url: r.link || '',
      platform: 'SERPER',
      publishedAt: r.date ? new Date(r.date) : undefined,
    }));

    return {
      items,
      meta: { query, source: 'serper', fetchedAt: new Date(), count: items.length }
    };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run lib/collectors/__tests__/serper-collector.test.ts
```

- [ ] **Step 5: 커밋**

```bash
git add lib/collectors/serper-collector.ts lib/collectors/__tests__/serper-collector.test.ts
git commit -m "feat(collectors): add Serper web/news collector"
```

---

### Task 12: Naver 수집기

**Files:**
- Create: `lib/collectors/naver-collector.ts`

- [ ] **Step 1: 구현**

기존 `lib/search.ts`의 `fetchNaverRows` 패턴을 참고하여 구현.

```typescript
// lib/collectors/naver-collector.ts
import type { ICollector, CollectorResult, IntelItem } from './types';
import { CollectorError } from './types';

interface NaverItem {
  title?: string;
  description?: string;
  link?: string;
  postdate?: string;
  pubDate?: string;
}

export class NaverCollector implements ICollector {
  id = 'naver';
  name = '네이버 검색 (블로그/뉴스)';
  platform = 'NAVER';

  isConfigured(): boolean {
    return Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
  }

  async collect(query: string): Promise<CollectorResult> {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new CollectorError('MISSING_CONFIG', 'NAVER_CLIENT_ID/SECRET 미설정', this.platform);
    }

    const headers = { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret };
    const blogUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=8&sort=sim`;
    const newsUrl = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=8&sort=sim`;

    const [blogRes, newsRes] = await Promise.allSettled([
      fetch(blogUrl, { headers }),
      fetch(newsUrl, { headers })
    ]);

    const items: IntelItem[] = [];
    for (const res of [blogRes, newsRes]) {
      if (res.status !== 'fulfilled' || !res.value.ok) continue;
      const json = (await res.value.json()) as { items?: NaverItem[] };
      for (const item of json.items || []) {
        items.push({
          title: (item.title || '').replace(/<[^>]*>/g, ''),
          snippet: (item.description || '').replace(/<[^>]*>/g, ''),
          url: item.link || '',
          platform: 'NAVER',
          publishedAt: item.postdate ? new Date(item.postdate) : item.pubDate ? new Date(item.pubDate) : undefined,
        });
      }
    }

    return {
      items,
      meta: { query, source: 'naver', fetchedAt: new Date(), count: items.length }
    };
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/collectors/naver-collector.ts
git commit -m "feat(collectors): add Naver blog/news collector"
```

---

### Task 13: YouTube 수집기

**Files:**
- Create: `lib/collectors/youtube-collector.ts`

- [ ] **Step 1: 구현**

```typescript
// lib/collectors/youtube-collector.ts
import type { ICollector, CollectorResult, IntelItem } from './types';
import { CollectorError } from './types';

interface YouTubeSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    channelTitle?: string;
  };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
}

export class YouTubeCollector implements ICollector {
  id = 'youtube';
  name = 'YouTube 동영상 검색';
  platform = 'YOUTUBE';

  isConfigured(): boolean {
    return Boolean(process.env.YOUTUBE_API_KEY);
  }

  async collect(query: string): Promise<CollectorResult> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) throw new CollectorError('MISSING_CONFIG', 'YOUTUBE_API_KEY 미설정', this.platform);

    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: '10',
      order: 'relevance',
      relevanceLanguage: 'ko',
      key: apiKey
    });

    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);

    if (response.status === 403) throw new CollectorError('QUOTA', 'YouTube quota exceeded', this.platform);
    if (response.status === 401) throw new CollectorError('AUTH', 'YouTube auth failed', this.platform);
    if (!response.ok) throw new CollectorError('UNKNOWN', `YouTube ${response.status}`, this.platform);

    const json = (await response.json()) as YouTubeSearchResponse;
    const items: IntelItem[] = (json.items || []).map((item) => ({
      title: item.snippet?.title || '',
      snippet: item.snippet?.description || '',
      url: item.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : '',
      platform: 'YOUTUBE',
      publishedAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : undefined,
    }));

    return {
      items,
      meta: { query, source: 'youtube', fetchedAt: new Date(), count: items.length }
    };
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/collectors/youtube-collector.ts
git commit -m "feat(collectors): add YouTube Data API v3 collector"
```

---

### Task 14: Twitter 수집기

**Files:**
- Create: `lib/collectors/twitter-collector.ts`

- [ ] **Step 1: 구현**

```typescript
// lib/collectors/twitter-collector.ts
import type { ICollector, CollectorResult, IntelItem } from './types';
import { CollectorError } from './types';

interface Tweet {
  id?: string;
  text?: string;
  created_at?: string;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    impression_count?: number;
  };
  author_id?: string;
}

interface TwitterSearchResponse {
  data?: Tweet[];
}

export class TwitterCollector implements ICollector {
  id = 'twitter';
  name = 'Twitter/X 검색';
  platform = 'TWITTER';

  isConfigured(): boolean {
    return Boolean(process.env.TWITTER_BEARER_TOKEN);
  }

  async collect(query: string): Promise<CollectorResult> {
    const token = process.env.TWITTER_BEARER_TOKEN;
    if (!token) throw new CollectorError('MISSING_CONFIG', 'TWITTER_BEARER_TOKEN 미설정', this.platform);

    const params = new URLSearchParams({
      query,
      max_results: '10',
      'tweet.fields': 'created_at,public_metrics,author_id'
    });

    const response = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 429) throw new CollectorError('RATE_LIMIT', 'Twitter rate limit', this.platform);
    if (response.status === 401) throw new CollectorError('AUTH', 'Twitter auth failed', this.platform);
    if (!response.ok) throw new CollectorError('UNKNOWN', `Twitter ${response.status}`, this.platform);

    const json = (await response.json()) as TwitterSearchResponse;
    const items: IntelItem[] = (json.data || []).map((tweet) => ({
      title: (tweet.text || '').slice(0, 100),
      snippet: tweet.text || '',
      url: tweet.id ? `https://twitter.com/i/status/${tweet.id}` : '',
      platform: 'TWITTER',
      publishedAt: tweet.created_at ? new Date(tweet.created_at) : undefined,
      engagement: {
        likes: tweet.public_metrics?.like_count,
        shares: tweet.public_metrics?.retweet_count,
        comments: tweet.public_metrics?.reply_count,
        views: tweet.public_metrics?.impression_count,
      },
    }));

    return {
      items,
      meta: { query, source: 'twitter', fetchedAt: new Date(), count: items.length }
    };
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/collectors/twitter-collector.ts
git commit -m "feat(collectors): add Twitter/X API v2 collector"
```

---

### Task 15: Reddit 수집기

**Files:**
- Create: `lib/collectors/reddit-collector.ts`

- [ ] **Step 1: 구현**

```typescript
// lib/collectors/reddit-collector.ts
import type { ICollector, CollectorResult, IntelItem } from './types';
import { CollectorError } from './types';

interface RedditPost {
  data?: {
    title?: string;
    selftext?: string;
    url?: string;
    permalink?: string;
    created_utc?: number;
    ups?: number;
    num_comments?: number;
  };
}

interface RedditSearchResponse {
  data?: { children?: RedditPost[] };
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getRedditAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt) {
    return cachedAccessToken.token;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Reddit credentials missing');

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) throw new Error(`Reddit auth failed: ${response.status}`);
  const json = (await response.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return cachedAccessToken.token;
}

export class RedditCollector implements ICollector {
  id = 'reddit';
  name = 'Reddit 검색';
  platform = 'REDDIT';

  isConfigured(): boolean {
    return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
  }

  async collect(query: string): Promise<CollectorResult> {
    let token: string;
    try {
      token = await getRedditAccessToken();
    } catch {
      throw new CollectorError('AUTH', 'Reddit 인증 실패', this.platform);
    }

    const params = new URLSearchParams({ q: query, limit: '10', sort: 'relevance', t: 'week' });
    const response = await fetch(`https://oauth.reddit.com/search?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Garnet/0.5.0'
      }
    });

    if (response.status === 429) throw new CollectorError('RATE_LIMIT', 'Reddit rate limit', this.platform);
    if (!response.ok) throw new CollectorError('UNKNOWN', `Reddit ${response.status}`, this.platform);

    const json = (await response.json()) as RedditSearchResponse;
    const items: IntelItem[] = (json.data?.children || []).map((post) => {
      const d = post.data;
      return {
        title: d?.title || '',
        snippet: (d?.selftext || '').slice(0, 300),
        url: d?.permalink ? `https://reddit.com${d.permalink}` : d?.url || '',
        platform: 'REDDIT',
        publishedAt: d?.created_utc ? new Date(d.created_utc * 1000) : undefined,
        engagement: { likes: d?.ups, comments: d?.num_comments },
      };
    });

    return {
      items,
      meta: { query, source: 'reddit', fetchedAt: new Date(), count: items.length }
    };
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/collectors/reddit-collector.ts
git commit -m "feat(collectors): add Reddit API collector"
```

---

### Task 16: 수집기 통합 등록 + QuotaTracker

**Files:**
- Create: `lib/collectors/quota-tracker.ts`
- Create: `lib/collectors/init.ts`

- [ ] **Step 1: QuotaTracker 구현**

```typescript
// lib/collectors/quota-tracker.ts

interface QuotaConfig {
  dailyLimit: number;
  monthlyLimit?: number;
}

interface QuotaState {
  dailyUsed: number;
  monthlyUsed: number;
  lastResetDate: string; // YYYY-MM-DD
  lastMonthlyResetMonth: string; // YYYY-MM
}

const DEFAULT_QUOTAS: Record<string, QuotaConfig> = {
  YOUTUBE: { dailyLimit: 8000 }, // 10000 중 2000 여유
  TWITTER: { monthlyLimit: 8000 },
  REDDIT: { dailyLimit: 5000 },
  SERPER: { dailyLimit: 500 },
  NAVER: { dailyLimit: 20000 },
};

const state = new Map<string, QuotaState>();

function getState(platform: string): QuotaState {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  let s = state.get(platform);

  if (!s) {
    s = { dailyUsed: 0, monthlyUsed: 0, lastResetDate: today, lastMonthlyResetMonth: month };
    state.set(platform, s);
    return s;
  }

  if (s.lastResetDate !== today) {
    s.dailyUsed = 0;
    s.lastResetDate = today;
  }
  if (s.lastMonthlyResetMonth !== month) {
    s.monthlyUsed = 0;
    s.lastMonthlyResetMonth = month;
  }
  return s;
}

export function checkQuota(platform: string): { canProceed: boolean; remaining: number } {
  const config = DEFAULT_QUOTAS[platform];
  if (!config) return { canProceed: true, remaining: Infinity };

  const s = getState(platform);

  if (config.monthlyLimit) {
    const remaining = config.monthlyLimit - s.monthlyUsed;
    return { canProceed: remaining > 0, remaining };
  }

  const remaining = config.dailyLimit - s.dailyUsed;
  return { canProceed: remaining > 0, remaining };
}

export function consumeQuota(platform: string, units: number = 1): void {
  const s = getState(platform);
  s.dailyUsed += units;
  s.monthlyUsed += units;
}

export function resetAllQuotas(): void {
  state.clear();
}
```

- [ ] **Step 2: 수집기 통합 등록**

```typescript
// lib/collectors/init.ts
import { collectorRegistry } from './registry';
import { SerperCollector } from './serper-collector';
import { NaverCollector } from './naver-collector';
import { YouTubeCollector } from './youtube-collector';
import { TwitterCollector } from './twitter-collector';
import { RedditCollector } from './reddit-collector';

let registered = false;

export function initCollectors(): void {
  if (registered) return;
  registered = true;

  collectorRegistry.register(new SerperCollector());
  collectorRegistry.register(new NaverCollector());
  collectorRegistry.register(new YouTubeCollector());
  collectorRegistry.register(new TwitterCollector());
  collectorRegistry.register(new RedditCollector());
}
```

- [ ] **Step 3: 커밋**

```bash
git add lib/collectors/quota-tracker.ts lib/collectors/init.ts
git commit -m "feat(collectors): add QuotaTracker and collector initialization"
```

---

## Chunk 3: AI 분석 + 알림 (Phase 3)

### Task 17: 수집 오케스트레이터 (잡 핸들러)

**Files:**
- Create: `lib/collectors/orchestrator.ts`

- [ ] **Step 1: 구현**

수집 잡의 핸들러. 쿼리 목록을 순회하며 수집기를 호출하고 MarketingIntel에 저장한다.

```typescript
// lib/collectors/orchestrator.ts
import { prisma } from '@/lib/prisma';
import { collectorRegistry } from './registry';
import { loadKeywordsForPlatform } from './query-builder';
import { checkQuota, consumeQuota } from './quota-tracker';
import { CollectorError } from './types';
import type { IntelItem } from './types';
import type { JobRunResult } from '@/lib/scheduler/types';

type PrismaIntelPlatform = 'YOUTUBE' | 'TWITTER' | 'REDDIT' | 'SERPER' | 'NAVER';

function toPrismaEngagement(item: IntelItem) {
  return {
    views: item.engagement?.views ?? null,
    likes: item.engagement?.likes ?? null,
    comments: item.engagement?.comments ?? null,
    shares: item.engagement?.shares ?? null,
  };
}

export async function runCollectionJob(platformId: string): Promise<JobRunResult> {
  const collector = collectorRegistry.get(platformId);
  if (!collector) return { ok: false, message: `Collector not found: ${platformId}` };
  if (!collector.isConfigured()) return { ok: false, message: `${platformId} API 키 미설정` };

  const platform = collector.platform as PrismaIntelPlatform;
  const quota = checkQuota(platform);
  if (!quota.canProceed) {
    return { ok: false, message: `${platform} 쿼터 소진 (남은: ${quota.remaining})` };
  }

  const queries = await loadKeywordsForPlatform(platformId);
  if (queries.length === 0) {
    return { ok: true, message: '검색 키워드 없음 (캠페인/워치리스트 등록 필요)' };
  }

  let totalCollected = 0;
  let errors = 0;

  for (const query of queries) {
    const quotaCheck = checkQuota(platform);
    if (!quotaCheck.canProceed) break;

    try {
      const result = await collector.collect(query);
      consumeQuota(platform, 1);

      for (const item of result.items) {
        if (!item.url) continue;
        const engagement = toPrismaEngagement(item);
        await prisma.marketingIntel.upsert({
          where: { platform_url: { platform, url: item.url } },
          create: {
            platform,
            query,
            title: item.title,
            snippet: item.snippet,
            url: item.url,
            publishedAt: item.publishedAt,
            ...engagement,
            raw: item.raw ? JSON.stringify(item.raw) : null,
          },
          update: {
            query,
            title: item.title,
            snippet: item.snippet,
            publishedAt: item.publishedAt,
            ...engagement,
          }
        });
        totalCollected++;
      }
    } catch (err) {
      errors++;
      if (err instanceof CollectorError && (err.code === 'QUOTA' || err.code === 'RATE_LIMIT')) {
        break; // 쿼터/레이트리밋이면 남은 쿼리 스킵
      }
    }
  }

  return {
    ok: errors === 0,
    message: `${platform}: ${totalCollected}건 수집, ${queries.length}개 쿼리 실행, ${errors}건 에러`
  };
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/collectors/orchestrator.ts
git commit -m "feat(collectors): add collection orchestrator with quota integration"
```

---

### Task 18: AI 분석기 (analyzer)

**Files:**
- Create: `lib/intel/analyzer.ts`

- [ ] **Step 1: 구현**

```typescript
// lib/intel/analyzer.ts
import { prisma } from '@/lib/prisma';
import { runLLM } from '@/lib/llm';
import type { RuntimeConfig } from '@/lib/types';

const FREE_RUNTIME: RuntimeConfig = { llmProvider: 'groq' } as RuntimeConfig;

interface AnalysisResult {
  relevance: number;
  urgency: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
  tags: string[];
}

/**
 * 미분석 MarketingIntel 항목을 배치로 분석하여 relevance/urgency를 업데이트한다.
 */
export async function analyzeRecentIntel(batchSize: number = 20): Promise<number> {
  // relevance가 0인 (미분석) 항목 조회
  const items = await prisma.marketingIntel.findMany({
    where: { relevance: 0 },
    orderBy: { createdAt: 'desc' },
    take: batchSize,
  });

  if (items.length === 0) return 0;

  // 활성 브랜드/키워드 로드
  const [campaigns, keywords] = await Promise.all([
    prisma.manualCampaignRoom.findMany({ where: { status: 'ACTIVE' }, select: { brand: true } }),
    prisma.watchKeyword.findMany({ where: { isActive: true }, select: { keyword: true } }),
  ]);

  const brands = campaigns.map((c) => c.brand).join(', ');
  const kws = keywords.map((k) => k.keyword).join(', ');

  const itemsSummary = items.map((item, i) =>
    `[${i}] ${item.platform} | ${item.title} | ${item.snippet.slice(0, 150)}`
  ).join('\n');

  const prompt = `아래 수집된 마케팅 콘텐츠를 분석하세요.
현재 활성 브랜드: ${brands || '(없음)'}
감시 키워드: ${kws || '(없음)'}

${itemsSummary}

각 항목 [번호]에 대해 JSON 배열로 답하세요:
[{"i":0,"relevance":0.8,"urgency":"HIGH","tags":["경쟁사","캠페인"]}, ...]

- relevance (0~1): 마케팅 전략 관련도
- urgency: CRITICAL(즉시 대응), HIGH(24시간 내), NORMAL, LOW
- tags: 관련 태그 2~4개

JSON 배열만 출력하세요.`;

  let results: AnalysisResult[] = [];
  try {
    const raw = await runLLM(
      '마케팅 인텔리전스 분석가입니다. JSON만 출력하세요.',
      prompt,
      0.2,
      2000,
      FREE_RUNTIME
    );
    // JSON 추출
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      results = JSON.parse(match[0]) as (AnalysisResult & { i: number })[];
    }
  } catch {
    return 0; // LLM 실패 시 다음 주기에 재시도
  }

  let updated = 0;
  for (const r of results as (AnalysisResult & { i: number })[]) {
    const item = items[r.i];
    if (!item) continue;
    await prisma.marketingIntel.update({
      where: { id: item.id },
      data: {
        relevance: Math.max(0, Math.min(1, r.relevance || 0)),
        urgency: (['CRITICAL', 'HIGH', 'NORMAL', 'LOW'].includes(r.urgency) ? r.urgency : 'NORMAL') as 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW',
        tags: JSON.stringify(r.tags || []),
      }
    });
    updated++;
  }

  return updated;
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/intel/analyzer.ts
git commit -m "feat(intel): add AI analyzer for relevance/urgency scoring"
```

---

### Task 19: 긴급 탐지기 (urgent-detector)

**Files:**
- Create: `lib/intel/urgent-detector.ts`

- [ ] **Step 1: 구현**

```typescript
// lib/intel/urgent-detector.ts
import { prisma } from '@/lib/prisma';
import { sendSlackMessage } from '@/lib/integrations/slack';

/**
 * CRITICAL urgency 항목 중 아직 알림을 보내지 않은 것을 찾아 즉시 Slack 발송한다.
 * 수집+분석 직후 호출된다.
 */
export async function detectAndAlertUrgent(): Promise<number> {
  // digestId가 null이고 urgency가 CRITICAL인 미알림 항목
  const urgentItems = await prisma.marketingIntel.findMany({
    where: {
      urgency: 'CRITICAL',
      digestId: null,
      relevance: { gte: 0.5 },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  if (urgentItems.length === 0) return 0;

  // 긴급 다이제스트 생성
  const digest = await prisma.marketingDigest.create({
    data: {
      type: 'URGENT',
      headline: `긴급 마케팅 인텔 ${urgentItems.length}건 감지`,
      summary: urgentItems.map((item) => `[${item.platform}] ${item.title}`).join('\n'),
      insights: JSON.stringify([]),
      actions: JSON.stringify([]),
      itemCount: urgentItems.length,
    }
  });

  // 항목에 다이제스트 연결
  await prisma.marketingIntel.updateMany({
    where: { id: { in: urgentItems.map((i) => i.id) } },
    data: { digestId: digest.id }
  });

  // Slack 발송
  if (process.env.SLACK_WEBHOOK_URL) {
    const message = urgentItems
      .map((item) => `*[${item.platform}]* ${item.title}\n${item.snippet.slice(0, 200)}\n${item.url}`)
      .join('\n\n');

    await sendSlackMessage({
      text: `*[긴급 마케팅 인텔]*\n\n${message}`
    });

    await prisma.marketingDigest.update({
      where: { id: digest.id },
      data: { notifiedAt: new Date() }
    });
  }

  return urgentItems.length;
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/intel/urgent-detector.ts
git commit -m "feat(intel): add urgent issue detector with Slack alerts"
```

---

### Task 20: 데일리 다이제스트 빌더

**Files:**
- Create: `lib/intel/digest-builder.ts`

- [ ] **Step 1: 구현**

```typescript
// lib/intel/digest-builder.ts
import { prisma } from '@/lib/prisma';
import { runLLM } from '@/lib/llm';
import { sendSlackMessage } from '@/lib/integrations/slack';
import type { RuntimeConfig } from '@/lib/types';
import type { JobRunResult } from '@/lib/scheduler/types';

export async function buildDailyDigest(runtime?: RuntimeConfig): Promise<JobRunResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const items = await prisma.marketingIntel.findMany({
    where: {
      createdAt: { gte: since },
      relevance: { gte: 0.3 },
    },
    orderBy: { relevance: 'desc' },
    take: 50,
  });

  if (items.length === 0) {
    return { ok: true, message: '지난 24시간 수집된 관련 인텔 없음' };
  }

  const summary = items
    .map((item) => `[${item.platform}/${item.urgency}] ${item.title}: ${item.snippet.slice(0, 100)}`)
    .join('\n');

  const analysis = await runLLM(
    '마케팅 전략 분석가입니다. 한국어로 간결하게 분석하세요.',
    `지난 24시간 수집된 마케팅 인텔리전스를 분석하세요:

${summary}

아래 JSON 형식으로 답변하세요:
{
  "headline": "한 줄 핵심 요약",
  "insights": [{"category": "카테고리", "summary": "요약", "source_count": N}],
  "actions": [{"priority": "NOW|NEXT|LATER", "title": "추천 액션"}]
}

JSON만 출력하세요.`,
    0.3,
    2000,
    runtime
  );

  let parsed: { headline: string; insights: unknown[]; actions: unknown[] };
  try {
    const match = analysis.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : { headline: '분석 실패', insights: [], actions: [] };
  } catch {
    parsed = { headline: analysis.slice(0, 100), insights: [], actions: [] };
  }

  const digest = await prisma.marketingDigest.create({
    data: {
      type: 'DAILY',
      headline: parsed.headline,
      summary: analysis,
      insights: JSON.stringify(parsed.insights),
      actions: JSON.stringify(parsed.actions),
      itemCount: items.length,
    }
  });

  // 항목에 다이제스트 연결
  await prisma.marketingIntel.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: { digestId: digest.id }
  });

  // Slack 발송
  if (process.env.SLACK_WEBHOOK_URL) {
    await sendSlackMessage({
      text: `*[Garnet 데일리 마케팅 인텔]*\n\n*${parsed.headline}*\n\n수집: ${items.length}건\n${analysis.slice(0, 800)}`
    });
    await prisma.marketingDigest.update({
      where: { id: digest.id },
      data: { notifiedAt: new Date() }
    });
  }

  return { ok: true, message: parsed.headline, data: { digestId: digest.id, itemCount: items.length } };
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/intel/digest-builder.ts
git commit -m "feat(intel): add daily digest builder with AI summary"
```

---

### Task 21: 수집 잡 등록 + 통합 완성

**Files:**
- Modify: `lib/scheduler/register-jobs.ts`
- Create: `lib/scheduler/maintenance.ts`

- [ ] **Step 1: maintenance 잡 구현**

```typescript
// lib/scheduler/maintenance.ts
import { prisma } from '@/lib/prisma';
import type { JobRunResult } from './types';

export async function runMaintenanceJob(): Promise<JobRunResult> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  // JobRun: 90일 이상 삭제
  const deletedJobRuns = await prisma.jobRun.deleteMany({
    where: { createdAt: { lt: ninetyDaysAgo } }
  });

  // MarketingIntel: 30일 이상 raw 필드 정리
  const clearedRaw = await prisma.marketingIntel.updateMany({
    where: { createdAt: { lt: thirtyDaysAgo }, raw: { not: null } },
    data: { raw: null }
  });

  // MarketingIntel: 180일 이상 + 저관련도 삭제
  const deletedIntel = await prisma.marketingIntel.deleteMany({
    where: { createdAt: { lt: oneEightyDaysAgo }, relevance: { lt: 0.1 } }
  });

  return {
    ok: true,
    message: `정리 완료: JobRun ${deletedJobRuns.count}건 삭제, raw ${clearedRaw.count}건 정리, Intel ${deletedIntel.count}건 삭제`
  };
}
```

- [ ] **Step 2: register-jobs.ts에 수집 잡 + 분석 잡 추가**

`lib/scheduler/register-jobs.ts` 에 수집 잡, 분석 잡, 다이제스트 잡, maintenance 잡을 추가한다.

```typescript
// lib/scheduler/register-jobs.ts에 추가할 import와 잡 정의:

import { runCollectionJob } from '@/lib/collectors/orchestrator';
import { analyzeRecentIntel } from '@/lib/intel/analyzer';
import { detectAndAlertUrgent } from '@/lib/intel/urgent-detector';
import { buildDailyDigest } from '@/lib/intel/digest-builder';
import { runMaintenanceJob } from './maintenance';
import { resetAllQuotas } from '@/lib/collectors/quota-tracker';
import { initCollectors } from '@/lib/collectors/init';

// COLLECTION_JOBS를 BUILTIN_JOBS 배열에 추가:
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
      if (result.ok) {
        await analyzeRecentIntel();
        await detectAndAlertUrgent();
      }
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
      if (result.ok) {
        await analyzeRecentIntel();
        await detectAndAlertUrgent();
      }
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
      if (result.ok) {
        await analyzeRecentIntel();
        await detectAndAlertUrgent();
      }
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
      if (result.ok) {
        await analyzeRecentIntel();
        await detectAndAlertUrgent();
      }
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
      if (result.ok) {
        await analyzeRecentIntel();
        await detectAndAlertUrgent();
      }
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
    handler: async () => {
      resetAllQuotas();
      return { ok: true, message: 'API 쿼터 리셋 완료' };
    }
  }
];

// registerBuiltinJobs에서 initCollectors() 호출 + COLLECTION_JOBS 등록 추가
```

> **주의**: `registerBuiltinJobs()` 함수 상단에 `initCollectors()` 호출을 추가하고, `[...BUILTIN_JOBS, ...COLLECTION_JOBS]`를 순회해야 한다.

- [ ] **Step 3: 커밋**

```bash
git add lib/scheduler/register-jobs.ts lib/scheduler/maintenance.ts
git commit -m "feat(scheduler): register collection, analysis, digest, and maintenance jobs"
```

---

### Task 22: WatchKeyword API 라우트

**Files:**
- Create: `app/api/watch-keywords/route.ts`

- [ ] **Step 1: 구현**

```typescript
// app/api/watch-keywords/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const keywords = await prisma.watchKeyword.findMany({
    orderBy: { createdAt: 'desc' }
  });
  return NextResponse.json({ keywords });
}

const createSchema = z.object({
  keyword: z.string().min(1),
  category: z.enum(['BRAND', 'COMPETITOR', 'TREND', 'GENERAL']).optional(),
  platforms: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  try {
    const body = createSchema.parse(await req.json());
    const keyword = await prisma.watchKeyword.create({
      data: {
        keyword: body.keyword,
        category: body.category || 'GENERAL',
        platforms: JSON.stringify(body.platforms || []),
      }
    });
    return NextResponse.json({ keyword });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add app/api/watch-keywords/route.ts
git commit -m "feat(api): add watch keywords CRUD endpoint"
```

---

### Task 23: MarketingIntel API 라우트

**Files:**
- Create: `app/api/intel/route.ts`
- Create: `app/api/intel/digests/route.ts`

- [ ] **Step 1: 인텔 목록 API**

```typescript
// app/api/intel/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get('platform');
  const urgency = searchParams.get('urgency');
  const limit = Math.min(Number(searchParams.get('limit') || '50'), 100);

  const where: Record<string, unknown> = {};
  if (platform) where.platform = platform.toUpperCase();
  if (urgency) where.urgency = urgency.toUpperCase();

  const items = await prisma.marketingIntel.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}
```

- [ ] **Step 2: 다이제스트 목록 API**

```typescript
// app/api/intel/digests/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const limit = Math.min(Number(searchParams.get('limit') || '20'), 50);

  const where: Record<string, unknown> = {};
  if (type) where.type = type.toUpperCase();

  const digests = await prisma.marketingDigest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { items: { take: 5, orderBy: { relevance: 'desc' } } }
  });

  return NextResponse.json({ digests });
}
```

- [ ] **Step 3: 커밋**

```bash
git add app/api/intel/route.ts app/api/intel/digests/route.ts
git commit -m "feat(api): add marketing intel and digest list endpoints"
```

---

### Task 24: 최종 통합 테스트 + 정리

**Files:**
- Create: `lib/scheduler/__tests__/integration.test.ts`

- [ ] **Step 1: 통합 테스트 작성**

```typescript
// lib/scheduler/__tests__/integration.test.ts
import { describe, it, expect } from 'vitest';

describe('Scheduler Integration', () => {
  it('should import init module without errors', async () => {
    const mod = await import('@/lib/scheduler/init');
    expect(typeof mod.initSchedulerSystem).toBe('function');
    expect(typeof mod.shutdownSchedulerSystem).toBe('function');
  });

  it('should import all collectors without errors', async () => {
    const mod = await import('@/lib/collectors/init');
    expect(typeof mod.initCollectors).toBe('function');
  });

  it('should import analyzer without errors', async () => {
    const mod = await import('@/lib/intel/analyzer');
    expect(typeof mod.analyzeRecentIntel).toBe('function');
  });

  it('should import digest builder without errors', async () => {
    const mod = await import('@/lib/intel/digest-builder');
    expect(typeof mod.buildDailyDigest).toBe('function');
  });

  it('should import urgent detector without errors', async () => {
    const mod = await import('@/lib/intel/urgent-detector');
    expect(typeof mod.detectAndAlertUrgent).toBe('function');
  });
});
```

- [ ] **Step 2: 전체 테스트 실행**

```bash
npx vitest run
```

- [ ] **Step 3: 최종 커밋**

```bash
git add lib/scheduler/__tests__/integration.test.ts
git commit -m "test: add scheduler + collector + intel integration tests"
```
