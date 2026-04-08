---
title: "Agent Loop 설계"
category: "spec"
owner: "rnr"
doc_kind: "design"
tags: ["agent-loop", "자율운영", "AGI", "world-model", "meta-cognition"]
created: 2026-04-08
---

# Agent Loop 설계

## 개요

Garnet의 모든 자율 시스템(수집, 분석, 판단, 실행, 학습)을 하나의 순환 루프로 묶는 오케스트레이터.
기존 인프라(Cron 수집기, Governor, Flow Runner, Self-Improvement, Episodic Memory) 위에 **World Model 기반 추론 계층**을 얹는 구조.

### 설계 원칙

1. **World Model 중심** — 매번 새로 분석하지 않고 누적된 이해를 기반으로 판단
2. **Goal-driven** — 반응형이 아닌 목표 지향형. BusinessContext의 전략 목표를 추적하며 능동적으로 행동
3. **Meta-Cognition** — 루프 자체의 판단 품질을 평가하고 스스로 개선
4. **리스크 기반 자율** — LOW 리스크는 자동, MEDIUM+ 는 Governor 승인
5. **Phase 6 대비** — World Model이 에이전트 조직의 공유 컨텍스트로 확장 가능

## 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│                    Agent Loop Core                        │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────┐         │
│  │           World Model (세계 모델)             │         │
│  │  - 환경 상태 스냅샷 (매 사이클 갱신)           │         │
│  │  - 트렌드 벡터 (상승/하락/안정 추적)           │         │
│  │  - 미결 이슈 큐                               │         │
│  └────────────┬────────────────────────────────┘         │
│               │                                           │
│  ┌────────────▼────────────────────────────────┐         │
│  │          Goal Manager (목표 관리)             │         │
│  │  - BusinessContext.strategicGoals 추적        │         │
│  │  - 목표별 진행률 계산                         │         │
│  │  - 우선순위 동적 조정                         │         │
│  └────────────┬────────────────────────────────┘         │
│               │                                           │
│  ┌────────┐   ▼   ┌──────────────────────────┐           │
│  │Scanner │──→──│      Reasoner (추론)       │           │
│  │(환경스캔)│       │ World Model + Goals +     │           │
│  └────────┘       │ Episodic Memory 참조      │           │
│                   │ → 후보 액션 생성           │           │
│                   │ → 목표 정합성 평가         │           │
│                   └─────────┬────────────────┘           │
│                             │                             │
│                   ┌─────────┴────────┐                   │
│                   ▼                  ▼                   │
│            ┌──────────┐      ┌──────────┐               │
│            │ Executor │      │ Governor │               │
│            │ (LOW 자동)│      │(MED+ 승인)│               │
│            └────┬─────┘      └──────────┘               │
│                 ▼                                         │
│            ┌──────────┐                                  │
│            │Evaluator │→ 에피소딕 메모리 저장             │
│            └────┬─────┘                                  │
│                 ▼                                         │
│            ┌──────────────────────────┐                  │
│            │  Meta-Cognition (메타인지) │                  │
│            │  - 판단 정확도 추적        │                  │
│            │  - 루프 파라미터 자동 조정  │                  │
│            │  - Self-Improvement 트리거 │                  │
│            └──────────────────────────┘                  │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

## 다중 주기 스케줄

| 주기 | 이름 | 하는 일 |
|------|------|---------|
| **15분** | `urgency-check` | GA4 이상 탐지, SNS 급변 감지. 이상 발견 시만 Reasoner 호출 |
| **1시간** | `routine-cycle` | 전체 환경 스캔 → World Model 갱신 → Reasoner → 액션 실행/승인큐 |
| **매일 07:00** | `daily-briefing` | 전일 성과 평가 + 오늘의 브리핑 생성 + Goal 진행률 업데이트 |
| **매주 월요일 09:00** | `weekly-review` | 주간 전략 리뷰 + 예산 재배분 제안 + Meta-Cognition 전체 점검 + Self-Improvement 트리거 |

### 긴급 이벤트 트리거

