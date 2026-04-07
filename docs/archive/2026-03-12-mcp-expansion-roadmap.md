# MCP Expansion Roadmap

## Goal

현재 앱의 내부 MCP 기능을 외부 워크스페이스, 디자인, 테스트, 운영 도구까지 확장해 `전략 설계 -> 실행 -> 검증 -> 배포/운영` 흐름을 한 앱에서 관리할 수 있게 만든다.

## Current Baseline

- 내부 MCP 서버는 이미 존재한다: `scripts/mcp-server.mjs`
- 앱 내부 MCP 클라이언트는 현재 로컬 stdio 서버 1개에 맞춰져 있다: `lib/mcp-client.ts`
- 연결 UI는 설정 화면의 `AI 연결 센터` 중심이다: `app/settings/page.tsx`, `components/mcp-inspector.tsx`
- 핵심 업무 화면은 이미 분리되어 있다:
  - 전략 워룸: `app/page.tsx`
  - 세미나: `app/seminar/page.tsx`
  - 데이터 스튜디오: `app/datasets/page.tsx`
  - 학습 인사이트: `app/dashboard/page.tsx`
  - 학습 카드: `app/learning/page.tsx`

## Foundational Change Needed First

외부 MCP를 본격적으로 붙이기 전에, 현재의 단일 로컬 서버 전용 MCP 클라이언트를 아래 형태로 일반화해야 한다.

- `McpConnection` 레지스트리 추가
  - `id`, `name`, `transport`, `url`, `command`, `args`, `envSecretRefs`, `authType`, `status`
- transport 분리
  - `stdio`
  - `streamable-http`
  - `sse` (필요 시만)
- 연결별 상태 확인 API
  - `inspect`
  - `tools`
  - `resources`
  - `prompts`
  - `health`
- 보안 저장
  - BrowserStack, Sentry, DB 자격 증명은 Electron secure storage 사용
  - OAuth 토큰은 앱 로컬 안전 저장소에 별도 네임스페이스로 보관

## Wave 1: Notion + Figma + Playwright

### Why this wave first

- Notion: 결과물 축적과 공유
- Figma: 디자인 컨텍스트 주입
- Playwright: 실제 UI 검증

이 3개가 합쳐지면 `전략 문서화`, `디자인-개발 연결`, `실사용 흐름 QA`가 동시에 가능해진다.

### 1. Notion MCP

#### Product role

- 전략 워룸 결과를 Notion 페이지/데이터베이스로 발행
- 세미나 아침 브리핑과 최종 보고서를 자동 기록
- 학습 카드 승인본을 플레이북 페이지로 축적

#### Screen integration

- `app/page.tsx`
  - `Notion에 브리프 저장`
  - `실행 결과를 캠페인 페이지로 발행`
- `app/seminar/page.tsx`
  - `아침 브리핑 발행`
  - `최종 보고서 발행`
- `app/dashboard/page.tsx`
  - `검증된 패턴을 플레이북으로 발행`
- `app/settings/page.tsx`
  - 워크스페이스 연결 상태
  - 대상 데이터베이스/상위 페이지 선택
  - 자동 발행 규칙 설정

#### MVP flow

1. 설정 화면에서 Notion 워크스페이스 연결
2. `Campaign Briefs`, `Seminar Reports`, `Learning Playbooks` 대상 위치 선택
3. 각 화면에서 수동 발행 버튼 제공
4. 안정화 후 자동 발행 토글 추가

#### Engineering notes

- remote MCP 우선
- 앱 내 OAuth 브라우저 승인 플로우 필요
- 발행 전 미리보기 모달 필요

#### Source

- Notion은 hosted remote MCP를 권장하고, 대부분의 사용 사례에서 `https://mcp.notion.com/mcp` 사용을 권장한다.
- OAuth 기반이며 headless 자동화에는 적합하지 않을 수 있다.

### 2. Figma MCP

#### Product role

- 선택된 Figma 프레임을 기준으로 현재 앱 UI를 개선
- 디자인 토큰, 컴포넌트, 레이아웃 맥락을 읽어 코드 변경에 반영
- `전략 캔버스`, `리포트 카드`, `세미나 타임라인` 같은 화면 리디자인에 직접 활용

#### Screen integration

- `app/settings/page.tsx`
  - Figma 연결 상태
  - 현재 선택 파일/프레임 확인
- `app/page.tsx`
  - `선택 프레임 기준으로 워룸 개선안 만들기`
- `app/seminar/page.tsx`
  - `세미나 진행 보드 시안 가져오기`
- `app/datasets/page.tsx`
  - `데이터 카드/차트 레이아웃 가이드 적용`

