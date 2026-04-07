# Garnet 개인 에이전트 피벗 초기 검토

> 날짜: 2026-03-27
> 목적: `/Users/rnr/Downloads/Project Garnet.md`, `/Users/rnr/Downloads/garnet_self_improvement_architecture.md` 를 현재 코드베이스에 적용할 수 있는지 검토하고, 초기 작업 단계를 정의한다.

## 0. 전제 재정의

이 두 문서는 `기존 마케팅 플랫폼의 확장 문서`가 아니라,
**Garnet을 개인 에이전트로 피벗시키기 위한 첫 기준 문서**로 해석해야 한다.

즉 질문은 다음으로 바뀐다:

- `마케팅 플랫폼에 개인화 기능을 조금 더 붙일 수 있는가?` 가 아니라
- `현재 마케팅 앱을 개인 에이전트 Core 아래의 첫 번째 도메인 패키지로 재배치할 수 있는가?`

이 전제를 기준으로 보면,
현재 필요한 일은 기능 추가보다 먼저 **제품 정체성 재선언**, **Core/Domain 분리**, **범용 추상화 재설계**다.

## 1. 결론 요약

두 문서는 현재 Garnet을 개인 에이전트로 **확장**하는 수준이 아니라,
제품의 중심축을 **마케팅 플랫폼 -> 개인 에이전트 시스템**으로 바꾸는 데 적합하다.

따라서 핵심 판단은 다음이다:

1. 현재 Garnet은 아직 `개인 에이전트`가 아니라 `에이전트 기능이 들어간 마케팅 앱`이다.
2. 앞으로의 목표는 `마케팅 기능 강화`가 아니라 `개인 에이전트 Core 정립`이어야 한다.
3. 마케팅 기능은 제거 대상이 아니라, 개인 에이전트의 첫 번째 `domain module` 로 재배치하는 것이 맞다.

초기 단계에서는 다음 원칙이 맞다:

1. 지금 있는 스케줄러, 승인, 학습, MCP 구조는 Core 후보로 재사용한다.
2. 마케팅 특화 화면/프롬프트/데이터 모델은 `도메인 패키지` 관점으로 내린다.
3. 자기개선 루프는 `관찰(Level 0) -> 제안(Level 1)` 까지만 먼저 연다.
4. 코드 자동 생성/자동 반영(Level 2+)은 `리스크 점수`, `회귀 검증`, `변경 저널`이 생긴 뒤에 연다.

## 2. 현재 코드베이스에서 이미 활용 가능한 기반

### 2.1 스케줄링과 병렬 작업 기반

현재 프로젝트에는 이미 잡 스케줄러와 자동 실행 인프라가 있다.

- `lib/scheduler/engine.ts`
- `lib/scheduler/register-jobs.ts`
- `prisma/schema.prisma` 의 `JobRun`

즉, self-improvement 문서의 `Scheduler`, `Queue`, `Workers` 개념 중
`시간 기반 실행`과 `작업 이력 기록`은 이미 부분적으로 갖춰져 있다.

### 2.2 Scout / Analyst에 가까운 구조

현재는 마케팅 인텔 수집용이지만, 외부 탐색과 분석 흐름 자체는 이미 존재한다.

- 수집: `lib/collectors/orchestrator.ts`
- 분석: `lib/intel/analyzer.ts`
- 다이제스트: `lib/intel/digest-builder.ts`

즉, `GitHub/Docs/Issue 탐색`으로 수집 대상을 바꾸거나 확장하면
개인 에이전트의 `Scout`, `Analyst` lane 으로 전환할 수 있다.

### 2.3 Governor / 승인 흐름

문서의 핵심 원칙인 `인간 승인 기반 통제`와 가장 잘 맞는 부분이다.

- 승인 저장: `lib/approval-actions.ts`
- 승인 노출: `app/operations/page.tsx`
- 승인 실행 API: `app/api/approvals/execute/route.ts`
- 데이터 모델: `prisma/schema.prisma` 의 `ApprovalDecision`

즉, self-improvement 제안도 현재 구조를 확장하면 `Approval Inbox` 형태로 받을 수 있다.

### 2.4 학습 자산과 변경 로그에 가까운 기반

