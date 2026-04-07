# Garnet 개인 에이전트 피벗 기술 설계

> 날짜: 2026-03-27
> 기준 문서:
> - `/Users/rnr/Downloads/Project Garnet.md`
> - `/Users/rnr/Downloads/garnet_self_improvement_architecture.md`
> 참고:
> - `docs/2026-03-27-personal-agent-initial-assessment.md`
> - `docs/2026-03-27-personal-agent-pivot-plan.md`

## 1. 목표

현재 코드베이스를 `마케팅 앱 중심 구조`에서
`개인 에이전트 Core + domain-marketing` 구조로 점진적으로 전환한다.

이 설계의 목표는 세 가지다.

1. 현재 기능을 깨지 않고 Core 를 추출한다
2. 자기개선 루프를 안전하게 붙일 수 있는 구조를 만든다
3. 이후 마케팅 외 도메인을 추가해도 Core 를 다시 쓰게 한다

## 2. 비목표

이번 설계는 다음을 당장 하지 않는다.

- 기존 마케팅 기능 전체 재작성
- 모든 Prisma 모델 즉시 rename
- 자동 브랜치/PR 생성
- 무인 자동 코드 반영
- iPhone 앱 구현

즉, 이번 설계는 `최종 형태를 향한 안전한 마이그레이션 구조`를 만드는 데 집중한다.

## 3. 현재 구조 요약

현재 Garnet은 다음 축을 가지고 있다.

- 실행/오케스트레이션: `lib/pipeline.ts`
- 승인: `lib/approval-actions.ts`
- 학습 자산화: `lib/learning-archive.ts`
- 자동화/스케줄링: `lib/scheduler/*`, `lib/job-scheduler.ts`
- 외부 연결: `lib/mcp-client.ts`, `lib/mcp-connections.ts`
- 마케팅 인텔: `lib/collectors/*`, `lib/intel/*`
- UI/IA: 마케팅 중심 라우트와 내비게이션

문제는 이 요소들이 모두 이미 존재하지만,
개인 에이전트 Core 라는 상위 추상화 없이 마케팅 앱 내부에 섞여 있다는 점이다.

## 4. 목표 아키텍처

### 4.1 상위 구조

```text
Garnet
├── core-agent
│   ├── identity
│   ├── memory
│   ├── planning
│   ├── execution
│   ├── approvals
│   ├── research
│   ├── self-improvement
│   └── tool-hub
├── domain-marketing
│   ├── campaigns
│   ├── content
│   ├── analytics
│   ├── seminar
│   └── intel
└── app-shell
    ├── inbox
    ├── today
    ├── memory
    ├── workstreams
    ├── domains
    └── settings
```

### 4.2 원칙

- Core 는 도메인 지식 없이도 설명 가능해야 한다
- domain-marketing 은 Core 의 계약을 사용해야 한다
- 기존 구현은 adapter 를 통해 점진적으로 이동한다
- 데이터 모델은 즉시 rename 하지 않고 semantic layer 부터 분리한다

## 5. Core bounded contexts

### 5.1 `core-agent/identity`

역할:

- Garnet의 상위 정체성
- 사용자 프로필
- 사용자 선호
- 장기 설정과 자율성 정책

주요 개념:

- AgentIdentity
- UserProfile
- UserPreferenceMemory
- AutonomyPolicy

### 5.2 `core-agent/memory`

역할:

- 장기 메모리
- 패턴화된 학습 카드
- 승인/거절 이유 축적
- 반복 가능한 응답 템플릿 저장

주요 개념:

- MemoryPattern
- PreferenceMemory
- WorkflowTemplate
- DecisionMemory

### 5.3 `core-agent/planning`

역할:

- 사용자의 입력을 작업 단위로 구조화
- 작업 유형 분류
- 필요한 도메인과 도구 결정
- multi-step plan 생성

주요 개념:

- TaskIntent
- TaskPlan
- TaskStep
- DomainRoutingDecision

