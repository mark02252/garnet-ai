---
title: "Flow Builder"
category: "features"
owner: "rnr"
audience: "self"
doc_kind: "overview"
tags: ["flow-builder", "에이전트", "파이프라인", "ReactFlow", "SSE"]
updated: 2026-04-07
---

# Flow Builder

에이전트를 드래그 앤 드롭으로 캔버스에 배치하고, 파이프라인으로 연결하여 실행하는 비주얼 에디터.

## 핵심 파일
| 경로 | 역할 |
|------|------|
| `lib/flow/types.ts` | FlowNode, FlowEdge, FlowRunEvent 타입 |
| `lib/flow/graph.ts` | kahnSort (위상정렬), validateFlow, buildUserPrompt |
| `lib/flow/runner.ts` | executeFlow 비동기 제너레이터 (순수 함수, DB 접근 없음) |
| `lib/flow/run-store.ts` | Zustand — 실행 상태 관리 (nodeStatuses, isRunning) |
| `lib/flow/architect.ts` | Flow Architect — LLM 기반 플로우 자동 설계 |
| `lib/flow/architect-prompt.ts` | Architect systemPrompt + JSON 스키마 |
| `lib/flow/template-matcher.ts` | LLM 기반 템플릿 매칭 |
| `app/api/flow-templates/` | CRUD + SSE 실행 API |
| `app/(domains)/flow/` | 목록 + 에디터 페이지 |
| `components/flow-result-dashboard.tsx` | Flow 전용 결과 대시보드 |

## 노드 타입
- **StartNode** — 토픽/브랜드/지역/목표 설정
- **AgentNode** — LLM 에이전트 (역할, 모델, systemPrompt)
- **ToolNode** — 웹검색 (web-search)
- **EndNode** — 산출물

## 실행 흐름
1. kahnSort로 레이어별 위상정렬
2. 레이어 내 노드 병렬 실행 (Promise.all)
3. node-start -> 비동기 작업 -> node-done/error 순서
4. API route에서 Run + Deliverable DB 저장
5. SSE로 클라이언트에 실시간 이벤트 스트리밍

## 스펙/플랜 참조
- 스펙: `docs/superpowers/specs/2026-04-06-flow-builder-design.md`
- 플랜: `docs/superpowers/plans/2026-04-06-flow-builder.md`

> **향후 확장 메모:** Flow 실행 결과 -> 세미나 형식 연동은 `workflows/flow-to-seminar.md`로 분리 가능
