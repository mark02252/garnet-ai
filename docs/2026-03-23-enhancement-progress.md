# Garnet 고도화 진행 기록 — 2026-03-23

> 기준: Garnet v0.3.1 → v0.4.0 고도화
> 총 7개 커밋, +2,800줄, 신규 파일 19개
> GenSpark 문서 기반 고도화 계획에서 GenSpark API 직접 연동 제외 후 독립 구현

---

## 커밋 이력

| # | 커밋 | 내용 |
|---|------|------|
| 1 | `252fcd6` | Phase 1 — 검색 다변화, Claude LLM, GA4 연동, 디자인 토큰 |
| 2 | `b18bf80` | Phase 2 — LLM 스트리밍, 역할별 모델 분리, Notion 강화 |
| 3 | `8b45bda` | Phase 3 — 추천 엔진, PPTX 슬라이드, AI 이미지, Slack 알림 |
| 4 | `606109a` | Phase 4 — 자동화 스케줄러, 멀티에이전트 강화, MCP 확장 |
| 5 | `3cd3084` | UI — GA4 대시보드, 추천 액션, PPTX 버튼, 스케줄러 관리 |
| 6 | `77b2362` | GA4 미연결 시 데모 데이터 미리보기 모드 |

---

## Phase 1: 기반 확장 ✅

### 검색 Provider 3단 fallback
- **변경 파일**: `lib/search.ts`, `lib/types.ts`, `lib/env.ts`
- **내용**: Serper → Brave Search → 네이버 검색 자동 fallback
- Brave: `https://api.search.brave.com/res/v1/web/search` (한국어/한국 필터)
- 네이버: 블로그 + 뉴스 동시 검색, HTML 태그 자동 제거
- API route 3개 (`run`, `seminar`, `search/test`) provider enum 확장
- **환경변수**: `BRAVE_SEARCH_API_KEY`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`

### Anthropic Claude LLM Provider
- **변경 파일**: `lib/llm.ts`, `lib/types.ts`, `lib/runtime-draft.ts`, `lib/env.ts`
- **내용**: 6번째 LLM provider로 Claude 추가
- `@anthropic-ai/sdk` 설치
- `runClaude()`, `mapClaudeError()` 구현
- fallback 체인에 claude 포함 (openai→claude→groq→gemini→openclaw→local)
- 설정 UI 드롭다운에 'Claude' 옵션 추가
- **기본 모델**: `claude-sonnet-4-5-20250514`
- **환경변수**: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`

### GA4 Data API 연동
- **신규 파일**: `lib/ga4-client.ts`
- **API routes**: `/api/ga4/report`, `/api/ga4/realtime`, `/api/ga4/analyze`
- **기능**:
  - `fetchDailyTraffic()` — 일별 활성 사용자, 세션, 페이지뷰, 전환
  - `fetchChannelBreakdown()` — 유입 채널별 세션/사용자/전환
  - `fetchPagePerformance()` — 페이지별 뷰/사용자/체류시간
  - `fetchRealtimeActiveUsers()` — 실시간 접속자
  - `analyzeGA4WithAI()` — GA4 데이터를 LLM에 전달하여 인사이트 생성
- MCP 서버에 `get_ga4_traffic_summary` tool 추가
- **환경변수**: `GA4_PROPERTY_ID`, `GA4_CLIENT_EMAIL`, `GA4_PRIVATE_KEY`
- **상태**: 백엔드 완료, GA4 Service Account 인증키 보안 제한으로 연동 대기 중

### 디자인 토큰 정리
- **변경 파일**: `app/globals.css`, campaigns, learning, operations 페이지
- **내용**: 상태 배지 색상 10개를 CSS 변수로 토큰화
  - `--status-active`, `--status-paused`, `--status-completed`, `--status-draft`, `--status-failed` + 각 bg
- 4개 페이지의 하드코딩 Tailwind 클래스를 `var()` 방식으로 교체

---

## Phase 2: 품질 향상 ✅

