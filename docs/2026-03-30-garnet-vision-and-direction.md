# Garnet 비전 및 발전 방향

> 날짜: 2026-03-30
> 상태: 방향성 검토

---

## 1. 핵심 비전

Garnet은 **단순한 마케팅 자동화 도구가 아니라**, 지속적으로 스스로 학습하고 개선하는 **개인 AGI 에이전트 시스템**이다.

### 궁극적 목표
- 스스로 학습하고
- 스스로 개선하고
- 스스로 제안하며
- 인간과 협력하여 발전하는
- **개인 AI 에이전트 자산**

### 핵심 원칙
1. **개인 자산** — 특정 회사/서비스에 종속되지 않는 독립 시스템
2. **장기 진화** — 일회성 도구가 아닌 지속적으로 발전하는 구조
3. **구조 중심** — 기능 단위가 아닌 에이전트 구조 단위로 사고
4. **승인 기반 자율** — 모든 핵심 변경은 인간 승인 기반
5. **병렬 처리** — 24시간 자율적으로 탐색/분석/제안

---

## 2. 현재 상태 (v0.5.0)

### 완료된 것
| 영역 | 상태 |
|------|------|
| 마케팅 OS 기반 | ✅ 19개 페이지, 프리미엄 UI |
| Cron 스케줄러 | ✅ 12개 잡, 24시간 자동 실행 |
| 마케팅 인텔리전스 | ✅ 5개 플랫폼 수집 + AI 분석 |
| GA4 성과 분석 | ✅ 실제 데이터, 11개 섹션 대시보드 |
| Instagram 연동 | ✅ OAuth 로그인 + 인사이트 수집 |
| 영상 생성 | ✅ LTX-2.3 (Fal.ai) 스크립트+영상 |
| AI 코파일럿 | ✅ Cmd+. 마케팅 전문 채팅 |
| 데스크탑 앱 | ✅ Tauri v2 (Electron 제거) |
| 웹 배포 | ✅ Vercel (garnet-two.vercel.app) |
| DB | ✅ Supabase PostgreSQL |

### 아직 없는 것 (Self-Improvement 관점)
| 영역 | 상태 |
|------|------|
| 자기 진화 루프 | ❌ Scout/Analyst/Builder/Governor 미구현 |
| Research Memory | ❌ 탐색 이력/결론 저장 없음 |
| Change Journal | ❌ 변경 이유/승인 추적 없음 |
| Approval Inbox | ❌ 모바일 승인 인터페이스 없음 |
| Meta Learning | ❌ 사용자 패턴 학습 없음 |
| 멀티 에이전트 | ❌ 하위 에이전트 구조 없음 |

---

## 3. Self-Improvement Architecture 매핑

### 3.1 4단계 자기 진화 루프

```
[Scout] → [Analyst] → [Builder] → [Governor]
탐색       분석        초안 생성    승인/통제
```

| 단계 | 현재 Garnet 매핑 | 추가 필요 |
|------|-----------------|----------|
| **Scout (탐색)** | 마케팅 인텔 수집기 (5개 플랫폼) | GitHub/기술 탐색 추가 |
| **Analyst (분석)** | AI 분석 (관련도/긴급도) | 코드 분석, 구조 개선 분석 |
| **Builder (초안)** | 영상 스크립트, AI 코파일럿 | PR 자동 생성, 코드 초안 |
| **Governor (승인)** | 없음 | 승인 인박스, 모바일 알림 |

### 3.2 병렬 Lane 매핑

| Lane | 현재 상태 | 발전 방향 |
|------|---------|----------|
| **Tech Radar** | ❌ 미구현 | GitHub 오픈소스 자동 탐색 → 적용 가능성 분석 |
| **Dependency** | ❌ 미구현 | npm audit, 보안 이슈, breaking change 자동 감지 |
| **Architecture** | ❌ 미구현 | 코드 병목 분석, 중복 로직 탐지, 개선 후보 |
| **Experiment** | ❌ 미구현 | PoC 브랜치 자동 생성, A/B 테스트 |
| **Review** | ❌ 미구현 | PR/이슈/실패 사례 재분석 |

### 3.3 자율성 레벨

| Level | 설명 | 현재 | 목표 |
|-------|------|------|------|
| **L0 Observe** | 탐색/수집/요약 | ✅ (인텔 수집) | 기술 탐색 추가 |
| **L1 Suggest** | 개선 제안 | 부분 (AI 분석) | 구조 개선 제안 |
| **L2 Draft** | 코드 초안/PR | ❌ | 자동 PR 생성 |
| **L3 Limited Auto** | 낮은 위험 자동 반영 | ❌ | lint/format 자동 수정 |
| **L4 Restricted** | 핵심 변경은 승인 | ❌ | Governor 시스템 |

