# Garnet Development Roadmap

> Personal AGI Agent System — 자율 학습 + 자기 개선 + 조직 확장

**최종 업데이트:** 2026-04-20
**현재 버전:** v0.8.0+
**이전 로드맵:** `docs/archive/2026-03-GARNET_ROADMAP_v1.md`

---

## 비전

Garnet은 마케팅 자동화 도구가 **아니다**.
스스로 학습하고 성장하여 여러 명의 역할을 수행하는 **범용 비즈니스 AGI 에이전트**.
마케팅은 첫 번째 학습 도메인일 뿐이며, 회사를 옮겨도 함께 가는 **개인 자산**이다.

---

## 현재 상태: Agent Loop Phase 1~8 운영 중

### 아키텍처

```
┌──────────────────────────────────────────────────────────────┐
│  Agent Loop (50+ 모듈, lib/agent-loop/)                      │
│                                                               │
│  ┌──────────┐  ┌─────────────────────┐  ┌──────────┐        │
│  │ Scanner  │→│ 5 Sub-Reasoners     │→│ Reasoner │        │
│  │(환경 인식)│  │(능동 도구 호출+A2A) │  │(LLM 추론)│        │
│  └──────────┘  └─────────────────────┘  └──────────┘        │
│       ↑              ↕ Tool Harness          │               │
│       │         (캐시+화이트리스트+Rate Limit) │               │
│       │              ↕ ask_expert (A2A)       ↓               │
│       │         ┌──────────┐  ┌──────────┐                   │
│       │         │Reflective│→│ Executor │                   │
│       │         │  Critic  │  │(실행/승인)│                   │
│       │         └──────────┘  └──────────┘                   │
│       └────── World Model ←──────────────────┘               │
│              (config 기반 도메인 이식)                         │
│                                                               │
│  사이클: 15분(긴급) / 1시간(루틴) / 7시(브리핑)               │
│          18시(저녁보고) / 월 9시(주간리뷰)                    │
└──────────────────────────────────────────────────────────────┘
```

### Agent Loop 진화 단계 (Phase 1~8 완료)

| Phase | 이름 | 핵심 모듈 | 상태 |
|-------|------|----------|------|
| 1 | Knowledge Engine | Outcome Observer, Knowledge Store, Human Feedback, Anti-Patterns | ✅ 운영 중 |
| 2 | Curiosity Engine | Article Learner, Macro Tracker, Self-Improvement Scout, Cross-Pollinator, Emergence Detector | ✅ 운영 중 |
| 3 | Causal Reasoning | Causal Model, Confidence Scoring, Goal Predictor, Strategy Mutator, Paradigm Shift | ✅ 운영 중 |
| 4 | Reflective Roles | Reflective Critic, Self Benchmark, Proactive Inquiry, Role Manager | ✅ 운영 중 |
| 5 | Self-Coding | Cycle Reflector, Prediction Calibrator, Prompt Evolver | ✅ 운영 중 |
| 6 | Agent Organization | Sub-Reasoner 5인 (Analysis, Content, Strategy, CRO, Psychology) | ✅ 운영 중 |
| 7 | Agentic Tool Harness | Tool Harness, runLLMWithTools, A2A Protocol, Domain Bootstrap | ✅ 구현 완료 |
| 8 | WorldModel Portability | snapshot-formatter, MetricResolver, config 기반 프롬프트 | ✅ 구현 완료 |

### 운영 실적 (4/8~4/20)

| 지표 | 수치 |
|------|------|
| 축적 지식 | 339+ 건 (25개 도메인) |
| 에피소딕 메모리 | 814+ 건 |
| 등록 도구 | 10개 (GA4 3, Instagram 3, Knowledge 2, Web 1, A2A 1) |
| 도메인 이식성 | config/ 교체만으로 완료 |

---

## Phase 5-6: Self-Coding + Agent Organization (완료)

> "AI가 자기 코드를 개선한다"

Phase 1~4의 학습 데이터가 축적된 상태에서, 에이전트가 자신의 동작을 스스로 개선하는 단계.

### 5-1. 프롬프트 자동 최적화

**목표:** Reasoner/Scanner의 시스템 프롬프트를 자동으로 개선

```
매주 백그라운드:
1. 각 모듈의 최근 실행 결과 + 품질 점수 수집
2. LLM에게 프롬프트 변형 5개 생성 요청
3. 테스트 데이터로 A/B 평가
4. 최고 성능 변형으로 교체 (이전 버전 백업)
```

- **의존:** Phase 4 Self Benchmark (품질 점수)
- **파일:** `lib/self-improve/prompt-optimizer.ts` (신규)
- **리스크:** LOW — 프롬프트만 변경, 코드 변경 없음

### 5-2. 예측 모델 자체 보정

**목표:** Goal Predictor의 정확도를 자동으로 높임

```
예측 vs 실제 오차 누적 기록
→ 과대추정/과소추정 패턴 분석
→ 보정 계수 자동 조정
→ 다음 예측에 반영
```

- **의존:** Phase 3 Goal Predictor + Confidence
- **파일:** `lib/self-improve/prediction-calibrator.ts` (신규)
- **기존 기반:** goal-predictor.ts의 선형 외삽 → 보정 가중치 추가

### 5-3. Flow 자동 생성/개선

