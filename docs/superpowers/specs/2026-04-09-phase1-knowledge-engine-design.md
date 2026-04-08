---
title: "Phase 1: Knowledge Engine + Outcome Observer + Human Feedback"
category: "spec"
owner: "rnr"
doc_kind: "design"
tags: ["agent-loop", "knowledge-engine", "evolution", "feedback-loop"]
created: 2026-04-09
---

# Phase 1: Knowledge Engine

## 개요

Agent Loop의 학습 기반을 구축한다. 세 가지 학습 소스를 연결:
1. **Outcome Observer** — 자기 액션의 실제 결과를 측정
2. **Knowledge Store** — 경험을 범용 비즈니스 지식으로 일반화
3. **Human Feedback** — 승인/거절에서 학습

추가로 진화 메커니즘의 첫 단계:
4. **Selection** — 효과 있는 전략 승격, 실패한 전략은 anti-pattern으로 저장
5. **Soft Self-Modification** — 설정/프롬프트/스케줄을 자기 판단으로 조정

## 아키텍처

```
Executor → 액션 실행
    ↓
Outcome Observer (시간차 측정)
    ↓ 지표 변화 측정
    ↓
Knowledge Extractor
    ↓ 경험 → Pattern/Principle로 일반화
    ↓
Knowledge Store (DB)
    ↑
    ├── Reasoner가 판단 시 참조
    ├── Anti-Pattern도 함께 참조 ("이건 하지 마")
    └── Human Feedback → 거절 이유 학습

Governor 승인/거절
    ↓
Human Feedback Learner
    ↓ 거절 → anti-pattern, 승인 → positive signal
    ↓
Knowledge Store
```

## 1. Outcome Observer (`lib/agent-loop/outcome-observer.ts`)

액션 실행 후 일정 시간이 지나면 지표 변화를 측정하여 에피소드 점수를 업데이트.

### 측정 시점 (액션 종류별)

| action kind | 측정 지연 | 측정 지표 |
|------------|----------|----------|
| report_generation | 즉시 | 생성 완료 여부 |
| playbook_update | 1일 | 관련 Flow 성과 변화 |
| content_publish | 3일 | SNS 참여율/도달 변화 |
| budget_adjust | 7일 | 해당 채널 트래픽 변화 |
| flow_trigger | 1일 | Flow 실행 결과 점수 |
| alert | 즉시 | 알림 전달 여부 |

### 동작
1. 액션 실행 시 `PendingOutcome` 레코드 생성 (action_id, measure_at, metric_snapshot_before)
2. Agent Loop urgency-check 때 `measure_at`이 지난 PendingOutcome 확인
3. 현재 지표와 before 스냅샷 비교 → delta 계산
4. EpisodicMemory 점수 업데이트 (실행 성공 70점 → 실제 효과 반영 0-100)
5. Knowledge Extractor에 결과 전달

### DB 모델

```prisma
model PendingOutcome {
  id              String   @id @default(cuid())
  governorActionId String
  episodeId       String?
  actionKind      String
  metricsBefore   String   // JSON: 측정 전 지표 스냅샷
  metricsAfter    String?  // JSON: 측정 후 지표
  impactScore     Float?   // -100 ~ +100 (부정적 ~ 긍정적 영향)
  measureAt       DateTime // 언제 측정할지
  measuredAt      DateTime?
  status          String   @default("pending") // pending | measured | expired
  createdAt       DateTime @default(now())

  @@index([status, measureAt])
}
```

## 2. Knowledge Store (`lib/agent-loop/knowledge-store.ts`)

범용 비즈니스 지식을 도메인별, 레벨별로 저장.

### 지식 레벨

| Level | 이름 | 예시 | 이식성 |
|-------|------|------|--------|
| 1 | Fact | "MONOPLEX 라이즈점 좌석률 15%" | 이 회사만 |
| 2 | Pattern | "체험 후기 릴스 → 참여율 +8%" | 유사 업종 |
| 3 | Principle | "프라이빗 경험 상품은 가격 저항이 낮다" | 범용 |

### DB 모델

```prisma
model KnowledgeEntry {
  id          String   @id @default(cuid())
  domain      String   // marketing, competitive, consumer, b2b, operations, finance, macro, self_improvement
  level       Int      @default(1) // 1=fact, 2=pattern, 3=principle
  pattern     String   // 조건/상황 (e.g. "경쟁사 프로모션 시작 시")
  observation String   // 관찰된 결과 (e.g. "자사 트래픽 10-20% 하락")
  confidence  Float    @default(0.5) // 0-1
  observedCount Int    @default(1) // 관찰 횟수 (높을수록 신뢰도 ↑)
  source      String   // "MONOPLEX 2026-Q2" or "industry_article" etc
  isAntiPattern Boolean @default(false) // true면 "이건 하지 마"
  relatedIds  String   @default("[]") // JSON: 연관 지식 ID
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([domain])
  @@index([level])
  @@index([confidence])
  @@index([isAntiPattern])
}
```

### Knowledge Extractor

