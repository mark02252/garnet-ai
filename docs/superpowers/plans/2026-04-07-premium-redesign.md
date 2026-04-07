# Garnet Premium Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teal 테마, WCAG AA 대비, 럭셔리 타이포그래피, 컬랩서블 사이드바로 가넷 UI를 프리미엄 수준으로 업그레이드한다.

**Architecture:** CSS 변수 기반 토큰 시스템을 수정하여 전역 색상/폰트를 변경하고, 사이드바를 Zustand + CSS transition으로 컬랩서블화한다. UX 결함은 각 페이지에서 개별 수정한다.

**Tech Stack:** Next.js 15, Tailwind CSS, CSS Variables, Zustand, Framer Motion, Google Fonts (Cormorant Garamond)

**Spec:** `docs/superpowers/specs/2026-04-07-premium-redesign-design.md`

---

## Chunk 1: 색상 시스템 + 대비 + 타이포그래피 (globals.css 집중)

### Task 1: CSS 변수 토큰 — 액센트/대비/상태 전체 교체

**Files:**
- Modify: `app/globals.css:5-66`

- [ ] **Step 1: 액센트 토큰 변경**

`app/globals.css` `:root` 블록에서:

```css
/* 변경 전 → 변경 후 */
--accent: #00d4ff;          → --accent: #00BFA6;
--accent-hover: #00b8d9;    → --accent-hover: #00A896;
--accent-soft: rgba(0,212,255,0.08); → --accent-soft: rgba(0,191,166,0.08);
--accent-rgb: 0,212,255;    → --accent-rgb: 0,191,166;
--accent-glow: rgba(0,212,255,0.2); → --accent-glow: rgba(0,191,166,0.2);
--accent-secondary: #0066ff; → --accent-secondary: #0088cc;
```

- [ ] **Step 2: 텍스트 대비 토큰 변경**

```css
--text-muted: #6090a8;      → --text-muted: #8ab4cc;
--text-secondary: #7abccc;  → --text-secondary: #90d0e0;
--text-disabled: #2a4a60;   → --text-disabled: #4a7090;
```

- [ ] **Step 3: 상태 토큰 변경 + running RGB 추가**

```css
--status-completed: #00d4ff; → --status-completed: #00BFA6;
--status-completed-bg: rgba(0,212,255,0.1); → --status-completed-bg: rgba(0,191,166,0.1);
--status-running: #00d4ff;   → --status-running: #22d3ee;
--status-draft: #3a6080;     → --status-draft: #4a7090;
--status-draft-bg: rgba(58,96,128,0.15); → --status-draft-bg: rgba(74,112,144,0.15);
/* 새로 추가 */
--status-running-rgb: 34,211,238;
```

- [ ] **Step 4: 보더/서피스 토큰 변경**

```css
--surface-border: rgba(0,212,255,0.22);        → --surface-border: rgba(0,191,166,0.22);
--surface-border-strong: rgba(0,212,255,0.4);  → --surface-border-strong: rgba(0,191,166,0.4);
--surface-hover: rgba(0,212,255,0.05);         → --surface-hover: rgba(0,191,166,0.05);
--border: rgba(0,212,255,0.15);                → --border: rgba(0,191,166,0.15);
```

- [ ] **Step 5: 버튼 텍스트 색상 변경**

`.button-primary` (line ~332):

```css
color: #ffffff; → color: #00201a;
```

- [ ] **Step 6: 빌드 확인**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -5`
Expected: 에러 없음 (CSS만 변경)

- [ ] **Step 7: 커밋**

```bash
git add app/globals.css
git commit -m "style: switch accent from cyan to teal + fix WCAG AA contrast"
```

---

### Task 2: 하드코딩된 cyan 값 전수 교체

**Files:**
- Modify: `app/globals.css` (전체)

- [ ] **Step 1: SVG 패턴 색상 교체**

`.app-shell` (line ~87): `%2300d4ff` → `%2300BFA6` (2곳 — 두 개의 hexagon path)
`.canvas-hex-grid` (line ~729): `%2300d4ff` → `%2300BFA6` (2곳)

- [ ] **Step 2: L-bracket 코너 데코를 변수 참조로**

lines 822-878: 모든 `background: #00d4ff` → `background: var(--accent)` (8곳 — ::before/::after × 4 corners)

