# Cron 스케줄러 + 마케팅 인텔리전스 자동 수집 설계

> 날짜: 2026-03-24
> 상태: Reviewed

## 개요

Garnet의 잡 스케줄러를 `node-cron` 수준의 단순 구조에서 `croner` + `toad-scheduler` 기반의 프로덕션급 Cron 엔진으로 교체하고, 멀티 플랫폼 웹 수집기를 통해 마케팅 인텔리전스를 자동 수집/분석/알림하는 시스템을 구축한다.

### 목표

1. **진짜 시간 기반 자동 실행** — `cronLike: 'daily'` 문자열이 아닌 실제 Cron 표현식으로 잡 실행
2. **앱 재시작 시 catch-up** — 놓친 잡을 자동 보충 실행
3. **잡 실행 이력 DB 저장** — in-memory `lastRunAt` → Prisma `JobRun` 모델
4. **멀티 플랫폼 마케팅 자료 자동 수집** — YouTube, Twitter/X, Reddit, 네이버, 웹/뉴스
5. **AI 기반 분석 + 긴급 알림** — 수집 즉시 관련도/긴급도 판단, 데일리 다이제스트 생성
6. **하이브리드 아키텍처** — Electron 앱 내부에서 실행하되, 향후 서버 분리 가능한 구조

## 기술 스택 선정

### 스케줄링 엔진: croner + toad-scheduler

| 항목 | croner | toad-scheduler |
|------|--------|----------------|
| 역할 | Cron 표현식 파싱/실행 | 잡 라이프사이클 관리 |
| 의존성 | **0개** | croner (peer dep) |
| TypeScript | 네이티브 | 네이티브 |
| Electron 호환 | 최적 (in-memory, worker thread 없음) | 최적 |
| 핵심 기능 | 초/년/L/W/# 크론 문법, `protect` 오버런 방지 | ID별 잡 관리, `preventOverrun`, `AsyncTask`, `runImmediately` |
| 번들 크기 | 6.8KB | ~128KB |

**선정 이유:**
- `node-cron` 대비 의존성 0개, 더 풍부한 크론 문법, 오버런 방지 내장
- `bree` 대비 Electron에서 worker thread 문제 없음
- `BullMQ` 대비 Redis 불필요, 데스크탑 앱에 적합

## 아키텍처

### 전체 데이터 흐름

```
[Cron 트리거]
    ↓
[검색어 생성] ← WatchKeyword + ManualCampaignRoom
    ↓
[플랫폼별 수집기] → YouTube / Twitter / Reddit / Naver / Serper
    ↓
[MarketingIntel 저장]
    ↓
[AI 분석] → relevance(0~1) + urgency 점수 부여
    ↓
  ┌─────────────────┐
  │ urgency=critical │──→ 즉시 Slack 알림
  └─────────────────┘
    ↓
[데일리 다이제스트] → 매일 7시, 24시간 수집분 AI 요약 → MarketingDigest → Slack + 대시보드
```

## 파일 구조

```
lib/
├── scheduler/
│   ├── engine.ts              -- toad-scheduler 래퍼 (시작/종료/catch-up)
│   ├── job-registry.ts        -- 잡 CRUD, 상태 조회, DB 이력 저장
│   ├── catch-up.ts            -- 앱 재시작 시 놓친 잡 보충
│   └── types.ts               -- ScheduledJobConfig, JobRunResult 타입
│
├── collectors/
│   ├── types.ts               -- ICollector, CollectorResult, IntelItem
│   ├── registry.ts            -- 수집기 등록/조회/isConfigured 체크
│   ├── query-builder.ts       -- 캠페인+워치리스트 → 플랫폼별 검색어 생성
│   ├── serper-collector.ts    -- 웹/뉴스 (기존 search.ts 활용)
│   ├── youtube-collector.ts   -- YouTube Data API v3
│   ├── twitter-collector.ts   -- Twitter/X API v2
│   ├── reddit-collector.ts    -- Reddit API
│   └── naver-collector.ts     -- 네이버 검색 API
│
├── intel/
│   ├── analyzer.ts            -- 수집 항목 relevance/urgency 점수 부여
│   ├── digest-builder.ts      -- 데일리/주간 다이제스트 AI 생성
│   └── urgent-detector.ts     -- 긴급 이슈 감지 + 즉시 알림
│
├── job-scheduler.ts           -- (기존) → engine.ts로 마이그레이션 후 삭제
├── seminar-scheduler.ts       -- (기존) 별도 유지, engine 라이프사이클에서 start/stop만 관리
```

