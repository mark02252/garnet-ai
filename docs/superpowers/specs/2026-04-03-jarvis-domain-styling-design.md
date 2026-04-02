# Garnet Domain Pages — JARVIS 스타일 전체 롤아웃 설계

> 날짜: 2026-04-03
> 상태: 스펙 확정 (v2 — 리뷰 반영)

---

## 1. 목표

현재 Agent Shell (`/(shell)`)에만 적용된 JARVIS 스타일(아크 리액터 사이언 팔레트, 헥스 그리드, 글로우 효과)을 도메인 페이지 전체 (`/(domains)/*`)에 일관되게 적용한다. 모든 페이지가 하나의 커맨드센터처럼 보이도록 한다.

---

## 2. 현재 상태

| 영역 | 현재 스타일 |
|------|------------|
| `/(shell)/*` | JARVIS 완료 (`shell-theme` 클래스, `--shell-*` 토큰) |
| `/(domains)/*` | Toss 스타일 (흰 배경, 파란 accent, `--accent` 등 별도 토큰) |
| `components/app-nav.tsx` | 흰 사이드바, 파란 active 상태 |
| `app/(domains)/layout.tsx` | `app-shell` + `app-topbar` + `app-main` CSS 클래스 사용 |

---

## 3. 구현 전략: CSS 토큰 교체

개별 페이지 컴포넌트를 건드리지 않고, **globals.css의 루트 CSS 변수와 구조 클래스만 교체**한다. 도메인 전체가 동일 토큰(`--accent`, `--surface`, `--text-muted` 등)을 참조하므로 자동 상속된다.

---

## 4. 변경 명세

### 4.1 `app/globals.css`

#### `:root` CSS 변수 전체 교체

현재 `:root` 블록을 아래로 완전 교체. `color-scheme: dark`로 변경해 브라우저 네이티브 컨트롤(스크롤바, select, input)도 다크 모드로 렌더링:

```css
:root {
  color-scheme: dark;

  /* 배경 */
  --app-bg: #050810;
  --bg-base: #050810;
  --bg-sub: #0a0f1a;

  /* 서피스 */
  --surface: rgba(0, 12, 28, 0.92);
  --surface-sub: rgba(0, 20, 40, 0.6);
  --surface-alt: rgba(0, 20, 40, 0.8);
  --surface-border: rgba(0, 212, 255, 0.15);
  --surface-hover: rgba(0, 212, 255, 0.05);

  /* 텍스트 */
  --text-base: #a8d8ff;
  --text-strong: #e8f4ff;
  --text-muted: #3a6080;
  --text-secondary: #6aabcc;

  /* 액센트 */
  --accent: #00d4ff;
  --accent-rgb: 0, 212, 255;
  --accent-hover: #00b8d9;
  --accent-secondary: #0066ff;
  --accent-soft: rgba(0, 212, 255, 0.08);
  --accent-glow: rgba(0, 212, 255, 0.2);

  /* 보더 */
  --border: rgba(0, 212, 255, 0.15);

  /* 상태 색상 */
  --status-success: #00ff88;
  --status-error: #ff4466;
  --status-warning: #ffaa00;
  --status-running: #00d4ff;
}
```

#### 구조 클래스 업데이트

```css
.app-shell {
  background: #050810;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='92'%3E%3Cpath d='M20,1 L39,11.5 L39,34.5 L20,45 L1,34.5 L1,11.5 Z' fill='none' stroke='%2300d4ff' stroke-opacity='0.05' stroke-width='0.5'/%3E%3Cpath d='M60,47 L79,57.5 L79,80.5 L60,91 L41,80.5 L41,57.5 Z' fill='none' stroke='%2300d4ff' stroke-opacity='0.05' stroke-width='0.5'/%3E%3C/svg%3E");
  background-size: 80px 92px;
  min-height: 100vh;
  color: var(--text-base);
}

.app-sidebar {
  background: rgba(0, 12, 28, 0.95);
  border-right: 1px solid rgba(0, 212, 255, 0.15);
  backdrop-filter: blur(16px);
}

.app-topbar {
  background: rgba(0, 8, 20, 0.8);
  border-bottom: 1px solid rgba(0, 212, 255, 0.12);
  backdrop-filter: blur(12px);
  color: var(--text-muted);
}

.app-main {
  background: transparent;
}
```

#### 유틸리티 클래스 추가

```css
.jarvis-card {
  background: rgba(0, 12, 28, 0.92);
  border: 1px solid rgba(0, 212, 255, 0.15);
  border-radius: 12px;
  backdrop-filter: blur(16px);
}

.jarvis-card:hover {
  border-color: rgba(0, 212, 255, 0.3);
  background: rgba(0, 20, 40, 0.9);
}

.jarvis-label {
  font-size: 9px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 2px;
}
```

#### 보조 클래스 다크 모드 수정

**`.surface-note`** — 하드코딩된 `color: #1a4580` 제거:
```css
.surface-note {
  background: rgba(var(--accent-rgb), 0.08);
  border: 1px solid rgba(var(--accent-rgb), 0.2);
  border-radius: 8px;
  padding: 12px 16px;
  color: var(--text-base);   /* #1a4580 → 토큰으로 교체 */
}
```

**상태 뱃지** — 라이트 배경 → 다크 배경으로 교체:
```css
.status-badge-success  { background: rgba(0, 255, 136, 0.12); color: #00ff88; border: 1px solid rgba(0, 255, 136, 0.25); }
.status-badge-warning  { background: rgba(255, 170, 0, 0.12);  color: #ffaa00; border: 1px solid rgba(255, 170, 0, 0.25); }
.status-badge-error    { background: rgba(255, 68, 102, 0.12); color: #ff4466; border: 1px solid rgba(255, 68, 102, 0.25); }
.status-badge-running  { background: rgba(0, 212, 255, 0.12); color: #00d4ff;  border: 1px solid rgba(0, 212, 255, 0.25); }
```

