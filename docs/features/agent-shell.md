---
title: "Agent Shell"
category: "features"
owner: "rnr"
audience: "self"
doc_kind: "overview"
tags: ["agent-shell", "JARVIS", "커맨드", "자연어", "데스크탑"]
updated: 2026-04-07
---

# Agent Shell

JARVIS형 커맨드 인터페이스. 자연어 입력으로 Garnet의 모든 기능에 접근.

## 경로
- `/shell` (풀스크린, 데스크탑 전용 레이아웃)

## 핵심 구조
- 커맨드 바 (자연어 입력)
- Canvas 패널 (결과 렌더링 영역)
- Flow Preview Panel (플로우 미리보기 + 실행)

## 인텐트 분류 (`lib/agent-intent.ts`)
| 인텐트 | 동작 |
|--------|------|
| `flow-create` | Flow Architect로 자동 설계 |
| `flow-run` | 템플릿 매칭 -> 실행 |
| `flow-list` | /flow 페이지 이동 |
| `flow-converse` | 대화형 플로우 생성 (예정) |
| `converse` | 일반 대화 |
| `navigate` | 페이지 이동 |

## 관련 파일
- `app/(shell)/shell/page.tsx` — Shell 페이지
- `components/agent-shell/` — Shell UI 컴포넌트
- `lib/agent-intent.ts` — 인텐트 분류기
- `app/api/agent/command/route.ts` — 서버 처리
