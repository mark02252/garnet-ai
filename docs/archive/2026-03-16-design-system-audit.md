# Garnet 디자인 시스템 감사 및 개선 작업 기록

> 작업 일자: 2026-03-16
> 커밋 범위: `4cb38b5` → `e2bc8bd`
> 작업자: Claude Sonnet 4.6 + rnr

---

## 1. 작업 배경

Garnet은 Toss Business 스타일의 디자인 시스템을 채택하고 있다.
CSS 변수 기반 토큰(`--text-strong`, `--accent`, `--surface-border` 등)과 유틸리티 클래스(`.panel`, `.soft-panel`, `.list-card` 등)를 기준으로 삼는다.

이번 작업의 목적:
1. 전체 페이지에서 디자인 시스템 위반 사항을 찾아 수정
2. `오늘의 마케팅 브리핑`에서 "마케팅" 제거 — 특정 도메인에 한정되지 않는 방향으로
3. 전체 페이지 UX/UI 전문성 검토

---

## 2. 금지 패턴 (디자인 시스템 위반)

| 금지 패턴 | 올바른 대체 |
|-----------|------------|
| `text-slate-950` | `text-[var(--text-strong)]` |
| `text-slate-800`, `text-slate-900` | `text-[var(--text-strong)]` |
| `text-slate-600`, `text-slate-700` | `text-[var(--text-base)]` |
| `text-slate-400`, `text-slate-500` | `text-[var(--text-muted)]` |
| `bg-sky-100 text-sky-700` | `bg-[var(--accent-soft)] text-[var(--accent)]` |
| `border-sky-200 bg-sky-50` | `border-[var(--accent)] bg-[var(--accent-soft)]` |
| `bg-sky-500` | `bg-[var(--accent)]` |
| `bg-slate-200` | `bg-[var(--surface-border)]` |
| `bg-slate-100` | `bg-[var(--surface-sub)]` |
| `bg-white/xx` (glassmorphism) | `bg-[var(--surface)]` 또는 `.soft-panel` |
| `rounded-[22px]+` + `shadow-[...]` | `.panel` 또는 `.soft-panel` |
| `border-slate-200 bg-white` | `border-[var(--surface-border)] bg-[var(--surface)]` |

---

## 3. 수정된 파일 목록

### 3.1 커밋 `38ec7e5` (첫 번째 배치)

| 파일 | 주요 수정 내용 |
|------|--------------|
| `app/history/page.tsx` | `text-slate-*` 전수 교체, progress bar `bg-sky-500`/`bg-slate-200` 수정 |
| `app/social/page.tsx` | `text-slate-*` 전수 교체 |
| `app/campaigns/[id]/page.tsx` | `text-slate-*`, `roomStatusTone`/`timelineTone` sky 색상, `coverageTone` progress bar 수정 |
| `app/seminar/page.tsx` | `statusClass` 수정, preset 버튼 glassmorphism 제거 |
| `app/datasets/page.tsx` | hero 카드 glassmorphism 제거, drop zone/library 버튼 수정, table/pre 블록 정리 |
| `app/notifications/page.tsx` | `typeTone` info badge 수정 |
| `components/seminar-report-dashboard.tsx` | `priorityTone`, progress bar, pre 블록 glassmorphism 제거 |

### 3.2 커밋 `e2bc8bd` (두 번째 배치 — 전수 완료)