#### MVP flow

1. Figma Desktop MCP 또는 Remote MCP 연결
2. 선택 프레임 기준 `Design Context Sync` 실행
3. 앱에 `선택 프레임 요약`, `토큰`, `컴포넌트 매핑` 표시
4. 이후 `이 디자인을 현재 화면에 반영` 액션 추가

#### Engineering notes

- 데스크톱 앱 성격상 Figma Desktop 연결이 UX상 자연스럽다
- rate limit과 seat 조건을 설정 화면에서 함께 보여주는 것이 좋다
- Figma 데이터를 바로 렌더하는 것이 아니라, `디자인 컨텍스트 캐시`로 저장 후 활용하는 구조가 안정적이다

### 3. Playwright MCP

#### Product role

- 우리 앱의 주요 플로우를 실제로 검증
- 로컬 `http://localhost:3000`과 Electron 경로의 smoke test 수행
- 버튼, 폼, 결과 렌더링, 회귀 테스트 자동화

#### Screen integration

- `app/settings/page.tsx`
  - `QA 연결` 섹션 추가
  - 기본 테스트 시나리오 목록
- `app/page.tsx`
  - `현재 워룸 흐름 검증`
- `app/seminar/page.tsx`
  - `세션 생성 플로우 검증`
- `app/datasets/page.tsx`
  - `업로드 -> 저장 -> 분석` 검증

#### MVP flow

1. Playwright MCP 연결
2. 사전 정의된 `Smoke Test Pack` 제공
3. 최근 실행 결과를 `AI 연결 센터` 또는 별도 `검증 기록` 패널에 표시
4. 실패 시 스텝과 셀렉터/페이지 정보를 요약

#### Engineering notes

- 가장 빨리 붙일 수 있는 커넥터
- 현재 dev 서버/빌드 흐름과 궁합이 좋다
- CI 연동 전, 앱 내부 수동 QA 어시스턴트로 먼저 도입하는 것이 좋다

## Wave 2: Sentry + BrowserStack

### 4. Sentry MCP

#### Product role

- 배포 후 오류, 프론트 예외, API 실패, 성능 병목 분석
- `무슨 화면에서 어떤 오류가 반복되는지`를 제품 운영 언어로 요약

#### Screen integration

- 새 `운영 상태` 또는 `배포/오류` 화면 추가 권장
- `app/settings/page.tsx`
  - DSN/토큰/프로젝트 상태 확인
- `app/page.tsx`, `app/seminar/page.tsx`, `app/datasets/page.tsx`
  - 최근 관련 오류 배지 표시 가능

#### MVP flow

1. 프로젝트/환경 연결
2. `최근 오류 요약`, `새 이슈`, `고빈도 오류` 카드 표시
3. `이 오류를 해결하기 위한 분석 브리프 만들기` 액션 제공

#### Engineering notes

- Sentry MCP는 개발/디버깅 중심 서버다
- 자연어 검색 도구 일부는 OpenAI/Anthropic provider 설정이 추가로 필요하다
- 운영팀용 요약 레이어를 앱 쪽에서 별도로 만들어주는 것이 중요하다

### 5. BrowserStack MCP

#### Product role

- 실제 브라우저/디바이스 매트릭스 검증
- Windows Edge, iPhone Safari, Android Chrome 등에서 플로우 확인
- 접근성 검사와 테스트 관측 확장

#### Screen integration

- `app/settings/page.tsx`
  - BrowserStack 계정 연결
  - 기본 디바이스 세트 관리
- `app/page.tsx`
  - 랜딩/워룸 주요 경로 디바이스 검증
- `app/seminar/page.tsx`
  - 장시간 세션 UI 검증

#### MVP flow

1. BrowserStack 계정 연결
2. `기본 디바이스 팩` 실행 버튼
3. 결과를 `통과/실패/이슈` 카드로 요약
4. 접근성 스캔은 별도 실행 옵션으로 제공

#### Engineering notes

- remote MCP는 localhost 직접 테스트 제한이 있다
- 로컬 앱/로컬 웹 테스트가 중요하면 BrowserStack Local MCP 전략을 같이 설계해야 한다
- Playwright MCP와 역할이 겹치므로 `Playwright = 빠른 로컬 QA`, `BrowserStack = 실제 디바이스 검증`으로 분리해야 한다

## Wave 3: GitHub + Vercel + DB

### 6. GitHub MCP

#### Product role

- end-user 기능보다 운영/개발 플로우 강화에 가깝다
- 이슈 생성, PR 상태 확인, 릴리즈 노트 재료 수집

