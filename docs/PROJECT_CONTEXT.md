# Project Context

이 문서는 다음 대화에서 빠르게 맥락을 복원하기 위한 현재 상태 문서입니다.
새 작업을 시작할 때는 이 문서를 먼저 읽고, 큰 변경이 끝나면 업데이트합니다.

## 현재 기준
- 마지막 큰 정리 시점: 2026-03-16
- 현재 배포 버전: `0.2.0`
- 현재 서비스명: `Garnet`
- 제품 성격: 사내용 `AI 마케팅 올인원 컨트롤 타워`
- 목표 톤: 개발자 도구가 아니라 `자비스형 마케팅 운영 비서`
- 현재 UI 방향: `화이트-블루`, `미니멀`, `카테고리형 내비`, `대시보드 우선`
- 최근 리디자인: 홈/브리핑/캠페인/데이터 화면에 `섹션 탭`, `더 짧은 브리핑 카피`, `스튜디오 중심 명칭`을 반영했다.

## 제품 방향
- 사용자에게는 기술 용어보다 업무 언어를 보여준다.
- 줄글 리포트보다 `대시보드`, `카드`, `우선순위`, `승인 액션`을 먼저 보여준다.
- 워크플로우 중심으로 설계한다.
- 핵심 흐름은 `오늘의 브리핑 -> 캠페인 룸 -> 캠페인 스튜디오 실행 -> 세미나 시뮬레이션 -> 보고서/플레이북 자산화` 이다.
- 개발자용 설정, MCP 점검, 자동화 점검은 `개발 점검 모드` 안에 숨긴다.

## 현재 구현된 큰 축

### 1. 워룸과 실행 흐름
- 메인 실행 화면은 이제 `캠페인 스튜디오`라는 이름을 사용한다.
- 메인 화면은 대시보드형 2열 레이아웃으로 정리되어 있다.
- 오른쪽 레일에 `실행 준비도`, `입력 해석`, `근거`, `첨부 컨텍스트`, `실행 타임라인`이 붙는다.
- 실행 상세는 `전략 요약`, `산출물 보드`, `회의 로그`, `PM 결정`, `근거 레일` 중심으로 재구성되어 있다.

### 2. 세미나와 보고서
- 세미나는 전략 시뮬레이션 룸 성격으로 정리되어 있다.
- 세미나 보고서는 텍스트만 저장하지 않고 `structured JSON + 원문 텍스트`를 함께 다룬다.
- 보고서는 카드형 대시보드로 렌더링되며, `액션 보드`, `타임라인`, `리스크`, `근거`, `전략 헤드라인`이 보인다.
- 실행 보고서와 세미나 보고서는 모두 PDF 저장 흐름을 지원한다.

### 3. 운영 허브
- `/operations` 는 개발 상태판이 아니라 `오늘의 브리핑` 화면으로 재설계되었다. (마케팅 한정 명칭 제거)
- `/campaigns` 는 캠페인 중심 운영을 보는 `캠페인 룸` 이다.
- `/campaigns/[id]` 는 개별 캠페인의 실행, 세미나, 플레이북, 승인 상태를 보는 상세 룸이다.
- 승인 대기함은 실제 액션을 실행할 수 있으며, `보고서 확정`, `세미나 결과 회수`, `플레이북 확정` 흐름이 있다.

### 4. 데이터와 학습
- `/datasets` 는 `업로드 스튜디오 + 분석 보드 + 인사이트 레일` 구조다.
- `/learning` 은 `카드 라이브러리 + 편집 워크스페이스 + 상태 레일` 구조다.
- `/dashboard`, `/history` 도 같은 대시보드 시스템으로 정리되어 있다.