다중 주기와 별개로, 다음 이벤트 발생 시 즉시 루프 사이클 진입:
- GA4 anomaly detection (기존 `lib/analytics/forecast.ts`) 에서 CRITICAL 감지
- Cron collector에서 경쟁사 급변 감지
- Governor 승인 후 후속 실행 필요 시

## 핵심 컴포넌트 상세

### 1. World Model (`world-model.ts`)

환경 상태를 누적하고 트렌드를 추적하는 핵심 데이터 구조.

```typescript
type WorldModel = {
  snapshot: {
    ga4: {
      sessions: number
      bounceRate: number
      conversionRate: number
      topChannels: Array<{ name: string; sessions: number }>
      trend: 'rising' | 'falling' | 'stable'
    }
    sns: {
      engagement: number
      followerGrowth: number
      topContent: Array<{ platform: string; id: string; metric: number }>
      trend: 'rising' | 'falling' | 'stable'
    }
    competitors: {
      recentMoves: Array<{ competitor: string; action: string; detectedAt: string }>
      threatLevel: 'low' | 'medium' | 'high'
    }
    campaigns: {
      active: number
      pendingApproval: number
      recentPerformance: Array<{ id: string; name: string; score: number }>
    }
  }
  trends: TrendVector[]
  openIssues: Array<{
    id: string
    type: 'anomaly' | 'competitor_move' | 'goal_behind' | 'approval_pending'
    severity: 'critical' | 'high' | 'normal' | 'low'
    summary: string
    detectedAt: string
  }>
  lastUpdated: string
  cycleCount: number
}

type TrendVector = {
  metric: string       // e.g. "ga4.sessions", "sns.engagement"
  direction: 'up' | 'down' | 'stable'
  magnitude: number    // 변화율 (%)
  duration: number     // 트렌드 지속 사이클 수
  confidence: number   // 0-1
}
```

**갱신 전략:**
- Scanner 결과가 들어올 때마다 snapshot 업데이트
- 이전 snapshot과 비교하여 TrendVector 자동 계산
- DB `WorldModelSnapshot` 테이블이 source of truth. `.garnet-config/world-model.json`은 빠른 읽기 캐시
- 히스토리 보관: `WHERE createdAt > NOW() - INTERVAL '7 days'` (시간 기반 정리, 카운트 아님)

### 2. Goal Manager (`goal-manager.ts`)

BusinessContext의 전략 목표를 추적하고 진행률을 계산.

```typescript
type GoalState = {
  goal: StrategicGoal          // from business-context.ts
  currentValue: number | null
  progressPercent: number
  onTrack: boolean
  suggestedActions: string[]
  lastChecked: string
}
```

**동작:**
- `BusinessContext.strategicGoals` 로드
- 각 목표의 `metric`에 해당하는 World Model 지표 매핑
- 목표 대비 현재 진행률 계산
- Reasoner에 "뒤처진 목표" 우선 전달 → 능동적 액션 생성

### 3. Scanner (`scanner.ts`)

기존 수집기들의 최신 결과를 통합하여 World Model에 주입.

**데이터 소스:**
- GA4: `lib/analytics/` — 최신 CollectorRun 결과
- SNS: `lib/sns/` — Instagram, Twitter 등 최신 메트릭
- 경쟁사: `lib/competitor-monitor.ts` — 최신 변화 감지
- Governor: `lib/governor.ts` — 미결 승인 건
- 캠페인: DB에서 활성 캠페인 + 최근 성과

Scanner는 새로운 수집을 하지 않음. 기존 Cron이 이미 수집한 데이터의 최신 값을 읽어 World Model을 갱신하는 역할.

### 4. Reasoner (`reasoner.ts`)

World Model + Goals + Episodic Memory를 참조하여 액션을 결정하는 LLM 기반 추론 엔진.

**입력 컨텍스트:**
```
1. World Model snapshot + trends (현재 상황)
2. Goal states (목표 대비 진행률)
3. Open issues (미결 이슈)
4. Business Context (사업 맥락)
5. Recent episodic memories (유사 과거 사례 + 결과)
```

