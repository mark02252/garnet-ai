# Aaru 스타일 합성 고객 시뮬레이션 — 향후 개발 방향

**Date:** 2026-04-22
**Status:** 리서치 완료, 미착수
**참고:** Aaru (aaru.com) — AI 기반 시장조사 시뮬레이션 플랫폼, $1B 밸류에이션

---

## Aaru 작동 방식

1. **인구 생성** — 인구통계 + 심리/행동 데이터로 AI 페르소나 수만~수십만 개 생성
2. **행동 모델링** — 각 에이전트에 의사결정 동기, 인지 편향, 위험 선호도 부여
3. **현실 보정** — 실제 거래/POS 데이터로 지속 캘리브레이션
4. **시나리오 실행** — "가격 10% 인상하면?" → 에이전트들이 반응 시뮬레이션
5. **추적 가능** — 왜 그런 결정을 했는지 로직 트레일

검증 결과: EY 설문 3,600명 6개월 → Aaru 10만 에이전트 1일, 상관계수 0.90

---

## Garnet 이식 방향: Mini Aaru

### 단계별 구현

| 단계 | 내용 | 필요 데이터 | 비용 |
|------|------|-----------|------|
| **1. 최소 시작** | 페르소나 5~10개 수동 정의 + Gemini Flash | GA4 + Knowledge Store | 0원 |
| **2. CRM 연동** | 실제 고객 데이터 기반 페르소나 자동 생성 | CRM + 거래 데이터 | 앱 출시 후 |
| **3. 보정 루프** | 예측 vs 실제 비교 → 파라미터 자동 조정 | Prediction Calibrator 연계 | 기존 인프라 |
| **4. 규모 확대** | 50개+ 페르소나 + 외부 인구통계 | 공공 데이터 + 데이터 구매 | 데이터 비용 |

### 구현 구조

```
config/personas.yaml — 고객 세그먼트 정의
lib/agent-loop/scenario-simulator.ts — 시뮬레이션 엔진
  → 각 페르소나에 시나리오 주입 → LLM이 반응 생성
  → 결과 집계 → 세그먼트별 영향도 산출
Tool Harness에 scenario_simulate 도구 등록
  → Strategy Sub-Reasoner가 전략 제안 시 시뮬레이션 실행
```

### personas.yaml 예시

```yaml
personas:
  - name: "20대 커플"
    demographics: { age: 25, income: "중상", location: "서울" }
    behavior: { price_sensitivity: 0.6, brand_loyalty: 0.3, social_proof: 0.8 }
    motivations: ["데이트", "특별한 경험", "인스타 콘텐츠"]

  - name: "30대 가족"
    demographics: { age: 35, income: "상", location: "수도권" }
    behavior: { price_sensitivity: 0.3, brand_loyalty: 0.7, convenience: 0.9 }
    motivations: ["아이와 시간", "프라이빗", "편의성"]

  - name: "기업 담당자"
    demographics: { role: "총무/HR", company_size: "중견" }
    behavior: { price_sensitivity: 0.4, brand_loyalty: 0.2, roi_focus: 0.9 }
    motivations: ["워크숍", "팀빌딩", "비용 대비 효과"]
```

### 시뮬레이션 예시

```
입력: "JSW씨네라운지 가격을 20% 인상하면?"

결과:
  20대 커플 → 30% 이탈 예상 (가격 민감도 0.6)
  30대 가족 → 10% 이탈 (프라이빗 가치 > 가격)
  기업 담당자 → 대안 비교 후 결정 (할인 패키지면 유지)

  종합: 전체 예약 15~20% 감소 예상
  추천: 가족/기업 세그먼트 유지하면서 커플 대상 프로모션 병행
```

---

## 일반 기업 적용 시 수반 요소

### 필수 데이터

| 데이터 | 용도 | 확보 방법 |
|--------|------|----------|
| 고객 CRM | 페르소나 생성 근거 | 앱/서비스 고객 DB |
| 거래 데이터 | 행동 패턴 보정 | POS/결제 시스템 연동 |
| 고객 설문 | 동기/불만/니즈 | 최소 1회 설문으로 초기 보정 |
| 인구통계 | 세그먼트 정의 | 통계청 공공 데이터 |
| 경쟁사 데이터 | 시장 맥락 | 마케팅 인텔 수집 |

### 보정 루프 (정확도의 핵심)

```
시뮬레이션 예측 → 실제 결과 비교 → 파라미터 조정 → 다음 예측 개선
  → Garnet Prediction Calibrator (Phase 5)와 동일 구조
```

### 비용 비교

| 수준 | 에이전트 수 | 인프라 | 비용 |
|------|-----------|--------|------|
| Garnet Mini | 5~10 | Gemini Flash API | 0원 |
| 소규모 기업 | 50~100 | 클라우드 LLM API | 월 수십만원 |
| 중견 기업 | 1,000+ | 전용 GPU | 월 수백만원 |
| Aaru급 | 10만+ | GPU 클러스터 | 수억원+ |

---

## 착수 시점

- **최소 시작**: CRM 데이터 확보 후 (앱 출시 후)
- **보정 루프**: 시뮬레이션 vs 실제 데이터 비교가 가능해질 때
- **회사 이동 시**: config/personas.yaml 교체 + 새 회사 CRM 연동

---

## 참고 자료

- [Aaru 공식](https://aaru.com/)
- [EY × Aaru 검증](https://www.ey.com/en_us/insights/wealth-asset-management/how-ai-simulation-accelerates-growth-in-wealth-and-asset-management)
- [Accenture × Aaru 투자](https://newsroom.accenture.com/news/2025/accenture-invests-in-and-collaborates-with-ai-powered-agentic-prediction-engine-aaru)
- [TechCrunch: Aaru $1B Series A](https://techcrunch.com/2025/12/05/ai-synthetic-research-startup-aaru-raised-a-series-a-at-a-1b-headline-valuation/)
- [Stanford LLM Persona 연구](https://arxiv.org/abs/2401.01234) — 19,447 페르소나로 미디어 효과 76% 재현
