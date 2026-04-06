# GA4 요약 연결 & Vercel Cron 마이그레이션 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 텔레그램 `요약` 명령이 GA4 실제 데이터를 반환하고, Vercel Cron으로 daily-briefing · ga4-analysis 두 잡이 매일 자동 실행되도록 한다.

**Architecture:** `lib/analytics/ga4.ts`의 스텁을 `lib/ga4-client.ts`의 `fetchDailyTraffic()`을 활용해 실제 구현으로 교체한다. Vercel 네이티브 Cron Jobs를 위한 GET 라우트 2개를 신규 생성하고 `vercel.json`에 crons 배열을 추가한다. ToadScheduler 코드는 Vercel 서버리스에서 자동으로 동작하지 않으므로 그대로 유지한다.

**Tech Stack:** Next.js 14 App Router, Vitest, `@google-analytics/data` (lib/ga4-client.ts에서 사용 중), Vercel Cron Jobs

---

## Chunk 1: GA4 요약

### Task 1: getTodaySummary() 구현

**Files:**
- Modify: `lib/analytics/ga4.ts` (스텁 → 실제 구현, 7줄 → ~30줄)
- Create: `lib/__tests__/analytics-ga4.test.ts`

**배경 지식:**
- `lib/ga4-client.ts`는 `fetchDailyTraffic(startDate, endDate): Promise<GA4DailyTraffic[]>`를 export한다
- `GA4DailyTraffic` 타입: `{ activeUsers: number; sessions: number; screenPageViews: number; eventCount: number; conversions: number }`
- `isGA4Configured()` — 환경변수(`GA4_PROPERTY_ID`, `GA4_CLIENT_EMAIL`, `GA4_PRIVATE_KEY`) 세 가지가 모두 설정돼 있으면 `true` 반환
- `fetchDailyTraffic`은 인증 실패 또는 API 오류 시 throw한다
- 날짜는 KST 기준: `new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })` → `'YYYY-MM-DD'`
- 기존 테스트 패턴: `vi.resetModules()` + `vi.stubGlobal` / `vi.mock` 사용 (`lib/__tests__/telegram.test.ts` 참고)

- [ ] **Step 1: 테스트 파일 생성**

`lib/__tests__/analytics-ga4.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ga4-client', () => ({
  isGA4Configured: vi.fn(),
  fetchDailyTraffic: vi.fn(),
}));

import { getTodaySummary } from '@/lib/analytics/ga4';
import { isGA4Configured, fetchDailyTraffic } from '@/lib/ga4-client';

const MOCK_ROW = {
  activeUsers: 1234,
  sessions: 2345,
  screenPageViews: 5000,
  eventCount: 10000,
  conversions: 47,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getTodaySummary', () => {
  it('returns unconfigured message when GA4 is not set up', async () => {
    vi.mocked(isGA4Configured).mockReturnValue(false);
    const result = await getTodaySummary();
    expect(result).toBe('GA4가 설정되지 않았습니다');
    expect(fetchDailyTraffic).not.toHaveBeenCalled();
  });

  it('returns no-data message when fetchDailyTraffic returns empty array', async () => {
    vi.mocked(isGA4Configured).mockReturnValue(true);
    vi.mocked(fetchDailyTraffic).mockResolvedValue([]);
    const result = await getTodaySummary();
    expect(result).toBe('오늘 데이터가 아직 없습니다');
  });

  it('formats visitors, sessions, and conversion rate correctly', async () => {
    vi.mocked(isGA4Configured).mockReturnValue(true);
    vi.mocked(fetchDailyTraffic).mockResolvedValue([MOCK_ROW]);
    const result = await getTodaySummary();
    // 방문자 1234 → '1,234명', 세션 2345 → '2,345', 전환율 47/2345*100 ≈ 2.0%
    expect(result).toContain('1,234명');
    expect(result).toContain('2,345');
    expect(result).toContain('%');
    expect(result).toContain('👤');
    expect(result).toContain('📈');
    expect(result).toContain('🎯');
  });

  it('shows 0.0% conversion rate when sessions is 0', async () => {
    vi.mocked(isGA4Configured).mockReturnValue(true);
    vi.mocked(fetchDailyTraffic).mockResolvedValue([{ ...MOCK_ROW, sessions: 0, conversions: 0 }]);
    const result = await getTodaySummary();
    expect(result).toContain('0.0%');
  });

  it('propagates error when fetchDailyTraffic throws', async () => {
    vi.mocked(isGA4Configured).mockReturnValue(true);
    vi.mocked(fetchDailyTraffic).mockRejectedValue(new Error('GA4 API error'));
    await expect(getTodaySummary()).rejects.toThrow('GA4 API error');
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd "/Users/rnr/Documents/New project"
npx vitest run lib/__tests__/analytics-ga4.test.ts
```

Expected: 5개 테스트 모두 FAIL (`getTodaySummary throws 'GA4 not yet implemented'`)

- [ ] **Step 3: getTodaySummary() 구현**