## 데이터 모델 (Prisma)

### JobRun — 잡 실행 이력

기존 in-memory `lastRunAt`을 대체한다. 모든 잡의 실행 결과를 영구 저장한다.

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

### MarketingIntel — 수집된 마케팅 인텔리전스

모든 플랫폼의 수집 결과를 통합 저장한다.

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
  relevance    Float         @default(0)        // AI 마케팅 관련도 (0~1)
  urgency      IntelUrgency  @default(NORMAL)
  tags         String        @default("[]")
  raw          String?                          // 원본 데이터 (30일 후 자동 정리)
  campaignId   String?                          // 관련 캠페인 연결 (선택)
  digestId     String?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @default(now()) @updatedAt
  digest       MarketingDigest? @relation(fields: [digestId], references: [id])
  campaign     ManualCampaignRoom? @relation(fields: [campaignId], references: [id])

  @@unique([platform, url])
  @@index([platform, createdAt])
  @@index([urgency, createdAt])
  @@index([relevance])
  @@index([campaignId])
}
```

### MarketingDigest — AI 분석 다이제스트

데일리/주간 리포트 및 긴급 알림을 저장한다.

```prisma
enum DigestType {
  DAILY
  URGENT
  WEEKLY
}

model MarketingDigest {
  id           String           @id @default(cuid())
  type         DigestType
  headline     String
  summary      String
  insights     String           // JSON: 핵심 인사이트 배열
  actions      String           // JSON: 추천 액션 배열
  itemCount    Int              @default(0)
  notifiedAt   DateTime?
  createdAt    DateTime         @default(now())
  items        MarketingIntel[]

  @@index([type, createdAt])
}
```

### WatchKeyword — 감시 키워드

사용자가 직접 등록하는 추가 감시 키워드.

```prisma
enum WatchCategory {
  BRAND
  COMPETITOR
  TREND
  GENERAL
}

model WatchKeyword {
  id          String        @id @default(cuid())
  keyword     String
  category    WatchCategory @default(GENERAL)
  platforms   String        @default("[]")      // JSON: 특정 플랫폼만 지정 가능
  isActive    Boolean       @default(true)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([isActive])
}
```

## API 쿼터 관리

각 플랫폼의 API 사용량을 추적하고 쿼터 초과를 방지한다.

### 쿼터 한도 (기본값)

| 플랫폼 | 일일 한도 | 쿼리당 비용 | 비고 |
|--------|----------|------------|------|
| YouTube Data API v3 | 10,000 units | search=100, videos=1 | 10 쿼리 x 4회/일 = 4,000 units |
| Twitter/X API v2 (Basic) | 10,000 reads/월 | ~1 per tweet | 월 333 reads/일 |
| Reddit API | 100 req/min | 1 per request | 넉넉함 |
| Serper.dev | 플랜별 상이 | 1 per search | 기존 회의 검색과 공유 |
| Naver Search API | 25,000/일 | 1 per request | 넉넉함 |

### QuotaTracker (in-memory + DB)

```typescript
interface QuotaTracker {
  check(platform: string): { remaining: number; canProceed: boolean; };
  consume(platform: string, units: number): void;
  reset(platform: string): void; // 일일 리셋
}
```

- 수집기 실행 전 `check()` → 쿼터 부족 시 `SKIPPED` 상태로 잡 종료
- 일일 리셋은 자정 cron으로 처리
- 환경 변수로 한도 커스텀 가능: `YOUTUBE_DAILY_QUOTA=10000`, `TWITTER_MONTHLY_QUOTA=10000`

## 데이터 보존 정책

SQLite 성능 유지를 위한 자동 정리:

| 테이블 | 보존 기간 | 정리 방식 |
|--------|----------|----------|
| `JobRun` | 90일 | `maintenance` 잡이 주 1회 정리 |
| `MarketingIntel.raw` | 30일 | raw 필드만 NULL 처리 (요약/점수는 유지) |
| `MarketingIntel` (전체) | 180일 | relevance < 0.1인 항목만 삭제 |
| `MarketingDigest` | 365일 | 1년 보존 |

`maintenance` 잡을 Cron 스케줄에 추가: `0 3 * * 0` (매주 일요일 새벽 3시)

## 네트워크/오류 처리

- **오프라인 감지**: 수집 전 간단한 connectivity check (`fetch('https://dns.google')`)
- **네트워크 실패**: `FAILED` 기록 후 다음 정규 스케줄에서 자동 재시도 (별도 재시도 루프 없음)
- **API 에러 분류**: 기존 `lib/llm.ts`의 에러 택소노미 패턴 적용 — `MISSING_CONFIG`, `AUTH`, `QUOTA`, `RATE_LIMIT`, `NETWORK`, `TIMEOUT`
- **Rate limit 429**: 해당 수집기만 다음 주기로 스킵, 다른 수집기는 정상 실행

## 수집기 상세

### 공통 인터페이스

```typescript
interface ICollector {
  id: string;
  name: string;
  platform: IntelPlatform;
  // 단일 쿼리 단위 실행 — 오케스트레이터가 쿼리 배열을 순회하며 호출
  collect(query: string): Promise<CollectorResult>;
  isConfigured(): boolean;
}

