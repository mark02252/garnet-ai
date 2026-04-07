---
title: "Garnet 시스템 아키텍처"
category: "architecture"
owner: "rnr"
audience: "self"
doc_kind: "overview"
tags: ["아키텍처", "Next.js", "Prisma", "Zustand", "LLM", "SSE"]
updated: 2026-04-07
---

# Garnet 시스템 아키텍처

## 기술 스택
- **프레임워크:** Next.js 15 App Router
- **언어:** TypeScript
- **DB:** PostgreSQL (Supabase) + Prisma ORM
- **상태관리:** Zustand
- **스타일:** Tailwind CSS + CSS 변수 (다크 테마)
- **LLM:** Gemma4 (기본) + Gemini/Groq/OpenAI/Claude (폴백)
- **검색:** Serper (기본) + Brave/Naver (폴백)
- **데스크탑:** Tauri v2
- **배포:** Vercel

## 라우트 그룹
| 그룹 | 경로 | 레이아웃 |
|------|------|---------|
| `(shell)` | `/shell` | 풀스크린 Agent Shell (데스크탑 전용) |
| `(domains)` | `/operations`, `/flow`, `/campaigns`, ... | 사이드바 + 헤더 |

## LLM 아키텍처 (`lib/llm.ts`)
- 6+1 프로바이더: gemma4, gemini, groq, openai, claude, local, openclaw
- `runLLM()` / `streamLLM()` — 프로바이더 자동 선택 + 폴백 체인
- 에러 분류: MISSING_CONFIG, AUTH, QUOTA, RATE_LIMIT, CONTEXT, TIMEOUT 등
- Gemma4/Gemini 공유 헬퍼: `callGeminiCompatibleApi()`, `streamGeminiCompatibleApi()`

## 주요 데이터 모델
- `Run` — 실행 기록 (topic, brand, region, goal, flowTemplateId?)
- `Deliverable` — 실행 산출물 (CAMPAIGN_PLAN 등)
- `FlowTemplate` — 플로우 템플릿 (nodes/edges JSON)
- `MeetingTurn` — 세미나 토론 턴
- `WebSource` — 웹검색 결과

## 핵심 흐름
```
사용자 입력 -> Intent 분석 -> 분기:
|- 캠페인 실행: pipeline.ts -> 역할별 LLM 호출 -> Deliverable 저장
|- 플로우 실행: runner.ts -> 레이어별 병렬 실행 -> SSE 스트리밍
|- Shell 명령: agent-intent.ts -> Canvas 패널 / 네비게이션
\- 플로우 자동 생성: architect.ts -> LLM 설계 -> 미리보기 -> 실행
```

> **향후 확장 메모:** Self-Improvement 루프 (Scout->Analyst->Builder->Governor) 구체화 시 `workflows/self-improvement-loop.md` 생성