**목표:** 반복 작업 패턴을 감지하여 자동화 Flow 제안

```
반복 패턴 감지 (3회 이상 유사 액션)
→ "이 작업을 Flow로 만들면 자동화 가능" 제안
→ 승인 시 Flow Architect가 자동 생성
→ 실행 후 성과 측정 → 자동 개선
```

- **의존:** Phase 1 Knowledge Store (패턴 인식)
- **파일:** `lib/self-improve/flow-evolver.ts` (신규)

### 5-4. 도구 자동 생성

**목표:** 에이전트가 필요한 MCP 도구를 스스로 만듦

```
Agent가 "이런 도구가 필요합니다" 요청
→ Tool Builder가 MCP 도구 스펙 생성
→ 테스트 실행 → Governor 승인
→ 도구 카탈로그에 등록
```

- **의존:** Phase 2 Self-Improvement Scout
- **파일:** `lib/self-improve/tool-builder.ts` (신규)
- **리스크:** HIGH — Governor 승인 필수

### 5-5. 리플렉션 강화

**목표:** 기존 Reflective Critic을 실행 전체 과정 리뷰로 확장

```
현재: MEDIUM/HIGH 결정만 자기 비판
확장: 모든 주요 실행 완료 후 전체 과정 리뷰
→ 잘한 점 / 못한 점 / 개선점 추출
→ Knowledge Store에 원칙으로 승격
→ Reasoner 프롬프트에 자동 반영
```

- **의존:** Phase 4 Reflective Critic (이미 구현)
- **파일:** `lib/agent-loop/reflective-critic.ts` 확장

---

## Phase 7-8: Agentic Tool Harness + WorldModel Portability (완료)

> "Sub-Reasoner가 직접 찾고, 서로 물어보고, 어디든 이식 가능"

### Phase 7: Agentic Tool Harness (2026-04-20)

```
Sub-Reasoner가 분석 중 추가 데이터가 필요하면 직접 도구를 호출:

1. LLM이 "추가 데이터 필요한가?" 판단 (Pass 1)
2. 필요하면 도구 호출 → Tool Harness가 실행 (캐시/화이트리스트/Rate Limit)
3. 도구 결과 반영 → LLM이 재분석 (Pass 2)
4. 기본 데이터로 충분하면 1-pass로 완료 (기존 속도 유지)
```

- **Tool Harness:** 캐시(사이클 단위) + Sub-Reasoner별 화이트리스트 + 슬라이딩 윈도우 Rate Limit + 관측성 메트릭
- **10개 도구:** ga4_query, ga4_funnel, theater_detail, knowledge_search, episode_search, web_search, instagram_posts, instagram_account, instagram_demographics, ask_expert
- **A2A Protocol:** Sub-Reasoner 간 교차 질의 (ask_expert) — CRO가 Psychology에게 질문 가능
- **Native Function Calling:** Gemini/Groq는 native tool-use, Gemma4는 JSON 폴백
- **Domain Bootstrap:** config/company.md → config/ 자동 생성

### Phase 8: WorldModel Portability (2026-04-20)

```
Engine (도메인 무관) / Config (회사별 교체) / Knowledge (학습 데이터) 3계층 분리

회사 이동 시:
1. config/company.md 작성
2. config/domain.yaml + tools.yaml 자동 생성
3. .env 교체
4. 끝. 코드 변경 없음.
```

- **snapshot-formatter.ts:** MetricResolver + config 기반 프롬프트/브리핑 포맷터
- **config/domain.yaml:** company_name, company_description, metrics_display
- 11개 파일의 하드코딩 → formatSnapshotForPrompt/getMetricValue로 통합
- 향후 분석 툴 변경 시: MetricResolver만 교체

---

## 향후 로드맵

### 단기 (다음 작업)

| 항목 | 설명 |
|------|------|
| 도구 호출 프롬프트 튜닝 | LLM이 1-pass 선호 → 도구 호출 유도 강화 |
| harness-metrics 대시보드 | 도구 호출 트렌드, 캐시 효율 시각화 |
| Sub-Reasoner 간헐적 파싱 실패 | Gemini function calling 안정성 개선 |

### 중기

| 항목 | 설명 |
|------|------|
| Slack/Notion MCP 연동 | MCP Hub 28개 커넥션 중 필요한 것 활성화 |
| 분석 툴 전환 | MetricResolver 교체 + WorldModel 타입 제네릭화 |
| Scanner 플러그인화 | 데이터소스별 모듈 분리 |

### 장기

| 항목 | 설명 |
|------|------|
| 외부 A2A (askExternal) | 외부 에이전트 연동 — 대상 생길 때 |
| Google A2A v0.2 호환 | 표준 프로토콜 채택 |
| 모델 업그레이드 | Claude Sonnet 4.5 / Haiku 4.5 — Anthropic 키 확보 시 |
| 자율 에이전트 조직 | 에이전트가 스스로 구조 개편, 외부 시스템 자율 연동 |

---

## 핵심 원칙

- Phase 1~8은 **병렬 연속 진화** — 사이클마다 모든 Phase가 동시 동작
- 사용자 승인 게이트는 **항상** 유지
- **범용 추론 + 도메인 지식 분리** — config 기반 이식성
- 새 기능은 하드코딩 금지 — config/domain.yaml 기반으로 설계