interface CollectorResult {
  items: IntelItem[];
  meta: { query: string; source: string; fetchedAt: Date; count: number; };
}

interface IntelItem {
  title: string;
  snippet: string;
  url: string;
  platform: string;
  publishedAt?: Date;
  engagement?: { views?: number; likes?: number; comments?: number; shares?: number; };
  raw?: unknown;
}
```

> **참고**: `collect()`는 단일 쿼리를 받는다. 오케스트레이터(job handler)가 쿼리 목록을 순회하며 각각 호출하고, QuotaTracker와 연동하여 쿼터 초과 시 조기 중단한다.

### 플랫폼별 API 연동

| 플랫폼 | API | 환경 변수 | 비고 |
|--------|-----|----------|------|
| Serper (웹/뉴스) | Serper.dev API | `SEARCH_API_KEY` (기존) | 웹/뉴스/이미지/비디오 별도 엔드포인트 |
| YouTube | YouTube Data API v3 | `YOUTUBE_API_KEY` | `search.list` + `videos.list` |
| Twitter/X | Twitter API v2 | `TWITTER_BEARER_TOKEN` | `tweets/search/recent` |
| Reddit | Reddit API (OAuth2) | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | `/search.json` |
| 네이버 | Naver Search API | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 블로그/뉴스/카페 통합 |

### 소스별 차등 수집 주기

| 소스 | 주기 | Cron 표현식 | 이유 |
|------|------|------------|------|
| Twitter/X | 1시간 | `0 * * * *` | 실시간 트렌드, 바이럴 감지 |
| 웹/뉴스 (Serper) | 2시간 | `0 */2 * * *` | 뉴스 속보, 경쟁사 기사 |
| Naver | 3시간 | `0 */3 * * *` | 한국 시장 블로그/뉴스 |
| YouTube | 6시간 | `0 */6 * * *` | 영상 콘텐츠는 변화 느림 |
| Reddit | 6시간 | `0 */6 * * *` | 토론/리뷰 트렌드 |

### 검색어 생성 로직 (query-builder.ts)

1. `ManualCampaignRoom` (status=ACTIVE)에서 brand, goal 추출
2. `WatchKeyword` (isActive=true)에서 키워드 로드
3. 플랫폼별 최적화:
   - Twitter: 해시태그 추가 (`#브랜드명`), `lang:ko` 필터
   - YouTube: "리뷰", "비교" 접미어 추가
   - Naver: 블로그/뉴스 카테고리 분리
   - Reddit: subreddit 필터 (r/marketing, r/korea 등)
4. 중복 제거 후 플랫폼별 최대 쿼리 수 제한 (기본 10개)

## 분석 파이프라인

### analyzer.ts — 관련도/긴급도 점수

수집 직후 실행. 비용 최적화를 위해 2단계 분석:

1. **1차 필터** (기존 `runLLM()` + free 프로필): 배치로 20개씩 처리, relevance/urgency 점수
2. **2차 심층** (기존 `runLLM()` + 기본 프로필): urgency=CRITICAL/HIGH인 항목만 상세 분석

> **참고**: 기존 `lib/llm.ts`의 `runLLM()` 함수와 `RuntimeConfig`를 재사용한다. 1차 필터는 `{ llmProvider: 'groq', runProfile: 'free' }`, 2차는 기본 프로필 사용.

프롬프트:
```
아래 수집된 콘텐츠를 분석하세요.
현재 활성 브랜드: {brands}
감시 키워드: {keywords}

각 항목에 대해:
- relevance (0~1): 마케팅 전략에 얼마나 관련있는지
- urgency: critical(즉시 대응) | high(24시간 내) | normal | low
- tags: 관련 태그 배열
```

