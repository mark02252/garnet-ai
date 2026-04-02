# Garnet Domain Pages — JARVIS 스타일 전체 롤아웃 설계

> 날짜: 2026-04-03
> 상태: 스펙 확정

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

#### 루트 CSS 변수 교체

현재 라이트 Toss 팔레트 변수들을 JARVIS 팔레트로 교체:

```css
:root {
  /* 배경 */
  --bg-base: #050810;
  --bg-sub: #0a0f1a;

  /* 서피스 */
  --surface: rgba(0, 12, 28, 0.92);
  --surface-sub: rgba(0, 20, 40, 0.6);
  --surface-border: rgba(0, 212, 255, 0.15);
  --surface-hover: rgba(0, 212, 255, 0.05);

  /* 텍스트 */
  --text-base: #a8d8ff;
  --text-strong: #e8f4ff;
  --text-muted: #3a6080;
  --text-secondary: #6aabcc;

  /* 액센트 */
  --accent: #00d4ff;
  --accent-secondary: #0066ff;
  --accent-soft: rgba(0, 212, 255, 0.08);
  --accent-glow: rgba(0, 212, 255, 0.2);

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
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='92'%3E%3Cpath d='M20,1 L39,11.5 L39,34.5 L20,45 L1,34.5 L1,11.5 Z' fill='none' stroke='%2300d4ff' stroke-opacity='0.04' stroke-width='0.5'/%3E%3Cpath d='M60,47 L79,57.5 L79,80.5 L60,91 L41,80.5 L41,57.5 Z' fill='none' stroke='%2300d4ff' stroke-opacity='0.04' stroke-width='0.5'/%3E%3C/svg%3E");
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

#### 카드/패널 공통 클래스 추가

페이지별 인라인 스타일을 줄이기 위한 유틸리티:

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
// Before (active)
'bg-[var(--accent-soft)] text-[var(--accent)]'

// After (active)
'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--surface-border)]'
```

Active indicator 바: 현재 `bg-[var(--accent)]` → `bg-[var(--accent)] shadow-[0_0_6px_var(--accent-glow)]` (글로우 추가)

---

### 4.3 `app/(domains)/layout.tsx`

```tsx
// Before
<p className="text-[13px] font-semibold text-[#333d4b]">Garnet</p>

// After
<p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--text-muted)]">Garnet OS</p>
```

---

### 4.4 Recharts 색상 업데이트 (3개 파일)

차트 색상은 prop으로 직접 전달되므로 각 파일에서 수동 교체 필요.

| 파일 | 현재 | 변경 |
|------|------|------|
| `app/(domains)/dashboard/page.tsx` | `#3b82f6`, `#8b5cf6` 등 | `#00d4ff`, `#0066ff`, `#00ff88` |
| `app/(domains)/sns/analytics/page.tsx` | `#3b82f6` 등 | `#00d4ff`, `#6aabcc` |
| `app/(domains)/analytics/page.tsx` | 다수 색상 | `#00d4ff`, `#0066ff`, `#00ff88`, `#ffaa00` |

Recharts 교체 규칙:
- Primary metric → `#00d4ff` (아크 리액터 사이언)
- Secondary metric → `#0066ff` (일렉트릭 블루)
- Positive/growth → `#00ff88` (그린)
- Warning/negative → `#ff4466` (레드)
- Neutral → `#6aabcc` (뮤트 블루)

---

## 5. 적용 범위

CSS 토큰 자동 상속으로 별도 수정 없이 JARVIS 스타일이 적용되는 페이지:

`/operations`, `/campaigns`, `/content`, `/seminar`, `/datasets`, `/video`, `/sns/studio`, `/sns/calendar`, `/sns/personas`, `/sns/community`, `/goals`, `/intel`, `/intel/watchlist`, `/learning`, `/history`, `/notifications`, `/settings`, `/meta/*`, `/auth/*`

수동 수정 필요:
- `app-nav.tsx` (로고/active 스타일)
- `layout.tsx` (topbar 텍스트)
- 차트 색상 3개 파일

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
- [ ] 기존 30개 테스트 전부 통과
- [ ] TypeScript 신규 에러 없음