`lib/analytics/ga4.ts` 전체 교체:

```typescript
import { fetchDailyTraffic, isGA4Configured } from '@/lib/ga4-client';

export async function getTodaySummary(): Promise<string> {
  if (!isGA4Configured()) {
    return 'GA4가 설정되지 않았습니다';
  }

  // KST 기준 날짜 — sv-SE 로케일이 'YYYY-MM-DD' 형식 반환
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const data = await fetchDailyTraffic(today, today);
  // 인증 실패 / 네트워크 오류 시 fetchDailyTraffic이 throw → 호출부(telegram-router)의 catch로 전파

  if (!data || data.length === 0) {
    return '오늘 데이터가 아직 없습니다';
  }

  const row = data[0];
  const visitors = row.activeUsers.toLocaleString('ko-KR');
  const sessions = row.sessions.toLocaleString('ko-KR');
  const convRate = row.sessions > 0
    ? ((row.conversions / row.sessions) * 100).toFixed(1)
    : '0.0';

  const dateLabel = new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
  });
  return `${dateLabel} 기준\n👤 방문자: ${visitors}명\n📈 세션: ${sessions}\n🎯 전환율: ${convRate}%`;
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
npx vitest run lib/__tests__/analytics-ga4.test.ts
```

Expected: 5/5 PASS

- [ ] **Step 5: 전체 테스트 스위트 이상 없는지 확인**

```bash
npx vitest run
```

Expected: 기존 테스트 모두 통과 (회귀 없음)

- [ ] **Step 6: 커밋**

```bash
git add lib/analytics/ga4.ts lib/__tests__/analytics-ga4.test.ts
git commit -m "feat(analytics): implement getTodaySummary() using fetchDailyTraffic"
```

---

## Chunk 2: Vercel Cron 라우트 + vercel.json

### Task 2: Cron 라우트 2개 생성

**Files:**
- Create: `app/api/cron/daily-briefing/route.ts`
- Create: `app/api/cron/ga4-analysis/route.ts`
- Create: `app/api/cron/__tests__/daily-briefing.test.ts`
- Create: `app/api/cron/__tests__/ga4-analysis.test.ts`

**배경 지식:**
- Vercel은 Cron 호출 시 `Authorization: Bearer {CRON_SECRET}` 헤더를 자동 포함
- `CRON_SECRET` 미설정 시(`undefined`) 모든 요청 거부 — 의도된 동작
- `lib/job-scheduler.ts`는 `runDailyBriefingJob()`, `runGA4AnalysisJob()` 두 함수를 export함
- 기존 API 라우트 테스트 패턴: `app/api/telegram/webhook/__tests__/route.test.ts` 참고
- 라우트는 GET 메서드 사용 (Vercel Cron은 GET으로 호출)

- [ ] **Step 1: 테스트 디렉토리 생성 및 daily-briefing 테스트 파일 작성**

