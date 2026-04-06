# GA4 요약 연결 & Vercel Cron 마이그레이션 설계 문서

## 목표

1. 텔레그램 `요약` 명령이 GA4 실제 데이터를 반환하도록 `getTodaySummary()` 구현
2. ToadScheduler(서버리스 비호환) → Vercel Cron으로 교체, Hobby 플랜(무료) 기준 핵심 잡 2개만 유지

## 배경

### GA4 요약
`lib/telegram-router.ts`의 `요약` 명령 핸들러는 `lib/analytics/ga4.ts`의 `getTodaySummary()`를 호출하지만, 해당 함수는 "not yet implemented"를 throw하는 스텁이다. `lib/ga4-client.ts`에 `fetchDailyTraffic()`이 이미 구현돼 있으므로 이를 활용한다.

`lib/analytics/ga4.ts`는 현재 스텁 상태로, 호출 시 `Error('GA4 not yet implemented')`를 throw한다. 이번 작업으로 완전히 교체한다.

### Vercel Cron 마이그레이션
ToadScheduler는 장기 실행 Node.js 프로세스 기반으로, Vercel 서버리스 환경에서는 요청마다 함수가 생성/종료되기 때문에 스케줄러가 실제로 동작하지 않는다. `register-jobs.ts`의 기존 등록 코드는 건드리지 않고(Vercel에서 자동으로 동작 안 함), Vercel 네이티브 Cron Jobs만 추가한다. `lib/job-scheduler.ts`에는 이미 `runDailyBriefingJob()`, `runGA4AnalysisJob()`이 구현돼 있으므로 이를 그대로 호출한다.

## 아키텍처

```
[GA4 요약]
  텔레그램 "요약" 명령
    → lib/telegram-router.ts → getTodaySummary()
    → lib/analytics/ga4.ts → fetchDailyTraffic() (lib/ga4-client.ts)
    → "📊 오늘 요약\n👤 방문자: N명\n📈 세션: N\n🎯 전환율: N%" 반환

[Vercel Cron]
  vercel.json crons 배열
    → /api/cron/daily-briefing  (15 7 * * *  — UTC 기준, 아래 타임존 주의 참고)
    → /api/cron/ga4-analysis    (0 8 * * *   — UTC 기준)
  각 라우트: Authorization 헤더 검증 → lib/job-scheduler.ts 잡 함수 호출
```

## 파일 구조

| 파일 | 변경 | 역할 |
|------|------|------|
| `lib/analytics/ga4.ts` | 수정 (스텁 → 실제 구현) | `getTodaySummary()` 구현 |
| `vercel.json` | 수정 | `crons` 배열 추가 |
| `app/api/cron/daily-briefing/route.ts` | 신규 | daily-briefing 잡 엔드포인트 |
| `app/api/cron/ga4-analysis/route.ts` | 신규 | ga4-analysis 잡 엔드포인트 |

`lib/scheduler/register-jobs.ts`는 변경하지 않는다. ToadScheduler는 Vercel에서 실행되지 않으므로 등록 코드가 남아 있어도 동작하지 않는다.

## 상세 설계

### lib/analytics/ga4.ts

`GA4DailyTraffic`의 모든 필드는 `number` 타입(nullable 아님)이므로 nullish coalescing 없이 사용한다.

날짜 처리: GA4 날짜 차원은 UTC 기준이고 Vercel 함수도 UTC에서 실행되므로 UTC 날짜를 그대로 사용한다. 표시 레이블만 KST로 변환한다.

```typescript
import { fetchDailyTraffic, isGA4Configured } from '@/lib/ga4-client';

export async function getTodaySummary(): Promise<string> {
  if (!isGA4Configured()) {
    return 'GA4가 설정되지 않았습니다';
  }

  // KST 기준 날짜 사용 — UTC와 최대 9시간 차이가 있으므로 timeZone 명시
  // sv-SE 로케일은 'YYYY-MM-DD' 형식을 반환하므로 GA4 날짜 파라미터에 바로 사용 가능
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // 'YYYY-MM-DD'
  const data = await fetchDailyTraffic(today, today);
  // fetchDailyTraffic은 인증 실패 / 네트워크 오류 시 throw → 호출부(telegram-router)의 catch로 전파

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

### vercel.json (전체 파일)

기존 `buildCommand`, `framework` 필드를 유지하고 `crons` 배열만 추가한다.

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

> **타임존 주의:** Vercel Cron은 UTC 기준으로 실행된다. `15 7 * * *`은 UTC 07:15 = KST 16:15다. 아침 브리핑을 KST 07:15에 받으려면 `15 22 * * *`(전날 UTC 22:15)으로 변경해야 한다. 현재 스프린트에서는 기존 register-jobs.ts의 원본 cron 값을 그대로 사용하고, 타임존 조정은 배포 후 실제 동작을 확인한 뒤 수정한다.

### app/api/cron/daily-briefing/route.ts

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

### app/api/cron/ga4-analysis/route.ts

`runGA4AnalysisJob`은 `runtime?: RuntimeConfig` 파라미터를 받지만, Cron 트리거는 런타임 설정 없이 기본값으로 실행한다.

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

## 환경변수

```
CRON_SECRET   # 무단 호출 방지용 랜덤 문자열 (Vercel 환경변수에 추가 필요)
```

Vercel은 Cron 호출 시 `Authorization: Bearer {CRON_SECRET}` 헤더를 자동으로 포함한다. 로컬 개발 시 `CRON_SECRET` 미설정이면 모든 Cron 요청이 401로 거부된다(의도된 동작).

## 에러 처리

| 상황 | 처리 |
|------|------|
| GA4 미설정 (`isGA4Configured()` false) | "GA4가 설정되지 않았습니다" 문자열 반환 (예외 아님) |
| GA4 데이터 없음 (빈 배열) | "오늘 데이터가 아직 없습니다" 반환 |
| `fetchDailyTraffic` 예외 (네트워크/API 오류) | 예외 전파 → telegram-router의 catch에서 "오류 발생" 메시지 전송 |
| Cron `CRON_SECRET` 미설정 | 401 반환 |
| Cron Authorization 헤더 불일치 | 401 반환 |
| Cron 잡 실행 실패 | console.error 후 500 반환, Vercel 대시보드 로그에서 확인 |

## 테스트 전략

- `lib/analytics/ga4.ts`:
  - GA4 미설정 → 안내 문자열 반환
  - 데이터 없음 → 안내 문자열 반환
  - 정상 데이터 → 포맷 확인 (방문자/세션/전환율)
  - `fetchDailyTraffic` throw → 예외 전파
- `app/api/cron/daily-briefing/route.ts`:
  - `CRON_SECRET` 미설정 → 401
  - Authorization 불일치 → 401
  - 정상 호출 → 200 "ok"
  - 잡 실패 → 500
- `app/api/cron/ga4-analysis/route.ts`: 동일 패턴