- [ ] **Step 3: cmd-wrapper/cmd-typing을 변수 참조로**

`.cmd-wrapper` (line ~787):
```css
border-color: rgba(0,212,255,0.25);  → border-color: rgba(var(--accent-rgb),0.25);
```
`.cmd-wrapper.cmd-focused` (line ~791):
```css
border-color: rgba(0,212,255,0.6);   → border-color: rgba(var(--accent-rgb),0.6);
box-shadow: 0 0 0 1px rgba(0,212,255,0.2), 0 0 20px rgba(0,212,255,0.1);
→ box-shadow: 0 0 0 1px rgba(var(--accent-rgb),0.2), 0 0 20px rgba(var(--accent-rgb),0.1);
```
`@keyframes cmd-glow` (line ~797):
```css
border-color: rgba(0,212,255,0.4) → rgba(var(--accent-rgb),0.4)
border-color: rgba(0,212,255,0.7) → rgba(var(--accent-rgb),0.7)
```

- [ ] **Step 4: panel-glow-pulse를 변수 참조로**

`@keyframes panel-glow-pulse` (line ~777):
```css
모든 rgba(0,212,255,...) → rgba(var(--accent-rgb),...)
```

- [ ] **Step 5: 기타 하드코딩 교체**

`.signal-feed-scroll` (line ~884):
```css
scrollbar-color: rgba(0,212,255,0.2) → scrollbar-color: rgba(var(--accent-rgb),0.2)
```

`.status-badge-running` (line ~474):
```css
background: rgba(0,212,255,0.12);  → background: rgba(var(--status-running-rgb),0.12);
color: #00d4ff;                     → color: var(--status-running);
border: 1px solid rgba(0,212,255,0.25); → border: 1px solid rgba(var(--status-running-rgb),0.25);
```

`.status-badge-info` (line ~470):
```css
color: var(--accent); (이미 변수 — OK)
```

- [ ] **Step 6: Shell 테마 토큰 변경**

`.shell-theme` (line ~667):
```css
--shell-text-muted: #3a6080;         → --shell-text-muted: #6a9aba;
--shell-border: rgba(0,212,255,0.15); → --shell-border: rgba(0,191,166,0.15);
--shell-border-active: rgba(0,212,255,0.5); → --shell-border-active: rgba(0,191,166,0.5);
--shell-accent: #00d4ff;              → --shell-accent: #00BFA6;
--shell-accent-secondary: #0066ff;    → --shell-accent-secondary: #0088cc;
--shell-accent-glow: rgba(0,212,255,0.2); → --shell-accent-glow: rgba(0,191,166,0.2);
--shell-status-running: #00d4ff;      → --shell-status-running: #22d3ee;
```

- [ ] **Step 7: 전체 검색으로 누락 확인**

Run: `grep -n '00d4ff\|0,212,255\|0, 212, 255' app/globals.css`
Expected: 0 매치 (SVG URL-encoded 제외 — `%2300BFA6`로 이미 교체)

- [ ] **Step 8: 커밋**

```bash
git add app/globals.css
git commit -m "style: replace all hardcoded cyan with CSS variable references"
```

---

### Task 3: 타이포그래피 — Cormorant Garamond + 폰트 사이즈

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: layout.tsx에 Cormorant Garamond import 추가**

`app/layout.tsx`에서 Google Fonts import 부분에 추가:

```typescript
import { Noto_Sans_KR, Cormorant_Garamond } from 'next/font/google'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
  display: 'swap',
})
```

`<body>` 태그의 className에 `${cormorant.variable}` 추가.

- [ ] **Step 2: globals.css에 디스플레이 폰트 적용**

`.dashboard-title` (line ~231):
```css
font-family: var(--font-display, 'Cormorant Garamond'), serif;
letter-spacing: -0.02em;  /* 기존 -0.03em에서 변경 */
```

`.brand-title` (line ~315):
```css
font-family: var(--font-display, 'Cormorant Garamond'), serif;
```

- [ ] **Step 3: 폰트 사이즈 최소값 조정**