**코파일럿 메시지** — `--surface-alt` 토큰 사용 (`:root`에 추가됨으로 자동 해결):
```css
.copilot-msg-assistant { background: var(--surface-alt, rgba(0, 20, 40, 0.8)); }
```

---

### 4.2 `components/app-nav.tsx`

#### 로고 변경

```tsx
// Before
<span className="flex h-7 w-7 ... bg-[var(--accent-soft)] text-[13px] font-bold">G</span>
<span className="text-[15px] font-bold text-[var(--text-strong)]">Garnet</span>

// After
<span className="flex h-7 w-7 ... bg-[var(--accent-soft)] border border-[var(--surface-border)] text-[12px] font-bold text-[var(--accent)]">◈</span>
<span className="text-[13px] font-bold text-[var(--text-base)] tracking-[2px]">GARNET</span>
```

#### 그룹 레이블 변경

```tsx
// Before
<p className="... text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] opacity-60">

// After
<p className="... text-[8px] font-semibold uppercase tracking-[2px] text-[var(--text-muted)]">
```

#### Active 아이템 스타일

```tsx
// active className
'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--surface-border)]'

// active indicator bar — 글로우 추가 (--accent-glow는 :root 업데이트 후 유효)
<span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--accent)] shadow-[0_0_6px_var(--accent-glow)]" />
```

---

### 4.3 `app/(domains)/layout.tsx`

```tsx
// Before
<p className="text-[13px] font-semibold text-[#333d4b]">Garnet</p>

// After
<p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--text-muted)]">Garnet OS</p>
```

---

### 4.4 Recharts 색상 업데이트

차트 색상은 prop으로 직접 전달되므로 각 파일에서 수동 교체. 아래 색상 맵을 기준으로 파일 전체 검색·교체:

**색상 치환 맵 (공통):**
| 기존 | 변경 | 용도 |
|------|------|------|
| `#3b82f6` | `#00d4ff` | Primary metric (blue → cyan) |
| `#6366f1` | `#0066ff` | Secondary metric (indigo → electric blue) |
| `#8b5cf6` | `#6aabcc` | Tertiary (purple → muted blue) |
| `#10b981` | `#00ff88` | Positive/growth (green → neon green) |
| `#f59e0b` | `#ffaa00` | Warning/neutral (amber → amber 유지) |
| `#94a3b8` | `#3a6080` | Muted/inactive (slate → dark muted) |
| `#ef4444` | `#ff4466` | Error/negative (red → hot red) |
| `#22c55e` | `#00ff88` | Positive/success (green — analytics 전용) |
| `#f97316` | 유지 | MEDIUM priority 지시자 — 의도적 orange 유지 |

**`app/(domains)/dashboard/page.tsx`:**
- Recharts stroke/fill 색상 치환 (위 맵 적용)
- 인라인 `style={{ borderTop: '4px solid #8b5cf6' }}` → `style={{ borderTop: '4px solid #6aabcc' }}`

**`app/(domains)/sns/analytics/page.tsx`:**
- Recharts stroke/fill 색상 치환 (위 맵 적용)

**`app/(domains)/analytics/page.tsx`:**
- Recharts stroke/fill/stopColor 색상 치환 (위 맵 적용)
- 런타임 조건부 색상 (동적으로 색상을 선택하는 로직): 기존 blue/purple/green 계열 분기를 각각 `#00d4ff` / `#6aabcc` / `#00ff88`으로 교체
- 인라인 스타일의 gradient stopColor도 동일 맵 적용

---

## 5. 적용 범위

### CSS 토큰 자동 상속 (별도 수정 없음)

`/operations`, `/campaigns`, `/content`, `/seminar`, `/datasets`, `/video`, `/sns/studio`, `/sns/calendar`, `/sns/personas`, `/sns/community`, `/goals`, `/intel`, `/intel/watchlist`, `/learning`, `/history`, `/notifications`, `/settings`, `/meta/*`, `/auth/*`

### 수동 수정 필요 (총 5개 파일)

| 파일 | 변경 내용 |
|------|----------|
| `app/globals.css` | `:root` 토큰 + 구조 클래스 + 보조 클래스 |
| `components/app-nav.tsx` | 로고/active 스타일 |
| `app/(domains)/layout.tsx` | topbar 텍스트 |
| `app/(domains)/dashboard/page.tsx` | Recharts + 인라인 borderTop |
| `app/(domains)/sns/analytics/page.tsx` | Recharts 색상 |
| `app/(domains)/analytics/page.tsx` | Recharts + 조건부 인라인 색상 |

---

## 6. 비변경 범위

- `/(shell)/*` — 이미 JARVIS 완료, 건드리지 않음
- `--shell-*` CSS 변수 — Agent Shell 전용, 유지
- 컴포넌트 구조/로직 — 스타일만 변경, 기능 변경 없음
- TypeScript 타입 — 변경 없음

---

## 7. 완료 기준

- [ ] 전체 도메인 페이지 배경이 `#050810` + 헥스 그리드로 표시됨
- [ ] 사이드바가 다크 배경 + 사이언 보더로 표시됨
- [ ] Active 네비게이션 아이템이 사이언 글로우로 표시됨
- [ ] 차트 3개 파일이 JARVIS 팔레트 색상으로 표시됨
- [ ] 브라우저 네이티브 컨트롤(스크롤바 등)이 다크 모드로 렌더링
- [ ] `.surface-note`, 상태 뱃지, 코파일럿 메시지가 다크 배경에서 올바른 대비 유지
- [ ] 기존 30개 테스트 전부 통과
- [ ] TypeScript 신규 에러 없음
