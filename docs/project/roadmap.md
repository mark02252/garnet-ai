---
title: "Garnet 로드맵"
category: "project"
owner: "rnr"
audience: "self"
doc_kind: "catalog"
tags: ["로드맵", "우선순위", "계획"]
updated: 2026-04-13
---

# Garnet 로드맵

> 전체 로드맵: `docs/GARNET_ROADMAP.md`

## 현재 완료 (v0.6.0+)

### 인프라 & UI
- 마케팅 OS 기반 (19+ 페이지, 에이전트 중심 6개 카테고리)
- Cron 스케줄러 (12개 잡)
- GA4 성과 분석 (이커머스 매출 추적 포함)
- Instagram 연동 (OAuth + 인사이트)
- 영상 생성 (fal.ai LTX)
- Flow Builder + Agent Shell + Seminar
- Telegram + Slack 알림

### Agent Loop (v0.6.0 핵심)
- **Phase 1~4 전체 구현 및 운영 중** (36개 모듈)
- Knowledge Engine → Curiosity Engine → Causal Reasoning → Reflective Roles
- 다중 주기: 15분(긴급) / 1시간(루틴) / 7시(브리핑) / 18시(저녁) / 월 9시(주간)
- 운영 실적: 550+ 사이클, 99건 지식, 807건 에피소딕 메모리

## 다음 우선순위

### 즉시 — Phase 5: Self-Coding
1. 프롬프트 자동 최적화 (Reasoner/Scanner 프롬프트 A/B 테스트)
2. 예측 모델 자체 보정 (Goal Predictor 오차 보정)
3. 리플렉션 강화 (실행 전체 과정 리뷰로 확장)

### 단기 — Phase 5 확장
4. Flow 자동 생성 (반복 패턴 감지 → Flow 제안)
5. 도구 자동 생성 (MCP 도구 스펙 자동 생성)

### 중기 — Phase 6: Agent Organization
6. 역량 기반 역할 분화 (단일 Reasoner → 독립 에이전트)
7. 에이전트 간 통신 프로토콜
8. 도메인 확장 (마케팅 외 → 전략, 재무, 운영)

### 인프라 병렬 진행
- Meta Business 2FA → 시스템 토큰
- Instagram Login 전환
- Supabase SMTP 해제

## 과거 로드맵 참조
- `docs/archive/2026-03-GARNET_ROADMAP_v1.md` (v0.5.0 기준, 구버전)
- `docs/archive/2026-03-16-roadmap.md`
- `docs/archive/2026-03-18-garnet-roadmap-v3.md`
- `docs/archive/2026-03-26-development-roadmap.md`
