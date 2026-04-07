---
title: "Shell <> Flow 자동 생성/실행"
category: "features"
owner: "rnr"
audience: "self"
doc_kind: "overview"
tags: ["agent-shell", "flow-builder", "자동생성", "architect", "자연어"]
updated: 2026-04-07
---

# Shell <> Flow 자동 생성/실행

Agent Shell 커맨드 바에서 자연어로 플로우를 자동 생성, 실행, 조회.

## 사용 예시
- "카페 창업 마케팅 플로우 만들어줘" -> 에이전트 팀 자동 설계 -> 미리보기 -> 실행
- "지난 마케팅 플로우 돌려줘" -> 템플릿 매칭 -> 에디터로 이동
- "플로우 목록 보여줘" -> /flow 페이지로 이동

## 핵심 모듈
| 모듈 | 역할 |
|------|------|
| `lib/flow/architect.ts` | LLM으로 프로젝트 분석 -> nodes/edges 자동 생성 |
| `lib/flow/architect-prompt.ts` | Architect systemPrompt (프리셋 에이전트 목록 포함) |
| `lib/flow/template-matcher.ts` | LLM 기반 저장된 템플릿 매칭 |
| `lib/agent-intent.ts` | flow-create/run/list/converse 인텐트 |
| `app/api/agent/command/route.ts` | flow 인텐트 서버 처리 |
| `components/agent-shell/flow-preview-panel.tsx` | SVG 미니 다이어그램 + 실행 버튼 |

## Flow Architect 동작
1. 프리셋 에이전트 풀에서 매칭 -> 기존 systemPrompt 사용
2. 프리셋에 없는 역할 -> 커스텀 에이전트 생성 (role + systemPrompt)
3. 병렬 실행 가능한 역할은 dependsOn=[] -> 병렬 배치
4. 웹검색 필요 시 needsWebSearch=true -> ToolNode 자동 삽입
5. validateFlow + kahnSort로 그래프 검증
6. 실패 시 1회 재시도 (에러 컨텍스트 첨부)

## 스펙/플랜 참조
- 스펙: `docs/superpowers/specs/2026-04-07-shell-flow-integration-design.md`
- 플랜: `docs/superpowers/plans/2026-04-07-shell-flow-integration.md`

> **향후 확장 메모:** 대화형 플로우 생성 (flow-converse)은 `playbooks/conversational-flow-creation.md`로 분리 가능
