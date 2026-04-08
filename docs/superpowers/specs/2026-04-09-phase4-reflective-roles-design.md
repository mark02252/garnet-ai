---
title: "Phase 4: Reflective Reasoning + Role Expansion + Proactive Inquiry"
category: "spec"
owner: "rnr"
doc_kind: "design"
tags: ["agent-loop", "reflection", "roles", "proactive", "evolution"]
created: 2026-04-09
---

# Phase 4: Reflective Reasoning + Role Expansion + Proactive Inquiry

## 개요

Agent Loop의 판단 성숙도와 자율성을 높인다:
1. **Reflective Reasoning** — MEDIUM/HIGH 판단에 자기비판 적용
2. **Self Benchmark** — 도메인별 능력 추적
3. **Proactive Inquiry** — 정보 부족 시 사용자에게 질문
4. **Role Expansion** — 새 역할을 자기 제안

진화 메커니즘:
5. **Self-Architecture** — 자기 구조의 한계 인식 + 개선 제안
6. **Capability Breeding** — 능력 조합으로 새 역할 자동 생성

## 1. Reflective Critic (`lib/agent-loop/reflective-critic.ts`)

MEDIUM/HIGH 리스크 판단에만 자기비판 적용. LOW는 건너뜀 (비용 절약).

### 동작
1. Reasoner 출력에서 MEDIUM/HIGH 액션 필터
2. 각 액션에 대해 LLM 자기비판: "이 판단의 반례는? 더 나은 대안은?"
3. 비판 결과가 심각하면 → 액션 수정 or 제거
4. 비판 과정 자체를 Knowledge Store에 저장 (메타 학습)

## 2. Self Benchmark (`lib/agent-loop/self-benchmark.ts`)

도메인별 Garnet의 능력을 수치로 추적.

### 메트릭
- 도메인별: 지식 건수, 평균 confidence, 판단 정확도, 거절률
- 종합: 전체 판단 정확도, 자동실행 성공률, 지식 성장률

### 출력
- 주간 리뷰에 포함
- Operations 대시보드 API에 노출

## 3. Proactive Inquiry (`lib/agent-loop/proactive-inquiry.ts`)

정보 부족을 감지하고 사용자에게 질문.

### 트리거
- Reasoner가 confidence < 0.3인 판단을 내릴 때
- World Model에 0인 지표가 3개 이상일 때
- 특정 목표가 0%이고 관련 데이터가 없을 때

### 질문 형태
- Telegram으로 구조화된 질문
- "비상영 대관의 현재 가격과 주요 문의 채널을 알려주시면 더 정확한 전략을 제안할 수 있습니다."

## 4. Role Manager (`lib/agent-loop/role-manager.ts`)

Garnet의 현재 역할 + 확장 가능한 역할을 관리.

### 동작
- Emergence Detector + Self Benchmark 결과를 기반으로
- 준비도 80%+ 도메인 → "이 역할을 활성화할 수 있습니다" 제안
- 사용자 승인 시 → Reasoner 시스템 프롬프트에 새 역할 추가

## 파일 구조

```
lib/agent-loop/
  reflective-critic.ts    — 자기비판 (MEDIUM/HIGH만)
  self-benchmark.ts       — 도메인별 능력 추적
  proactive-inquiry.ts    — 정보 부족 시 질문
  role-manager.ts         — 역할 관리 + 확장 제안
```