### 5. 소셜 인사이트와 Meta 연결
- `/social` 은 현재 `개발 예정` 카테고리로 내려간 상태이며, 정식 운영 메뉴가 아니라 소셜 연동 실험 공간으로 남겨뒀다.
- 설정 화면에는 관리자용 연결 관리만 남기고, 실제 로그인/계정선택/도달분석/최근결과 확인은 소셜 화면으로 분리했다.
- 현재 연결 방식은 `Meta 공식 인증창 + 비즈니스 연결 흐름` 이다.
- 일반 사용자가 느끼기에는 `인스타그램 계정 연결`로 보이도록 UX를 단순화했지만, 기술적으로는 아직 `Instagram Login` 병행 지원 전 단계다.
- 공식적으로 `Instagram API with Instagram Login` 이 가능하고, 현재 제품 목적상 이 쪽이 더 우선순위가 높다.
- 현재 목표는 `사내 단일 관리 계정 1개 연결 + 인사이트 조회` 이므로, 다음 소셜 연동 개편은 `Instagram Login 우선`, `Meta 비즈니스 연결 보조` 방향으로 진행한다.
- 현재 계정/권한 이슈로 인해, 실제 제품 IA에서는 `/social` 을 핵심 기능이 아닌 `보류 중인 개발 예정 메뉴`로 간주한다.

### 6. 설정과 관리자 기능
- 설정 화면은 운영자 중심 언어로 정리되어 있다.
- MCP 연결 허브, AI 연결 센터, Playwright 자동 점검 등은 `개발 점검 모드` 안에 숨겨져 있다.
- 런타임 키 저장은 `localStorage` 대신 Electron secure storage 기반으로 옮겨졌다.

### 7. MCP와 외부 확장 준비
- 내부 MCP 서버가 있으며 `tools/resources/prompts` 를 노출한다.
- MCP 연결 허브는 다중 커넥터 구조로 준비되어 있다.
- Playwright MCP 기반 자동 점검 흐름이 일부 붙어 있다.
- 추후 확장 우선순위는 `Notion + Figma + Playwright -> Sentry + BrowserStack -> GitHub/Vercel/DB` 이다.

### 8. Supabase 준비 상태
- `supabase init` 기반 로컬 개발 스캐폴드가 추가되었다.
- `supabase/config.toml`, 초기 `auth + organizations + memberships` 마이그레이션, seed 파일이 들어가 있다.
- 앱에는 `lib/supabase/env.ts`, `lib/supabase/client.ts` 와 `supabase:*` npm 스크립트가 추가되었다.
- hosted Supabase 프로젝트 URL + publishable key가 로컬 `.env`에 연결돼 있다.
- 설정 화면에 `팀 계정과 협업 백엔드` 패널이 추가되어 이메일 로그인, 세션 확인, 워크스페이스 생성 준비가 가능하다.
- 상단 헤더에는 Supabase 세션 상태 칩이 붙어 있다.
- `/auth/callback` 콜백 페이지가 추가되어 magic link/OTP 확인 흐름을 받는다.
- `supabase login`, `supabase link --project-ref pwllacujwgzulkelqfrq`, `supabase db push` 까지 완료되어 원격 프로젝트에 초기 조직/Auth 마이그레이션이 적용되었다.
- `20260316113000_workspace_shared_data.sql` 까지 원격 프로젝트에 적용되어 `workspace_runs`, `workspace_learning_archives`, `workspace_approval_decisions`, `workspace_run_progress` 테이블이 준비되었다.
- Supabase 로그인은 `PKCE`에서 `implicit` 흐름으로 조정했다. 브라우저-앱 저장소가 달라도 magic link가 실패하지 않도록 맞춘 상태다.
- `build`는 `.next-build`, `dev`는 `.next`를 사용하도록 분리해, 개발 서버와 프로덕션 빌드가 서로의 산출물을 깨뜨리던 문제를 정리했다.
- 현재 막혀 있는 지점은 앱 코드가 아니라 Supabase 기본 이메일 발송 제한이다. `email rate limit exceeded`가 발생해 오후에 다시 인증 테스트를 재시도하기로 했다.
- 앱 내부에는 로컬 운영 데이터를 Supabase 형식으로 내보내는 `shared-sync` 레이어와 `/api/supabase/bootstrap` export API가 추가되었다.

### 9. 자동 업데이트
- Electron auto updater를 사용한다.
- 업데이트 피드는 generic provider 기반이다.
- 2026-03-13 기준으로 `0.2.0` 배포본을 다시 패키징했고, 이전 설치 앱에서 업데이트 가능하도록 수정했다.