완전한 change journal 은 아니지만, 학습/기록 축은 이미 있다.

- 메모리 생성: `lib/pipeline.ts`
- 학습 카드 변환: `lib/learning-archive.ts`
- 학습 관리 UI/API: `app/learning/page.tsx`, `app/api/learning-archives/`
- 실행 진행 기록: `lib/run-progress.ts`

즉, `Learning`, `Change Journal`, `Approval History` 로 확장할 토대는 이미 있다.

### 2.5 외부 도구 연결 기반

개인 에이전트가 외부 시스템과 연결되기 위한 기반도 이미 있다.

- 연결 정의: `lib/mcp-connections.ts`
- MCP 클라이언트: `lib/mcp-client.ts`
- 내부 MCP 서버: `scripts/mcp-server.mjs`

따라서 장기적으로 개인 에이전트가 `Notion`, `Slack`, `GitHub`, `Sentry`, `Supabase` 를 쓰는 구조는 현실적으로 가능하다.

## 3. 바로 적용하면 안 되는 이유

### 3.1 현재 제품은 아직 마케팅 도메인에 강하게 고정되어 있음

핵심 진입점과 프롬프트가 아직 `범용 개인 에이전트`가 아니라 `마케팅 운영 코파일럿` 전제다.

- 홈 진입: `app/page.tsx`
- 메인 오케스트레이션: `lib/pipeline.ts`
- 코파일럿 프롬프트: `app/api/copilot/route.ts`
- 내비게이션 구조: `components/app-nav.tsx`

즉, 외부 문서의 `개인 자산 Core` 철학은 맞지만
현재 앱은 아직 `개인 에이전트 Core 위에 마케팅 앱이 올라간 구조`가 아니라
`마케팅 앱 안에 에이전트 기능이 섞인 구조`에 가깝다.

개인 에이전트 피벗 관점에서 보면 이는 단순한 한계가 아니라,
**가장 먼저 바꿔야 할 제품 구조**다.

예를 들면 현재 아래 요소는 제품 정체성을 마케팅 앱으로 고정하고 있다.

- `package.json` description
- `README.md` 제품 소개
- `components/app-nav.tsx` 정보구조
- `app/page.tsx` 홈 진입 언어
- `app/api/copilot/route.ts` 시스템 정체성
- `lib/prompts.ts`, `lib/job-scheduler.ts`, `lib/search.ts` 의 마케팅 중심 프롬프트

### 3.2 내부 기준 문서들에 버전 드리프트가 있음

개인 에이전트 전환 전에 현재 기준선을 먼저 정리해야 한다.

예시:

- `README.md` 는 아직 Electron 기반 설명이 많다.
- `docs/PROJECT_CONTEXT.md` 에는 존재하지 않는 `electron/main.ts`, `electron/preload.ts` 경로가 남아 있다.
- 반면 최근 로드맵(`docs/2026-03-26-development-roadmap.md`)은 Tauri 전환 완료를 기준으로 작성되어 있다.

즉, 새 아키텍처를 적용하기 전에 `현재 진짜 상태`를 문서 기준으로 통일해야 한다.

### 3.3 Self-improvement 문서의 Builder 단계는 아직 선행 조건이 부족함

`코드 초안 생성`, `브랜치 생성`, `PR 생성`, `낮은 위험 작업 자동 반영`은
아래가 없으면 위험하다.

- 변경 제안 데이터 모델
- 리스크 점수 체계
- 회귀 검증 기준
- 변경 저널
- 자동화 실패 시 차단 규칙

따라서 현재 시점에서는 `Draft Build` 이후 자동 반영까지 열면 안 된다.

또한 개인 에이전트 피벗 관점에서는
`Builder 자동화`보다 먼저 **에이전트가 무엇을 자신의 핵심 자산으로 간주하는지**
정의해야 한다.

예:

- 개인 메모리
- 사용자 선호
- 승인 패턴
- 워크플로우 습관
- 도구 사용 이력
- 반복 가능한 작업 템플릿

## 4. 문서별 적용 가능성 판단

### 4.1 `/Users/rnr/Downloads/Project Garnet.md`

이 문서는 **바로 코드로 옮기는 문서라기보다 상위 설계 원칙 문서**로 보는 것이 맞다.

