---
title: "Phase 3: Causal Reasoning + Confidence + Prediction"
category: "spec"
owner: "rnr"
doc_kind: "design"
tags: ["agent-loop", "causal-reasoning", "prediction", "evolution"]
created: 2026-04-09
---

# Phase 3: Causal Reasoning + Confidence + Prediction

## 개요

Agent Loop의 판단 품질을 근본적으로 높인다:
1. **Causal Model** — "왜 일어났는지" 이해 (액션→결과 인과 관계)
2. **Confidence Scoring** — 판단의 불확실성 인식 + 리스크 자동 조정
3. **Goal Predictor** — "이 속도면 목표 달성 가능한지" 예측

진화 메커니즘:
4. **Strategy Mutation** — 주기적으로 완전히 다른 접근 시도
5. **Failure Pressure** — 반복 실패 시 패러다임 전환

## 1. Causal Model (`lib/agent-loop/causal-model.ts`)

액션→결과 인과 관계를 축적.

### DB 모델

```prisma
model CausalLink {
  id            String   @id @default(cuid())
  cause         String   // "content_publish:체험후기릴스"
  effect        String   // "engagement_increase_8pct"
  lag           String   // "3d" (3일 후 효과)
  strength      Float    @default(0.5) // 0-1 인과 강도
  observedCount Int      @default(1)
  domain        String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([cause])
  @@index([domain])
}
```

### 동작
- Outcome Observer에서 impactScore가 측정될 때마다 CausalLink 생성/업데이트
- cause = actionKind:context, effect = metric_change
- strength = min(0.95, 0.3 + observedCount * 0.1)
- Reasoner가 액션 제안 시 "이 액션의 예상 효과"를 CausalLink에서 조회

## 2. Confidence Scoring (`lib/agent-loop/confidence.ts`)

Reasoner의 각 판단에 신뢰도를 부여.

### 신뢰도 계산 요소
- Knowledge Store에 관련 지식이 많으면 ↑
- 관련 CausalLink가 있으면 ↑
- 관련 anti-pattern이 있으면 ↓
- 데이터가 부족하면 (World Model 값이 0) ↓

### Reasoner 연동
- 각 ReasonerAction에 confidence 필드 추가
- confidence < 0.4 이면 리스크 레벨 자동 1단계 상향 (LOW→MEDIUM)
- 대시보드에 "이 판단의 확신도: 72%" 표시

## 3. Goal Predictor (`lib/agent-loop/goal-predictor.ts`)

현재 추세를 기반으로 목표 달성 가능성 예측.

### 동작
- GoalState 이력에서 최근 7건의 progressPercent 추출
- 선형 회귀로 기울기 계산
- deadline까지 extrapolation → 달성 가능/불가능 판단
- 불가능 시 "남은 N일 안에 X% 추가 필요" 알림

## 4. Strategy Mutator (`lib/agent-loop/strategy-mutator.ts`)

주기적으로 기존과 완전히 다른 접근을 시도.

### 동작
- routine-cycle 10번 중 1번 확률로 활성화
- Reasoner에 추가 지시: "기존 패턴과 완전히 다른 접근을 1개 제안하세요"
- 결과를 별도 태그로 에피소딕 메모리에 저장
- 효과 있으면 기존 전략 대체, 없으면 폐기

## 5. Failure Pressure (`lib/agent-loop/paradigm-shift.ts`)

같은 유형 실패가 반복되면 근본 전환 트리거.

### 동작
- 특정 actionKind가 5회 연속 실패 (impactScore < -10) 또는 5회 거절
- → "이 접근 자체를 바꿔야 한다" 판단
- → LLM에게: "기존 접근: X, 5회 실패. 완전히 새로운 프레임워크를 제안하세요"
- → 결과를 Knowledge Store에 level=3 Principle로 저장
- → 기존 접근 관련 지식의 confidence 대폭 하향

## 파일 구조

```
lib/agent-loop/
  causal-model.ts        — 액션→결과 인과 관계 축적
  confidence.ts          — 판단 신뢰도 계산
  goal-predictor.ts      — 목표 달성 예측
  strategy-mutator.ts    — 전략 변이 (진화)
  paradigm-shift.ts      — 패러다임 전환 (진화)
```

## 기존 연동
- `reasoner.ts` — CausalLink + Confidence + Mutation 주입
- `executor.ts` — confidence 낮으면 리스크 상향
- `outcome-observer.ts` — 측정 결과로 CausalLink 갱신
- `goal-manager.ts` — Goal Predictor 연동
- `index.ts` — mutation 확률 제어, paradigm shift 트리거