| 파일 | 주요 수정 내용 |
|------|--------------|
| `app/operations/page.tsx` | 타이틀 "오늘의 브리핑"으로 변경, sky 색상 3곳 수정 |
| `app/campaigns/page.tsx` | `statusTone` READY 상태 sky → accent 수정 |
| `app/dashboard/page.tsx` | 타이틀/카피 개선, `bg-slate-100` 수정 |
| `app/history/page.tsx` | 타이틀 "실행 아카이브", 카피 개선 |
| `app/seminar/sessions/[id]/report/page.tsx` | `text-slate-*`, `text-sky-*` 전수 수정 |
| `app/settings/page.tsx` | `text-slate-*` 전수 교체 (60+ 라인), 선택 버튼 active 상태 수정, wrapper 카드 glassmorphism 제거 |
| `app/not-found.tsx` | `text-slate-600` 수정 |
| `app/auth/callback/page.tsx` | `text-slate-*` 수정 |
| `app/meta/connect/page.tsx` | `text-slate-*` 수정 |
| `components/war-room-evidence-rail.tsx` | `stepTone` running 상태 sky → accent 수정, pending 상태 slate → surface 수정 |
| `components/mcp-connection-hub.tsx` | 선택 상태 glassmorphism 제거, `text-slate-*` 수정 |
| `components/mcp-inspector.tsx` | glassmorphism 완전 제거 (`rounded-[28px] bg-white/84 shadow-[...]` → `.panel`), `text-slate-*` 전수 교체, showcase/trace 카드 정리 |
| `components/meta-connection-panel.tsx` | `text-slate-*` 전수 교체, wrapper 카드 glassmorphism 제거 |
| `components/playwright-smoke-pack.tsx` | `text-slate-*` 전수 교체, input 클래스 통일, 카드 glassmorphism 제거 |
| `components/approval-action-list.tsx` | glassmorphism 카드 → `.list-card`, `text-slate-*` 수정 |
| `components/print-button.tsx` | `text-slate-500` 수정 |
| `components/run-detail-client.tsx` | `bg-slate-100` → `bg-[var(--surface-sub)]` |
| `components/supabase-auth-callback.tsx` | `text-slate-*` 수정 |
| `components/supabase-auth-chip.tsx` | glassmorphism 제거 (nav 상단 auth chip), `bg-slate-300` → CSS 변수 |
| `components/supabase-auth-panel.tsx` | `text-slate-*` 전수 교체 |

---

## 4. 타이틀/카피 변경 내역

| 위치 | 이전 | 이후 | 이유 |
|------|------|------|------|
| `app/operations/page.tsx` h1 | 오늘의 마케팅 브리핑 | 오늘의 브리핑 | 마케팅 도메인에 한정되지 않는 범용 운영 도구로 포지셔닝 |
| `app/operations/page.tsx` copy | 우선순위와 승인 대기만 빠르게 정리했습니다. | 전체 실행 흐름과 지금 당장 처리할 일을 한 화면에서 파악합니다. | 더 포괄적인 가치 전달 |
| `app/dashboard/page.tsx` h1 | 대화 학습 운영 대시보드 | 플레이북 운영 대시보드 | "대화 학습"이라는 기술 용어 대신 업무 언어 사용 |
| `app/dashboard/page.tsx` copy | 어떤 요청 패턴이 재사용 가능한 학습 카드로 | 어떤 실행 패턴이 재사용 가능한 플레이북으로 | 위와 동일 |
| `app/history/page.tsx` h1 | 캠페인 실행 아카이브 | 실행 아카이브 | 마케팅/캠페인 한정 제거 |
| `app/history/page.tsx` copy | 과거 전략 회의 | 과거 전략 실행 | "회의"보다 "실행"이 정확한 표현 |

---

## 5. 전체 페이지 UX/UI 감사 결과

### 5.1 잘 되어 있는 부분

- **반응형 레이아웃**: 모든 페이지가 모바일→데스크탑 grid 전환 잘 처리
- **Empty state**: 거의 모든 섹션에 빈 상태 메시지 존재
- **정보 계층**: hero → KPI tiles → main content → sidebar 패턴 일관됨
- **CSS utility 클래스**: `.panel`, `.soft-panel`, `.list-card`, `.status-tile` 등 일관 사용
- **sticky sidebar**: 모든 주요 페이지에서 `xl:sticky xl:top-24 xl:self-start` 패턴 적용

### 5.2 남은 개선 필요 사항 (다음 작업)

#### 🔴 P1 — status color 토큰화

모든 페이지에서 상태 색상이 Tailwind 하드코딩으로 반복됨:

```tsx
// 현재 (6개 페이지에서 반복)
if (status === 'CONFIRMED') return 'bg-emerald-100 text-emerald-700';
if (status === 'DRAFT') return 'bg-amber-100 text-amber-700';
```

**해결책**: `globals.css`에 `.status-badge-*` 클래스 추가 + `lib/design-tokens.ts`에 `getStatusColor()` 유틸리티 함수 통합

