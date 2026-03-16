# Garnet — 개발 진행 기록

> 마지막 업데이트: 2026-03-16
> 현재 버전: v0.2.x (개발 진행 중)
> Git 저장소: `mark02252/garnet-ai` (GitHub Private)

---

## 앱 개요

**Garnet**은 macOS 데스크탑 기반 All-in-One AI 마케팅 전략 워크스페이스입니다.

| 항목 | 내용 |
|------|------|
| 플랫폼 | Electron + Next.js 15.2 (App Router) |
| 언어 | TypeScript, React 19 |
| DB | Prisma + SQLite (로컬) |
| AI | OpenAI / Gemini / Groq / local (runLLM 추상화) |
| 인증 | Supabase (계획됨), Instagram Login OAuth |
| 디자인 | Toss Business 스타일 (토스 비즈니스 참고) |

---

## 완료된 작업 (이전 세션들)

### 기반 설계 및 핵심 기능 (v0.1 → v0.2)
- **캠페인 스튜디오** (`/`) — 역할별 AI 회의 실행 (브리프 → 웹서치 → 회의 → 산출물)
- **실행 아카이브** (`/history`) — Run 목록, 상세, 메모리 로그
- **세미나 스튜디오** (`/seminar`) — 자동 토론 AI 세미나 세션
- **데이터 스튜디오** (`/datasets`) — CSV/JSON 업로드 + AI 분석
- **플레이북** (`/learning`) — 학습 카드 (상황 → 권장 응답) 관리
- **성과 대시보드** (`/dashboard`) — 학습 카드 통계 시각화
- **캠페인 룸** (`/campaigns`) — 브랜드+지역+목표 기준 자동 집계
- **SNS 인사이트** (`/social`) — Instagram Login OAuth + Reach 분석
- **설정** (`/settings`) — API 키, LLM 프로바이더, MCP 연결
- **승인 워크플로우** — ApprovalDecision 테이블, 승인 액션 컴포넌트
- **Supabase 마이그레이션** — auth, organizations, workspace_runs 등 스키마 적용
- **MCP 서버** (`scripts/mcp-server.mjs`) — 내부 데이터 접근 도구/리소스 노출

### 인프라
- GitHub 저장소 생성 및 초기 커밋 (139 files)
- `.mcp.json` — Claude Code MCP 서버 연결
- `.gitignore` 확장 (`.next-build`, `superpowers/`, `vendor_prisma/` 등)

---

## 이번 세션 작업 내역

### 1단계 — 디자인 시스템 마이그레이션 + 핵심 UX 개선

#### 1단계-1: 홈화면 고도화 (`/app/operations/page.tsx`)
**커밋:** `a8ccac7`

- 글래스모피즘 완전 제거
  - `rounded-[24px] border border-slate-200 bg-white p-4 shadow-[...]` → `.soft-card`
  - `rounded-[18px] border border-slate-200 bg-slate-50/70` → `.soft-panel`
  - `bg-white/92`, `bg-slate-50/70` 등 알파 투명도 제거
- 모든 `text-slate-*` 색상 → CSS 변수 토큰
  - `text-slate-950` → `text-[var(--text-strong)]`
  - `text-slate-600/700` → `text-[var(--text-base)]`
  - `text-slate-500/400` → `text-[var(--text-muted)]`
- 프로그레스바 `bg-sky-500` → `bg-[var(--accent)]`
- 높이 `h-2` → `h-1.5` (더 섬세한 진행 바)

#### 1단계-2: 캠페인 직접 생성 (`/app/campaigns/`)
**커밋:** `124cbf2`

**Prisma 스키마 추가:**
```prisma
enum CampaignRoomManualStatus { ACTIVE / PAUSED / COMPLETED }
model ManualCampaignRoom { id, title, brand, region, goal, objective, notes, status, ... }
```

**신규 파일:**
- `app/api/campaigns/rooms/route.ts` — POST로 ManualCampaignRoom 생성
- `components/create-campaign-room-dialog.tsx` — 모달 폼 (title, brand, region, goal, objective, notes)

**수정 파일:**
- `lib/campaign-rooms.ts` — `getCampaignRooms()` 에 수동 룸 병합 로직 추가
- `app/campaigns/page.tsx` — 생성 버튼 + 디자인 토큰 적용, 빈 상태 메시지 추가

#### 1단계-3: 플레이북 확정 UX (`/app/learning/page.tsx`)
**커밋:** `3c42ef9`

- **카드 목록에 인라인 "확정" 버튼** 추가 (DRAFT 카드에만 표시)
  - 클릭 시 즉시 CONFIRMED 상태로 변경 (편집기 열지 않아도 됨)