---

## 4. System Ownership 원칙 적용

### Core (개인 자산, 이식 가능)
- 에이전트 구조 (lib/scheduler, lib/collectors, lib/intel)
- 메모리 시스템 (향후 Research Memory, Change Journal)
- 워크플로우 엔진 (Cron 스케줄러, 파이프라인)
- AI 코파일럿 (대화 기반 인터페이스)

### Pluggable (외부 서비스, 교체 가능)
- LLM Provider (Gemini/OpenAI/Claude — 이미 멀티 프로바이더)
- 영상 생성 (LTX/Kling/MiniMax — 멀티 프로바이더 예정)
- 검색 (Serper/Brave/Naver — 이미 fallback 구조)
- DB (SQLite → PostgreSQL 전환 완료, 추가 교체 가능)
- 배포 (Vercel/자체 서버 — 유연)

### External (비즈니스 종속, 분리 필요)
- GA4 데이터 (monoplex.com 종속)
- Instagram 계정 (@monoplex_official)
- Meta Developer App

---

## 5. 발전 로드맵 (Self-Improvement 통합)

### Phase 1: 기반 완성 (현재 ~ v1.0)
> 현재 진행 중인 개발 완료

- [ ] AI 성과 분석 프리미엄 업그레이드
- [ ] 통합 대시보드 (GA4 + Instagram)
- [ ] 멀티 프로바이더 영상 생성 (Kling/MiniMax)
- [ ] DMG 프로덕션 빌드
- [ ] 커스텀 도메인

### Phase 2: 자기 진화 기초 (v1.0 ~ v1.5)
> Scout + Analyst 구현

- [ ] **Research Memory** — 탐색 이력 DB 테이블 (ResearchLog)
- [ ] **Tech Radar Lane** — GitHub 트렌드 자동 탐색 (일 1회)
- [ ] **Dependency Lane** — npm audit + 보안 이슈 자동 감지
- [ ] **Change Journal** — 모든 변경 이유/결과 기록
- [ ] **일간 리서치 리포트** — AI가 기술 트렌드 요약 → Slack/대시보드

### Phase 3: 자율 제안 (v1.5 ~ v2.0)
> Builder + Governor 구현

- [ ] **Architecture Lane** — 코드 병목/중복 자동 분석
- [ ] **Proposal Generator** — 구조 개선 제안서 자동 생성
- [ ] **Approval Inbox** — 모바일 승인 인터페이스 (Push 알림)
- [ ] **Risk Scoring** — Low/Medium/High 자동 분류
- [ ] **PR Auto-Draft** — 낮은 위험 변경 자동 PR 생성

### Phase 4: 메타 학습 (v2.0 ~ v3.0)
> 자기 개선 루프 완성

- [ ] **Meta Learning** — 승인/거절 패턴 학습
- [ ] **Regression Guard** — 자동 테스트 + 실패 시 롤백
- [ ] **Experiment Lane** — PoC 브랜치 자동 생성
- [ ] **멀티 에이전트** — 하위 에이전트 확장 구조
- [ ] **모바일 에이전트** — iPhone에서 음성/텍스트 지시

---

## 6. 디바이스 역할 계획

| 디바이스 | 현재 | 목표 |
|---------|------|------|
| **Mac (Main)** | 로컬 개발 + Tauri | 스케줄러, 병렬 처리, 장기 메모리 |
| **Web (Vercel)** | 배포판 + GA4/Instagram | 24시간 서버, Cron 잡, API |
| **iPhone** | 없음 | 승인/거절, 음성 지시, Push 알림 |
| **Cloud** | Gemini API | 고성능 추론, 외부 API |

---

## 7. 비용 최적화 전략

현재 구현됨:
- ✅ LLM 멀티 프로바이더 (free → paid fallback)
- ✅ 수집 QuotaTracker (일별/월별 한도)
- ✅ 데이터 보존 정책 (90일 JobRun, 30일 raw, 180일 Intel)

추가 필요:
- [ ] 단순 작업 → 로컬/저비용 모델 (분류, 요약)
- [ ] 반복 작업 → 캐싱
- [ ] 토큰 사용량 추적 대시보드

---

## 8. 핵심 설계 질문

> "이 구조가 향후 내 개인 AI 에이전트 경쟁력을 강화하는가?"

모든 개발 결정 시 이 질문을 기준으로 판단:
1. **단기 구현**보다 **장기 확장성** 우선
2. **기능 단위**가 아닌 **에이전트 구조 단위**로 사고
3. **오픈소스를 복사하지 말고 재해석**
4. **개인 자산으로 유지** 가능한 구조
5. **설명 가능한 포트폴리오** 수준의 설계