### 5.4 `core-agent/execution`

역할:

- 작업 실행
- 상태 추적
- 실행 로그 축적
- 결과와 근거 저장

주요 개념:

- AgentTaskExecution
- ExecutionState
- ExecutionEvidence
- ExecutionOutcome

### 5.5 `core-agent/approvals`

역할:

- 승인 대기함
- 인간 승인 정책
- 위험도에 따른 gate
- 결정 이력 저장

주요 개념:

- ApprovalInboxItem
- ApprovalDecision
- ApprovalPolicy
- RiskGate

### 5.6 `core-agent/research`

역할:

- 외부 정보 탐색
- 문서/레포/이슈/릴리즈/의존성 조사
- 신호 저장과 재사용

주요 개념:

- ResearchTask
- ResearchSignal
- ResearchDigest
- ResearchMemory

### 5.7 `core-agent/self-improvement`

역할:

- 현재 구조 관찰
- 병목 분석
- 개선안 제안
- 코드 초안 자동화의 상위 정책 제공

주요 개념:

- ImprovementProposal
- ChangeJournal
- RiskAssessment
- RegressionGuardResult

### 5.8 `core-agent/tool-hub`

역할:

- MCP 연결 관리
- local / remote tool routing
- 도구 사용 정책

주요 개념:

- ToolConnection
- ToolCapability
- ToolInvocationRecord
- ToolUsagePattern

## 6. Domain bounded context: `domain-marketing`

마케팅은 Core 위에 놓이는 첫 번째 전문 도메인이다.

### 하위 모듈

- campaigns
- seminar
- content
- analytics
- intel
- sns

### 원칙

- 도메인 로직은 Core memory, execution, approvals 를 사용한다
- 도메인 특화 prompt 는 Core prompt 와 분리한다
- 마케팅 데이터 모델은 장기적으로 범용 개념에 매핑 가능해야 한다

## 7. 현재 코드에서의 매핑

### Core 로 승격할 후보

- `lib/scheduler/*`
- `lib/approval-actions.ts`
- `lib/run-progress.ts`
- `lib/mcp-client.ts`
- `lib/mcp-connections.ts`
- `lib/runtime-storage.ts`
- `lib/secure-json-store.ts`

### domain-marketing 으로 이동할 후보

- `lib/pipeline.ts`
- `lib/campaign-rooms.ts`
- `lib/ga4-client.ts`
- `lib/instagram-*`
- `lib/intel/*`
- `lib/collectors/*`
- `lib/sns/*`
- `app/campaigns/*`
- `app/seminar/*`
- `app/intel/*`
- `app/sns/*`

### 범용 추상화 후 분리할 후보

- `lib/learning-archive.ts`
- `app/learning/page.tsx`
- `app/operations/page.tsx`
- `app/page.tsx`
- `app/api/copilot/route.ts`

## 8. 데이터 모델 진화 방향

이번 피벗의 핵심은 DB rename 보다 먼저 `개념 rename` 이다.

즉시 테이블명을 바꾸기보다 아래처럼 semantic layer 를 먼저 도입한다.

### 8.1 기존 -> 목표 개념 매핑

| 현재 개념 | 목표 개념 | 설명 |
|---|---|---|
| `Run` | `AgentTaskExecution` | 사용자의 하나의 실행 단위 |
| `RunProgress` | `ExecutionState` | 실행 상태 추적 |
| `LearningArchive` | `MemoryPattern` | 재사용 가능한 학습 패턴 |
| `ApprovalDecision` | `ApprovalDecision` | 유지 가능, inbox item 확장 필요 |
| `ManualCampaignRoom` | `ProjectRoom` 또는 `Workstream` | 도메인 중립 상위 개념 |
| `SeminarSession` | `DeliberationSession` | 다중 관점 토론 세션 |
| `MarketingIntel` | `ResearchSignal` | 특정 도메인 신호로 일반화 |

### 8.2 신규 모델 제안

#### `ImprovementProposal`