### urgent-detector.ts — 긴급 알림

수집+분석 직후 이벤트 트리거:

- `urgency === 'critical'` → 즉시 Slack 알림
- 감지 패턴: 경쟁사 대형 캠페인, 브랜드 관련 부정 바이럴, 업계 규제 변화
- Slack 메시지에 원본 URL + AI 요약 + 추천 대응 액션 포함

### digest-builder.ts — 데일리 다이제스트

매일 아침 7시 실행:

1. 지난 24시간 MarketingIntel 취합 (relevance >= 0.3)
2. 카테고리별 그룹핑 (경쟁사, 트렌드, 브랜드 언급, 업계 뉴스)
3. AI가 종합 분석 → `MarketingDigest` 생성
4. Slack + 대시보드에 발행

다이제스트 JSON 구조:
```json
{
  "headline": "경쟁사 A가 신규 캠페인 론칭, 우리 브랜드 언급량 30% 증가",
  "insights": [
    { "category": "경쟁사", "summary": "A사 봄 캠페인 론칭...", "source_count": 12 },
    { "category": "트렌드", "summary": "숏폼 콘텐츠 전환율 상승...", "source_count": 8 }
  ],
  "actions": [
    { "priority": "NOW", "title": "A사 캠페인 대응 전략 회의 소집" },
    { "priority": "NEXT", "title": "숏폼 콘텐츠 비중 확대 검토" }
  ]
}
```

## 스케줄 통합

### 전체 Cron 잡 목록

| 잡 ID | 설명 | Cron | 카테고리 |
|--------|------|------|----------|
| `collect-twitter` | Twitter/X 수집 | `0 * * * *` | 수집 |
| `collect-serper` | 웹/뉴스 수집 | `0 */2 * * *` | 수집 |
| `collect-naver` | 네이버 수집 | `0 */3 * * *` | 수집 |
| `collect-youtube` | YouTube 수집 | `0 */6 * * *` | 수집 |
| `collect-reddit` | Reddit 수집 | `0 */6 * * *` | 수집 |
| `daily-digest` | 마케팅 인텔 다이제스트 | `0 7 * * *` | 신규 |
| `daily-briefing` | 운영 브리핑 | `15 7 * * *` | 기존 (다이제스트 후 15분) |
| `weekly-kpi-review` | KPI 리뷰 | `0 9 * * 1` | 기존 (마이그레이션) |
| `ga4-analysis` | GA4 분석 | `0 8 * * *` | 기존 (주간→일간 업그레이드) |
| `urgent-recommendations` | 긴급 추천 | `0 * * * *` | 기존 (마이그레이션) |
| `urgent-intel-check` | 긴급 인텔 알림 | 수집 직후 함수 체이닝 | 신규 |
| `maintenance` | 데이터 정리 (JobRun/MarketingIntel 보존 정책) | `0 3 * * 0` | 신규 |
| `quota-reset` | API 쿼터 일일 리셋 | `0 0 * * *` | 신규 |

### catch-up 로직

앱 재시작 시:
1. `JobRun` 테이블에서 각 잡의 마지막 성공 실행 시각 조회
2. `마지막 실행 + 예정 주기 < 현재 시각` → 즉시 보충 실행
3. 보충 실행은 최대 1회로 제한 (연쇄 실행 방지)
4. 보충 실행 후 정상 Cron 스케줄로 복귀

## 하이브리드 아키텍처

현재는 Electron 앱 내부에서 실행하되, 향후 서버 분리를 위한 설계 원칙:

1. **스케줄러 엔진은 Next.js API route와 분리** — `lib/scheduler/engine.ts` 자체는 프레임워크 무관, 단 잡 핸들러는 `@/` 경로 별칭 사용 (서버 분리 시 별칭 재설정 필요)
2. **수집기는 환경 무관** — HTTP API만 사용, Electron 전용 API 미사용
3. **DB 접근은 Prisma 추상화** — SQLite → PostgreSQL 전환 시 코드 변경 없음
4. **잡 트리거 인터페이스 통일** — Cron(앱 내부) / API 엔드포인트(외부) / Webhook(서버) 모두 동일한 `executeJob(jobId)` 호출

## UX/UI 고도화 설계

GitHub 리서치 기반으로 Garnet의 사용자 경험을 플랫폼 수준으로 끌어올린다.

### 참고 프로젝트