**LLM 프롬프트 구조:**
```
당신은 MONOPLEX의 마케팅 총괄 AI입니다.

## 현재 상황 (World Model)
{worldModel.snapshot 요약}

## 트렌드
{trends 요약}

## 전략 목표 진행률
{goalStates 요약}

## 미결 이슈
{openIssues}

## 과거 유사 상황에서의 판단과 결과
{episodic memories}

위 상황을 분석하고, 지금 해야 할 액션을 우선순위 순으로 제안하세요.
각 액션에 대해: 근거, 예상 효과, 리스크 레벨(LOW/MEDIUM/HIGH)을 포함하세요.
```

**출력:**
```typescript
type ReasonerOutput = {
  situationSummary: string
  actions: Array<{
    kind: string           // Governor action kind
    title: string
    rationale: string
    expectedEffect: string
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
    goalAlignment: string  // 어떤 목표에 기여하는지
    payload: unknown
  }>
  noActionReason?: string  // 액션 불필요 시 근거
}
```

**LLM 전략:** `lib/llm.ts`의 기존 폴백 체인 사용 (Gemma 4 우선, 런타임 설정에 따라 폴백)

### 5. Executor (`executor.ts`)

LOW 리스크 액션을 자동 실행. 기존 `governor-executor.ts`의 handler 레지스트리 활용.

**Governor 연동 방식:**
Reasoner가 결정한 riskLevel을 신뢰하고 Governor scorer를 바이패스한다.
- LOW → Executor가 직접 실행 (Governor 큐를 거치지 않음)
- MEDIUM/HIGH → `governor.enqueue()` 호출하여 승인 큐에 등록. 기존 scorer는 실행하지 않고 Reasoner의 riskLevel을 그대로 사용.
- `governor.ts`에 `enqueueWithRisk(kind, payload, riskLevel)` 헬퍼 추가.

**자동 실행 대상:**
- 분석 리포트 생성
- 플레이북 업데이트
- 에피소딕 메모리 갱신
- 내부 알림 생성
- World Model 갱신

**Governor 라우팅 대상 (MEDIUM+):**
- 콘텐츠 발행
- 예산 변경 제안
- 외부 API 호출
- 캠페인 실행/중단
- Flow 자동 실행

### 6. Evaluator (`evaluator.ts`)

실행 결과를 평가하고 에피소딕 메모리에 저장. 기존 `lib/self-improve/reflection-agent.ts` 활용.

**저장 형식:**
```typescript
{
  category: 'agent_loop_decision',  // EpisodicEntry.category 유니온에 추가 필요
  input: JSON.stringify({
    worldModelSnapshot: ...,
    goalStates: ...,
    decision: ...
  }),
  output: JSON.stringify(executionResult),
  score: evaluationScore,  // 0-100
  tags: ['agent-loop', actionKind, cycleType],
  metadata: { cycleId, cycleType, goalAlignment }
}
```

**기존 타입 확장 필요:**
`lib/memory/episodic-store.ts`의 `EpisodicEntry.category` 유니온에 `'agent_loop_decision'` 추가.

### 7. Meta-Cognition (`meta-cognition.ts`)

루프 자체의 판단 품질을 평가하고 개선하는 계층.

**주간 점검 항목:**
1. **판단 정확도**: 지난 주 Reasoner 판단 vs 실제 결과 비교
2. **목표 기여도**: 액션들이 실제로 목표 진행에 기여했는지
3. **미활용 기회**: 사후에 보면 했어야 할 판단을 놓쳤는지
4. **루프 효율**: 불필요한 사이클이 있었는지 (액션 없는 사이클 비율)

**자동 조정:**
- 판단 정확도 낮은 영역 → Self-Improvement 프롬프트 최적화 트리거
- 특정 시간대에 액션이 집중 → 스케줄 자동 조정 (향후)
- 반복 실패 패턴 감지 → 해당 종류 액션 리스크 레벨 자동 상향

### 8. Notifier (`notifier.ts`)

기존 알림 인프라를 활용한다. 현재 코드베이스는 Telegram이 주요 알림 채널 (`lib/telegram`).