- **에디터에 "확정하기" primary 버튼** 추가
  - 기존 "저장" 버튼과 분리, DRAFT 상태일 때만 표시
- **DRAFT 안내 배너** (`surface-note`) — "확정하기 전에 내용을 검토하세요"
- 상태 드롭다운 한글 레이블 개선 (DRAFT → "검토 필요 (DRAFT)")
- 카드 선택 스타일: 커스텀 클래스 → `.list-card` + `.list-card-active`
- 전체 디자인 토큰 적용

---

### 2단계 — 신규 기능 3종 추가

#### 2단계-1: KPI 목표 관리 (`/app/goals/`)
**커밋:** `58b2c93`

**Prisma 스키마 추가:**
```prisma
enum KpiPeriod { WEEKLY / MONTHLY / QUARTERLY / ANNUAL }
model KpiGoal { id, title, brand, region, metric, targetValue, currentValue, unit, period, notes, ... }
```

**신규 파일:**
- `app/api/goals/route.ts` — GET (목록) / POST (생성)
- `app/api/goals/[id]/route.ts` — PATCH (수정/업데이트) / DELETE (삭제)
- `app/goals/page.tsx` — KPI 보드 전체 UI

**주요 기능:**
- 목표 생성/편집/삭제 모달
- 달성률 프로그레스 바 (색상 연동: 100%=초록, 70%+=파랑, 40%+=노랑, 미만=빨강)
- 인라인 현재값 업데이트 (숫자 입력 + Enter 또는 버튼)
- 브랜드/지역/기간/단위 필터링
- 히어로 섹션에 달성/진행/주의 현황 요약

#### 2단계-2: 콘텐츠 생성 스튜디오 (`/app/content/`)
**커밋:** `58b2c93`

**신규 파일:**
- `app/api/content/route.ts` — AI 콘텐츠 생성 (runLLM 활용)
- `app/content/page.tsx` — 스튜디오 UI

**지원 콘텐츠 타입:**
| 타입 | 설명 |
|------|------|
| 인스타그램 캡션 | 캡션 + 해시태그 15개 |
| 광고 카피 | 헤드라인 3가지 + 서브카피 + CTA |
| 이메일 카피 | 제목 줄 + 본문 + CTA |
| 블로그 포스트 | SEO 최적화 초안 |
| 보도자료 | 언론 배포용 형식 |
| SMS / 푸시 알림 | 40자 이내 짧은 문구 |

**주요 기능:**
- 브랜드, 타겟, 톤앤매너(프리셋 제공), 핵심 메시지 입력
- 생성 중 로딩 상태 표시
- 결과 복사 버튼 (클립보드)
- 톤앤매너 프리셋 5종 원클릭 선택

#### 2단계-3: 알림 인박스 (`/app/notifications/`)
**커밋:** `58b2c93`

**신규 파일:**
- `app/api/notifications/route.ts` — DB 상태 기반 알림 계산
- `app/notifications/page.tsx` — 알림 목록 UI

**알림 타입:**

| 타입 | 트리거 조건 |
|------|------------|
| ⚠️ 주의 | 도달 하락 추세, 실패 세미나, KPI 40% 미만 |
| 🔔 즉시 처리 | DRAFT 플레이북 n개, 보고서 미작성 실행 |
| ℹ️ 정보 | 진행 중인 세미나 |
| ✅ 달성 | KPI 100% 달성, 승인 완료 |

**네비게이션 아이콘 추가:**
- `GoalsIcon` → `/goals`
- `ContentIcon` → `/content`
- `NotificationIcon` → `/notifications`

---

## 현재 파일 구조 (주요)