| 프로젝트 | Stars | 적용 패턴 |
|----------|-------|----------|
| cmdk | 12K | Cmd+K 커맨드 팔레트 |
| Tremor | 3.3K | KPI 카드, 스파크라인, 차트 컴포넌트 |
| Novu | 39K | 인앱 알림 센터 |
| CrewAI | 47K | 에이전트 역할/목표/배경 기반 프로필 |
| AgentGPT | 36K | 에이전트 step-by-step 실행 피드 |
| VoltAgent | 6.9K | 승인 인박스, suspend/resume 패턴 |
| AgentOps | 5.4K | 세션 리플레이, 단계별 비용 추적 |
| Flowise | 51K | AI 코파일럿 채팅 위젯 |
| Langflow | 146K | React Flow 기반 비주얼 워크플로우 |
| Cal.com | 41K | 캘린더/타임라인 뷰 |

### 추가 라이브러리

| 라이브러리 | 용도 | 추가 시점 |
|-----------|------|----------|
| `cmdk` | 커맨드 팔레트 | Phase 4 |
| `@tremor/react` | 대시보드 KPI 컴포넌트 | Phase 4 |
| `reactflow` | 비주얼 에이전트 파이프라인 | Phase 6 |
| `sonner` | 토스트 알림 (shadcn 호환) | Phase 4 |

### Cmd+K 커맨드 팔레트

`Cmd+K`로 글로벌 검색 + AI 질의 + 네비게이션 + 액션 실행을 통합한다.

**기능:**
- 캠페인/KPI/리포트/잡 검색
- 에이전트 회의 즉시 시작 ("경쟁사 분석 회의 시작")
- PPTX 생성, Slack 알림 트리거
- 자연어 질문 ("지난주 전환율은?") → 기존 runLLM으로 답변
- 앱 내 모든 페이지 즉시 이동

### 알림 센터

벨 아이콘 + 슬라이드오버 패널. 비동기 작업 결과를 사용자에게 전달한다.

**알림 유형:**
- 에이전트 회의 완료 (요약 미리보기)
- 스케줄 잡 결과 (성공/실패)
- 긴급 마케팅 인텔 (`urgency=CRITICAL`)
- GA4/Instagram 이상 징후
- PPTX 리포트 생성 완료

**구현:** 알림은 Prisma `Notification` 모델에 저장, 읽음/안읽음 상태 관리.

### KPI 카드 강화

기존 숫자만 표시 → 스파크라인 + 기간 대비 변화율 + 드릴다운.

- Tremor `<SparkAreaChart>` 임베드
- 기간 비교 배지: "+12.3% vs 지난주"
- 클릭 시 상세 차트 확장
- Tracker 컴포넌트로 잡 스케줄러 건강 상태 시각화

### 에이전트 프로필 카드

CrewAI 패턴 적용. 각 에이전트(STRATEGIST, CONTENT_DIRECTOR 등)에:
- 이름 + 아바타 + 전문 분야 태그
- 최근 참여 회의 수, 주요 기여 통계
- 역할 설명 + 의사결정 정책 요약

### 에이전트 실행 타임라인

회의 진행 시 step-by-step 실시간 피드:
- 각 에이전트 발언을 타임라인 항목으로 표시
- 현재 발언 중인 에이전트 하이라이트
- "사고 과정" 접기/펼치기 (웹 검색 쿼리, 참고 자료 등)
- 완료된 단계는 축약 표시

### 모닝 브리핑 카드

대시보드 상단에 AI가 생성한 "오늘의 브리핑" 카드:
- 마케팅 인텔 다이제스트 요약
- 오늘의 추천 액션 (우선순위별)
- 진행 중 세미나/캠페인 현황
- 어제 대비 핵심 지표 변화

### AI 코파일럿 사이드바

`Cmd+.`로 토글하는 우측 AI 채팅 패널:
- 현재 화면 컨텍스트 인식 (GA4 대시보드 보면서 → GA4 데이터 기반 답변)
- 멀티턴 대화 지원
- 액션 실행: "이 데이터로 PPTX 만들어", "주간 분석 회의 잡아줘"
- 에이전트 사고 과정 확장/축소

### 승인 인박스

에이전트가 자율 작업 중 인간 판단이 필요한 경우:
- 승인 요청 큐 (알림 센터 내 별도 탭)
- 요청 내용 + 에이전트 추천 + 근거 표시
- 승인/거부/수정 후 재실행
- VoltAgent의 suspend/resume 패턴 적용