## 현재 정보 구조
- `/operations`: 오늘의 브리핑 (이전: "오늘의 마케팅 브리핑" → 범용 운영 허브로 명칭 변경)
- `/social`: 개발 예정인 SNS 인사이트 실험 공간
- `/campaigns`: 캠페인 룸
- `/campaigns/[id]`: 캠페인 상세 룸
- `/`: 캠페인 스튜디오
- `/seminar`: 세미나 스튜디오
- `/datasets`: 인사이트 센터 성격의 데이터 워크벤치
- `/learning`: 운영 플레이북/학습 카드 허브
- `/history`: 실행 아카이브
- `/dashboard`: 학습 운영 대시보드
- `/settings`: 관리자/운영 설정
- `/auth/callback`: Supabase 이메일 로그인 콜백

## 핵심 디자인 원칙
- 화이트-블루 기반의 미니멀하고 정돈된 운영 대시보드 톤을 유지한다.
- 큰 설명 블록보다 `짧은 가치 제안`, `빠른 이동`, `상태 카드`를 우선 노출한다.
- 좌측 내비는 `카테고리형`으로 정리하고, 화면 이름은 `스튜디오`, `브리핑`, `룸` 같은 업무 언어를 사용한다.
- 하위 화면에는 가능하면 `섹션 탭`을 두어, 한 페이지 안에서도 빠르게 이동할 수 있게 한다.
- 너무 기술적인 용어는 사용자 화면에서 숨긴다.
- 긴 본문보다 `요약 카드 -> 액션 -> 근거` 순서로 보여준다.
- 우측 `evidence rail` 패턴을 핵심 화면에 일관되게 적용한다.
- 단순 목록보다 `진행률`, `상태`, `우선순위`, `추천 액션`을 먼저 보여준다.

## 주요 파일 맵

### 앱 프레임
- [/Users/rnr/Documents/New project/app/layout.tsx](/Users/rnr/Documents/New%20project/app/layout.tsx)
- [/Users/rnr/Documents/New project/components/app-nav.tsx](/Users/rnr/Documents/New%20project/components/app-nav.tsx)
- [/Users/rnr/Documents/New project/app/globals.css](/Users/rnr/Documents/New%20project/app/globals.css)
- [/Users/rnr/Documents/New project/components/supabase-auth-chip.tsx](/Users/rnr/Documents/New%20project/components/supabase-auth-chip.tsx)

### 핵심 화면
- [/Users/rnr/Documents/New project/app/page.tsx](/Users/rnr/Documents/New%20project/app/page.tsx)
- [/Users/rnr/Documents/New project/app/operations/page.tsx](/Users/rnr/Documents/New%20project/app/operations/page.tsx)
- [/Users/rnr/Documents/New project/app/social/page.tsx](/Users/rnr/Documents/New%20project/app/social/page.tsx)
- [/Users/rnr/Documents/New project/app/campaigns/page.tsx](/Users/rnr/Documents/New%20project/app/campaigns/page.tsx)
- [/Users/rnr/Documents/New project/app/campaigns/[id]/page.tsx](/Users/rnr/Documents/New%20project/app/campaigns/%5Bid%5D/page.tsx)
- [/Users/rnr/Documents/New project/app/seminar/page.tsx](/Users/rnr/Documents/New%20project/app/seminar/page.tsx)
- [/Users/rnr/Documents/New project/app/datasets/page.tsx](/Users/rnr/Documents/New%20project/app/datasets/page.tsx)
- [/Users/rnr/Documents/New project/app/learning/page.tsx](/Users/rnr/Documents/New%20project/app/learning/page.tsx)
- [/Users/rnr/Documents/New project/app/history/page.tsx](/Users/rnr/Documents/New%20project/app/history/page.tsx)
- [/Users/rnr/Documents/New project/app/dashboard/page.tsx](/Users/rnr/Documents/New%20project/app/dashboard/page.tsx)
- [/Users/rnr/Documents/New project/app/settings/page.tsx](/Users/rnr/Documents/New%20project/app/settings/page.tsx)
- [/Users/rnr/Documents/New project/app/auth/callback/page.tsx](/Users/rnr/Documents/New%20project/app/auth/callback/page.tsx)
- [/Users/rnr/Documents/New project/components/supabase-auth-panel.tsx](/Users/rnr/Documents/New%20project/components/supabase-auth-panel.tsx)
- [/Users/rnr/Documents/New project/components/supabase-auth-callback.tsx](/Users/rnr/Documents/New%20project/components/supabase-auth-callback.tsx)
- [/Users/rnr/Documents/New project/app/api/supabase/bootstrap/route.ts](/Users/rnr/Documents/New%20project/app/api/supabase/bootstrap/route.ts)