적용 가능:

- `개인 자산 중심`
- `Core 와 외부 의존 요소 분리`
- `장기 확장성 우선`
- `오픈소스 재해석 원칙`

주의점:

- 현재 프롬프트/도메인 모델 대부분이 마케팅 특화이므로,
  이 문서를 그대로 시스템 프롬프트로 박아넣는 것보다
  먼저 `Core policy layer` 를 만드는 편이 낫다.

판정:

- **적용 가능**
- 단, **설계 기준 문서로 먼저 반영**하고 기능은 단계적으로 이관해야 한다.

### 4.2 `/Users/rnr/Downloads/garnet_self_improvement_architecture.md`

이 문서는 현재 코드와 직접 연결되는 부분이 더 많다.

바로 적용 가능한 축:

- Scheduler
- Approval 기반 Governor
- Research/Analysis 파이프라인
- Learning 기록 구조

선행 작업 후 적용 가능한 축:

- Research Memory
- Change Journal
- Risk Scoring
- Regression Guard
- Approval Inbox 고도화

아직 보류해야 하는 축:

- 자동 브랜치/PR 생성
- 낮은 위험 변경 자동 반영
- 모바일 승인 인터페이스를 전제로 한 운영 플로우

판정:

- **부분 적용 가능**
- **Level 0-1 중심으로 시작해야 안전**

## 5. 개인 에이전트 전환을 위한 Phase 0 제안

초기 작업은 새 기능을 많이 붙이는 것보다
`구조 분리 + 기준선 정리 + 저위험 루프 구성`이 우선이다.

### Phase 0-0. 제품 피벗 선언

가장 먼저 해야 할 일은 `무엇을 만들고 있는가`를 코드와 문서에서 다시 선언하는 것이다.

핵심 선언:

- Garnet은 더 이상 `AI 마케팅 OS`가 아니다.
- Garnet은 `개인 에이전트 시스템`이다.
- 마케팅은 Garnet이 다루는 첫 번째 전문 도메인일 뿐이다.

이 단계에서 바꿔야 하는 대표 요소:

- 제품 설명 문구
- 메인 홈 카피
- 코파일럿 시스템 프롬프트
- 설정 화면의 운영 언어
- 로드맵 제목과 단계 정의

### Phase 0-1. 기준 문서 정리

먼저 해야 할 일:

- `README.md` 와 `docs/PROJECT_CONTEXT.md` 를 현재 Tauri/Next.js 기준으로 정리
- 현재 실제 아키텍처를 기준 문서 하나로 통일
- `개인 에이전트 피벗`을 별도 로드맵으로 추가
- 기존 마케팅 중심 로드맵은 `domain-marketing backlog` 로 재분류

이 단계의 목표:

- 앞으로의 모든 논의가 오래된 Electron 기준 문서에 끌려가지 않게 한다.
- 앞으로의 모든 기능 개발이 `개인 에이전트 Core 강화인가, 마케팅 도메인 확장인가`로 구분되게 한다.

### Phase 0-2. Core 와 Domain 경계 정의

새 폴더 또는 모듈 경계를 먼저 정하는 것이 좋다.

권장 분리:

- `core-agent`
  - agent identity
  - user profile / preference memory
  - approval policy
  - memory policy
  - planning / reflection / proposal loop
  - self-improvement proposal model
- `domain-marketing`
  - 현재 `pipeline`, `campaign`, `seminar`, `intel`, `sns`

핵심 목표:

- 마케팅 앱이 없어도 개인 에이전트 Core 가 설명 가능한 구조가 되게 한다.
- 반대로, 마케팅 기능도 Core 위에서 돌아가는 하나의 vertical 로 설명 가능해야 한다.

이 관점에서 현재 개념들도 장기적으로 이름을 재검토해야 한다.

- `Run` -> 범용 `AgentTaskExecution` 성격으로 확장 가능한지
- `LearningArchive` -> 범용 `MemoryPattern` 으로 확장 가능한지
- `CampaignRoom` -> 범용 `ProjectRoom` 또는 `Workstream` 으로 일반화 가능한지
- `SeminarSession` -> 범용 `DeliberationSession` 으로 볼 수 있는지
- `MarketingIntel` -> 범용 `ResearchSignal` 로 확장 가능한지

