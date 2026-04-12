# Garnet Development Roadmap

> Personal AGI Agent System — 자율 학습 + 자기 개선 + 조직 확장

**최종 업데이트:** 2026-04-13
**현재 버전:** v0.6.0+
**이전 로드맵:** `docs/archive/2026-03-GARNET_ROADMAP_v1.md`

---

## 비전

Garnet은 마케팅 자동화 도구가 **아니다**.
스스로 학습하고 성장하여 여러 명의 역할을 수행하는 **범용 비즈니스 AGI 에이전트**.
마케팅은 첫 번째 학습 도메인일 뿐이며, 회사를 옮겨도 함께 가는 **개인 자산**이다.

---

## 현재 상태: Agent Loop Phase 1~4 운영 중

### 아키텍처

```
┌─────────────────────────────────────────────────┐
│  Agent Loop (36개 모듈, lib/agent-loop/)         │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Scanner  │→│ Reasoner │→│ Executor │      │
│  │(환경 인식)│  │(LLM 추론)│  │(실행/승인)│      │
│  └──────────┘  └──────────┘  └──────────┘      │
│       ↑                            │             │
│       └────── World Model ←────────┘             │
│              (누적 상황 인식)                      │
│                                                  │
│  사이클: 15분(긴급) / 1시간(루틴) / 7시(브리핑)   │
│          18시(저녁보고) / 월 9시(주간리뷰)        │
└─────────────────────────────────────────────────┘
```

### Agent Loop 진화 단계 (Phase 1~4 완료)

| Phase | 이름 | 핵심 모듈 | 상태 |
|-------|------|----------|------|
| 1 | Knowledge Engine | Outcome Observer, Knowledge Store, Human Feedback, Anti-Patterns | ✅ 운영 중 |
| 2 | Curiosity Engine | Article Learner, Macro Tracker, Self-Improvement Scout, Cross-Pollinator, Emergence Detector | ✅ 운영 중 |
| 3 | Causal Reasoning | Causal Model, Confidence Scoring, Goal Predictor, Strategy Mutator, Paradigm Shift | ✅ 운영 중 |
| 4 | Reflective Roles | Reflective Critic, Self Benchmark, Proactive Inquiry, Role Manager | ✅ 운영 중 |

### 운영 5일차 실적 (4/8~4/13)

| 지표 | 수치 |
|------|------|
| 총 사이클 | 550회 (일평균 110회) |
| 축적 지식 | 99건 (9개 도메인) |
| 에피소딕 메모리 | 807건 |
| 인과 관계 모델 | 7건 |
| 총 액션 | 536건 (496건 자동 실행) |
| 전략 목표 평균 달성 | 81% |

---

## Phase 5: Self-Coding (다음 단계)

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

## Phase 6: Agent Organization

> "단일 Reasoner → 전문 에이전트 팀 → 자율 조직"

### 6-1. 역량 기반 역할 분화

현재 Role Manager가 역량 임계값(80%+) 도달 시 새 역할을 제안하는 구조.
이를 확장하여 **독립 에이전트로 분화**:

```
현재:  단일 Reasoner + 역할 프롬프트 주입
       ↓
Phase 6: 독립 에이전트 인스턴스

Garnet Core (총괄 — 전략 수립, 팀 간 조율)
├── Analysis Agent    — 데이터 분석 + 인사이트 (GA4, SNS)
├── Content Agent     — 콘텐츠 기획/생성/검수
├── Strategy Agent    — 시장 조사 + 경쟁 분석 + 전략 설계
└── Operations Agent  — 일정 관리 + 이상 탐지 + 리포팅
```

- **핵심 원칙:** 하드코딩이 아닌 **역량 성숙도에 따른 자연 분화**
- Role Manager의 readiness 점수가 임계값을 넘으면 독립 에이전트로 승격 제안

### 6-2. 에이전트 간 프로토콜

```
각 에이전트:
- 전용 에피소딕 메모리 (자기 분야 경험 축적)
- 전용 Knowledge Store 도메인
- 개별 Self Benchmark (역량 추적)
- Phase 5 자기 개선 적용

팀 간 통신:
- 구조화된 JSON 메시지
- 승인 게이트 (중요 결정은 사용자 승인)
- 에스컬레이션 (해결 못 하면 상위로)
```

### 6-3. 도메인 확장

현재 MONOPLEX 마케팅이 첫 번째 도메인. Phase 6에서 확장:

```
현재: marketing, operations, content_strategy, consumer, b2b, pricing, finance
확장: HR, 재무, 법무, 제품, 기술 등 → 새 회사/역할에 이식 가능
```

---

## Phase 7: 자율 에이전트 (장기 비전)

> "사람이 방향만 제시하면 나머지는 에이전트 조직이 자율 운영"

- 에이전트 조직이 스스로 구조를 개편 (팀 신설/해산/합병)
- 외부 시스템과 자율 연동 (새 API 발견 → 도구 생성 → 연결)
- 멀티 도메인 동시 운영 (마케팅 + 전략 + 운영)
- 사용자는 주간 1회 방향 확인 + 승인만

---

## 기술 스택 추가 필요

| Phase | 필요 기술 | 비고 |
|-------|---------|------|
| 5 | 없음 | 기존 LLM + DB로 구현 가능 |
| 6 | Agent 통신 프로토콜 | JSON 메시지 규격 설계 필요 |
| 7 | 없음 | Phase 5-6 위에 자연 확장 |

---

## 타임라인

```
현재        Phase 1~4 운영 중 (지식/메모리 연속 축적)
            ████████████████████████████████████████

다음        Phase 5: Self-Coding
            ░░░░░░░░░░░░░░░░

이후        Phase 6: Agent Organization
            ░░░░░░░░░░░░░░░░░░░░

장기        Phase 7: 자율 에이전트
            ░░░░░░░░░░░░░░░░░░░░░░░░
```

**핵심 원칙:**
- Phase 1~4는 **병렬 연속 진화** — 사이클마다 모든 Phase가 동시 동작
- Phase 5는 Phase 1~4 데이터 축적이 전제 (현재 충족)
- Phase 6는 Phase 5의 자기 개선이 안정화된 후
- 사용자 승인 게이트는 **항상** 유지
- "마케팅 전용"이 아닌 **범용 추론 + 도메인 지식 분리** 구조
