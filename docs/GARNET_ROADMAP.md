# Garnet Development Roadmap

> Personal AGI Marketing OS — from Tool to Self-Improving Agent Organization

---

## Current State (v0.5.0+)

### Completed ✅
- Garnet Red design system + 3D crystal
- ops-zone intelligence dashboard (전 페이지)
- GA4 Analytics: 8 new charts + 10yr marketer AI analysis
- SNS Performance: saves/shares/follower daily/online followers
- Instagram token auto-refresh + long-lived exchange
- Cron daily sync job
- Flow Builder + Agent Shell (JARVIS)
- Seminar (multi-round debate)
- Campaign Rooms
- 12 cron intelligence collectors

### Blocked ⏸
- Meta Business 2FA → system token (계정 관리 이슈)
- GA4 conversion funnel → PG callback dataLayer (앱 개발 시)

---

## Phase 1: 기반 완성 (1주)
> "수집한 데이터를 빠짐없이 활용"

### 1-1. 코호트 리텐션 히트맵
- **구현:** GA4 Cohort API → 주차별 재방문율 그리드
- **파일:** `lib/ga4-client.ts` (fetchCohortRetention), `app/api/ga4/cohort/route.ts`, analytics page 차트 추가
- **의존성:** 없음 (GA4 API 즉시 가능)
- **결과:** "3주차에 유저 73% 이탈" → 이탈 시점 특정

### 1-2. 예산 시뮬레이터
- **구현:** 채널별 세션/전환 데이터 기반 What-if 계산기
- **파일:** `components/budget-simulator.tsx`, analytics page 통합
- **로직:** 채널별 CPA 계산 → 예산 변경 시 예상 전환 수 추정
- **의존성:** 없음 (기존 채널 데이터 활용)
- **결과:** "Organic Social 예산 2배 → 전환 +230건 예상"

### 1-3. 자동 주간 리포트
- **구현:** cron (매주 월 9시) → GA4+SNS 데이터 수집 → LLM 분석 → Slack/Notion 발행
- **파일:** `lib/job-scheduler.ts` (runWeeklyReportJob), 기존 cron 인프라 활용
- **의존성:** 없음
- **결과:** 매주 월요일 아침 자동 브리핑

### 1-4. Operations 2차 개선
- **구현:** 실사용 피드백 반영, 빈 데이터 상태 개선
- **의존성:** 피드백 수집 후

---

## Phase 2: 에이전트 지능 (1~2주)
> "단순 분석 → 자율 판단 + 실행 제안"

### 2-1. Flow Converse + Debate 노드
- **구현:** 스펙/플랜 이미 완료 (`docs/superpowers/specs/2026-04-07-flow-converse-design.md`)
- **파일:** 9개 태스크, 2개 청크 (플랜 참조)
- **핵심:** Converser LLM → Architect → Smart Execution (합의 기반 토론)
- **결과:** 에이전트 간 토론으로 전략 품질 검증

### 2-2. Judge Agent 노드 (품질 평가)
- **구현:** 새 FlowNode 타입 `JudgeNode`
- **로직:**
  ```
  Creator Agent → 결과물 → Judge Agent (0-100 점수)
  → 70점 미만? → 피드백 + 재생성 (최대 3회)
  → 70점 이상? → 통과
  ```
- **파일:** `lib/flow-runner.ts`, `components/flow/nodes/JudgeNode.tsx`
- **의존성:** Phase 2-1 (Flow 확장 기반)
- **결과:** 자동 품질 관리, 저품질 output 필터링

### 2-3. AI 자동 액션 제안 엔진
- **구현:** 분석 결과 → 구체적 액션 자동 생성 → 승인 대기열
- **로직:**
  ```
  GA4/SNS 데이터 분석 완료
  → "이탈률 높은 /booking 페이지 A/B 테스트 필요" (액션 생성)
  → Operations 승인 대기열에 추가
  → 사용자 승인 → 실행
  ```
- **파일:** `lib/action-engine.ts`, `app/api/actions/suggest/route.ts`
- **의존성:** 없음
- **결과:** 분석 → 실행 사이의 갭 자동화

### 2-4. 이상 탐지 실시간 알림
- **구현:** 기존 anomaly detection + Slack 즉시 발송 + 원인 추정
- **파일:** 기존 `lib/analytics/forecast.ts` 확장
- **의존성:** 없음
- **결과:** 트래픽 급감 시 3분 내 알림 + "원인 추정: 서버 장애 가능성"

---

## Phase 3: 피드백 루프 (2~3주)
> "실행 → 결과 → 학습 → 개선의 자동 순환"

### 3-1. 에피소딕 메모리 시스템
- **구현:** 3계층 메모리 아키텍처
  ```
  작업 메모리: Flow context Map (이미 있음)
  에피소딕 메모리: 과거 실행 결과 + 점수 (DB + pgvector)
  시맨틱 메모리: 브랜드 보이스, 오디언스 (플레이북, 이미 있음)
  ```