영향 파일:
- `app/operations/page.tsx` — `seminarTone()`, `timelineTone()`
- `app/campaigns/page.tsx` — `statusTone()`
- `app/campaigns/[id]/page.tsx` — `roomStatusTone()`, `timelineTone()`, `coverageTone()`
- `app/seminar/page.tsx` — `statusClass`, 라운드 상태 hex 색상
- `app/learning/page.tsx` — `statusTone()`
- `app/dashboard/page.tsx` — `statusTone()`

#### 🔴 P1 — app-nav.tsx 색상 변수 통일

```tsx
// 현재
'bg-[rgba(49,130,246,0.1)] text-[#3182f6]'  // active
'text-[#6b7684] hover:bg-[#f5f6f7]'          // inactive
'bg-[#e8ebed]'                                // divider

// 개선 후
'bg-[var(--accent-soft)] text-[var(--accent)]'
'text-[var(--text-muted)] hover:bg-[var(--surface-sub)]'
'bg-[var(--surface-border)]'
```

#### 🟡 P2 — Table 스타일 클래스화

`datasets/page.tsx` 테이블이 Tailwind 클래스 직접 적용 중.
→ `globals.css`에 `.data-table`, `.data-table-header`, `.data-table-cell` 클래스 추가

#### 🟡 P2 — seminar/page.tsx 라운드 상태 색상

라운드 로그 섹션에 `#e7f7ee`, `#304f7a`, `#8a3636` 등 hex 직접 사용 중.
→ status badge 시스템 적용 필요

#### 🟢 P3 — 선택적 개선

- Focus visible state 명확화 (접근성)
- Shadow depth 2단계 이상 추가 (`--surface-shadow-sm`, `--surface-shadow-lg`)
- SSR 페이지 에러 state 처리 (operations, campaigns)

---

## 6. globals.css 현재 정의된 주요 토큰

```css
/* Color tokens */
--accent: #3182f6
--accent-soft: #edf3ff (accent 10%)
--text-strong: 최고 대비 (제목)
--text-base: 본문
--text-muted: 보조 텍스트
--surface: 카드 배경
--surface-sub: 약한 배경
--surface-border: 테두리

/* Component classes */
.panel            — 주요 섹션 카드
.soft-panel       — 내부 강조 박스
.soft-card        — hero 영역 카드
.list-card        — 목록 아이템 카드
.list-card-active — 선택된 목록 아이템
.status-tile      — KPI 타일
.metric-label     — KPI 라벨
.button-primary   — 주요 액션 버튼
.button-secondary — 보조 액션 버튼
.pill-option      — 회색 태그 pill
.accent-pill      — 파란 accent pill
.input            — 인풋 필드
.dashboard-hero   — 페이지 상단 hero 섹션
.dashboard-title  — hero h1
.dashboard-copy   — hero 설명 텍스트
.dashboard-eyebrow — hero 상단 레이블
.section-title    — 섹션 h2
```

---

## 7. 유지해야 할 예외

| 패턴 | 위치 | 이유 |
|------|------|------|
| `bg-slate-950 text-slate-100` | `app/datasets/page.tsx:631` | 코드 블록 다크 배경 (의도적) |
| `bg-emerald-*`, `bg-amber-*`, `bg-rose-*` | 모든 페이지 tone 함수 | semantic 상태 색상 (별도 토큰화 예정) |
| `MARKETING_GROWTH` enum 값 | `app/settings/page.tsx` | 내부 식별자, 표시용 텍스트가 아님 |

---

## 8. 다음 작업 체크리스트

- [ ] `globals.css` — `.status-badge-success/warning/error/info/running` 클래스 추가
- [ ] `lib/design-tokens.ts` 생성 — `getStatusColor()` 유틸리티
- [ ] `components/app-nav.tsx` — hex 색상 CSS 변수로 교체
- [ ] `app/seminar/page.tsx` — 라운드 상태 hex 색상 정리
- [ ] `globals.css` — `.data-table` 클래스 추가
- [ ] `app/datasets/page.tsx` — 테이블 클래스 적용