**Telegram (기존 인프라 활용):**
- CRITICAL/HIGH 이슈 즉시 발송
- 일일 브리핑 요약 발송 (07:00)
- Governor 승인 대기 알림

**앱 내 알림:**
- Operations 대시보드에 실시간 카드 표시
- NORMAL 이하 이슈

## Operations 대시보드 통합

`/operations` 페이지에 Agent Loop 상태 섹션 추가:

```
┌─────────────────────────────────────┐
│ Agent Loop Status                    │
│ ● Running  |  Last: 5분 전          │
│ Next routine: 55분 후               │
│                                      │
│ 오늘: 자동실행 12건 | 승인대기 3건    │
│                                      │
│ 목표 진행률                          │
│ ├ 신규유저 20%↑  ████████░░ 78%     │
│ └ 이탈률 < 40%   ██████░░░░ 62%     │
│                                      │
│ 최근 판단                            │
│ 09:15 SNS 참여율 하락 감지 → 콘텐츠  │
│       전략 변경 제안 [승인대기]       │
│ 08:00 데일리 브리핑 생성 [완료]       │
│ 07:45 GA4 트래픽 정상 확인 [액션없음] │
└─────────────────────────────────────┘
```

## 파일 구조

```
lib/agent-loop/
├── index.ts           — 오케스트레이터 (스케줄 관리 + 라이프사이클)
├── world-model.ts     — 세계 모델 (환경 상태 누적 + 트렌드 추적)
├── goal-manager.ts    — 목표 관리 (BusinessContext 연동 + 진행률)
├── scanner.ts         — 환경 스캔 (기존 collectors 최신 결과 통합)
├── reasoner.ts        — 추론 엔진 (World Model + Goals + Memory → 액션 결정)
├── executor.ts        — LOW 리스크 자동 실행
├── evaluator.ts       — 결과 평가 + 에피소딕 메모리 저장
├── meta-cognition.ts  — 판단 품질 추적 + 루프 자체 개선
├── notifier.ts        — Slack 웹훅 + 앱 내 알림
└── types.ts           — 공유 타입 정의

app/api/agent-loop/
├── status/route.ts    — 루프 상태 조회 API
└── control/route.ts   — 시작/정지/재시작 API
```

## 기존 시스템 연동

| 기존 모듈 | 연동 방식 |
|-----------|----------|
| `lib/collectors/*` | Scanner가 최신 CollectorRun 결과 읽기 |
| `lib/governor*.ts` | Reasoner 출력 → Governor 승인큐 or Executor 자동실행 |
| `lib/memory/episodic-store.ts` | Reasoner 입력(유사 과거 사례) + Evaluator 출력(결과 저장) |
| `lib/self-improve/*` | Meta-Cognition이 주간 점검 후 트리거 |
| `lib/business-context.ts` | Goal Manager가 전략 목표 로드 |
| `lib/flow/runner.ts` | Executor가 Flow 자동 실행 시 호출 |
| `lib/intel/digest-builder.ts` | daily-briefing에서 활용 |
| `lib/llm.ts` | Reasoner가 기존 폴백 체인 사용 (Gemma 4 우선) |

## 영속화 전략

| 데이터 | 저장 위치 | 근거 |
|--------|----------|------|
| World Model (현재 상태) | DB `WorldModelSnapshot` (source of truth) + `.garnet-config/world-model.json` (캐시) | DB가 정본, 파일은 빠른 읽기용 캐시 |
| World Model 히스토리 | DB `WorldModelSnapshot` 테이블 | 7일 보관 (시간 기반 정리) |
| Goal 상태 | DB `GoalState` 테이블 | 진행률 추적 이력 |
| 루프 실행 로그 | DB `AgentLoopCycle` 테이블 | Meta-Cognition 분석용 |
| 판단 결과 | `EpisodicMemory` 테이블 (기존) | category: 'agent_loop_decision' |

## 새 DB 모델

