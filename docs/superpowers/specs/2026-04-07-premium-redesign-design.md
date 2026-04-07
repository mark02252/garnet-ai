---
title: "Garnet Premium Redesign"
category: "spec"
owner: "rnr"
audience: "developer"
doc_kind: "design-spec"
tags: ["ui", "ux", "redesign", "accessibility", "navigation"]
created: 2026-04-07
updated: 2026-04-07
---

# Garnet Premium Redesign

## 목표

가독성/접근성 문제를 해결하고, 럭셔리/정제된 톤으로 전체 UI를 업그레이드한다. 컬랩서블 사이드바로 공간 효율을 극대화하고, Shell/Flow 등 몰입형 페이지의 경험을 개선한다.

## 1. 색상 시스템 리뉴얼

### 1.1 액센트: Cyan → Teal

```
변경 전                    변경 후
--accent:       #00d4ff  → #00BFA6
--accent-hover: #00b8d9  → #00A896
--accent-soft:  rgba(0,212,255,0.08) → rgba(0,191,166,0.08)
--accent-rgb:   0,212,255 → 0,191,166
--accent-glow:  rgba(0,212,255,0.2) → rgba(0,191,166,0.2)
--accent-secondary: #0066ff → #0088cc
```

**버튼 텍스트 색상:** 흰색(#FFFFFF) on #00BFA6 = 2.4:1로 WCAG 실패.
`.button-primary`의 `color: #ffffff` → `color: #00201a` (다크 텍스트)로 변경.
이로써 대비 비율 약 8.5:1 달성.

### 1.1.1 하드코딩된 cyan 값 전수 교체

`globals.css`에서 CSS 변수가 아닌 직접 하드코딩된 `#00d4ff` / `rgba(0,212,255,...)` 값을 모두 teal로 교체:

| 대상 | 라인 | 내용 |
|------|------|------|
| `.app-shell` SVG 패턴 | 87 | `%2300d4ff` → `%2300BFA6` |
| `.canvas-hex-grid` SVG 패턴 | 729 | `%2300d4ff` → `%2300BFA6` |
| `.lb-tl/tr/bl/br` 코너 데코 | 822-878 | `background: #00d4ff` → `background: var(--accent)` |
| `.cmd-wrapper` 보더 | 787-793 | `rgba(0,212,255,...)` → `rgba(var(--accent-rgb),...)` |
| `.cmd-typing` 키프레임 | 797-800 | `rgba(0,212,255,...)` → `rgba(var(--accent-rgb),...)` |
| `.panel-glow-pulse` 키프레임 | 777-783 | `rgba(0,212,255,...)` → `rgba(var(--accent-rgb),...)` |
| `.signal-feed-scroll` 스크롤바 | 884 | `rgba(0,212,255,0.2)` → `rgba(var(--accent-rgb),0.2)` |
| `.status-badge-running` | 474-478 | 하드코딩 → `var(--status-running)` 사용 |

총 약 20곳. 교체 후 향후 색상 변경 시 변수만 수정하면 됨.

### 1.2 대비 수정 (WCAG AA 준수)

```
변경 전                    변경 후           대비(on #050810)
--text-muted:    #6090a8 → #8ab4cc          4.8:1 ✓
--text-disabled: #2a4a60 → #4a7090          3.2:1 (비활성 적합)
--text-secondary:#7abccc → #90d0e0          5.1:1 ✓
```

### 1.3 Shell 테마 대비 수정

```
--shell-text-muted: #3a6080 → #6a9aba       4.6:1 ✓ (AA 준수)
--shell-border:     rgba(0,212,255,0.15) → rgba(0,191,166,0.15)
--shell-accent:     #00d4ff → #00BFA6
```

`--shell-text-muted`는 실행 로그 등 정보성 텍스트에 사용되므로 AA 4.5:1 이상 필수.

### 1.4 상태 색상 (유지, teal과 충돌 없음 확인)

```
--status-active:    #00ff88  (green — 유지)
--status-paused:    #ffaa00  (orange — 유지)
--status-completed: #00BFA6  (teal로 변경)
--status-failed:    #ff4466  (red — 유지)
--status-running:   #22d3ee  (밝은 cyan — completed와 구분)
--status-draft:     #4a7090  (기존 #3a6080에서 대비 개선)
```

**completed vs running 구분:** completed=#00BFA6(teal), running=#22d3ee(cyan) + pulse 애니메이션.
색각 이상(deuteranopia) 대응: running은 항상 `.dot-running` 펄스 애니메이션 병행.

**status-badge 클래스:** 하드코딩된 색상을 CSS 변수 참조로 교체.
```css
.status-badge-running {
  background: rgba(var(--status-running-rgb), 0.12);
  color: var(--status-running);
  border: 1px solid rgba(var(--status-running-rgb), 0.25);
}
```

### 1.5 보더/서피스 teal 반영

```
--surface-border:        rgba(0,191,166,0.22)
--surface-border-strong: rgba(0,191,166,0.4)
--surface-hover:         rgba(0,191,166,0.05)
--border:                rgba(0,191,166,0.15)
```

## 2. 타이포그래피

### 2.1 폰트 페어링

- **디스플레이**: `Cormorant Garamond` (Google Fonts) — 대시보드 타이틀, 히어로, 브랜드 텍스트
  - Weight: 600, 700
  - 사용처: `.dashboard-title`, `.brand-title`, 히어로 섹션 타이틀
- **본문**: `Pretendard` (기존) — 모든 UI 텍스트, 라벨, 본문
  - Fallback: `'Apple SD Gothic Neo', system-ui, sans-serif`
- **모노스페이스**: `JetBrains Mono` (기존) — Shell, 코드, 실행 로그

### 2.2 폰트 사이즈 최소값 통일

```
변경 전         변경 후         대상
9px  (jarvis)  → 11px          .jarvis-label
11px (badges)  → 12px          .status-badge, .dashboard-eyebrow
12px (labels)  → 13px          .metric-label
13px (nav)     → 14px          nav labels
```

모든 본문/라벨 텍스트 최소 11px (장식용), 정보성 텍스트 최소 13px, 인터랙티브 요소 최소 14px.

### 2.3 레터 스페이싱 개선

```
.dashboard-title: letter-spacing -0.03em → -0.02em (Cormorant은 자간이 넉넉)
.section-title: letter-spacing -0.02em (유지)
.jarvis-label: letter-spacing 2px → 1.5px (과도한 자간 완화)
```

## 3. 컬랩서블 사이드바

### 3.1 동작

| 상태 | 너비 | 표시 |
|------|------|------|
| 접힌 상태 (기본) | 60px | 아이콘만 + 툴팁 |
| 펼친 상태 | 200px | 아이콘 + 라벨 |
| Shell/Flow 페이지 | 60px (강제 접힘) | 아이콘만 |

### 3.2 토글 방식

- 사이드바 하단 토글 버튼 (chevron 아이콘)
- 접힌 상태에서 hover 시 200px로 오버레이 확장 (push 아님, `z-index: 30`)
- Shell/Flow에서는 hover 확장만 허용, 고정 펼침 불가
- 사용자 선택 `localStorage` 키: `garnet-sidebar-collapsed`
- **키보드:** `Cmd+B` (Mac) / `Ctrl+B` (Windows)로 토글
- **접힌 상태에서 키보드 포커스:** 아이콘에 포커스 시 툴팁 표시 + `aria-label`로 라벨 제공

### 3.2.1 모바일/반응형 (< 1024px)

- 사이드바 완전 숨김 → 탑바 좌측에 햄버거 버튼
- 햄버거 클릭 시 전체 높이 드로어로 슬라이드 (오버레이 + 백드롭)
- 드로어 `z-index: 40`, 백드롭 클릭 시 닫힘

### 3.3 애니메이션

```
transition: width 200ms cubic-bezier(0.4, 0, 0.2, 1)
```

아이콘 → 라벨 전환: `opacity 150ms, transform 150ms`

### 3.4 아이콘 레일 레이아웃

```
[로고 마크]          ← 28px 로고 (접힘 시)
─────────
[셸 아이콘]
[운영 아이콘]
[캠페인 아이콘]
[플로우 아이콘]
[세미나 아이콘]
─── 구분선 ───
[데이터셋]
[학습]
[대시보드]
─────────
[설정 아이콘]        ← 하단 고정
[토글 버튼]          ← 하단 고정
```

핵심 기능 5개 (상단) / 보조 기능 3개 (하단) / 설정+토글 (바닥)

### 3.5 현재 22개 네비 항목 → 8개 아이콘 매핑

현재 `app-nav.tsx`의 그룹/항목을 아이콘 레일로 축약:

| 아이콘 슬롯 | 현재 항목 | 매핑 |
|-------------|----------|------|
| 셸 | 에이전트 셸 | 단일 |
| 운영 | 오늘의 브리핑 | 단일 |
| 캠페인 | 캠페인 스튜디오 | 단일 |
| 플로우 | 플로우 빌더 | 단일 |
| 세미나 | 세미나 스튜디오 | 단일 |
| 데이터 | 인사이트 센터, SNS 인사이트 | 펼침 시 서브메뉴 |
| 학습 | 운영 플레이북, 실행 아카이브, 학습 대시보드 | 펼침 시 서브메뉴 |
| 설정 | 관리자 설정 | 단일 |

기존의 세부 항목(SNS, 아카이브 등)은 펼친 상태에서만 서브메뉴로 노출.

### 3.5 구현 파일

| 구분 | 파일 | 변경 |
|------|------|------|
| 수정 | `components/app-nav.tsx` | 컬랩서블 로직, 아이콘 레일, 호버 확장 |
| 수정 | `app/(domains)/layout.tsx` | grid 레이아웃 동적 변경 |
| 수정 | `app/globals.css` | `.app-sidebar` 너비 전환 스타일 |
| 신규 | `lib/sidebar-store.ts` | Zustand: collapsed 상태 + localStorage 동기화 |

## 4. UX 치명적 수정

### 4.1 에러 상태 탈출 경로

모든 에러 상태에 "← 뒤로가기" 또는 "다시 시도" 버튼 추가:

| 페이지 | 파일 | 수정 |
|--------|------|------|
| Flow 에디터 로드 실패 | `flow/[id]/page.tsx` | "← 플로우 목록으로" 링크 |
| 대시보드 로드 실패 | `dashboard/page.tsx` | "다시 시도" 버튼 |
| 캠페인 빈 상태 | `campaigns/page.tsx` | 빈 상태 vs 에러 시각적 구분 |

### 4.2 빈 상태 vs 에러 상태 구분

```
빈 상태: surface-note (teal 테두리, 안내 텍스트 + CTA)
에러 상태: 새 .error-note (red 테두리, 에러 메시지 + 재시도)
```

### 4.3 버튼 피드백

- 모든 비동기 CTA에 로딩 스피너 추가
- `disabled` 상태: `opacity: 0.5` → `opacity: 0.4` + `cursor: wait`
- 저장 버튼: `text-xs` → `text-sm`, 저장 완료 시 일시적 체크마크

### 4.4 포커스 링 전역 추가

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

## 5. 모션 & 전환

### 5.1 페이지 전환

Framer Motion `AnimatePresence` + `layout` 패턴:

```tsx
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2, ease: 'easeOut' }}
>
```

모든 `app/(domains)/*/page.tsx`에 적용.

### 5.2 스켈레톤 로더

새 공통 컴포넌트 `components/skeleton.tsx`:

```tsx
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[var(--surface-sub)] ${className}`} />
}
```

적용 페이지: campaigns, dashboard, flow 목록

### 5.3 카드 호버 효과

```css
.list-card:hover {
  border-color: var(--surface-border-strong);
  background: var(--surface-sub);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
```

### 5.4 사이드바 전환 모션

```css
.app-sidebar {
  transition: width 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
.sidebar-label {
  transition: opacity 150ms, transform 150ms;
}
.app-sidebar[data-collapsed] .sidebar-label {
  opacity: 0;
  transform: translateX(-8px);
}
```

## 6. Flow Builder 노드 비주얼 개선

### 6.1 노드 글로우

실행 중 노드에 teal 글로우:

```css
.react-flow__node[data-status='running'] {
  box-shadow: 0 0 12px rgba(0,191,166,0.4);
}
```

### 6.2 엣지 애니메이션

실행 중 엣지에 dash 애니메이션:

```css
.react-flow__edge-path[data-animated] {
  stroke-dasharray: 5;
  animation: flow-dash 1s linear infinite;
}
@keyframes flow-dash {
  to { stroke-dashoffset: -10; }
}
```

### 6.3 Debate 노드 (새 디자인)

- 보라색(`#A78BFA`) 계열 테두리
- "⚔" 아이콘 + 라운드 수 표시
- 실행 중: 찬성(teal)/반대(rose) 번갈아 글로우

## 7. 전체 변경 파일 목록

| 구분 | 파일 | 변경 |
|------|------|------|
| 수정 | `app/globals.css` | 전체 색상 토큰, 대비, 폰트, 모션, 포커스 링, 에러 상태 |
| 수정 | `app/layout.tsx` | Cormorant Garamond 폰트 import |
| 수정 | `app/(domains)/layout.tsx` | 동적 grid (컬랩서블 대응) |
| 수정 | `components/app-nav.tsx` | 컬랩서블 사이드바 전체 리팩토링 |
| 수정 | `app/(domains)/flow/[id]/page.tsx` | 에러 탈출, 저장 피드백 |
| 수정 | `app/(domains)/dashboard/page.tsx` | 에러 복구, 스켈레톤 |
| 수정 | `app/(domains)/campaigns/page.tsx` | 빈/에러 구분, 스켈레톤, 폰트 사이즈 |
| 수정 | `app/(domains)/flow/[id]/components/FlowCanvas.tsx` | 노드 글로우, 엣지 애니메이션 |
| 수정 | `app/(domains)/flow/[id]/components/nodes/*.tsx` | teal 색상 반영 |
| 수정 | `components/agent-shell/*.tsx` | teal 색상, shell 토큰 |
| 수정 | `components/agent-shell/flow-preview-panel.tsx` | SVG 색상 teal 반영 |
| 신규 | `lib/sidebar-store.ts` | 사이드바 상태 Zustand 스토어 |
| 신규 | `components/skeleton.tsx` | 스켈레톤 로더 공통 컴포넌트 |