```css
.jarvis-label { font-size: 11px; letter-spacing: 1.5px; } /* 기존 9px, 2px */
.status-badge { font-size: 12px; }                        /* 기존 11px */
.dashboard-eyebrow { font-size: 12px; }                   /* 기존 11px */
.metric-label { font-size: 13px; }                        /* 기존 12px */
```

- [ ] **Step 4: 빌드 확인**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -5`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add app/layout.tsx app/globals.css
git commit -m "style: add Cormorant Garamond display font + increase min font sizes"
```

---

### Task 4: 전역 UX 수정 — 포커스 링, 에러 상태, 카드 호버, 스켈레톤

**Files:**
- Modify: `app/globals.css`
- Create: `components/skeleton.tsx`

- [ ] **Step 1: 포커스 링 전역 추가**

`app/globals.css` 하단에:

```css
/* Focus ring for keyboard navigation */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
/* Remove focus ring for mouse clicks */
:focus:not(:focus-visible) {
  outline: none;
}
```

- [ ] **Step 2: 에러 상태 스타일 추가**

```css
.error-note {
  background: rgba(255, 68, 102, 0.08);
  border: 1px solid rgba(255, 68, 102, 0.2);
  color: var(--text-base);
  border-radius: var(--radius);
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.6;
}
.error-note strong {
  color: var(--status-failed);
}
```

- [ ] **Step 3: 카드 호버 개선**

`.list-card:hover` (line ~171) 교체:

```css
.list-card:hover {
  border-color: var(--surface-border-strong);
  background: var(--surface-sub);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  transition: border-color 0.15s, background 0.15s, transform 0.15s, box-shadow 0.15s;
}
```

- [ ] **Step 4: disabled 버튼 개선**

`.button-primary:disabled` + `.button-secondary:disabled`:
```css
opacity: 0.4;
cursor: wait;
```

- [ ] **Step 5: skeleton.tsx 생성**

`components/skeleton.tsx`:

```tsx
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-[var(--surface-sub)] ${className ?? ''}`}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="panel space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-full" />
    </div>
  )
}
```

- [ ] **Step 6: 커밋**

```bash
git add app/globals.css components/skeleton.tsx
git commit -m "style: add focus ring, error-note, card hover, skeleton components"
```

---

## Chunk 2: 컬랩서블 사이드바

### Task 5: Sidebar Zustand 스토어

**Files:**
- Create: `lib/sidebar-store.ts`

- [ ] **Step 1: sidebar-store.ts 작성**

```typescript
import { create } from 'zustand'

type SidebarState = {
  collapsed: boolean
  toggle: () => void
  setCollapsed: (v: boolean) => void
}

const STORAGE_KEY = 'garnet-sidebar-collapsed'

function getInitial(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: getInitial(),
  toggle: () =>
    set((s) => {
      const next = !s.collapsed
      localStorage.setItem(STORAGE_KEY, String(next))
      return { collapsed: next }
    }),
  setCollapsed: (v) => {
    localStorage.setItem(STORAGE_KEY, String(v))
    set({ collapsed: v })
  },
}))
```

- [ ] **Step 2: 커밋**

```bash
git add lib/sidebar-store.ts
git commit -m "feat: add sidebar Zustand store with localStorage sync"
```

---

### Task 6: app-nav.tsx 컬랩서블 리팩토링

**Files:**
- Modify: `components/app-nav.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: globals.css에 사이드바 전환 스타일 추가**

`app/globals.css`에 추가:

```css
/* Collapsible sidebar */
.app-sidebar {
  transition: width 200ms cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
.app-sidebar[data-collapsed='true'] {
  width: 60px;
}
.app-sidebar[data-collapsed='false'] {
  width: 200px;
}
.sidebar-label {
  transition: opacity 150ms, transform 150ms;
  white-space: nowrap;
  overflow: hidden;
}
.app-sidebar[data-collapsed='true'] .sidebar-label {
  opacity: 0;
  transform: translateX(-8px);
  pointer-events: none;
}
/* Hover overlay expansion */
.app-sidebar[data-collapsed='true']:hover {
  width: 200px;
  z-index: 30;
  position: fixed;
  box-shadow: 4px 0 24px rgba(0,0,0,0.3);
}
.app-sidebar[data-collapsed='true']:hover .sidebar-label {
  opacity: 1;
  transform: translateX(0);
}
```

