# Garnet Agent Workflows

> Anthropic의 5가지 Agent Workflow 패턴에 Garnet 구성 요소 매핑

**Reference:** [Building Effective Agents (Anthropic)](https://www.anthropic.com/research/building-effective-agents)

---

## 1. Prompt Chaining (순차 프롬프트 체인)

**패턴:** 한 LLM 출력이 다음 LLM의 입력이 되는 직렬 처리
**언제:** 작업을 명확한 하위 작업으로 분해할 수 있을 때

### Garnet 적용 예
```
Scanner (환경 인식) → Reasoner (판단) → Executor (실행)
                    ↓
                    Evaluator (평가) → Cycle Reflector (교훈 추출)
```

**파일:** `lib/agent-loop/index.ts` (runCycle 전체 흐름)

---

## 2. Routing (분기 라우팅)

**패턴:** 입력을 분류하여 적절한 전문 핸들러로 전달
**언제:** 서로 다른 입력이 서로 다른 처리를 필요로 할 때

### Garnet 적용 예
```
CycleType에 따라:
  urgency-check (15분)    → 긴급 이슈만 처리
  routine-cycle (1시간)    → 전체 사이클 + 기사 학습 + 리플렉션
  daily-briefing (7시)     → 매출/목표 리포트
  weekly-review (월 9시)   → 전략 재평가 + 프롬프트 최적화
```

**파일:** `lib/agent-loop/index.ts:runCycle()` 의 cycleType 분기

---

## 3. Parallelization (병렬 처리)

**패턴:** 여러 LLM이 동시에 독립적으로 작업, 결과 종합
**언제:** 독립적 하위 작업을 빠르게 처리하거나 다양한 관점이 필요할 때

### Garnet 적용 예 (Phase 6-1)
```
runSubReasoners()
  ├→ AnalysisSubReasoner   (데이터 분석 전문)
  ├→ ContentSubReasoner    (콘텐츠 전략 전문)
  └→ StrategySubReasoner   (시장/경쟁 전략 전문)

모두 Promise.allSettled로 병렬 실행 → 메인 Reasoner가 종합
```

**파일:** `lib/agent-loop/sub-reasoners/index.ts`

---

## 4. Orchestrator-Workers (오케스트레이터-워커)

**패턴:** 중앙 LLM이 작업을 동적으로 분해하고 워커에게 할당
**언제:** 하위 작업이 사전에 예측 불가능할 때

### Garnet 적용 예
```
Reasoner (Orchestrator)
  → 상황 분석 후 필요한 액션 동적으로 생성
  → 각 액션이 적절한 Executor 핸들러로 라우팅
    - content_publish → 콘텐츠 발행 핸들러
    - budget_adjust → 예산 조정 핸들러
    - flow_trigger → Flow 실행 핸들러
    - report_generation → 리포트 생성 핸들러
```

**파일:** `lib/agent-loop/executor.ts` + `lib/agent-loop/handlers.ts`

---

## 5. Evaluator-Optimizer (평가-최적화 루프)

**패턴:** 한 LLM이 생성, 다른 LLM이 평가/개선. 반복.
**언제:** 명확한 평가 기준이 있고 반복 개선이 가치 있을 때

### Garnet 적용 예 (iGRPO 스타일, 오늘 적용)
```
Reasoner (생성)
  → 액션 Draft 생성
  ↓
Reflective Critic (평가)
  → 약점 식별
  → 개선된 액션 제시 (improvedAction)
  ↓
최종 액션으로 교체
```

또한:
```
Prompt Evolver (주간)
  → 기존 프롬프트 + 성과 데이터 분석
  → 개선된 프롬프트 제안
  → Governor 승인 후 적용
```

**파일:**
- `lib/agent-loop/reflective-critic.ts` (매 사이클)
- `lib/agent-loop/prompt-evolver.ts` (주간)

---

## Garnet의 고유 패턴 (Anthropic 5패턴 확장)

### 6. Self-Reflection Loop (자기 반성 루프) — Phase 5-5
```
사이클 완료 → Cycle Reflector → 교훈 추출 → Knowledge Store
                                          ↓
                              3회 반복 → 원칙 승격 → 다음 사이클 Reasoner에 주입
```

**파일:** `lib/agent-loop/cycle-reflector.ts`

### 7. Temporal Decay (시간 감쇠) — Failure Registry
```
과거 실패 사례
  → 시간 감쇠 가중치 적용
    7일 이내: 1.0
    14일 이내: 0.6
    30일 이내: 0.3
    30일 초과: 제외
  → Reasoner 프롬프트에 회피 규칙으로 주입
```

**파일:** `lib/agent-loop/failure-registry.ts`

### 8. Semantic Memory Retrieval — Episode Search
```
현재 상황 → 임베딩 변환 (Ollama)
          → 과거 814개 에피소드 중 코사인 유사도 검색
          → 유사 상황에서의 과거 판단 + 결과 참조
```

**파일:** `lib/memory/episodic-store.ts:retrieveByMeaning()`

---

## 전체 구조 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                      Cron Scheduler                           │
│  (15분/1시간/7시/18시/월9시) — Routing                         │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────────┐
│                   runCycle() — Prompt Chaining               │
│                                                               │
│  Scanner → [Sub-Reasoners Parallel] → Reasoner              │
│                                        ↓                      │
│                         Reflective Critic (Eval-Optimize)    │
│                                        ↓                      │
│                         Executor (Orchestrator-Workers)      │
│                                        ↓                      │
│                         Evaluator → Cycle Reflector          │
└─────────────────────────────────────────────────────────────┘
```

---

## 구현 성숙도

| 패턴 | 구현 상태 | 관련 모듈 |
|------|----------|----------|
| Prompt Chaining | ✅ 완전 구현 | runCycle 전체 |
| Routing | ✅ 완전 구현 | cycleType 분기 |
| Parallelization | ✅ Phase 6-1 | sub-reasoners/ |
| Orchestrator-Workers | ✅ 완전 구현 | executor + handlers |
| Evaluator-Optimizer | ✅ iGRPO 적용 | reflective-critic |
| Self-Reflection | ✅ Phase 5-5 | cycle-reflector |
| Temporal Decay | ✅ 오늘 추가 | failure-registry |
| Semantic Retrieval | ✅ 오늘 추가 | episodic-store |

**Garnet은 Anthropic의 5가지 표준 패턴을 모두 구현하고, 3가지 고유 확장 패턴을 추가한 상태.**
