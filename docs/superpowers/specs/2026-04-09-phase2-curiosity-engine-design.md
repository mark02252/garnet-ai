---
title: "Phase 2: Curiosity Engine + Macro Context + Self-Improvement Tech"
category: "spec"
owner: "rnr"
doc_kind: "design"
tags: ["agent-loop", "curiosity-engine", "evolution", "self-improvement"]
created: 2026-04-09
---

# Phase 2: Curiosity Engine

## 개요

Agent Loop가 **외부 정보에서 자율적으로 학습**하는 엔진. 세 가지 학습 도메인:
1. **비즈니스 지식** — 수집된 MarketingIntel에서 패턴/원칙 추출
2. **거시 환경** — 경제 지표, 계절/이벤트, 소비자 심리
3. **자가 발전** — GitHub/AI 기술에서 Garnet 개선 기회 탐색

진화 메커니즘:
4. **Cross-Domain Synthesis** — 도메인 간 지식 교차 연결
5. **Emergence Detection** — 지식 임계점에서 새 능력 제안

## 아키텍처

```
MarketingIntel (기존 수집)          Tech Radar (기존)
        ↓                              ↓
 Article Learner              Self-Improvement Scout
   뉴스/기사에서                  GitHub/AI 기술에서
   지식 추출                     Garnet 개선 기회 탐색
        ↓                              ↓
   Knowledge Store  ←──────────────────┘
        ↑
 Macro Context Tracker
   경제지표/계절/이벤트
        ↓
   Knowledge Store
        ↓
 Cross-Domain Synthesizer
   도메인 간 지식 교차 → 새 인사이트
        ↓
 Emergence Detector
   지식 임계점 → 새 능력 제안
```

## 1. Article Learner (`lib/agent-loop/article-learner.ts`)

이미 수집된 MarketingIntel에서 지식을 추출. 새 수집을 하지 않음.

### 동작
1. 최근 24시간 MarketingIntel 중 아직 학습하지 않은 것 조회
2. 기사 제목+snippet을 LLM에 전달
3. 비즈니스 지식으로 변환 → Knowledge Store 저장
4. 학습 완료 표시 (MarketingIntel.tags에 'learned' 추가)

### 호출 시점
- daily-briefing 사이클에서 호출 (매일 07:00)
- 하루 수집분을 한 번에 학습

## 2. Macro Context Tracker (`lib/agent-loop/macro-tracker.ts`)

거시 환경 정보를 Knowledge Store에 주입.

### 데이터 소스 (코드 내 정적 + 향후 API 확장)
- **계절/이벤트 캘린더**: 공휴일, 방학, 축제 (하드코딩으로 시작)
- **업종별 시즌**: 영화관 성수기(여름/겨울), 대관 성수기(봄/가을)
- **향후**: 한국은행 경제지표 API, 통계청 소비자심리지수

### 동작
1. 오늘 날짜 기준 ±14일 이내 이벤트 확인
2. 관련 Knowledge 생성: "다음 주 어린이날 → 가족 대관 수요 증가 예상"
3. Reasoner가 판단 시 참고

## 3. Self-Improvement Scout (`lib/agent-loop/self-improvement-scout.ts`)

기존 Tech Radar 데이터에서 Garnet 자체 개선 기회를 탐색.

### 동작
1. `techRadarItem` 테이블에서 category='tech' 항목 조회
2. LLM에게: "이 기술이 Garnet의 어떤 부분을 개선할 수 있는가?"
   - 메모리 검색 → 벡터 DB
   - 추론 품질 → 새 프레임워크
   - 데이터 수집 → 새 수집기
   - 자동화 → 새 MCP 도구
3. 개선 가능성이 있으면 Knowledge Store에 저장 (domain: 'self_improvement')
4. 주간 리뷰에서 사용자에게 보고

## 4. Cross-Domain Synthesizer (`lib/agent-loop/cross-pollinator.ts`)

서로 다른 도메인의 지식을 교차 연결하여 새 인사이트 생성.

### 동작
1. 주간 리뷰에서 호출
2. 각 도메인에서 confidence 높은 지식 top-5를 추출
3. LLM에게 교차 분석 요청:
   "marketing 지식과 competitive 지식을 결합하면 어떤 새 인사이트가 나오는가?"
4. 결과를 level=3 (Principle)로 Knowledge Store에 저장
5. 이전에 없던 인사이트면 Telegram으로 알림

## 5. Emergence Detector (`lib/agent-loop/emergence-detector.ts`)

지식이 임계점을 넘으면 새 능력을 제안.

### 규칙
- 특정 도메인의 지식이 50건+ 이고 평균 confidence > 0.6 → "이 도메인에서 자율 판단 가능"
- 두 도메인 모두 30건+ → "교차 능력 가능" (예: marketing+finance = ROI 분석)
- self_improvement 도메인에 HIGH 우선순위 항목 → "Garnet 업그레이드 제안"

### 출력
- 새 역할 제안 → Telegram + Operations 대시보드
- 주간 리뷰에 포함

## 기존 시스템 연동

| 모듈 | 변경 |
|------|------|
| `lib/agent-loop/index.ts` | daily-briefing에서 articleLearner 호출, weekly-review에서 synthesizer+emergence 호출 |
| `lib/agent-loop/meta-cognition.ts` | 주간 리뷰에 지식 성장 리포트 포함 |
| `lib/agent-loop/notifier.ts` | 새 능력 제안 / 중요 인사이트 알림 추가 |
| `lib/scheduler/register-jobs.ts` | tech-radar-collect 결과를 self-improvement-scout가 후처리 |

## 파일 구조

```
lib/agent-loop/
  article-learner.ts          — MarketingIntel → 지식 추출
  macro-tracker.ts            — 거시 환경 (계절/이벤트/경제)
  self-improvement-scout.ts   — Tech Radar → Garnet 개선 탐색
  cross-pollinator.ts         — 도메인 간 교차 인사이트
  emergence-detector.ts       — 새 능력 창발 감지
```