- **핵심:** 실행 전 유사 과거 사례 검색 → few-shot으로 주입
- **파일:** `lib/memory/episodic-store.ts`, `lib/memory/retriever.ts`
- **의존성:** pgvector 설치 또는 Mem0 JS SDK
- **결과:** 실행 횟수 ↑ → AI 품질 자동 ↑

### 3-2. 실행 결과 자동 평가
- **구현:** 캠페인/콘텐츠 발행 후 N일 뒤 성과 자동 수집
  ```
  콘텐츠 발행 → 3일 후 → 도달/참여/저장 자동 수집
  → AI가 "성공/실패" 판정 + 이유 분석
  → 에피소딕 메모리에 저장
  ```
- **파일:** `lib/evaluation/auto-evaluator.ts`, cron job 추가
- **의존성:** Phase 3-1 (메모리 시스템)
- **결과:** 모든 실행에 대한 자동 성과 카드

### 3-3. 플레이북 자동 업데이트
- **구현:** 성과 좋은 패턴 → 자동으로 플레이북에 추가
  ```
  평가 점수 90+ → "이 패턴을 플레이북 후보로 등록"
  → 3회 연속 성공 → 확정 플레이북으로 승격
  ```
- **파일:** `lib/learning/auto-playbook.ts`
- **의존성:** Phase 3-2
- **결과:** 수동 플레이북 관리 → 자동 축적

### 3-4. AI 추천 정확도 추적
- **구현:** "AI가 추천한 콘텐츠 vs 실제 성과" 대시보드
  ```
  추천 로그 DB 테이블
  → 추천 시점의 예상 효과 vs 실제 결과
  → 정확도 % 추적
  → 정확도 낮은 추천 유형 → 프롬프트 개선 대상
  ```
- **파일:** `lib/evaluation/accuracy-tracker.ts`
- **의존성:** Phase 3-2
- **결과:** AI 신뢰도 수치화

---

## Phase 4: 자율 마케팅 (3~4주)
> "사람이 승인만 하면 나머지는 AI가 설계+실행"

### 4-1. 캠페인 자동 설계
- **구현:** 목표 입력 → AI가 전체 캠페인 설계
  ```
  사용자: "4월 신규 유저 20% 증가"
  → Strategy Agent: 채널/예산/일정 설계
  → Content Agent: 콘텐츠 10개 초안
  → Performance Agent: 예산 시뮬레이션
  → 사용자: 승인/수정 → 자동 실행
  ```
- **파일:** `lib/campaign-designer.ts`, Flow template 자동 생성
- **의존성:** Phase 2 (Judge, Action Engine) + Phase 3 (메모리)
- **결과:** 캠페인 기획 시간 1주 → 1시간

### 4-2. A/B 테스트 자동 제안
- **구현:** 이탈률/참여율 기반 자동 개선안
  ```
  "이 페이지 이탈률 68%" 감지
  → AI가 3가지 개선안 생성 (헤드라인/CTA/레이아웃)
  → 승인 시 GTM으로 A/B 테스트 자동 설정
  ```
- **의존성:** Phase 2-3 (액션 엔진)

### 4-3. 경쟁사 자동 모니터링
- **구현:** 기존 collector 인프라 확장
  ```
  경쟁사 웹/SNS 변화 감지 (매일)
  → "경쟁사가 새 프로모션 시작" 알림
  → AI가 대응 전략 자동 제안
  ```
- **파일:** `lib/collectors/competitor-monitor.ts`
- **의존성:** 없음 (기존 collector 인프라)

### 4-4. 예산 자동 재배분 제안
- **구현:** 주간 성과 기반 채널별 예산 조정안
  ```
  매주 월요일:
  → 채널별 CPA/ROAS 계산
  → "Referral +20%, Direct -10%" 제안
  → 승인 → 광고 관리자 API로 반영 (Meta Business 연동 시)
  ```
- **의존성:** Phase 1-2 (시뮬레이터) + Meta Business 연동

---

## Phase 5: Self-Improvement (4~6주)
> "AI가 자기 자신을 개선"

### 5-1. 프롬프트 자동 최적화 (DSPy 방식)
- **구현:**
  ```
  매주 백그라운드 job:
  1. 각 AgentNode의 systemPrompt 가져오기
  2. 최근 10회 실행 + Judge 점수 분석
  3. LLM에게 5개 프롬프트 변형 생성 요청
  4. 각 변형을 테스트 데이터로 평가
  5. 최고 점수 변형으로 자동 교체 (이전 버전 백업)
  ```
- **파일:** `lib/self-improve/prompt-optimizer.ts`
- **의존성:** Phase 2-2 (Judge), Phase 3-1 (에피소딕 메모리)
- **근거:** Karpathy autoresearch — 700회 실험으로 19% 성능 향상
- **결과:** 매주 모든 에이전트 프롬프트가 자동으로 개선