### 실행/보고서
- [/Users/rnr/Documents/New project/components/run-detail-client.tsx](/Users/rnr/Documents/New%20project/components/run-detail-client.tsx)
- [/Users/rnr/Documents/New project/app/runs/[id]/report/page.tsx](/Users/rnr/Documents/New%20project/app/runs/%5Bid%5D/report/page.tsx)
- [/Users/rnr/Documents/New project/components/structured-deliverable-dashboard.tsx](/Users/rnr/Documents/New%20project/components/structured-deliverable-dashboard.tsx)
- [/Users/rnr/Documents/New project/components/seminar-report-dashboard.tsx](/Users/rnr/Documents/New%20project/components/seminar-report-dashboard.tsx)
- [/Users/rnr/Documents/New project/lib/report-visuals.ts](/Users/rnr/Documents/New%20project/lib/report-visuals.ts)

### 캠페인/승인
- [/Users/rnr/Documents/New project/lib/campaign-rooms.ts](/Users/rnr/Documents/New%20project/lib/campaign-rooms.ts)
- [/Users/rnr/Documents/New project/lib/approval-actions.ts](/Users/rnr/Documents/New%20project/lib/approval-actions.ts)
- [/Users/rnr/Documents/New project/components/approval-action-list.tsx](/Users/rnr/Documents/New%20project/components/approval-action-list.tsx)
- [/Users/rnr/Documents/New project/app/api/approvals/execute/route.ts](/Users/rnr/Documents/New%20project/app/api/approvals/execute/route.ts)

### 소셜/Meta 연결
- [/Users/rnr/Documents/New project/components/meta-connection-panel.tsx](/Users/rnr/Documents/New%20project/components/meta-connection-panel.tsx)
- [/Users/rnr/Documents/New project/lib/meta-connection.ts](/Users/rnr/Documents/New%20project/lib/meta-connection.ts)
- [/Users/rnr/Documents/New project/lib/meta-connection-storage.ts](/Users/rnr/Documents/New%20project/lib/meta-connection-storage.ts)
- [/Users/rnr/Documents/New project/app/meta/connect/page.tsx](/Users/rnr/Documents/New%20project/app/meta/connect/page.tsx)
- [/Users/rnr/Documents/New project/app/api/meta/oauth/exchange/route.ts](/Users/rnr/Documents/New%20project/app/api/meta/oauth/exchange/route.ts)
- [/Users/rnr/Documents/New project/lib/instagram-meta.ts](/Users/rnr/Documents/New%20project/lib/instagram-meta.ts)
- [/Users/rnr/Documents/New project/lib/instagram-reach-agent.ts](/Users/rnr/Documents/New%20project/lib/instagram-reach-agent.ts)
- [/Users/rnr/Documents/New project/app/api/instagram/reach/agent/route.ts](/Users/rnr/Documents/New%20project/app/api/instagram/reach/agent/route.ts)

### MCP/확장
- [/Users/rnr/Documents/New project/scripts/mcp-server.mjs](/Users/rnr/Documents/New%20project/scripts/mcp-server.mjs)
- [/Users/rnr/Documents/New project/lib/mcp-client.ts](/Users/rnr/Documents/New%20project/lib/mcp-client.ts)
- [/Users/rnr/Documents/New project/lib/mcp-connections.ts](/Users/rnr/Documents/New%20project/lib/mcp-connections.ts)
- [/Users/rnr/Documents/New project/components/mcp-connection-hub.tsx](/Users/rnr/Documents/New%20project/components/mcp-connection-hub.tsx)
- [/Users/rnr/Documents/New project/components/mcp-inspector.tsx](/Users/rnr/Documents/New%20project/components/mcp-inspector.tsx)

