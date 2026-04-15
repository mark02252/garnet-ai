# Phase 6 Step 1: Domain Sub-Reasoners

> 단일 Reasoner를 도메인별 Sub-Reasoner 3개 + 메인 종합 Reasoner 구조로 확장

**Date:** 2026-04-15
**Status:** Design
**Depends on:** Existing Reasoner, Knowledge Store, Failure Registry

---

## Problem

현재 Reasoner 1개가 마케팅 분석, 콘텐츠 전략, 경쟁 분석, 운영 관리 등 모든 도메인을 동시에 판단한다. 이로 인해:

- 각 도메인에 대한 깊이가 얕음
- 시스템 프롬프트가 너무 길어 핵심 지시가 묻힘
- Phase 5-1 프롬프트 자동 최적화가 모든 도메인에 동일하게 적용됨

## Solution

도메인 전문 Sub-Reasoner 3개를 병렬로 실행한 뒤, 메인 Reasoner가 결과를 종합하여 최종 액션을 결정한다.

## Architecture

```
WorldModel + Goals
    ↓
┌───────────────────────────────────────────┐
│  Sub-Reasoners (병렬, Promise.allSettled)    │
│                                              │
│  AnalysisSubReasoner   ContentSubReasoner    │
│  (데이터 해석)          (콘텐츠 전략)         │
│                                              │
│  StrategySubReasoner                         │
│  (시장/경쟁/거시)                             │
└───────────────────────────────────────────┘
    ↓ (insights + ideas + directions)
Main Reasoner (종합)
    ↓
Actions
```

## Sub-Reasoner 사양

### 1. AnalysisSubReasoner

**역할:** 현재 데이터에서 가장 중요한 인사이트 3개 추출

- **Input:** WorldModel GA4/SNS 스냅샷, 트렌드, 예측 데이터
- **Output:**
  ```typescript
  {
    insights: Array<{
      finding: string        // 발견한 사실
      significance: 'high' | 'medium' | 'low'
      dataEvidence: string   // 근거 수치
    }>
  }
  ```
- **System prompt:** "10년차 데이터 분석가. 데이터에서 숫자 너머의 의미를 찾는다."

### 2. ContentSubReasoner

**역할:** 콘텐츠/SNS 관점에서 제안할 만한 아이디어 2개

- **Input:** SNS 스냅샷, 최근 성과 게시물, Knowledge Store의 content_strategy 도메인
- **Output:**
  ```typescript
  {
    contentIdeas: Array<{
      concept: string        // 콘텐츠 컨셉
      rationale: string      // 이 시점에 제안하는 이유
      format: string         // 포스트/릴스/스토리 등
    }>
  }
  ```
- **System prompt:** "10년차 콘텐츠 전략가. 브랜드 보이스와 트렌드를 연결한다."

### 3. StrategySubReasoner

**역할:** 장기/거시 관점의 전략 방향 2개

- **Input:** 경쟁사 동향, 거시 환경 (시즌/이벤트), 전략 목표
- **Output:**
  ```typescript
  {
    strategicDirections: Array<{
      direction: string      // 전략 방향
      timeframe: 'immediate' | 'short_term' | 'medium_term'
      reasoning: string
    }>
  }
  ```
- **System prompt:** "10년차 마케팅 전략가. 거시 환경과 경쟁 구도에서 기회를 포착한다."

## Main Reasoner 변경

**이전:** WorldModel만 받아서 직접 액션 생성
**이후:** WorldModel + Sub-Reasoner 결과 3개를 받아서 종합 판단

**새 프롬프트 섹션:**
```
## 도메인 전문가 분석
### 데이터 분석 (AnalysisSubReasoner)
- 인사이트 1, 2, 3 (우선순위 포함)

### 콘텐츠 전략 (ContentSubReasoner)
- 제안 아이디어 1, 2

### 전략 방향 (StrategySubReasoner)
- 전략 방향 1, 2
```

Main Reasoner는 이 3개 Sub의 결과를 종합해:
- 서로 충돌하는 제안이 있으면 조정
- 우선순위를 부여
- 최종 액션 2~4개를 결정

## Files

| 파일 | 작업 |
|------|------|
| `lib/agent-loop/sub-reasoners/analysis.ts` | 신규 |
| `lib/agent-loop/sub-reasoners/content.ts` | 신규 |
| `lib/agent-loop/sub-reasoners/strategy.ts` | 신규 |
| `lib/agent-loop/sub-reasoners/index.ts` | 신규 — 병렬 오케스트레이터 |
| `lib/agent-loop/reasoner.ts` | 수정 — Sub 결과 주입 |

## Error Handling

- `Promise.allSettled` 사용 — 한 Sub가 실패해도 나머지 진행
- 모든 Sub 실패 시 → 기존 단일 Reasoner 방식으로 폴백
- 각 Sub는 독립적으로 try/catch — 에러가 메인 흐름을 막지 않음

## Cost

| 항목 | 현재 | 개선 후 |
|------|------|---------|
| LLM 호출/사이클 | 1회 (~2000 tokens) | 4회 (Sub 3 × ~800 + 메인 1 × ~2500) |
| 토큰 사용 | ~2000 | ~4900 |
| 레이턴시 | ~5초 | ~8초 (병렬) |
| 비용 증가 | - | 약 2.5배 |

**가치 대비:** 도메인 전문성 + 판단 품질 향상 > 비용 증가

## Success Criteria

1. Sub-Reasoner 3개가 병렬로 정상 실행됨
2. 한 Sub 실패해도 나머지가 메인 Reasoner에 전달됨
3. 메인 Reasoner가 Sub 결과를 참조하여 더 구체적인 액션 생성
4. 기존 사이클 성능(5~10초)에서 크게 벗어나지 않음