필드 예시:

- `id`
- `title`
- `summary`
- `proposalType`
- `targetArea`
- `rationale`
- `expectedImpact`
- `riskLevel`
- `status`
- `sourceSignals`
- `createdAt`
- `updatedAt`

#### `ChangeJournal`

필드 예시:

- `id`
- `proposalId`
- `changeType`
- `status`
- `beforeState`
- `afterState`
- `verificationSummary`
- `approvedBy`
- `appliedAt`

#### `RiskAssessment`

필드 예시:

- `id`
- `targetType`
- `targetId`
- `riskLevel`
- `reasons`
- `requiredChecks`
- `approvalRequired`

#### `UserPreferenceMemory`

필드 예시:

- `id`
- `category`
- `key`
- `value`
- `confidence`
- `source`
- `updatedAt`

#### `WorkflowTemplate`

필드 예시:

- `id`
- `name`
- `triggerPattern`
- `preferredSteps`
- `preferredOutputs`
- `domainHint`
- `lastUsedAt`

## 9. 자기개선 루프 설계

두 기준 문서의 self-improvement loop 는 다음 단계로 해석한다.

1. Scout
2. Analyst
3. Builder
4. Governor

현재 Garnet에서는 이를 다음처럼 구현한다.

### 9.1 Level 0: Observe

목표:

- 외부 정보 탐색
- 내부 병목 탐지
- 의존성/구조 상태 관찰

구성:

- `ResearchTask`
- `ResearchSignal`
- 스케줄러 잡
- 요약 리포트

### 9.2 Level 1: Suggest

목표:

- 개선 제안 초안 생성
- 영향 범위, 리스크, 기대 효과 정리
- 승인 인박스 등록

구성:

- `ImprovementProposal`
- `RiskAssessment`
- `ApprovalInboxItem`

### 9.3 Level 2: Draft

목표:

- 코드 초안 생성
- 검증 커맨드 준비
- 변경 저널 작성

선행 조건:

- 테스트 기준
- 타입체크 기준
- 영향 범위 계산
- 승인 정책

### 9.4 Level 3+: Auto Apply

현 시점에서는 비활성.

열기 위한 조건:

- 저위험 작업만 대상
- 필수 검증 성공
- 롤백 경로 존재
- 명시적 정책 허용

## 10. Risk scoring and approval policy

개인 에이전트 피벗에서 승인 구조는 더 중요해진다.

### 10.1 기본 위험도 분류

- Low
  - 문서 초안
  - 요약 생성
  - 정보 수집
  - 제안서 생성
- Medium
  - 설정 변경 초안
  - 새 파일 생성
  - 프롬프트 수정 초안
- High
  - 기존 핵심 로직 변경
  - 데이터 모델 변경
  - 배포 경로 변경
  - 외부 연동 권한 변경

### 10.2 승인 규칙

- Low: 제안은 자동 생성 가능, 적용은 기본적으로 승인 필요
- Medium: 승인 필요, 검증 필요
- High: 승인 필수, 검증 필수, 자동 반영 금지

## 11. Regression guard

Builder 이상 단계로 가려면 검증 계층이 필요하다.

기본 체크:

- `npm test`
- `npx tsc --noEmit`
- 필요한 smoke test
- lint 또는 빌드 검증

결과는 `RegressionGuardResult` 로 저장한다.

필드 예시:

- `checkName`
- `status`
- `summary`
- `logRef`
- `ranAt`

## 12. 런타임 토폴로지

두 기준 문서의 디바이스 역할은 그대로 유지하되 현실적으로 나눈다.

### Mac

- 메인 실행 환경
- 스케줄러
- 장기 메모리
- MCP 허브
- 자기개선 루프

### iPhone

초기에는 구현하지 않지만 장기 목표는 유지한다.

- 승인/거절
- 빠른 입력
- 알림 수신

### Cloud

- 선택적 고성능 추론
- 외부 API proxy
- 원격 sync