### Electron/업데이트
- [/Users/rnr/Documents/New project/electron/main.ts](/Users/rnr/Documents/New%20project/electron/main.ts)
- [/Users/rnr/Documents/New project/electron/preload.ts](/Users/rnr/Documents/New%20project/electron/preload.ts)
- [/Users/rnr/Documents/New project/lib/runtime-storage.ts](/Users/rnr/Documents/New%20project/lib/runtime-storage.ts)
- [/Users/rnr/Documents/New project/lib/secure-json-store.ts](/Users/rnr/Documents/New%20project/lib/secure-json-store.ts)

### Supabase 이전 레이어
- [/Users/rnr/Documents/New project/supabase/migrations/20260316113000_workspace_shared_data.sql](/Users/rnr/Documents/New%20project/supabase/migrations/20260316113000_workspace_shared_data.sql)
- [/Users/rnr/Documents/New project/lib/shared-sync/contracts.ts](/Users/rnr/Documents/New%20project/lib/shared-sync/contracts.ts)
- [/Users/rnr/Documents/New project/lib/shared-sync/local-export.ts](/Users/rnr/Documents/New%20project/lib/shared-sync/local-export.ts)
- [/Users/rnr/Documents/New project/lib/run-progress.ts](/Users/rnr/Documents/New%20project/lib/run-progress.ts)

## 다음 우선순위

### 디자인 시스템 마무리 (P1 — 이번 작업에서 확인된 잔여 항목)
1. `globals.css` — `.status-badge-success/warning/error/info/running` 클래스 추가
2. `lib/design-tokens.ts` 생성 — `getStatusColor()` 유틸리티로 tone 함수 통합
3. `components/app-nav.tsx` — hex 색상(`#3182f6`, `#6b7684`) → CSS 변수로 교체
4. `app/seminar/page.tsx` — 라운드 상태 hex 색상 정리
5. `globals.css` — `.data-table` 클래스 추가 후 `datasets/page.tsx` 적용

### 기능 개발
6. Supabase 이메일 로그인 재시도 후 실제 세션 연결 확인
7. 워크스페이스 생성 정상 동작 확인
8. `/api/supabase/bootstrap` 기반 실제 업로드/동기화 액션 붙이기
9. 공유 운영 데이터(`Run`, `LearningArchive`, `ApprovalDecision`, `RunProgress`) 1차 이전 완료
10. `Instagram Login` 우선 전환 설계 및 구현
11. 추천 액션 엔진 추가
12. Notion/Figma/Playwright 확장 연결

## 다음 대화에서 먼저 보면 좋은 것
- 이 문서
- [/Users/rnr/Documents/New project/docs/2026-03-16-design-system-audit.md](/Users/rnr/Documents/New%20project/docs/2026-03-16-design-system-audit.md) ← 최신: 디자인 시스템 감사 결과
- [/Users/rnr/Documents/New project/docs/2026-03-16-supabase-adoption-plan.md](/Users/rnr/Documents/New%20project/docs/2026-03-16-supabase-adoption-plan.md)
- [/Users/rnr/Documents/New project/docs/2026-03-12-mcp-expansion-roadmap.md](/Users/rnr/Documents/New%20project/docs/2026-03-12-mcp-expansion-roadmap.md)

## 운영 메모
- 큰 UI 수정 후에는 `npx tsc --noEmit --pretty false`, `npm run build:electron`, `npm run build:next` 를 기본 검증으로 본다.
- 브라우저 확인이 필요하면 Playwright 기반 점검을 우선 사용한다.
- 개발 실행은 현재 `next dev -p 3000 --turbo` 기준이다. 예전 dev 서버는 app router 정적 자산 경로 문제가 있었다.
- Supabase Auth는 현재 magic link 기준으로 동작한다. 이메일 코드 입력칸은 향후 OTP 템플릿 전환용 보조 UI다.
- Supabase 기본 이메일 서비스는 발송 제한이 낮아 `email rate limit exceeded`가 발생할 수 있다. 재시도 전 잠시 대기하거나 추후 custom SMTP 전환을 검토한다.
- 업데이트 테스트 시에는 버전 번호를 먼저 올리고 새 `latest-mac.yml` 이 생성됐는지 꼭 확인한다.
