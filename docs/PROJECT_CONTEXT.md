---
title: "Project Context"
category: "project"
owner: "rnr"
audience: "self"
doc_kind: "overview"
tags: ["garnet", "컨텍스트", "현재상태"]
updated: 2026-04-07
---

# Project Context

이 문서는 다음 대화에서 빠르게 맥락을 복원하기 위한 현재 상태 문서입니다.
새 작업을 시작할 때는 이 문서를 먼저 읽고, 큰 변경이 끝나면 업데이트합니다.

## 현재 기준
- 마지막 큰 정리 시점: 2026-04-07
- 현재 배포 버전: `0.5.0+`
- 현재 서비스명: `Garnet`
- 제품 성격: 개인 AGI 에이전트 시스템 (마케팅 자동화 + 자율 운영)
- 목표 톤: `자비스형 에이전트 운영 시스템`
- 현재 UI 방향: 다크 테마 기반, 미니멀, 카테고리형 내비, 대시보드 우선
- 기본 LLM: Gemma 4 (무료) + Groq/Gemini/OpenAI/Claude 폴백
- 데스크탑: Tauri v2

## 제품 방향
- 사용자에게는 기술 용어보다 업무 언어를 보여준다.
- 줄글 리포트보다 `대시보드`, `카드`, `우선순위`, `승인 액션`을 먼저 보여준다.
- 워크플로우 중심으로 설계한다.
- 핵심 흐름은 `오늘의 브리핑 -> 캠페인 룸 -> 플로우/세미나 실행 -> 보고서/플레이북 자산화` 이다.
- 개발자용 설정, MCP 점검, 자동화 점검은 `개발 점검 모드` 안에 숨긴다.

## 현재 구현된 큰 축

### 1. Agent Shell (JARVIS형 커맨드)
- `/shell` — 풀스크린 커맨드 인터페이스
- 자연어 인텐트 분류 -> Flow 자동 생성/실행/조회/대화
- 상세: `docs/features/agent-shell.md`

### 2. Flow Builder (에이전트 파이프라인)
- ReactFlow 캔버스 기반 비주얼 에디터
- 4종 노드 (Start, Agent, Tool, End) + 위상정렬 병렬 실행
- SSE 실시간 스트리밍 + Flow 전용 결과 대시보드
- 상세: `docs/features/flow-builder.md`

### 3. Shell <> Flow 자동 생성/실행
- Flow Architect: 자연어 -> LLM이 에이전트 팀 자동 설계
- SVG 미니 다이어그램 미리보기 + 원클릭 실행
- LLM 기반 템플릿 매칭
- 상세: `docs/features/shell-flow-integration.md`

### 4. Gemma 4 프로바이더
- Google AI Studio API 기반 무료 최상위 LLM
- thinking 파트 자동 필터링
- 폴백 체인: Gemma4 -> Groq -> Gemini -> OpenAI/Claude
- 상세: `docs/features/gemma4-provider.md`

### 5. 워룸과 실행 흐름
- 메인 실행 화면은 `캠페인 스튜디오`
- 대시보드형 2열 레이아웃, 우측 레일에 실행 준비도/입력 해석/근거/타임라인
- 실행 상세는 전략 요약/산출물 보드/회의 로그/PM 결정/근거 레일 중심

### 6. 세미나와 보고서
- 전략 시뮬레이션 룸 성격
- structured JSON + 원문 텍스트 저장
- 카드형 대시보드 렌더링 + PDF 저장 지원

### 7. 운영 허브
- `/operations` — 오늘의 브리핑 (리다이렉트: `/` -> `/operations`)
- `/campaigns` — 캠페인 룸
- `/campaigns/[id]` — 캠페인 상세 룸
- 승인 대기함에서 실제 액션 실행 가능

### 8. 마케팅 인텔리전스
- Cron 스케줄러 (12개 잡, 24시간 자동)
- 5개 플랫폼 수집 + AI 분석
- GA4 성과 분석 (11개 섹션 대시보드)

### 9. Instagram 연동
- Meta 공식 인증 + OAuth
- 인사이트 조회
- Instagram Login 전환 예정

### 10. 영상 생성
- fal.ai LTX + 스크립트 자동 생성

### 11. 데이터와 학습
- `/datasets` — 업로드 스튜디오 + 분석 보드 + 인사이트 레일
- `/learning` — 카드 라이브러리 + 편집 워크스페이스

### 12. MCP와 외부 확장
- 내부 MCP 서버 (tools/resources/prompts)
- MCP 연결 허브 (다중 커넥터)
- 확장 우선순위: Notion + Figma + Playwright -> Sentry + BrowserStack -> GitHub/Vercel/DB

### 13. Supabase 준비
- Auth + Organizations + Memberships 마이그레이션 완료
- Workspace shared data 테이블 준비
- SMTP 차단이 현재 블로킹 포인트

## 현재 정보 구조
- `/` -> `/operations` (리다이렉트)
- `/shell` — Agent Shell (풀스크린)
- `/flow` — Flow Builder (목록 + 에디터)
- `/operations` — 오늘의 브리핑
- `/campaigns` — 캠페인 룸
- `/campaigns/[id]` — 캠페인 상세 룸
- `/seminar` — 세미나 스튜디오
- `/datasets` — 인사이트 센터
- `/learning` — 운영 플레이북/학습 카드
- `/history` — 실행 아카이브
- `/dashboard` — 학습 운영 대시보드
- `/settings` — 관리자/운영 설정
- `/social` — SNS 인사이트 (개발 예정)

## 문서 구조
```
docs/
├── PROJECT_CONTEXT.md          (이 파일)
├── architecture/overview.md    (시스템 아키텍처)
├── project/
│   ├── garnet-vision.md        (비전 및 방향)
│   ├── changelog.md            (개발 변경 이력)
│   └── roadmap.md              (로드맵)
├── features/
│   ├── flow-builder.md         (Flow Builder)
│   ├── shell-flow-integration.md (Shell <> Flow 연동)
│   ├── gemma4-provider.md      (Gemma 4 프로바이더)
│   └── agent-shell.md          (Agent Shell)
├── superpowers/
│   ├── specs/                  (설계 스펙)
│   └── plans/                  (실행 계획)
└── archive/                    (과거 문서)
```

## 다음 우선순위
> 전체 로드맵: `docs/project/roadmap.md`

## 핵심 디자인 원칙
- 다크 테마 기반의 미니멀하고 정돈된 운영 대시보드 톤을 유지한다.
- 큰 설명 블록보다 짧은 가치 제안, 빠른 이동, 상태 카드를 우선 노출한다.
- 좌측 내비는 카테고리형, 화면 이름은 업무 언어를 사용한다.
- 우측 evidence rail 패턴을 핵심 화면에 일관되게 적용한다.
- 긴 본문보다 요약 카드 -> 액션 -> 근거 순서로 보여준다.

## 운영 메모
- 큰 UI 수정 후에는 `npx tsc --noEmit --pretty false`, `npm run build:next` 를 기본 검증으로 본다.
- 개발 실행은 `next dev -p 3000 --turbo` 기준이다.
- Supabase Auth는 magic link 기준. SMTP 차단 해제 필요.