## 13. UI/라우트 재구성 방향

### 현재 문제

라우트와 내비가 마케팅 중심으로 고정돼 있다.

### 목표

Core 중심 IA 로 재배치한다.

### 제안 라우트

- `/` -> Agent Home
- `/today` -> 오늘의 집중 항목
- `/inbox` -> 승인/제안 인박스
- `/memory` -> 장기 메모리와 패턴
- `/workstreams` -> 범용 프로젝트/작업 단위
- `/research` -> 조사 결과
- `/domains/marketing` -> 마케팅 모듈 진입
- `/settings` -> 연결/정책/런타임

### 마이그레이션 전략

- 기존 라우트는 유지
- 새 shell 에서 재링크
- domain-marketing 하위로 점진적 이동

## 14. 폴더 구조 제안

```text
lib/
  core-agent/
    identity/
    memory/
    planning/
    execution/
    approvals/
    research/
    self-improvement/
    tool-hub/
  domain-marketing/
    campaigns/
    seminar/
    content/
    analytics/
    intel/
    sns/
  shared/
app/
  (core)/
    page.tsx
    today/
    inbox/
    memory/
    workstreams/
    research/
  domains/
    marketing/
      page.tsx
      campaigns/
      seminar/
      intel/
      sns/
```

## 15. 단계별 마이그레이션 전략

### Stage A. Documentation and semantic layer

작업:

- 문서 정리
- 제품 정체성 재선언
- 개념 매핑 문서화

### Stage B. Core adapters

작업:

- 기존 `Run`, `LearningArchive`, `ApprovalDecision` 위에 Core adapter 작성
- 새 이름의 service layer 도입

예:

- `getAgentTaskExecutionFromRun()`
- `getMemoryPatternFromLearningArchive()`
- `getResearchSignalFromMarketingIntel()`

### Stage C. UI shell pivot

작업:

- Home/Inbox/Memory 중심 shell 도입
- 기존 마케팅 화면은 domain-marketing 링크로 이동

### Stage D. Self-improvement Level 0-1

작업:

- ResearchTask
- ImprovementProposal
- Approval inbox 연결

### Stage E. Generic data model introduction

작업:

- 신규 범용 모델 추가
- 기존 모델과 병행 운영
- 점진적 read-path 전환

## 16. 첫 구현 배치 제안

### Batch 1

- 제품 설명/문서 기준선 정리
- Core vs domain-marketing 분류 문서 확정

### Batch 2

- `core-agent` 폴더 구조 추가
- adapter service 초안 추가
- 코파일럿 시스템 프롬프트 분리

### Batch 3

- `ImprovementProposal`, `RiskAssessment`, `ChangeJournal` 모델 추가
- 인박스 노출

### Batch 4

- Agent Home / Inbox UI 추가
- 기존 홈의 마케팅 중심 진입 재배치

## 17. 테스트 전략

### 단위 테스트

- adapter mapping
- risk scoring
- approval policy
- proposal generation logic

### 통합 테스트

- ResearchTask -> ImprovementProposal 생성
- Proposal -> ApprovalInbox 등록
- 승인 후 journal 기록

### 회귀 테스트

- 기존 마케팅 워크플로우
- 스케줄러 정상 동작
- MCP 연결 허브 동작

## 18. 최종 판단

기술적으로 가장 중요한 결정은
`현재 앱을 버리고 새로 만드는 것`이 아니라
`현재 인프라를 Core 후보와 domain-marketing 으로 재배치하는 것`이다.

즉, Garnet의 피벗은 리라이트가 아니라
다음 순서의 구조 개편이다.

1. 의미를 바꾼다
2. 경계를 나눈다
3. adapter 를 둔다
4. 자기개선 루프를 붙인다
5. 이후에만 자동 Builder 를 연다

이 설계가 지켜지면 Garnet은
마케팅 앱에서 출발했더라도 결국 `개인 에이전트 Core`를 가진 시스템으로 성장할 수 있다.
