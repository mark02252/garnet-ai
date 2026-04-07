---
title: "Gemma 4 프로바이더"
category: "features"
owner: "rnr"
audience: "self"
doc_kind: "detail"
tags: ["gemma4", "LLM", "Google AI Studio", "무료", "프로바이더"]
updated: 2026-04-07
---

# Gemma 4 프로바이더

Google의 오픈 모델 Gemma 4를 Garnet의 최상위 LLM 프로바이더로 통합.

## 모델 정보
- `gemma-4-31b-it` (31B Dense, Arena AI 오픈모델 #3)
- `gemma-4-26b-a4b-it` (26B MoE, 3.8B만 활성화)
- API: Google AI Studio (`generativelanguage.googleapis.com`) — 기존 GEMINI_API_KEY 공유
- 무료 제한: ~15 RPM, ~1,500 RPD

## 구현 핵심
- `lib/llm.ts`에 `callGeminiCompatibleApi()` 공유 헬퍼 추출 (Gemini + Gemma4 코드 중복 제거)
- `<|think|>` 토큰으로 thinking 모드 활성화 -> `thought: true` 파트 자동 필터링
- 스트리밍에서도 thinking 파트 제외

## 프로바이더 우선순위
```
Gemma4 -> Groq -> Gemini Flash -> OpenAI/Claude (유료)
```
- Gemma4/Gemini는 Rate Limit 공유 (같은 API 키)
- Gemma4 폴백에서 Groq를 Gemini보다 먼저 배치

## 환경변수
```
GEMMA4_MODEL=gemma-4-31b-it     # 기본 모델
GEMINI_API_KEY=...               # Gemma4와 공유
LLM_PROVIDER=gemma4              # 시스템 기본
```

## 스펙 참조
- `docs/superpowers/specs/2026-04-07-routing-gemma4-design.md`