#### Recommended use in our app

- 설정 화면 또는 내부 운영 화면에서만 노출
- `실행 결과 -> GitHub issue 초안 생성`
- `배포 오류 -> GitHub 이슈화`
- `세미나 결과 -> 구현 태스크 초안 생성`

#### Engineering notes

- GitHub MCP는 Copilot 쪽에 기본 통합이 강하다
- 우리 앱에서 직접 다루려면 별도 운영 목적을 명확히 해야 한다
- 제품 핵심 기능보다 운영 자동화용으로 보는 것이 맞다

### 7. Vercel MCP

#### Product role

- 웹 랜딩/배포 운영 확장
- 프로젝트/배포/로그/문서 탐색

#### Screen integration

- 새 `배포 센터` 화면 권장
- `app/settings/page.tsx`
  - Vercel 프로젝트 연결
- `app/page.tsx`
  - 전략 결과를 랜딩 실험으로 넘기기

#### MVP flow

1. Vercel 프로젝트 연결
2. 최근 배포 목록, 실패 배포, 로그 요약 표시
3. `이 브리프 기반 랜딩 실험 브리프 생성`

#### Engineering notes

- 공식 endpoint 사용 검증 필요
- human confirmation을 기본값으로 두는 것이 안전하다
- 마케팅 랜딩/콘텐츠 실험 흐름과 붙일 때 가치가 커진다

### 8. DB Expansion

#### Product role

- 현재 로컬 DB 중심 구조를 분석/리포팅/웨어하우스 확장으로 연결
- 추후 Postgres/BigQuery/analytics DB로 이전 시 MCP를 통해 통합

#### Recommended architecture

- 1단계: 내부 `scripts/mcp-server.mjs` 확장
  - `run report`
  - `dataset cohort summary`
  - `seminar session health`
- 2단계: Google MCP Toolbox for Databases 도입
  - hosted/centralized tool layer로 확장
- 3단계: 운영 DB와 분석 DB 분리 시 toolset 구성

#### Engineering notes

- 현재는 내부 DB를 더 잘 노출하는 쪽이 먼저다
- 외부 DB MCP는 데이터 거버넌스와 권한 모델을 먼저 정리한 뒤 붙이는 것이 맞다

## Recommended Delivery Order Inside the Codebase

1. MCP connection registry + multi-transport client
2. Settings의 `연결 허브` UI
3. Playwright MCP
4. Figma MCP
5. Notion MCP
6. Sentry MCP
7. BrowserStack MCP
8. Vercel MCP
9. GitHub/DB 운영 확장

## New UI Surfaces to Add

### 1. Settings -> Connection Hub

- 연결 목록
- 인증 상태
- 최근 health check
- scopes / rate limit / seat requirement
- 수동 테스트 버튼

### 2. War Room -> Publish / Verify rail

- Notion 발행
- Playwright 검증
- 추후 Vercel 실험 연결

### 3. Seminar -> Auto briefing destinations

- Notion 브리핑 발행
- BrowserStack/Playwright 검증 이력

### 4. Operations Center (new)

- Sentry 이슈
- BrowserStack 결과
- Vercel 배포/로그
- 향후 GitHub 이슈화

## Key Risks

- OAuth 지원이 필요한 remote MCP가 늘어나면 Electron 인증 플로우 설계가 먼저 필요
- Figma와 Notion은 사용자 권한/seat/plan 제약이 있다
- BrowserStack remote는 localhost 한계가 있어 로컬 검증에는 별도 전략이 필요
- Sentry, GitHub, Vercel은 제품 기능보다 운영 기능으로 흐르기 쉬우므로 우선순위를 조절해야 한다

## Official References

- Notion MCP: https://developers.notion.com/docs/mcp
- Connecting to Notion MCP: https://developers.notion.com/docs/get-started-with-mcp
- Figma MCP Server: https://developers.figma.com/docs/figma-mcp-server/
- Figma plans and limits: https://developers.figma.com/docs/figma-mcp-server/plans-access-and-permissions/
- Playwright MCP: https://github.com/microsoft/playwright-mcp
- Sentry MCP: https://github.com/getsentry/sentry-mcp
- BrowserStack MCP: https://github.com/browserstack/mcp-server
- GitHub MCP usage: https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/use-the-github-mcp-server
- GitHub Copilot CLI MCP setup: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers
- Vercel MCP: https://vercel.com/docs/agent-resources/vercel-mcp
- Vercel MCP tools: https://vercel.com/docs/agent-resources/vercel-mcp/tools
- MCP Toolbox for Databases: https://github.com/googleapis/genai-toolbox