- [ ] **Step 2: app-nav.tsx에 컬랩서블 로직 추가**

`components/app-nav.tsx`에서:

1. Import: `import { useSidebarStore } from '@/lib/sidebar-store'`
2. 컴포넌트 상단에 `const collapsed = useSidebarStore(s => s.collapsed)` 및 `const toggle = useSidebarStore(s => s.toggle)`
3. 루트 `<nav>` 요소에 `data-collapsed={collapsed}` 추가
4. 각 네비 항목의 라벨을 `<span className="sidebar-label">` 으로 감싸기
5. 사이드바 하단에 토글 버튼:

```tsx
<button
  onClick={toggle}
  className="flex items-center justify-center w-full py-2 text-[var(--text-muted)] hover:text-[var(--accent)]"
  aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
>
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    {collapsed
      ? <path d="M6 3l5 5-5 5" /> /* chevron-right */
      : <path d="M10 3l-5 5 5 5" /> /* chevron-left */
    }
  </svg>
</button>
```

6. 접힌 상태에서 각 아이콘에 `title` 속성으로 툴팁 제공

- [ ] **Step 3: Cmd+B 키보드 단축키**

`app/(domains)/layout.tsx`에 키보드 이벤트 리스너 추가:

```tsx
'use client'
import { useEffect } from 'react'
import { useSidebarStore } from '@/lib/sidebar-store'

// layout 내부에서:
useEffect(() => {
  function handleKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault()
      useSidebarStore.getState().toggle()
    }
  }
  window.addEventListener('keydown', handleKey)
  return () => window.removeEventListener('keydown', handleKey)
}, [])
```

- [ ] **Step 4: layout.tsx grid 동적 변경**

`app/(domains)/layout.tsx`에서:

```tsx
const collapsed = useSidebarStore(s => s.collapsed)

<div className={`grid min-h-screen grid-cols-1 lg:grid-cols-[${collapsed ? '60px' : '200px'}_1fr]`}>
```

또는 인라인 스타일:

```tsx
<div
  className="grid min-h-screen grid-cols-1"
  style={{ gridTemplateColumns: `${collapsed ? '60px' : '200px'} 1fr` }}
>
```

- [ ] **Step 5: Shell/Flow 페이지 자동 접힘**

`app/(shell)/layout.tsx`에서 사이드바가 없으므로 변경 불필요 (Shell은 별도 route group).

Flow 에디터 (`app/(domains)/flow/[id]/page.tsx`): 페이지 마운트 시 `useSidebarStore.getState().setCollapsed(true)`, 언마운트 시 복원:

```tsx
useEffect(() => {
  const prev = useSidebarStore.getState().collapsed
  useSidebarStore.getState().setCollapsed(true)
  return () => useSidebarStore.getState().setCollapsed(prev)
}, [])
```

- [ ] **Step 6: 타입 체크 + 빌드**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -10`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add components/app-nav.tsx app/globals.css app/\(domains\)/layout.tsx app/\(domains\)/flow/\[id\]/page.tsx
git commit -m "feat: collapsible sidebar with hover expansion and keyboard shortcut"
```

---

### Task 7: 모바일 반응형 — 햄버거 드로어

**Files:**
- Modify: `components/app-nav.tsx`
- Modify: `app/(domains)/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: globals.css에 모바일 사이드바 스타일**

```css
@media (max-width: 1023px) {
  .app-sidebar {
    position: fixed;
    top: 0; left: 0; bottom: 0;
    z-index: 40;
    transform: translateX(-100%);
    transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
    width: 200px !important;
  }
  .app-sidebar[data-mobile-open='true'] {
    transform: translateX(0);
  }
  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 39;
  }
}
```

- [ ] **Step 2: layout.tsx에 햄버거 버튼 + 백드롭**

모바일에서만 표시되는 햄버거 버튼을 topbar에 추가:

```tsx
<button className="lg:hidden p-2" onClick={() => setMobileOpen(true)} aria-label="메뉴 열기">
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
    <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" />
  </svg>