Outcome Observer의 결과를 받아서 지식으로 변환:

```
Input: { actionKind: "content_publish", context: "체험 후기 릴스", impactScore: +8.2 }

LLM Prompt:
"다음 액션의 결과를 범용 비즈니스 지식으로 일반화하세요:
 액션: {context}
 결과: 참여율 +8.2%

 JSON: {
   domain: "marketing | competitive | consumer | ...",
   level: 1 | 2 | 3,
   pattern: "어떤 상황에서",
   observation: "어떤 결과가 나왔다",
   isAntiPattern: false
 }"

Output: {
  domain: "content_strategy",
  level: 2,
  pattern: "사용자 체험 후기 기반 숏폼 콘텐츠 발행 시",
  observation: "참여율 +5~10%, 프로필 방문 증가",
  isAntiPattern: false
}
```

### 기존 지식과 병합

같은 pattern이 이미 있으면:
- `observedCount++`
- `confidence` 재계산: `min(0.95, 0.3 + observedCount * 0.1)`
- 기존 observation과 새 observation 종합

## 3. Human Feedback Learner (`lib/agent-loop/human-feedback.ts`)

### Governor 거절 시 학습

```
사용자가 [거절] 누름
→ Telegram으로 거절 이유 질문:
  "거절 이유를 알려주시면 학습에 활용됩니다:
   1. 타이밍 아님
   2. 방향이 다름
   3. 예산/리소스 부족
   4. 이미 진행 중
   5. 기타"

→ 이유 수신 시:
  KnowledgeEntry 생성 (isAntiPattern: true)
  pattern: 액션의 context
  observation: "거절됨 — 이유: {reason}"
  domain: 해당 액션의 도메인

→ 이유 미수신 시:
  기본 anti-pattern 저장 (confidence 낮게)
```

### Governor 승인 시 학습

```
사용자가 [승인] 누름
→ 해당 액션 종류에 대한 positive signal
→ 기존 관련 Knowledge의 confidence 소폭 상승
```

### Reasoner 연동

Reasoner 프롬프트에 Knowledge Store 주입:

```
## 축적된 비즈니스 지식 (효과적)
- [Pattern, 신뢰도 0.8] 체험 후기 릴스 → 참여율 +8%
- [Principle, 신뢰도 0.7] 프라이빗 경험 강조 → 전환율 상승

## 하지 말아야 할 것 (Anti-Patterns)
- [Pattern] 할인 프로모션 → 브랜드 가치 훼손 (거절됨: "방향이 다름")
- [Pattern] 주말 오전 게시 → 참여율 하락 (실측)
```

## 4. Selection (진화 메커니즘)

### 전략 승격
- impactScore > 0 인 액션이 3회 이상 → confidence 높은 Pattern으로 승격
- Pattern이 다른 회사/도메인에서도 관찰되면 → Principle로 승격 (Phase 2에서)

### Anti-Pattern 관리
- impactScore < 0 인 액션이 2회 이상 → anti-pattern 등록
- 사용자 거절 → 즉시 anti-pattern (1회만으로 충분, 사람의 판단이 더 정확)
- Reasoner가 anti-pattern과 유사한 액션을 제안하면 자동 필터링

## 5. Soft Self-Modification

### Reasoner 프롬프트 자동 조정

```
Meta-Cognition이 매주 분석:
  "콘텐츠 제안 정확도: 80%, 예산 제안 정확도: 30%"
→ Reasoner 시스템 프롬프트에 추가:
  "예산 관련 제안 시 더 보수적으로, 반드시 데이터 근거 제시"
→ .garnet-config/reasoner-adjustments.json에 저장
```

### 리스크 기준 자동 조정

```
특정 kind의 자동실행 실패율 > 50%
→ 해당 kind의 기본 리스크를 LOW → MEDIUM으로 상향
→ .garnet-config/risk-overrides.json에 저장
```

## 파일 구조

```
lib/agent-loop/
  outcome-observer.ts    — 액션 결과 시간차 측정
  knowledge-store.ts     — 지식 CRUD + 검색 + 병합
  knowledge-extractor.ts — 경험 → 지식 변환 (LLM)
  human-feedback.ts      — 거절/승인 학습
  anti-patterns.ts       — anti-pattern 관리 + Reasoner 필터링
```

## 기존 시스템 연동

| 기존 모듈 | 변경 |
|-----------|------|
| `lib/agent-loop/executor.ts` | 액션 실행 시 PendingOutcome 생성 |
| `lib/agent-loop/evaluator.ts` | Outcome Observer 결과로 점수 업데이트 |
| `lib/agent-loop/reasoner.ts` | Knowledge Store + Anti-Patterns 프롬프트 주입 |
| `lib/agent-loop/scanner.ts` | urgency-check에서 PendingOutcome 만기 건 처리 |
| `lib/agent-loop/meta-cognition.ts` | Soft Self-Modification 트리거 |
| `app/api/governor/[id]/decide/route.ts` | 거절 시 Human Feedback 트리거 |
