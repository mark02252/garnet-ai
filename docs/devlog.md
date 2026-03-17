# Garnet 개발 로그

> Electron + Next.js 15.2 · React 19 · Prisma + SQLite · macOS 전용

---

## 버전 히스토리

| 버전 | 날짜 | 주요 내용 |
|------|------|-----------|
| 0.1.x | 초기 | 기본 골격 (Run, Deliverable, MeetingTurn, WebSource) |
| 0.2.0 | — | Notion 발행 UX 개선, Slack MCP, SSE 진행 스트림, MCP 툴 확장, Supabase Storage |
| 0.2.1 | — | DMG 패키징 첫 빌드 (CSS 경로 버그 존재) |
| 0.2.2 | 2026-03-17 | CSS 경로 수정 (standalone `.next-build/static` 올바른 위치로) |
| 0.2.3 | 2026-03-17 | 신규 설치 시 DB 스키마 자동 생성 (`node:sqlite` 사용) |
| 0.2.4 | 2026-03-17 | SNS 스튜디오 A~E 전 기능 구현 (페르소나·콘텐츠·캘린더·분석·커뮤니티) |

---

## 0.2.x 세션 — 주요 작업 상세

### 1. Notion 발행 UX 개선 (`components/notion-publish-button.tsx`)

**변경 사항:**
- `parentPageId`를 `localStorage`에 저장 (키: `notion_publish_parent_page_id`)
- 컴포넌트 마운트 시 저장된 값 자동 로드
- 로딩 중 입력 비활성화
- 발행 성공 후 "다시 발행" 버튼 표시
- 저장된 페이지 ID가 있을 때 "페이지 변경" 버튼으로 재진입
- 디버그 `console.log` 2개 제거

---

### 2. Slack MCP 연결

**파일:** `lib/mcp-client.ts`, `components/slack-notify-button.tsx`

**구조:**
- `@modelcontextprotocol/server-slack` 사용 (외부 패키지)
- Electron 런타임 설정에서 `SLACK_BOT_TOKEN` 주입 → MCP 서버 실행 시 env로 전달
- `SlackNotifyButton` 컴포넌트:
  - 상태: `idle → loading-channels → selecting → sending → success/error`
  - 채널 목록 불러오기(`slack_list_channels`) → 채널 선택 → 발송(`slack_post_message`)
  - 선택한 `channelId`를 `localStorage`에 저장 (키: `slack_notify_channel_id`)
  - "채널 변경" 버튼으로 재선택

**적용 위치:**
- `app/operations/page.tsx` — 주간 운영 브리핑 Slack 발송
- `app/seminar/sessions/[id]/report/page.tsx` — 세미나 보고서 발송
- `app/learning/page.tsx` — CONFIRMED 플레이북 발송

---

### 3. SSE 기반 진행 스트림 (`app/api/runs/[id]/progress/stream/route.ts`)

**기존:** `setInterval` 1300ms 폴링
**변경:** Server-Sent Events (SSE) 800ms 폴링

**서버 (`/api/runs/[id]/progress/stream`):**
```
Content-Type: text/event-stream
Cache-Control: no-cache
```
- `ReadableStream` + `TextEncoderStream`
- 재귀 `tick()` 함수, 800ms 간격
- `COMPLETED` / `FAILED` 도달 또는 15분 초과 시 스트림 종료
- 이벤트 형식: `data: {...JSON...}\n\n`

**클라이언트 (`app/page.tsx`):**
- `progressSourceRef = useRef<EventSource | null>`
- `es.onmessage` → 진행 상태 업데이트
- `es.onerror` → 에러 상태 전환
- `es.close()` → 완료/실패/언마운트 시 정리

---

### 4. MCP 서버 툴 확장 (`scripts/mcp-server.mjs`)

**신규 리소스:**
- `aimd://seminar/recent` — 최근 세미나 세션 목록

**신규 툴 (6개):**
| 툴 | 기능 |
|----|------|
| `list_kpi_goals` | KPI 목표 목록 조회 |
| `update_kpi_current_value` | KPI 현재값 업데이트 |
| `list_seminar_sessions` | 세미나 세션 목록 |
| `get_seminar_session` | 세미나 세션 상세 + 라운드 |
| `list_campaign_rooms` | 캠페인 룸 목록 |
| `get_operations_summary` | 운영 종합 요약 |

**신규 프롬프트 (3개):**
- `ops-weekly-digest` — 주간 운영 보고
- `seminar-to-action` — 세미나 인사이트 → 실행 계획
- `kpi-gap-analysis` — KPI 갭 분석

---