```
app/
├── operations/        # 홈 — 오늘의 브리핑
├── page.tsx           # 캠페인 스튜디오
├── campaigns/         # 캠페인 룸 (수동 생성 포함)
├── content/           # 콘텐츠 생성 스튜디오 ← NEW
├── goals/             # KPI 목표 관리 ← NEW
├── notifications/     # 알림 인박스 ← NEW
├── seminar/           # 세미나 스튜디오
├── datasets/          # 데이터 스튜디오
├── learning/          # 플레이북
├── history/           # 실행 아카이브
├── dashboard/         # 성과 대시보드
├── social/            # SNS 인사이트
└── settings/          # 설정

app/api/
├── run/               # 회의 실행 (메인 AI 파이프라인)
├── campaigns/rooms/   # 캠페인 룸 생성 ← NEW
├── content/           # 콘텐츠 AI 생성 ← NEW
├── goals/             # KPI CRUD ← NEW
├── goals/[id]/        # KPI 개별 PATCH/DELETE ← NEW
├── notifications/     # 알림 계산 ← NEW
├── learning-archives/ # 플레이북 CRUD
├── seminar/           # 세미나 세션 관리
├── datasets/          # 데이터셋 CRUD
├── approvals/         # 승인 처리
└── ...

components/
├── app-nav.tsx        # 사이드바 네비게이션
├── create-campaign-room-dialog.tsx  ← NEW
├── approval-action-list.tsx
└── ...

lib/
├── campaign-rooms.ts  # 캠페인 룸 집계 (수동 룸 포함)
├── llm.ts             # LLM 추상화 (OpenAI/Gemini/Groq)
├── prisma.ts          # Prisma 클라이언트
└── ...

prisma/
└── schema.prisma      # 전체 스키마
```

---

## Prisma 모델 현황

| 모델 | 설명 |
|------|------|
| `Run` | 전략 회의 실행 |
| `Deliverable` | Run 산출물 (캠페인 플랜 등) |
| `MemoryLog` | 실행 메모리 (가설/방향/태그) |
| `MeetingTurn` | 역할별 회의 발언 |
| `Dataset` | CSV/JSON 데이터셋 |
| `LearningArchive` | 플레이북 카드 (DRAFT/CONFIRMED/ARCHIVED) |
| `ManualCampaignRoom` | 수동 생성 캠페인 룸 ← NEW |
| `KpiGoal` | KPI 목표 설정 ← NEW |
| `InstagramReachDaily` | 일별 리치 데이터 |
| `InstagramReachAnalysisRun` | 리치 분석 실행 결과 |

---

## 디자인 시스템 (CSS 변수)

```css
/* globals.css 기준 */
--app-bg: #f5f6f7
--surface: #ffffff
--surface-sub: #f9fafb
--surface-border: #e8ebed
--text-strong: #191f28
--text-base: #333d4b
--text-muted: #6b7684
--accent: #3182f6
--accent-hover: #1b6ef3
--accent-soft: rgba(49, 130, 246, 0.1)
```

**CSS 유틸리티 클래스:**
- `.panel` / `.card` — 기본 카드
- `.soft-panel` / `.soft-card` — 서브 카드
- `.list-card` / `.list-card-active` — 클릭 가능 리스트 아이템
- `.status-tile` / `.metric-card` — KPI 타일
- `.button-primary` / `.button-secondary` — 버튼
- `.input` — 텍스트 입력
- `.accent-pill` / `.pill-option` — 뱃지/태그
- `.section-title` / `.dashboard-title` / `.dashboard-eyebrow` — 타이포

---

## 남은 작업 (로드맵)

### 2단계 잔여
- [ ] 메인 페이지(`/`) 런타임 오류 확인 및 수정
- [ ] 알림 인박스 — 서버 컴포넌트 내 절대 URL fetch 개선 (직접 함수 호출로 전환)

### 3단계 (Supabase 연동 이후)
- [ ] 팀 협업 — 워크스페이스 멤버 초대, 권한 관리
- [ ] 캠페인 캘린더 — 일정 기반 실행 계획
- [ ] 성과 통합 대시보드 — Instagram + KPI + 실행 통합 뷰
- [ ] 이메일 로그인 (Supabase Auth rate limit 해결 후)

### 기술 부채
- [ ] `prisma db push --force-reset` 대신 `migrate dev` 마이그레이션 관리 전환
- [ ] 메인 페이지 `text-slate-*` 색상 토큰 적용
- [ ] 캠페인 스튜디오 히어로 패널 글래스모피즘 제거

---

## Git 커밋 히스토리

```
58b2c93  feat(2단계): KPI goals, content studio, notifications, nav icons
3c42ef9  feat(learning): add explicit confirm button for DRAFT playbook cards
124cbf2  feat(campaigns): add manual campaign room creation
a8ccac7  refactor(operations): migrate to Toss-style design tokens
cc0083f  Add project MCP server config (.mcp.json)
86e5435  Initial commit — Garnet AI 마케팅 워크스페이스 v0.2.0
```

---

## 환경 설정

- **Node.js**: 프로젝트 루트 `.env` 파일에 API 키 관리
- **Electron**: `electron/main.ts` — safeStorage, OAuth popup, auto-updater
- **MCP**: `.mcp.json` — Claude Code에서 내부 DB 직접 접근
- **GitHub**: `gh` CLI로 관리 (`mark02252/garnet-ai`)