### LLM 스트리밍 (SSE)
- **변경 파일**: `lib/llm.ts`
- **신규 API**: `/api/llm/stream`
- **내용**: 4개 provider별 스트리밍 구현
  - `streamOpenAI()` — `client.responses.stream()`
  - `streamGemini()` — `streamGenerateContent` SSE 파싱
  - `streamClaude()` — `client.messages.stream()`
  - `streamGroq()` — OpenAI 호환 SSE
- `streamLLM()` — fallback 체인 포함, 스트리밍 불가 시 non-streaming으로 자동 전환
- SSE endpoint: `POST /api/llm/stream` → `text/event-stream` 응답

### 파이프라인 역할별 모델 분리
- **변경 파일**: `lib/pipeline.ts`
- **내용**: 회의 역할별 최적 LLM 자동 라우팅
  ```
  PM / 전략가 → OpenAI (의사결정 정확도)
  콘텐츠 디렉터 → Claude (창의성)
  퍼포먼스 마케터 → Gemini (분석)
  운영 매니저 → Groq (속도)
  ```
- `ROLE_MODEL_HINTS` 맵으로 설정, `runRoleTurn()`에서 runtime override 자동 적용

### 에이전트 컨텍스트 공유 강화
- **변경 파일**: `lib/pipeline.ts`
- **내용**: `buildSharedContext()` 함수 추가
  - 이전 역할 발언을 300자 이내로 압축
  - 다음 역할의 프롬프트에 자동 주입 (최대 2000자)
  - 역할 간 맥락 단절 문제 해소

### Notion 강화
- **변경 파일**: `app/api/integrations/notion/route.ts`
- **내용**:
  - `NOTION_PARENT_PAGE_ID` 환경변수 기본값 지원 (매번 입력 불필요)
  - `GET /api/integrations/notion` — 연결 상태 확인 endpoint 추가
- **환경변수**: `NOTION_API_KEY`, `NOTION_PARENT_PAGE_ID`

---

## Phase 3: 기능 확장 ✅

### 추천 액션 엔진
- **신규 파일**: `lib/recommendations.ts`
- **API route**: `/api/recommendations`
- **분석 대상**: KPI 달성률, 승인 대기, 비활성 캠페인, 세미나 상태, 실행 이력
- **우선순위**: urgent → high → medium → low (최대 10건)
- **규칙**:
  - KPI 30% 미만 → urgent
  - KPI 60% 미만 → high
  - 승인 대기 3건 이상 → urgent
  - 활성 캠페인 최근 실행 없음 → medium

### PPTX 슬라이드 내보내기
- **신규 파일**: `lib/slide-export.ts`
- **API route**: `/api/runs/[id]/export-pptx`
- **패키지**: `pptxgenjs`
- **슬라이드 구성** (6종):
  1. 표지 (제목, 목표, 타깃)
  2. Executive Summary (핵심 메시지, 요약)
  3. Channel Plan (채널/포맷/예산/KPI 테이블)
  4. KPI Targets (지표/기준/목표/기간 테이블)
  5. Timeline (단계/시작/종료/담당/액션 테이블)
  6. Next Actions (불릿 리스트)

### AI 이미지 생성 API
- **API route**: `/api/content/image`
- **provider**: OpenAI DALL-E 3 + Gemini (기존 `lib/sns/image-generator.ts` 활용)
- **옵션**: style(natural/vivid), size(3종), quality(standard/hd)

### Slack 승인 알림
- **변경 파일**: `lib/integrations/slack.ts`
- **API route**: `/api/notifications/slack`
- **추가 템플릿**: `buildApprovalNotification()`, `buildRecommendationAlert()`
- **알림 유형**: approval(승인 요청), recommendations(긴급 추천), custom(커스텀)

---

## Phase 4: 자동화 & 확장 ✅