### Phase 0-3. Self-improvement 최소 데이터 모델 정의

새로 필요한 최소 개념:

- `ResearchTask`
- `ImprovementProposal`
- `ChangeJournal`
- `RiskAssessment`
- `ApprovalInboxItem`

이 단계에서는 UI보다 데이터 구조와 저장 원칙부터 정하는 것이 맞다.

여기에 개인 에이전트 피벗 관점에서 아래도 필요하다:

- `UserPreferenceMemory`
- `WorkflowTemplate`
- `ToolUsagePattern`
- `DomainModule`

### Phase 0-4. Level 0-1 루프만 연결

첫 자동화는 아래 정도가 적당하다.

1. 스케줄러가 정해진 시간에 탐색 잡 실행
2. 외부 패턴/의존성/코드 병목을 요약
3. `ImprovementProposal` 초안 생성
4. 운영 화면 또는 별도 inbox 에 승인 대기 등록

즉, `관찰 -> 비교 분석 -> 제안 -> 승인 요청` 까지만 먼저 자동화한다.

중요한 점:

이 루프의 대상은 단순히 `마케팅 기능 개선`이 아니라
`개인 에이전트 Core`, `도메인 모듈`, `도구 체계`, `메모리 구조`, `승인 정책` 전체여야 한다.

### Phase 0-5. 회귀 검증과 차단 규칙 추가

Level 2 로 가기 전에 최소한 아래가 있어야 한다.

- `npm test`
- `npx tsc --noEmit`
- 필요한 경우 특정 smoke test
- 실패 시 자동 반영 금지
- 위험도 높음은 무조건 수동 승인

### Phase 0-6. 마케팅 로드맵의 재배치

개인 에이전트 피벗이 시작되면,
기존의 마케팅 기능 확장 로드맵은 아래처럼 재분류하는 것이 맞다.

- 유지보수 계속:
  - 기존 기능 안정화
  - 데이터 수집 정상화
  - 배포/빌드/문서 복구
- 선택적 유지:
  - 사용자가 실제로 당장 쓰는 마케팅 워크플로우
- 우선순위 하향:
  - 마케팅 대시보드 심화
  - SNS 확장 기능
  - 광고/캠페인 특화 고도화

즉, 앞으로 새 기능을 만들 때는 먼저
`이 작업이 Garnet을 개인 에이전트로 더 강하게 만드는가?`
를 통과해야 한다.

## 6. 지금 당장 추천하는 첫 구현 순서

가장 현실적인 순서는 아래다.

1. 제품 정체성을 `개인 에이전트 시스템`으로 재선언
2. 현재 문서 기준선 정리
3. Core 와 domain-marketing 경계 문서화
4. 기존 마케팅 개념을 범용 추상화로 어떻게 승격할지 결정
5. self-improvement 데이터 모델 설계
6. Level 0-1 제안 루프 구현
7. 승인 inbox 를 self-improvement 항목까지 확장
8. 회귀 검증 + 리스크 점수 추가
9. 이후에만 코드 초안 생성 자동화 검토

## 7. 이번 검토의 최종 판단

두 외부 문서는 모두 유효하다.
하지만 이 문서들은 `기존 Garnet 기능 몇 개를 더 똑똑하게 만드는 제안`이 아니다.
이 문서들은 **가넷의 제품 정의를 바꾸는 출발점**이다.

따라서 지금 필요한 것은
기존 마케팅 운영 앱 위에 형성된 에이전트 기능을 보강하는 것이 아니라,
현재 제품을 `개인 에이전트 Core + domain-marketing` 구조로 재편하는 것이다.

따라서 초기 작업 단계의 정답은 다음이다:

- **마케팅 플랫폼이 아니라 개인 에이전트를 제품의 중심으로 올린다**
- **마케팅 기능은 첫 번째 전문 도메인 모듈로 재배치한다**
- **가능한 부분은 현재 인프라를 Core 후보로 재사용한다**
- **도메인 결합이 강한 부분은 분리 설계부터 한다**
- **자기개선 자동화는 Level 0-1 까지만 먼저 연다**
- **Level 2+ 자동화는 검증/리스크/저널 체계가 생긴 뒤에 연다**