### 5. Supabase Storage 분리 (`lib/supabase/storage.ts`)

**버킷:** `garnet-attachments` (public, 50MB 제한)

**흐름:**
```
syncRunsToSupabase()
  → ensureAttachmentBucket()        # 버킷 없으면 자동 생성
  → uploadRunAttachmentsToStorage()  # base64 → Buffer → Blob → upload
  → storageUrl 저장, content 비움    # DB 사이즈 절감
```

**계약 타입 (`lib/shared-sync/contracts.ts`):**
```typescript
attachments: Array<{
  ...
  storageUrl?: string | null;  // 신규 추가
}>
```

---

### 6. DMG 패키징 수정

#### 문제 1: CSS 미로드 (0.2.1)

**원인:**
- `build:next` 스크립트가 정적 파일을 `standalone/.next/static/`에 복사
- 실제 Next.js standalone `server.js`는 `distDir: ".next-build"` 설정으로 `standalone/.next-build/static/`에서 파일을 찾음
- electron-builder가 `.`으로 시작하는 디렉토리를 기본 제외

**수정 (`package.json`):**
```json
// Before
"cp -R .next-build/static .next-build/standalone/.next/static"

// After
"mkdir -p .next-build/standalone/.next-build && cp -R .next-build/static .next-build/standalone/.next-build/static"
```
```json
"files": [
  ...
  ".next-build/standalone/.next-build/**/*",  // 명시적 추가
  ...
]
```

#### 문제 2: APP_UPDATE_URL 환경변수 누락

```bash
APP_UPDATE_URL=http://localhost:8765 npm run dist
```

---

### 7. 신규 설치 DB 스키마 자동 생성 (0.2.3)

**원인:** 신규 설치 시 `userData/marketing-os.db`가 빈 파일로 생성됨. Prisma Client가 테이블을 찾지 못해 Server Component 렌더 실패 → 에러 바운더리 표시.

**해결 (`electron/main.ts` — `ensureDbSchema()`):**

```typescript
function ensureDbSchema() {
  if (isDev) return;
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath);

  // Run 테이블 존재 여부로 스키마 초기화 여부 판단
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Run'").get();
  if (row) { db.close(); return; }

  // 전체 스키마 SQL 실행 (CREATE TABLE IF NOT EXISTS × 18개 테이블)
  db.exec(`...`);
  db.close();
}
```

**포인트:**
- `node:sqlite`는 Electron 35 (Node 22.16.0) 내장 모듈 — 외부 의존성 불필요
- `app.whenReady()` 안에서 `ensureRuntimeDatabaseUrl()` 직후, `startNextServer()` 이전에 실행
- 이미 스키마가 있으면 즉시 반환 (성능 영향 없음)

---

## 현재 Prisma 모델 전체 목록 (18개)

| 모델 | 역할 |
|------|------|
| `Run` | AI 실행 세션 |
| `RunAttachment` | 첨부파일 (base64 또는 storageUrl) |
| `WebSource` | 웹 조사 소스 |
| `MeetingTurn` | 회의 발언 기록 |
| `Deliverable` | 산출물 (캠페인 플랜 등) |
| `MemoryLog` | 실행 후 가설/방향 기록 |
| `Dataset` | 업로드 데이터셋 |
| `LearningArchive` | 학습 아카이브 (플레이북) |
| `ManualCampaignRoom` | 수동 캠페인 룸 |
| `KpiGoal` | KPI 목표 |
| `InstagramReachDaily` | 일별 Instagram 도달 수 |
| `ContentDraft` | AI 콘텐츠 초안 |
| `InstagramReachAnalysisRun` | Instagram 도달 분석 실행 |
| `ApprovalDecision` | 승인/거절 결정 기록 |
| `RunProgress` | 실행 진행 상태 |
| `SeminarSession` | 세미나 세션 |
| `SeminarRound` | 세미나 라운드 |
| `SeminarFinalReport` | 세미나 최종 보고서 |

---

## 현재 API 라우트 구조

```
app/api/
├── runs/
│   ├── route.ts                     # 목록 조회/생성
│   └── [id]/
│       ├── route.ts                 # 단건 조회/삭제
│       ├── progress/
│       │   ├── route.ts             # 진행 상태 읽기/쓰기
│       │   └── stream/route.ts      # SSE 스트림 (신규)
│       └── execute/route.ts         # AI 실행 트리거
├── goals/route.ts                   # KPI 목표 CRUD
├── mcp/
│   ├── connect/route.ts             # MCP 서버 연결
│   └── tool/route.ts                # MCP 툴 실행
├── seminar/
│   ├── sessions/route.ts
│   ├── sessions/[id]/route.ts
│   └── scheduler/start/route.ts
├── workspace/
│   └── sync/route.ts                # Supabase 동기화
└── ...
```