### 자동화 스케줄러
- **신규 파일**: `lib/job-scheduler.ts`
- **API route**: `/api/jobs` (GET: 목록, POST: 실행)
- **등록 작업 4개**:
  | ID | 이름 | 주기 | 내용 |
  |---|------|------|------|
  | `daily-briefing` | 일간 브리핑 | daily | 운영 현황 요약 → Slack |
  | `weekly-kpi-review` | 주간 KPI 리뷰 | weekly | KPI 분석 → 개선 권고 |
  | `ga4-analysis` | GA4 성과 분석 | weekly | GA4 데이터 → AI 인사이트 |
  | `urgent-recommendations` | 긴급 추천 알림 | hourly | urgent 추천 → Slack |

### MCP 서버 도구 확장 (5개 추가)
- `get_seminar_session` — 세미나 상세 (라운드, 최종 보고서)
- `list_campaign_rooms` — 캠페인 룸 목록 (상태 필터)
- `get_action_recommendations` — AI 추천 액션
- `list_scheduled_jobs` — 자동화 작업 목록
- `get_ga4_traffic_summary` — GA4 트래픽 요약

---

## UI 고도화 ✅

### GA4 Analytics 대시보드 (`/analytics`)
- **신규 파일**: `app/analytics/page.tsx`
- **기능**:
  - 실시간 접속자 표시 (60초 자동 갱신, 초록 펄스 뱃지)
  - KPI 카드 4종 (활성 사용자, 세션, 페이지뷰, 전환)
  - 일별 트래픽 바 차트 (30일)
  - 유입 채널 Top 10 (수평 바)
  - 상위 페이지 목록
  - AI 성과 분석 버튼 (인사이트/권고/이상 징후)
  - **데모 모드**: GA4 미연결 시 데모 데이터로 전체 UI 미리보기
  - 연동 완료 시 자동으로 실제 데이터 전환
- **네비게이션**: 사이드바 '성과' 그룹에 'GA4 Analytics' 추가

### 추천 액션 패널
- **신규 파일**: `components/recommendations-panel.tsx`
- **위치**: Operations(오늘의 브리핑) 페이지 하단
- 우선순위별 색상 배지 (긴급=빨강, 높음=노랑, 참고=파랑)
- 클릭 시 해당 페이지로 이동

### PPTX 다운로드 버튼
- **변경 파일**: `components/run-detail-client.tsx`
- Run 상세 페이지에 'PPTX 슬라이드' 버튼 추가 (산출물 있을 때만 표시)

### 자동화 스케줄러 관리
- **신규 파일**: `components/job-scheduler-panel.tsx`
- **위치**: 설정 페이지 'Automation' 섹션
- 작업 목록 (이름, 주기, 활성 상태, 마지막 실행 시간)
- 수동 실행 버튼 + 결과 표시

---

## 환경변수 총정리

### 신규 추가 (이번 고도화)

| 환경변수 | 용도 | 발급처 | 상태 |
|----------|------|--------|------|
| `BRAVE_SEARCH_API_KEY` | Brave 검색 fallback | brave.com/search/api | 미입력 |
| `NAVER_CLIENT_ID` | 네이버 검색 | developers.naver.com | 미입력 |
| `NAVER_CLIENT_SECRET` | 네이버 검색 | developers.naver.com | 미입력 |
| `ANTHROPIC_API_KEY` | Claude LLM | console.anthropic.com | 미입력 |
| `ANTHROPIC_MODEL` | Claude 모델명 | — | 기본값 설정됨 |
| `GA4_PROPERTY_ID` | GA4 속성 ID | Google Analytics | 미입력 (보안 제한) |
| `GA4_CLIENT_EMAIL` | GA4 서비스 계정 | Google Cloud Console | 미입력 (보안 제한) |
| `GA4_PRIVATE_KEY` | GA4 인증 키 | Google Cloud Console | 미입력 (보안 제한) |
| `NOTION_API_KEY` | Notion 발행 | notion.so/my-integrations | 미입력 |
| `NOTION_PARENT_PAGE_ID` | Notion 기본 상위 페이지 | Notion | 미입력 |
| `SLACK_WEBHOOK_URL` | Slack 알림 | api.slack.com | 미입력 |

### 기존 (변경 없음)