</button>
```

백드롭:
```tsx
{mobileOpen && <div className="sidebar-backdrop lg:hidden" onClick={() => setMobileOpen(false)} />}
```

- [ ] **Step 3: app-nav.tsx에 data-mobile-open 전달**

Nav 컴포넌트에 `mobileOpen` prop 추가, `<nav data-mobile-open={mobileOpen}>` 적용.

- [ ] **Step 4: 커밋**

```bash
git add components/app-nav.tsx app/\(domains\)/layout.tsx app/globals.css
git commit -m "feat: mobile responsive sidebar with hamburger drawer"
```

---

## Chunk 3: 페이지별 UX 수정

### Task 8: Flow 에디터 — 에러 탈출 + 저장 피드백

**Files:**
- Modify: `app/(domains)/flow/[id]/page.tsx`

- [ ] **Step 1: 에러 표시에 뒤로가기 링크 추가**

현재 에러 표시 부분을:

```tsx
<div className="flex h-full items-center justify-center flex-col gap-3">
  <p className="text-sm text-[var(--status-failed)]">{loadError}</p>
  <a href="/flow" className="button-secondary text-sm">← 플로우 목록으로</a>
</div>
```

- [ ] **Step 2: 저장 버튼 크기 + 피드백**

저장 버튼: `text-xs` → `text-sm`. 저장 완료 시 2초간 "✓ 저장됨" 표시:

```tsx
const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

// 저장 후:
setSaveStatus('saved')
setTimeout(() => setSaveStatus('idle'), 2000)