---

## 0.2.4 세션 — SNS 스튜디오 구현 상세

### 신규 Prisma 모델 (6개)
`SnsPersona`, `SnsPersonaPost`, `SnsContentDraft`, `SnsScheduledPost`, `SnsAnalyticsSnapshot`, `SnsCommentTemplate`

### 신규 라이브러리
- `lib/sns/persona-learner.ts` — AI 페르소나 생성 (FROM_POSTS / FROM_TEMPLATE)
- `lib/sns/upload.ts` — Supabase Storage SNS 파일 업로드
- `lib/sns/image-generator.ts` — 나노바나나 2 (gemini-2.0-flash-preview-image-generation) 이미지 생성
- `lib/sns/canva-pipeline.ts` — Canva MCP 파이프라인 (CANVA_API_TOKEN 없으면 graceful 패스)
- `lib/sns/video-renderer.ts` — 영상 렌더 스텁 (fluent-ffmpeg, 미구현)
- `lib/sns/instagram-api.ts` — Instagram Graph API 직접 호출

### 신규 API 라우트 (17개)
`/api/sns/personas`, `/api/sns/personas/[id]`, `/api/sns/personas/[id]/learn`,
`/api/sns/content`, `/api/sns/content/[id]`, `/api/sns/content/[id]/image`,
`/api/sns/schedule`, `/api/sns/schedule/[id]`, `/api/sns/schedule/process`, `/api/sns/schedule/missed`,
`/api/sns/analytics`, `/api/sns/analytics/sync`, `/api/sns/analytics/best-time`,
`/api/sns/chat`,
`/api/sns/community/comments`, `/api/sns/community/comments/generate`, `/api/sns/community/comments/[id]/reply`

### 신규 UI 페이지 (8개)
`/sns/personas`, `/sns/personas/new`, `/sns/personas/[id]`,
`/sns/studio`, `/sns/studio/[draftId]`,
`/sns/calendar`, `/sns/analytics`, `/sns/community`

### 버그 수정 (이 세션)
- `lib/prisma.ts` SQLite 경로 해석 버그 수정 — `file:./dev.db` 기준 디렉토리를 `prisma/`로 통일
- `/api/sns/personas` GET에 try-catch 추가
- 사이드바 56px → 200px 확장, 아이콘+텍스트+섹션 그룹 추가
- `app/content/page.tsx` → `redirect('/sns/studio')` 서버 컴포넌트로 전환

---

## 남은 기술 부채

- `app/page.tsx` 일부 `text-slate-*` → CSS 변수 미전환
- 캠페인 스튜디오 `bg-white/92` 글래스모피즘 잔존
- `prisma db push` → `prisma migrate` 전환 (운영 환경 안전성)
- `lib/sns/video-renderer.ts` — fluent-ffmpeg 실제 구현 필요
- Canva MCP 실제 연동 (`CANVA_API_TOKEN` 설정 후)

---

## 다음 우선순위 작업

### 1순위: Instagram 연동 설정 마법사
**스펙:** `docs/superpowers/specs/2026-03-17-instagram-setup-wizard-design.md`

Meta 개발자 앱 셋업을 앱 안에서 5단계로 안내 → 이후 "Instagram 연결" 버튼 하나로 페르소나 연동.

변경 파일:
- `components/meta-connection-panel.tsx` — 마법사 5단계 UI + BroadcastChannel 구독
- `app/settings/page.tsx` — 마법사 진입점
- `app/sns/personas/[id]/page.tsx` — Instagram 연결 버튼
- `app/sns/personas/new/page.tsx` — 동일

### 2순위: 성과 대시보드 재설계
현재 `/dashboard`는 플레이북(LearningArchive) 데이터만 보여줌. 실제 마케팅 성과 대시보드로 교체 필요.

원하는 내용:
- KPI 목표 달성률 (`KpiGoal` 테이블)
- Instagram 도달 추이 최근 30일 (`InstagramReachDaily`)
- 캠페인 실행 건수 (`Run`)
- SNS 발행 건수 (`SnsScheduledPost` / `SnsContentDraft`)

현재 `/dashboard` 플레이북 내용은 `/learning`으로 이동 또는 제거.

### 3순위: 미완료 기능
- 캠페인 캘린더 — 캠페인 룸 일정 시각화
- Supabase 팀 협업 — 워크스페이스 멤버, 역할 관리