| 환경변수 | 용도 | 상태 |
|----------|------|------|
| `LLM_PROVIDER` | 기본 LLM | gemini |
| `GEMINI_API_KEY` | Gemini API | 설정됨 |
| `SEARCH_API_KEY` | Serper 검색 | 설정됨 |
| `OPENAI_API_KEY` | OpenAI API | 미설정 |

---

## 신규 파일 목록

| 파일 | 유형 | 설명 |
|------|------|------|
| `lib/ga4-client.ts` | 라이브러리 | GA4 Data API 클라이언트 + AI 분석 |
| `lib/recommendations.ts` | 라이브러리 | 추천 액션 엔진 |
| `lib/slide-export.ts` | 라이브러리 | PPTX 슬라이드 생성 |
| `lib/job-scheduler.ts` | 라이브러리 | 자동화 작업 스케줄러 |
| `app/analytics/page.tsx` | 페이지 | GA4 대시보드 |
| `app/api/ga4/report/route.ts` | API | GA4 리포트 |
| `app/api/ga4/realtime/route.ts` | API | GA4 실시간 |
| `app/api/ga4/analyze/route.ts` | API | GA4 AI 분석 |
| `app/api/recommendations/route.ts` | API | 추천 액션 |
| `app/api/runs/[id]/export-pptx/route.ts` | API | PPTX 내보내기 |
| `app/api/content/image/route.ts` | API | AI 이미지 생성 |
| `app/api/notifications/slack/route.ts` | API | Slack 알림 |
| `app/api/jobs/route.ts` | API | 자동화 작업 |
| `app/api/llm/stream/route.ts` | API | LLM SSE 스트리밍 |
| `components/recommendations-panel.tsx` | 컴포넌트 | 추천 액션 패널 |
| `components/job-scheduler-panel.tsx` | 컴포넌트 | 스케줄러 관리 패널 |

---

## 변화 요약 (Before → After)

```
Garnet v0.3.1                          Garnet v0.4.0
─────────────                          ─────────────
검색: Serper 1개                    →  Serper + Brave + 네이버 (3단 fallback)
LLM: 5개 (동기식)                   →  6개 + Claude, SSE 스트리밍 4개 provider
회의: 단일 모델                      →  역할별 최적 모델 + 컨텍스트 공유
보고서: JSON만                       →  JSON + PPTX 슬라이드
이미지: Gemini만                     →  DALL-E 3 + Gemini 듀얼
공유: 앱 내부만                      →  Notion 발행 + Slack 알림
분석: 수동                           →  GA4 자동 수집 + AI 분석 (데모 모드)
자동화: 세미나만                      →  일간 브리핑 + 주간 KPI + GA4 + 긴급 알림
추천: 없음                           →  KPI/승인/캠페인 기반 액션 추천
MCP: 7개 tool                       →  12개 tool
디자인: 하드코딩 색상                 →  CSS 변수 토큰 시스템
UI: 기존 페이지만                    →  GA4 대시보드 + 추천 패널 + 스케줄러 관리
```

---

## 다음 단계 (미완료)

- [ ] GA4 Service Account 인증키 보안 제한 해제 후 실제 연동
- [ ] Brave Search / 네이버 검색 API 키 발급 및 테스트
- [ ] Anthropic API 키 입력 후 Claude provider 테스트
- [ ] Notion / Slack 연동 설정
- [ ] LLM 스트리밍을 캠페인 스튜디오 UI에 연결
- [ ] 자동화 스케줄러 cron 기반 백그라운드 실행 구현
- [ ] Supabase SMTP 해제 후 팀 협업 기능 활성화

---

## 관련 문서

| 문서 | 설명 |
|------|------|
| `docs/2026-03-18-garnet-roadmap-v3.md` | v0.3 로드맵 (이전 버전) |
| `docs/2026-03-16-roadmap.md` | 초기 로드맵 |
| `docs/superpowers/plans/2026-03-23-garnet-phase1-enhancement.md` | Phase 1 구현 계획서 |
| PR #1 `genspark_ai_developer` 브랜치 | GenSpark 연동 방안 원본 문서 |