### 세션 리플레이

에이전트 실행 기록을 단계별로 재생:
- 각 LLM 호출: 프롬프트, 응답, 토큰 수, 비용
- 도구 사용: 웹 검색 쿼리, API 호출, 결과
- 타임라인 슬라이더로 특정 시점 탐색
- AgentOps 패턴 참고

### 에이전트 메모리 사이드바

에이전트가 알고 있는 컨텍스트 표시:
- 참조 중인 과거 회의 결과
- 학습된 패턴 (LearningArchive)
- 사용자가 직접 수정/삭제 가능
- "이것을 기억해" / "이것을 잊어" 인터랙션

## 구현 우선순위 타임라인

### Phase 1: 스케줄링 엔진 교체 (핵심 인프라)

1. `croner` + `toad-scheduler` 설치
2. `lib/scheduler/types.ts` — 공통 타입 정의
3. `lib/scheduler/engine.ts` — toad-scheduler 래퍼 구현
4. `lib/scheduler/job-registry.ts` — 잡 등록/해제/상태/DB 이력
5. `lib/scheduler/catch-up.ts` — 놓친 잡 보충 로직
6. Prisma `JobRun` 모델 추가 + 마이그레이션
7. 기존 4개 잡을 새 엔진으로 마이그레이션
8. 세미나 스케줄러를 엔진 라이프사이클에 연결 (start/stop만, cron 변환 안 함)
9. `maintenance` + `quota-reset` 잡 추가

### Phase 2: 수집 파이프라인 (마케팅 인텔리전스)

10. Prisma `MarketingIntel`, `MarketingDigest`, `WatchKeyword` 모델 추가
11. `lib/collectors/types.ts` + `registry.ts` + `query-builder.ts`
12. `serper-collector.ts` (기존 Serper.dev 활용)
13. `naver-collector.ts` (기존 fetchNaverRows 리팩터)
14. `youtube-collector.ts` (YouTube Data API v3)
15. `twitter-collector.ts` (Twitter/X API v2)
16. `reddit-collector.ts` (Reddit API)
17. QuotaTracker 구현

### Phase 3: AI 분석 + 알림 (가치 전달)

18. `lib/intel/analyzer.ts` — relevance/urgency 점수 (기존 `runLLM()` 연동, 2단계)
19. `lib/intel/urgent-detector.ts` — 긴급 알림 즉시 발송 (수집 후 함수 체이닝)
20. `lib/intel/digest-builder.ts` — 데일리 다이제스트 생성
21. 수집 잡들을 스케줄 엔진에 등록 (차등 주기)
22. Slack 알림 템플릿 추가 (긴급 인텔, 데일리 다이제스트)

### Phase 4: UX/UI 고도화 — 핵심 (에이전트 + 대시보드)

23. Cmd+K 커맨드 팔레트 (`cmdk` + shadcn CommandDialog)
24. 알림 센터 (벨 아이콘 + 슬라이드오버 + Prisma Notification 모델)
25. KPI 카드 강화 (Tremor 스파크라인, 기간 비교 배지, 드릴다운)
26. 에이전트 프로필 카드 (CrewAI 역할/목표/배경 패턴)
27. 에이전트 실행 타임라인 (step-by-step 실시간 피드)
28. 모닝 브리핑 카드 (대시보드 상단, 다이제스트 + 추천 액션 통합)
29. 잡 스케줄러 UI 패널 업데이트 (실행 이력, Cron 표현식, Tracker)

### Phase 5: 영상 자동화 + 에이전트 고급 기능

30. MCP 영상 서버 연동 (mcp-video-gen: RunwayML+Luma, mcp-video-editor: FFmpeg 60tools)
31. 영상 생성 UI — 프롬프트 입력 → 포맷 선택(릴스/숏츠/틱톡) → 생성 → 미리보기
32. 영상 생성 API 라우트 + Prisma VideoGeneration 모델
33. AI 코파일럿 사이드바 (`Cmd+.` 토글, 컨텍스트 인식 채팅)
34. 승인 인박스 (에이전트 자율 작업 → 인간 판단 요청 큐)
35. 수집기 모니터링 (API 키 상태, 쿼터 현황, 에러)

### Phase 6: 비주얼 워크플로우 (향후)

38. React Flow 기반 에이전트 파이프라인 캔버스 (Langflow/Flowise 패턴)
39. 스케줄러 캘린더/타임라인 뷰 (Cal.com 패턴, 드래그로 재스케줄)
