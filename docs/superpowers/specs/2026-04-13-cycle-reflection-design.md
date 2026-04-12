# Phase 5-5: Cycle Reflection System

> Agent Loop 사이클 완료 후 전체 과정을 리뷰하고 교훈을 자율 축적

**Date:** 2026-04-13
**Status:** Design
**Depends on:** Phase 1 Knowledge Store, Phase 4 Reflective Critic

---

## Problem

현재 Agent Loop는 매 사이클마다 판단하고 실행하지만, **실행 후 전체 과정을 돌아보는 구조가 없다.** Reflective Critic은 개별 액션의 사전 비판만 수행하고, 사이클 전체를 종합적으로 리뷰하지 않는다. 이로 인해:

- 같은 실수를 반복할 수 있음
- 성공/실패 패턴이 명시적으로 축적되지 않음
- Reasoner가 과거 교훈을 참조하지 못함

## Solution

routine-cycle 완료 후 **Cycle Reflector** 모듈이 해당 사이클 전체를 리뷰하여 교훈을 추출하고, Knowledge Store에 저장하고, Reasoner 프롬프트에 자동 주입한다.

## Architecture

```
routine-cycle 흐름:
Scanner → Reasoner → Critic → Executor → Evaluator
                                              ↓
                                      Cycle Reflector
                                        ↓         ↓
                              Knowledge Store   Reasoner Prompt
                              (교훈/원칙 저장)   (최근 교훈 주입)
```

### 트리거 조건

- `routine-cycle`에서만 실행 (urgency-check, daily-briefing 등 제외)
- 해당 사이클에서 액션이 1건 이상 있을 때만 실행
- 액션 0건이면 스킵 (리플렉션할 내용 없음)

## Module: `lib/agent-loop/cycle-reflector.ts`

### Input

```typescript
type CycleReflectionInput = {
  cycleId: string
  cycleType: string
  worldModelSummary: string        // Scanner 결과 요약
  reasonerDecisions: string        // Reasoner 판단 + 근거
  actions: Array<{
    title: string
    riskLevel: string
    status: 'EXECUTED' | 'PENDING_APPROVAL' | 'REJECTED_BY_CRITIC'
    rationale: string
  }>
  goalChanges: Array<{             // 이번 사이클 전후 목표 변화
    goal: string
    before: number
    after: number
  }>
}
```

### Output

```typescript
type CycleReflectionResult = {
  summary: string                  // 1-2문장 사이클 요약
  lessons: Array<{
    pattern: string                // "이런 상황에서..."
    observation: string            // "이렇게 하면 좋다/나쁘다"
    domain: string                 // 지식 도메인
  }>
  reasonerFeedback: string         // 다음 사이클 Reasoner에 주입할 한 줄 피드백
}
```

### LLM Prompt

```
당신은 Agent Loop의 리플렉션 전문가입니다.
이번 사이클의 전체 과정을 리뷰하고 교훈을 추출하세요.

[사이클 컨텍스트]
환경: {worldModelSummary}
판단: {reasonerDecisions}
실행된 액션: {actions}
목표 변화: {goalChanges}

다음을 JSON으로 출력:
{
  "summary": "이번 사이클 1-2문장 요약",
  "lessons": [
    {
      "pattern": "반복 가능한 상황 패턴",
      "observation": "이 패턴에서의 교훈",
      "domain": "marketing|operations|content_strategy|consumer|b2b|..."
    }
  ],
  "reasonerFeedback": "다음 사이클에 반영할 한 줄 피드백"
}

교훈이 없으면 lessons를 빈 배열로. 억지로 만들지 마세요.
```

- Temperature: 0.3
- Max tokens: 800
- System prompt: 간결한 리플렉션 전문가

## Knowledge Store 연동

### 교훈 저장

각 lesson을 Knowledge Store에 저장:
- `level: 2` (Pattern) — 기본
- `source: 'cycle_reflector'`
- `domain`: LLM이 판단한 도메인

### 원칙 승격

같은 패턴이 **3회 이상 반복** 등장하면 Level 3(Principle)으로 승격:
- Knowledge Store에서 `source: 'cycle_reflector'`인 항목 중 유사 패턴 검색
- 유사도 판단은 단순 키워드 매칭 (비용 절약)
- 승격 시 기존 Pattern 항목을 Principle로 업데이트

## Reasoner 프롬프트 주입

### 최근 교훈 섹션

Reasoner 호출 시 시스템 프롬프트에 추가:

```
[최근 교훈]
- {최근 5개 cycle_reflector 교훈}

[확립된 원칙]
- {Level 3 원칙 중 최근 5개}
```

- Knowledge Store에서 `source: 'cycle_reflector'`로 필터링
- 최신순 5개만 주입 (프롬프트 비대 방지)
- 원칙(Level 3)은 별도 섹션으로 구분

### 주입 위치

`lib/agent-loop/reasoner.ts`의 시스템 프롬프트 구성 부분에 추가.

## Cost Control

| 항목 | 값 |
|------|-----|
| 트리거 | routine-cycle에서만 (1시간 간격) |
| 스킵 조건 | 액션 0건 |
| LLM 호출 | 사이클당 1회 |
| 토큰 제한 | 800 |
| 일간 최대 | ~24회 |
| 프롬프트 주입 | 교훈 5개 + 원칙 5개 (고정) |

## Files

| 파일 | 작업 |
|------|------|
| `lib/agent-loop/cycle-reflector.ts` | **신규** — 핵심 리플렉션 로직 |
| `lib/agent-loop/index.ts` | **수정** — runCycle에 reflector 호출 추가 |
| `lib/agent-loop/reasoner.ts` | **수정** — 시스템 프롬프트에 교훈/원칙 주입 |
| `lib/agent-loop/knowledge-store.ts` | **수정** — 원칙 승격 함수 추가 |

## Success Criteria

1. routine-cycle 완료 후 리플렉션이 자동 실행됨
2. 교훈이 Knowledge Store에 저장됨
3. 3회 반복 교훈이 원칙으로 승격됨
4. Reasoner가 최근 교훈/원칙을 참조하여 판단함
5. 액션 0건 사이클에서는 스킵됨