// 버튼 텍스트:
{saveStatus === 'saving' ? '저장 중...' : saveStatus === 'saved' ? '✓ 저장됨' : '저장'}
```

- [ ] **Step 3: 커밋**

```bash
git add app/\(domains\)/flow/\[id\]/page.tsx
git commit -m "fix: add error recovery and save feedback in flow editor"
```

---

### Task 9: 대시보드 — 에러 복구 + 스켈레톤

**Files:**
- Modify: `app/(domains)/dashboard/page.tsx`

- [ ] **Step 1: 에러 상태에 재시도 버튼**

```tsx
if (error || !data) {
  return (
    <div className="p-6 space-y-3">
      <div className="error-note">
        <strong>오류:</strong> {error || '데이터를 불러오지 못했습니다.'}
      </div>
      <button onClick={() => loadDashboard(days)} className="button-secondary text-sm">
        다시 시도
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 로딩 시 스켈레톤**

```tsx
import { SkeletonCard } from '@/components/skeleton'

if (loading) {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 커밋**

```bash
git add app/\(domains\)/dashboard/page.tsx
git commit -m "fix: add error recovery and skeleton loader to dashboard"
```

---

### Task 10: 캠페인 — 빈/에러 구분 + 폰트 사이즈

**Files:**
- Modify: `app/(domains)/campaigns/page.tsx`

- [ ] **Step 1: 빈 상태와 에러 상태 분리**

빈 상태 (데이터 0개): `.surface-note` 유지
에러 상태 (API 실패): `.error-note` 사용

- [ ] **Step 2: 배지 폰트 사이즈**

`text-[11px]` → `text-xs` (12px) 로 교체.

- [ ] **Step 3: 커밋**

```bash
git add app/\(domains\)/campaigns/page.tsx
git commit -m "fix: distinguish empty vs error states, increase badge font size"
```

---

## Chunk 4: 모션 + Flow 비주얼

### Task 11: 페이지 전환 모션

**Files:**
- Create: `components/page-transition.tsx`
- Modify: `app/(domains)/layout.tsx`

- [ ] **Step 1: page-transition.tsx 생성**

```tsx
'use client'

import { motion } from 'framer-motion'

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
```

- [ ] **Step 2: 주요 페이지에 적용**

각 `page.tsx`의 최상위 반환 JSX를 `<PageTransition>` 으로 감싸기:
- `operations/page.tsx`
- `campaigns/page.tsx`
- `dashboard/page.tsx`
- `flow/page.tsx`
- `seminar/page.tsx`

- [ ] **Step 3: 커밋**

```bash
git add components/page-transition.tsx app/\(domains\)/*/page.tsx
git commit -m "feat: add page transition animations with framer-motion"
```

---

### Task 12: Flow Builder 노드 비주얼 — 글로우 + 엣지

**Files:**
- Modify: `app/globals.css`
- Modify: `app/(domains)/flow/[id]/components/FlowCanvas.tsx`
- Modify: `app/(domains)/flow/[id]/components/nodes/AgentNode.tsx`

- [ ] **Step 1: globals.css에 Flow 노드 글로우 + 엣지 애니메이션**

```css
/* Flow node glow */
.react-flow__node[data-status='running'] {
  box-shadow: 0 0 12px rgba(var(--accent-rgb), 0.4);
  transition: box-shadow 0.3s;
}
.react-flow__node[data-status='done'] {
  box-shadow: 0 0 8px rgba(0, 255, 136, 0.3);
}

/* Flow edge dash animation */
@keyframes flow-dash {
  to { stroke-dashoffset: -10; }
}
.react-flow__edge-path[data-animated='true'] {
  stroke-dasharray: 5;
  animation: flow-dash 1s linear infinite;
}
```

- [ ] **Step 2: AgentNode 색상 teal 반영**

`AgentNode.tsx`의 `MODEL_COLOR` 맵에서 기존 cyan 참조를 teal로 교체 (이미 Tailwind 클래스 사용이면 변경 불필요 — CSS 변수로 처리됨).

`FlowCanvas.tsx`에서 실행 상태에 따라 노드에 `data-status` 속성 주입.

- [ ] **Step 3: 커밋**

```bash
git add app/globals.css app/\(domains\)/flow/\[id\]/components/FlowCanvas.tsx app/\(domains\)/flow/\[id\]/components/nodes/AgentNode.tsx
git commit -m "feat: add flow node glow and edge dash animation"
```

---

### Task 13: Agent Shell 컴포넌트 teal 반영

**Files:**
- Modify: `components/agent-shell/flow-preview-panel.tsx`
- Modify: `components/agent-shell/command-bar.tsx`
- Modify: `components/agent-shell/canvas-panel.tsx`

- [ ] **Step 1: flow-preview-panel.tsx SVG 색상**

`STATUS_COLOR` 맵 (line ~15):
```typescript
running: '#00d4ff' → running: '#22d3ee'
done: '#22c55e' (유지)
```

`MiniFlowDiagram`의 하드코딩된 `#1a3050`, `#4a6a7a` 등은 현재 테마에 맞게 조정.

- [ ] **Step 2: command-bar.tsx 인라인 스타일**

하드코딩된 `rgba(0,212,255,...)` 인라인 스타일을 CSS 변수 참조로:
- border 관련: `var(--shell-border)` 또는 `rgba(var(--accent-rgb),...)`
- `#00d4ff` → `var(--accent)` or `var(--shell-accent)`

- [ ] **Step 3: canvas-panel.tsx 색상**

하드코딩된 teal/cyan 색상을 CSS 변수로.

- [ ] **Step 4: 커밋**

```bash
git add components/agent-shell/
git commit -m "style: update agent shell components to teal theme"
```

---

### Task 14: 통합 검증

- [ ] **Step 1: 전체 타입 체크**

Run: `npx tsc --noEmit --pretty false`
Expected: 에러 없음

- [ ] **Step 2: 전체 빌드**

Run: `npm run build:next 2>&1 | tail -20`
Expected: 빌드 성공

- [ ] **Step 3: cyan 잔여 확인**

Run: `grep -rn '00d4ff\|0,212,255' app/ components/ lib/ --include='*.tsx' --include='*.ts' --include='*.css' | grep -v node_modules | grep -v '.next'`
Expected: 0 매치 (또는 주석만)

- [ ] **Step 4: 수동 테스트**

1. 모든 페이지 탐색 — teal 색상 일관성 확인
2. Shell 입력 → 실행 — teal 글로우/보더 확인
3. Flow 빌더 → 실행 — 노드 글로우, 엣지 애니메이션
4. 사이드바 접기/펼치기 — 200ms 전환, hover 확장
5. `Cmd+B` 단축키 동작
6. 모바일 뷰포트 (DevTools) — 햄버거 드로어
7. 키보드 탭 이동 — 포커스 링 확인
8. Flow 에디터 에러 상태 → "← 목록으로" 링크
9. 대시보드 에러 → "다시 시도" 버튼