```prisma
model WorldModelSnapshot {
  id        String   @id @default(uuid())
  data      String   // JSON
  cycleType String   // urgency-check | routine-cycle | daily-briefing | weekly-review
  createdAt DateTime @default(now())

  @@index([cycleType])
  @@index([createdAt])
}

model GoalState {
  id              String   @id @default(uuid())
  goalName        String
  metric          String
  targetValue     String   // 문자열 (e.g. "20%", "1000명"). Goal Manager가 파싱
  currentValue    String?  // 문자열. 수치 비교는 Goal Manager에서 처리
  progressPercent Float    @default(0)
  onTrack         Boolean  @default(true)
  checkedAt       DateTime @default(now())

  @@index([goalName])
}

model AgentLoopCycle {
  id            String   @id @default(uuid())
  cycleType     String
  worldModelId  String?  // WorldModelSnapshot.id 참조 (soft reference)
  actionsCount  Int      @default(0)
  autoExecuted  Int      @default(0)
  sentToGovernor Int     @default(0)
  durationMs    Int      @default(0)
  summary       String?
  error         String?  // 실패 시 에러 메시지
  createdAt     DateTime @default(now())

  @@index([cycleType])
  @@index([createdAt])
}
```

**Goal Manager의 목표 파싱:**
`StrategicGoal.target`은 문자열이므로 Goal Manager가 다음 전략으로 처리:
- 숫자 포함 목표 (e.g. "20%", "1000명"): 정규식으로 수치 추출 → 진행률 계산
- 정성적 목표 (e.g. "브랜드 인지도 향상"): LLM 기반 정성 평가 (0-100 점수)

## 동시성 제어

4개 주기 + 긴급 트리거가 동시에 발생할 수 있으므로 동시성 제어 필요.

**전략: DB 기반 간단한 뮤텍스**
```typescript
// AgentLoopCycle 테이블에 status 필드 추가
// 새 사이클 시작 전: status='running'인 최근 사이클이 있으면 스킵
// 사이클 완료 시: status='completed' 또는 'failed'로 업데이트
// 안전장치: 5분 이상 'running' 상태인 사이클은 타임아웃으로 간주
```

단, `urgency-check`은 경량(DB 조회만)이므로 뮤텍스 대상에서 제외. `routine-cycle`, `daily-briefing`, `weekly-review`만 상호 배제.

## 부분 실패 처리

파이프라인 단계별 실패 전략:
| 단계 | 실패 시 동작 |
|------|------------|
| Scanner | World Model 갱신 스킵, 이전 상태 유지. AgentLoopCycle에 에러 기록 |
| Reasoner (LLM 실패) | 사이클 종료, 다음 정규 스케줄에서 재시도 |
| Executor (개별 액션) | 해당 액션만 실패 처리, 나머지 액션은 계속 실행 |
| Evaluator | 실행 결과는 유효하나 에피소딕 메모리 저장만 실패. 경고 로그 기록 |
| Meta-Cognition | 비핵심. 실패해도 루프 운영에 영향 없음. 다음 주 재시도 |

## 비기능 요구사항

- **LLM:** `lib/llm.ts` 기존 폴백 체인 (Gemma 4 최대 활용). 별도 비용 관리 없음
- **비용:** 초기 관리 없이 시작, 필요 시 추후 추가
- **안정성:** 루프 실패 시 다음 정규 스케줄에서 자동 재시도. AgentLoopCycle에 에러 기록
- **성능:** 1시간 루틴 사이클 목표 실행 시간 < 30초 (LLM 호출 포함)

## API 응답 타입

```typescript
// GET /api/agent-loop/status
type AgentLoopStatusResponse = {
  status: 'running' | 'paused' | 'error' | 'idle'
  lastCycle: {
    id: string
    cycleType: string
    completedAt: string
    actionsCount: number
    summary: string | null
  } | null
  nextScheduled: {
    cycleType: string
    scheduledAt: string
  }
  today: {
    autoExecuted: number
    sentToGovernor: number
    totalCycles: number
  }
  goals: Array<{
    name: string
    progressPercent: number
    onTrack: boolean
  }>
  recentDecisions: Array<{
    time: string
    summary: string
    status: 'executed' | 'pending_approval' | 'no_action'
  }>
}
```