### 5-2. Flow 자동 생성/개선
- **구현:**
  ```
  반복 작업 패턴 감지
  → "이 작업을 Flow로 만들면 자동화 가능" 제안
  → 승인 시 Flow Architect가 자동 생성
  → 실행 후 성과 측정 → 자동 개선
  ```
- **파일:** `lib/self-improve/flow-evolver.ts`
- **의존성:** Phase 3 전체

### 5-3. 리플렉션 에이전트
- **구현:**
  ```
  모든 주요 실행 완료 후:
  → Reflection Agent가 전체 과정 리뷰
  → "잘한 점 / 못한 점 / 다음에 개선할 점" 추출
  → 시맨틱 메모리 업데이트
  → 관련 에이전트 프롬프트에 자동 반영
  ```
- **파일:** `lib/self-improve/reflection-agent.ts`
- **의존성:** Phase 3-1 (메모리)

### 5-4. 예측 모델 자체 보정
- **구현:**
  ```
  예측 vs 실제 오차 누적 기록
  → 오차 패턴 분석 (과대추정? 과소추정? 특정 채널?)
  → 보정 계수 자동 조정
  → 다음 예측에 반영
  ```
- **파일:** `lib/self-improve/prediction-calibrator.ts`
- **의존성:** Phase 3-4 (정확도 추적)

### 5-5. 도구 자동 생성
- **구현:**
  ```
  Agent가 "이런 도구가 필요합니다" 요청
  → Tool Builder Agent가 MCP 도구 스펙 생성
  → 테스트 실행 → 승인 → 도구 카탈로그에 등록
  → 다음 Flow에서 자동 사용 가능
  ```
- **파일:** `lib/self-improve/tool-builder.ts`
- **의존성:** Phase 2-2 (Judge)

---

## Phase 6: 에이전트 조직 (6주+)
> "개별 에이전트 → 전문 팀 → 자율 조직"

### 6-1. 전문 에이전트 부서 구조

```
CMO Agent (총괄 — 주간 전략 수립, 팀 간 조율)
│
├── Content Division
│   ├── Writer Agent      — 콘텐츠 작성 (에피소딕 메모리: 과거 성공 콘텐츠)
│   ├── Visual Agent      — 이미지/영상 제안 (Gemma4 Vision)
│   └── Editor Agent      — 브랜드 보이스 검수 (Judge 역할)
│
├── Performance Division
│   ├── Analyst Agent     — GA4+SNS 데이터 분석
│   ├── Optimizer Agent   — 예산/채널 최적화 + 시뮬레이션
│   └── Predictor Agent   — 성과 예측 + 자체 보정
│
├── Strategy Division
│   ├── Researcher Agent  — 시장 조사 + 트렌드
│   ├── Competitor Agent  — 경쟁사 모니터링
│   └── Planner Agent     — 캠페인 설계
│
└── Operations Division
    ├── Scheduler Agent   — 발행 일정 + 자동 게시
    ├── Monitor Agent     — 이상 탐지 + 즉시 알림
    └── Reporter Agent    — 주간/월간 리포트 자동 생성
```

### 6-2. 에이전트 간 프로토콜
```
각 에이전트:
- 전용 에피소딕 메모리 (자기 분야 경험 축적)
- 전용 프롬프트 (자동 최적화 대상)
- 성과 점수 (다른 에이전트가 평가)
- 자율 학습 (Phase 5 self-improvement 적용)

팀 간 통신:
- 구조화된 JSON 메시지
- 승인 게이트 (중요 결정은 사용자 승인)
- 에스컬레이션 (해결 못 하면 상위 에이전트에게)
```

---

## 기술 스택 추가 필요

| Phase | 필요 기술 | 비고 |
|-------|---------|------|
| 3 | **pgvector** 또는 **Mem0 JS SDK** | 벡터 유사도 검색 (에피소딕 메모리) |
| 4 | **GTM API** | A/B 테스트 자동 설정 (선택) |
| 5 | 없음 | 기존 LLM + DB로 구현 가능 |
| 6 | 없음 | Flow Runner 확장으로 구현 |

---

## 타임라인 요약

```
Week 1-2:   Phase 1 (기반 완성)
Week 2-3:   Phase 2 (에이전트 지능)
Week 3-5:   Phase 3 (피드백 루프) ← 데이터 축적 시작
Week 5-7:   Phase 4 (자율 마케팅)
Week 7-10:  Phase 5 (Self-Improvement) ← Phase 3 데이터 필요
Week 10+:   Phase 6 (에이전트 조직)
```

**핵심 원칙:**
- 각 Phase는 이전 Phase 위에 쌓임
- Phase 3의 데이터 축적이 Phase 5의 전제 조건
- 사용자 승인 게이트는 항상 유지 (완전 자율 실행 아님)
- 매 Phase 완료 시 커밋 + 메모리 업데이트
