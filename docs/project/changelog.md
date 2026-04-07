---
title: "개발 변경 이력"
category: "project"
owner: "rnr"
audience: "self"
doc_kind: "catalog"
tags: ["changelog", "개발이력", "커밋", "릴리즈"]
updated: 2026-04-07
---

# 개발 변경 이력

## 2026-04-07: Flow Builder + Gemma 4 + Shell 연동

### Flow Builder (신규 기능)
- ReactFlow 캔버스 기반 에이전트 파이프라인 에디터
- 4종 노드: StartNode, AgentNode, ToolNode(웹검색), EndNode
- SSE 기반 실시간 실행 + Zustand 상태 관리
- Flow 전용 결과 대시보드 (마크다운 렌더링, 에이전트 역할명)
- 실행 프로그레스 바 + 실행 이력 패널
- 파일: `lib/flow/`, `app/(domains)/flow/`, `app/api/flow-templates/`

### Gemma 4 프로바이더 (신규)
- Google AI Studio API 기반 (기존 Gemini API 재사용)
- thinking 파트 자동 필터링 (`<|think|>` 토큰)
- 모든 에이전트 역할 기본 모델로 설정
- 폴백 순서: Gemma4 -> Groq -> Gemini -> OpenAI/Claude
- 파일: `lib/llm.ts` (공유 헬퍼 추출), `lib/types.ts`, `lib/env.ts`, `lib/pipeline.ts`

### 라우팅 개선
- `/` -> `/operations` 리다이렉트 (middleware.ts)
- Agent Shell -> `/shell` 경로 이동
- 네비 "캠페인 스튜디오" -> "에이전트 셸"

### Shell <> Flow 자동 생성/실행 (신규)
- Flow Architect: 프로젝트 설명 -> LLM이 에이전트 팀 자동 설계
- Shell Canvas에 SVG 미니 플로우 다이어그램 미리보기
- 미리보기에서 바로 실행 (RunModal 없이 SSE 직행)
- LLM 기반 템플릿 매칭 (기존 플로우 검색)
- 파일: `lib/flow/architect.ts`, `lib/flow/template-matcher.ts`, `components/agent-shell/flow-preview-panel.tsx`

### 버그 수정
- Flow API 에러 핸들링 (빈 500 응답 -> JSON crash 방지)
- Zustand 셀렉터 무한 루프 수정
- Hydration mismatch (서버에서 날짜 포맷)
- 한국어 기본 응답 (systemPrompt에 자동 추가)