`app/api/cron/__tests__/daily-briefing.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/job-scheduler', () => ({
  runDailyBriefingJob: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/cron/daily-briefing/route';
import { runDailyBriefingJob } from '@/lib/job-scheduler';

const VALID_SECRET = 'test-cron-secret';

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('Authorization', authHeader);
  return new Request('https://garnet.app/api/cron/daily-briefing', { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = VALID_SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/daily-briefing', () => {
  it('returns 401 when CRON_SECRET env is not set', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest(`Bearer ${VALID_SECRET}`));
    expect(res.status).toBe(401);
    expect(runDailyBriefingJob).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(runDailyBriefingJob).not.toHaveBeenCalled();
  });

  it('returns 401 when secret does not match', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret'));
    expect(res.status).toBe(401);
    expect(runDailyBriefingJob).not.toHaveBeenCalled();
  });

  it('returns 200 and calls runDailyBriefingJob on valid request', async () => {
    const res = await GET(makeRequest(`Bearer ${VALID_SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(runDailyBriefingJob).toHaveBeenCalledOnce();
  });

  it('returns 500 when runDailyBriefingJob throws', async () => {
    vi.mocked(runDailyBriefingJob).mockRejectedValue(new Error('job failed'));
    const res = await GET(makeRequest(`Bearer ${VALID_SECRET}`));
    expect(res.status).toBe(500);
    expect(runDailyBriefingJob).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: ga4-analysis 테스트 파일 작성**

`app/api/cron/__tests__/ga4-analysis.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/job-scheduler', () => ({
  runGA4AnalysisJob: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '@/app/api/cron/ga4-analysis/route';
import { runGA4AnalysisJob } from '@/lib/job-scheduler';

const VALID_SECRET = 'test-cron-secret';

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('Authorization', authHeader);
  return new Request('https://garnet.app/api/cron/ga4-analysis', { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = VALID_SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/ga4-analysis', () => {
  it('returns 401 when CRON_SECRET env is not set', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest(`Bearer ${VALID_SECRET}`));
    expect(res.status).toBe(401);
    expect(runGA4AnalysisJob).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(runGA4AnalysisJob).not.toHaveBeenCalled();
  });

  it('returns 401 when secret does not match', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret'));
    expect(res.status).toBe(401);
    expect(runGA4AnalysisJob).not.toHaveBeenCalled();
  });

  it('returns 200 and calls runGA4AnalysisJob on valid request', async () => {
    const res = await GET(makeRequest(`Bearer ${VALID_SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(runGA4AnalysisJob).toHaveBeenCalledOnce();
  });

  it('returns 500 when runGA4AnalysisJob throws', async () => {
    vi.mocked(runGA4AnalysisJob).mockRejectedValue(new Error('job failed'));
    const res = await GET(makeRequest(`Bearer ${VALID_SECRET}`));
    expect(res.status).toBe(500);
    expect(runGA4AnalysisJob).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

```bash
npx vitest run app/api/cron/__tests__/
```

Expected: 10개 테스트 모두 FAIL (라우트 파일 없음)

- [ ] **Step 4: daily-briefing 라우트 구현**

`app/api/cron/daily-briefing/route.ts`:

```typescript
export async function GET(req: Request): Promise<Response> {
  if (!process.env.CRON_SECRET || req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const { runDailyBriefingJob } = await import('@/lib/job-scheduler');
    await runDailyBriefingJob();
    return new Response('ok');
  } catch (err) {
    console.error('[cron] daily-briefing 실패', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
```

- [ ] **Step 5: ga4-analysis 라우트 구현**

`app/api/cron/ga4-analysis/route.ts`:

```typescript
export async function GET(req: Request): Promise<Response> {
  if (!process.env.CRON_SECRET || req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const { runGA4AnalysisJob } = await import('@/lib/job-scheduler');
    await runGA4AnalysisJob();
    return new Response('ok');
  } catch (err) {
    console.error('[cron] ga4-analysis 실패', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
```

- [ ] **Step 6: 테스트 실행 — 통과 확인**

```bash
npx vitest run app/api/cron/__tests__/
```

Expected: 10/10 PASS

- [ ] **Step 7: 전체 테스트 스위트 이상 없는지 확인**

```bash
npx vitest run
```

Expected: 전체 테스트 통과 (회귀 없음)

- [ ] **Step 8: 커밋**

```bash
git add app/api/cron/daily-briefing/route.ts app/api/cron/ga4-analysis/route.ts app/api/cron/__tests__/daily-briefing.test.ts app/api/cron/__tests__/ga4-analysis.test.ts
git commit -m "feat(cron): add Vercel Cron routes for daily-briefing and ga4-analysis"
```

### Task 3: vercel.json에 crons 배열 추가

**Files:**
- Modify: `vercel.json`

테스트 없음 — JSON 설정 파일이므로 빌드(`npx next build`를 로컬에서 돌리기는 무거우므로 스킵)로 검증한다.

> **타임존 주의:** Vercel Cron은 UTC 기준이다. `15 7 * * *` = UTC 07:15 = KST 16:15. KST 오전 7:15에 받고 싶다면 배포 후 `15 22 * * *`으로 수정한다. 지금은 원본 값 그대로 사용한다.

- [ ] **Step 1: vercel.json 수정**

`vercel.json` 전체 내용:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "prisma generate && next build",
  "framework": "nextjs",
  "crons": [
    {
      "path": "/api/cron/daily-briefing",
      "schedule": "15 7 * * *"
    },
    {
      "path": "/api/cron/ga4-analysis",
      "schedule": "0 8 * * *"
    }
  ]
}
```

- [ ] **Step 2: JSON 유효성 확인**

```bash
node -e "JSON.parse(require('fs').readFileSync('vercel.json', 'utf8')); console.log('valid JSON')"
```

Expected: `valid JSON`

- [ ] **Step 3: 커밋 및 푸시**

```bash
git add vercel.json
git commit -m "feat(deploy): add Vercel Cron jobs for daily-briefing and ga4-analysis"
git push origin main
```

Expected: Vercel 자동 배포 시작

### Task 4: 배포 후 검증

- [ ] **Step 1: Vercel 대시보드에서 Cron Jobs 탭 확인**

Vercel 프로젝트 → Settings → Cron Jobs 탭에서 `daily-briefing`, `ga4-analysis` 두 잡이 표시되는지 확인

- [ ] **Step 2: CRON_SECRET 환경변수 추가**

Vercel 프로젝트 → Settings → Environment Variables에서 `CRON_SECRET` 추가:

```bash
# 랜덤 시크릿 생성 (로컬에서 실행 후 복사)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

생성된 값을 `CRON_SECRET`으로 Vercel 환경변수에 추가한 뒤 재배포(Redeploy) 트리거

- [ ] **Step 3: 텔레그램에서 `요약` 명령 테스트**

봇에 `요약` 전송 → `N월 N일 기준\n👤 방문자: ...` 형식 응답 확인

(GA4에 오늘 데이터가 없으면 `오늘 데이터가 아직 없습니다` 응답 — 정상)
