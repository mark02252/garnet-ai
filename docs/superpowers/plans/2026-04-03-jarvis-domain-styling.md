# JARVIS Domain Styling Rollout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the JARVIS holographic style (dark `#050810` bg, `#00d4ff` cyan accent, hex grid) to all domain pages (`/(domains)/*`) by swapping CSS tokens in `globals.css` and updating 5 files manually.

**Architecture:** CSS token swap approach — replace `:root` CSS variables so all domain components inherit JARVIS colors without touching individual page files. Structural layout classes (`.app-shell`, `.app-sidebar`, `.app-topbar`) get explicit dark styles. AppNav gets logo + active-state visual updates. Three chart files get manual Recharts color prop updates.

**Tech Stack:** Next.js 15, Tailwind CSS, Vitest (test: `npm run test`), TypeScript check: `npx tsc --noEmit`

**Spec:** `docs/superpowers/specs/2026-04-03-jarvis-domain-styling-design.md`

---

## Chunk 1: globals.css — Token Swap + Structural Classes

### Task 1: Baseline check

**Files:**
- Read: `app/globals.css` (lines 5–48 for `:root`, lines 62–105 for layout classes)

- [ ] **Step 1: Run existing tests and confirm all pass**

```bash
npm run test
```
Expected: All tests pass. If any fail, stop and investigate before proceeding.

- [ ] **Step 2: Confirm TypeScript baseline is clean (only the known pre-existing error)**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```
Expected: Only `lib/canvas-store.ts(69)` TS2345 error (pre-existing). No other errors.

---

### Task 2: Replace `:root` CSS token block

**Files:**
- Modify: `app/globals.css` (lines 5–45, the `:root { ... }` block)

- [ ] **Step 1: Replace the entire `:root` block**

Find the existing block (lines 5–45):
```css
:root {
  color-scheme: light;
  /* ── Toss-inspired design tokens ── */
  --app-bg: #f5f6f7;
  ...
  --status-failed-bg: #fef2f2;
}
```

Note: The replacement block includes a few forward-looking tokens (`--text-secondary`, `--text-disabled`, `--surface-shadow`, `--surface-border-strong`, `--surface-hover`) that are not currently referenced but will be used by future domain page updates. These are additive and harmless.

Replace it with:
```css
:root {
  color-scheme: dark;

  /* ── JARVIS design tokens ── */
  --app-bg: #050810;
  --bg-base: #050810;
  --bg-sub: #0a0f1a;

  /* Surface */
  --surface: rgba(0, 12, 28, 0.92);
  --surface-sub: rgba(0, 20, 40, 0.6);
  --surface-alt: rgba(0, 20, 40, 0.8);
  --surface-border: rgba(0, 212, 255, 0.15);
  --surface-border-strong: rgba(0, 212, 255, 0.3);
  --surface-hover: rgba(0, 212, 255, 0.05);
  --surface-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);

  /* Text */
  --text-strong: #e8f4ff;
  --text-base: #a8d8ff;
  --text-muted: #3a6080;
  --text-secondary: #6aabcc;
  --text-disabled: #1e3a50;

  /* Accent */
  --accent: #00d4ff;
  --accent-hover: #00b8d9;
  --accent-soft: rgba(0, 212, 255, 0.08);
  --accent-rgb: 0, 212, 255;
  --accent-secondary: #0066ff;
  --accent-glow: rgba(0, 212, 255, 0.2);

  /* Border */
  --border: rgba(0, 212, 255, 0.15);

  /* Border radius (unchanged) */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius: 8px;
  --radius-md: 10px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 20px;

  /* Status tokens */
  --status-active: #00ff88;
  --status-active-bg: rgba(0, 255, 136, 0.1);
  --status-paused: #ffaa00;
  --status-paused-bg: rgba(255, 170, 0, 0.1);
  --status-completed: #00d4ff;
  --status-completed-bg: rgba(0, 212, 255, 0.1);
  --status-draft: #3a6080;
  --status-draft-bg: rgba(58, 96, 128, 0.15);
  --status-failed: #ff4466;
  --status-failed-bg: rgba(255, 68, 102, 0.1);

  /* Status badge */
  --status-success: #00ff88;
  --status-error: #ff4466;
  --status-warning: #ffaa00;
  --status-running: #00d4ff;
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```
Expected: Same pre-existing error only. No new errors.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: replace :root CSS tokens with JARVIS palette"
```

---

### Task 3: Update structural layout classes

**Files:**
- Modify: `app/globals.css` (`.app-shell` line ~62, `.app-sidebar` line ~68, `.app-topbar` line ~84, `.app-main` line ~98)

- [ ] **Step 1: Replace `.app-shell` block**

Find:
```css
.app-shell {
  position: relative;
  min-height: 100vh;
  background: var(--app-bg);
}
```

Replace with:
```css
.app-shell {
  position: relative;
  min-height: 100vh;
  background: #050810;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='92'%3E%3Cpath d='M20,1 L39,11.5 L39,34.5 L20,45 L1,34.5 L1,11.5 Z' fill='none' stroke='%2300d4ff' stroke-opacity='0.05' stroke-width='0.5'/%3E%3Cpath d='M60,47 L79,57.5 L79,80.5 L60,91 L41,80.5 L41,57.5 Z' fill='none' stroke='%2300d4ff' stroke-opacity='0.05' stroke-width='0.5'/%3E%3C/svg%3E");
  background-size: 80px 92px;
  color: var(--text-base);
}
```

- [ ] **Step 2: Replace `.app-sidebar` block**

Find:
```css
.app-sidebar {
  position: sticky;
  top: 0;
  display: flex;
  height: 100vh;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  padding: 12px 8px;
  background: var(--surface);
  border-right: 1px solid var(--surface-border);
  width: 200px;
  overflow-y: auto;
  overflow-x: hidden;
}
```

Replace with:
```css
.app-sidebar {
  position: sticky;
  top: 0;
  display: flex;
  height: 100vh;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  padding: 12px 8px;
  background: rgba(0, 12, 28, 0.95);
  border-right: 1px solid rgba(0, 212, 255, 0.15);
  backdrop-filter: blur(16px);
  width: 200px;
  overflow-y: auto;
  overflow-x: hidden;
}
```

- [ ] **Step 3: Replace `.app-topbar` block**

Find:
```css
.app-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0 24px;
  height: 52px;
  background: var(--surface);
  border-bottom: 1px solid var(--surface-border);
}
```

Replace with:
```css
.app-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0 24px;
  height: 52px;
  background: rgba(0, 8, 20, 0.8);
  border-bottom: 1px solid rgba(0, 212, 255, 0.12);
  backdrop-filter: blur(12px);
  color: var(--text-muted);
}
```

- [ ] **Step 4: Verify `.app-main` is transparent**

Check the current `.app-main` rule. If it has a `background` property, update it to `background: transparent;` so the hex grid from `.app-shell` shows through. If it has no `background` property, no change needed.

```bash
grep -A 5 "^\.app-main" app/globals.css
```

- [ ] **Step 5: Run tests**

```bash
npm run test
```
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css
git commit -m "style: JARVIS structural layout classes — app-shell hex grid, dark sidebar/topbar"
```

---

### Task 4: Fix auxiliary CSS classes

**Files:**
- Modify: `app/globals.css` (`.surface-note` ~line 167, `.status-badge-*` ~lines 423–450)

- [ ] **Step 1: Replace `.surface-note` color rule**

Find:
```css
.surface-note {
  background: rgba(var(--accent-rgb), 0.06);
  border: 1px solid rgba(var(--accent-rgb), 0.14);
  color: #1a4580;
  border-radius: var(--radius);
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.6;
}
```

Replace with:
```css
.surface-note {
  background: rgba(var(--accent-rgb), 0.08);
  border: 1px solid rgba(var(--accent-rgb), 0.2);
  color: var(--text-base);
  border-radius: var(--radius);
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.6;
}
```

Note: `.surface-note strong { color: var(--text-strong); }` (the sub-rule on the next line) is intentionally left unchanged — after token swap `--text-strong` resolves to `#e8f4ff`, which is correct.

- [ ] **Step 2: Replace status badge classes — two separate operations**

**Operation A:** Find and replace the first block (success/warning/error are contiguous). `.status-badge-info` and `.status-badge-neutral` sit between error and running in the file — do NOT overwrite them.

Find:
```css
.status-badge-success {
  background: #e8f8f0;
  color: #16794c;
}

.status-badge-warning {
  background: #fef3c7;
  color: #92400e;
}

.status-badge-error {
  background: #fee2e2;
  color: #991b1b;
}
```

Replace with:
```css
.status-badge-success {
  background: rgba(0, 255, 136, 0.12);
  color: #00ff88;
  border: 1px solid rgba(0, 255, 136, 0.25);
}

.status-badge-warning {
  background: rgba(255, 170, 0, 0.12);
  color: #ffaa00;
  border: 1px solid rgba(255, 170, 0, 0.25);
}

.status-badge-error {
  background: rgba(255, 68, 102, 0.12);
  color: #ff4466;
  border: 1px solid rgba(255, 68, 102, 0.25);
}
```

**Operation B:** Find and replace the running badge separately:

Find:
```css
.status-badge-running {
  background: #ede9fe;
  color: #5b21b6;
}
```

Replace with:
```css
.status-badge-running {
  background: rgba(0, 212, 255, 0.12);
  color: #00d4ff;
  border: 1px solid rgba(0, 212, 255, 0.25);
}
```

- [ ] **Step 3: Add utility classes at the end of globals.css**

Append after the last rule in the file:
```css
/* ── JARVIS Domain Utilities ── */

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

- [ ] **Step 4: Run tests**

```bash
npm run test
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "style: fix auxiliary CSS classes for JARVIS dark mode — surface-note, status badges, utilities"
```

---

## Chunk 2: AppNav + DomainsLayout

### Task 5: Update AppNav logo and active state

**Files:**
- Modify: `components/app-nav.tsx` (lines 299–308 for logo, lines 278–291 for NavButton)

- [ ] **Step 1: Update logo section in `AppNav`**

Find (in `AppNav` return, around line 299):
```tsx
<Link
  href="/operations"
  className="mb-3 flex h-9 items-center gap-2.5 px-2 text-[var(--accent)]"
  title="Garnet"
>
  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[var(--accent-soft)] text-[13px] font-bold">
    G
  </span>
  <span className="text-[15px] font-bold text-[var(--text-strong)]">Garnet</span>
</Link>
```

Replace with:
```tsx
<Link
  href="/operations"
  className="mb-3 flex h-9 items-center gap-2.5 px-2 text-[var(--accent)]"
  title="Garnet"
>
  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[var(--accent-soft)] border border-[var(--surface-border)] text-[12px] font-bold text-[var(--accent)]">
    ◈
  </span>
  <span className="text-[13px] font-bold text-[var(--text-base)] tracking-[2px]">GARNET</span>
</Link>
```

- [ ] **Step 2: Update group label styling**

Find (around line 314):
```tsx
<p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] opacity-60">
  {group.label}
</p>
```

Replace with:
```tsx
<p className="mb-1 px-2.5 text-[8px] font-semibold uppercase tracking-[2px] text-[var(--text-muted)]">
  {group.label}
</p>
```

- [ ] **Step 3: Update NavButton active state**

Find (around line 278):
```tsx
className={[
  'relative flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 transition-colors',
  active
    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
    : 'text-[var(--text-muted)] hover:bg-[var(--surface-sub)] hover:text-[var(--text-base)]'
].join(' ')}
```

Replace with:
```tsx
className={[
  'relative flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 transition-colors',
  active
    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--surface-border)]'
    : 'text-[var(--text-muted)] hover:bg-[var(--surface-sub)] hover:text-[var(--text-base)]'
].join(' ')}
```

- [ ] **Step 4: Add glow to active indicator bar**

Find (around line 285):
```tsx
{active && (
  <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--accent)]" />
)}
```

Replace with:
```tsx
{active && (
  <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--accent)] shadow-[0_0_6px_var(--accent-glow)]" />
)}
```

- [ ] **Step 5: Run tests**

```bash
npm run test
```
Expected: All tests pass.

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```
Expected: Pre-existing error only.

- [ ] **Step 7: Commit**

```bash
git add components/app-nav.tsx
git commit -m "style: AppNav JARVIS — ◈ logo, uppercase tracking, cyan glow active state"
```

---

### Task 6: Update DomainsLayout topbar text

**Files:**
- Modify: `app/(domains)/layout.tsx` (line 14)

- [ ] **Step 1: Update topbar title**

Find:
```tsx
<p className="text-[13px] font-semibold text-[#333d4b]">Garnet</p>
```

Replace with:
```tsx
<p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--text-muted)]">Garnet OS</p>
```

- [ ] **Step 2: Run tests**

```bash
npm run test
```
Expected: All tests pass.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```
Expected: Pre-existing error only.

- [ ] **Step 4: Commit**

```bash
git add "app/(domains)/layout.tsx"
git commit -m "style: domain topbar text → 'Garnet OS' JARVIS label style"
```

---

## Chunk 3: Recharts Color Updates

**Color map reference (use for all replacements in this chunk):**

| Find | Replace | Notes |
|------|---------|-------|
| `#3b82f6` | `#00d4ff` | Primary cyan |
| `#6366f1` | `#0066ff` | Electric blue |
| `#8b5cf6` | `#6aabcc` | Muted blue |
| `#10b981` | `#00ff88` | Neon green |
| `#22c55e` | `#00ff88` | Neon green (analytics) |
| `#f59e0b` | `#ffaa00` | Amber (keep intent) |
| `#94a3b8` | `#3a6080` | Dark muted |
| `#ef4444` | `#ff4466` | Hot red |
| `#6b7280` | `#3a6080` | Muted grey → muted blue |
| `#3182f6` | `#00d4ff` | Toss blue variant (dominant in sns/analytics + analytics files) |
| `#ec4899` | `#ff4466` | Pink → hot red (dashboard borderTop) |
| `#06b6d4` | `#00d4ff` | Teal → accent cyan (dashboard borderTop) |

**Do NOT replace:** `#f97316` (MEDIUM priority orange — intentional), social brand colors (`#e1306c` Instagram, `#1877f2` Facebook, `#ff0000` YouTube, `#f7e600` Kakao), and any other hex color not listed above. Light-theme structural UI colors (`#fff`, `#f9fafb`, card backgrounds, table stripes, AI panel gradients) are also out of scope.

### Task 7: Update `dashboard/page.tsx` chart colors

**Files:**
- Modify: `app/(domains)/dashboard/page.tsx`

- [ ] **Step 1: Find all hardcoded colors in this file**

```bash
grep -n "#[0-9a-fA-F]\{6\}" "app/(domains)/dashboard/page.tsx"
```

Note every line number and color value for replacement.

- [ ] **Step 2: Replace Recharts stroke/fill colors using color map**

Apply the color map to all Recharts props (`stroke=`, `fill=`, `color=`) and inline chart config objects. Specific pattern:

For each color in the map, run a targeted search-and-replace. The colors appear in:
- `<Line stroke="..."` props
- `<Bar fill="..."` props
- Chart config objects like `{ color: "#3b82f6" }`
- `<Area fill="..."` props

- [ ] **Step 3: Fix structural inline styles (borderTop — 3 occurrences)**

```bash
grep -n "borderTop" "app/(domains)/dashboard/page.tsx"
```

Replace each match using the color map:
- `'4px solid #8b5cf6'` → `'4px solid #6aabcc'`
- `'4px solid #ec4899'` → `'4px solid #ff4466'`
- `'4px solid #06b6d4'` → `'4px solid #00d4ff'`

- [ ] **Step 4: Run tests**

```bash
npm run test
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add "app/(domains)/dashboard/page.tsx"
git commit -m "style: dashboard Recharts → JARVIS cyan/blue palette"
```

---

### Task 8: Update `sns/analytics/page.tsx` chart colors

**Files:**
- Modify: `app/(domains)/sns/analytics/page.tsx`

- [ ] **Step 1: Find all hardcoded colors**

```bash
grep -n "#[0-9a-fA-F]\{6\}" "app/(domains)/sns/analytics/page.tsx"
```

- [ ] **Step 2: Apply color map to Recharts props and inline conditional colors**

Replace all Recharts color props (`stroke=`, `fill=`, `color=`) AND inline style background colors in conditional/ternary expressions using the color map.

Key patterns to catch:
- `background: stat.type === 'VIDEO' ? '#8b5cf6' : ... ? '#f59e0b' : '#3182f6'`
- `background: Number(avgEngagement) >= 3 ? '#10b981' : ... ? '#3182f6' : '#f59e0b'`

Apply the color map to all matching colors in these ternaries.

- [ ] **Step 3: Run tests**

```bash
npm run test
```
Expected: All tests pass.

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```
Expected: Pre-existing error only.

- [ ] **Step 5: Commit**

```bash
git add "app/(domains)/sns/analytics/page.tsx"
git commit -m "style: sns/analytics Recharts + conditional colors → JARVIS palette"
```

---

### Task 9: Update `analytics/page.tsx` chart colors (large file)

**Files:**
- Modify: `app/(domains)/analytics/page.tsx`

This file has 200+ hardcoded hex colors. Most are light-theme structural UI (card backgrounds, table stripes, AI panel gradients, brand colors) — these are **out of scope and must not be changed**. Only replace colors that match the color map exactly. When in doubt, leave it alone.

- [ ] **Step 1: Find all hardcoded colors and note line numbers**

```bash
grep -n "#[0-9a-fA-F]\{6\}" "app/(domains)/analytics/page.tsx" | grep -v "node_modules"
```

- [ ] **Step 2: Replace static Recharts props**

Apply color map to all `stroke=`, `fill=`, `stopColor=` Recharts props.

- [ ] **Step 3: Replace conditional/runtime color logic**

Find functions or ternaries that return color strings, e.g.:
```tsx
isGood ? '#22c55e' : '#ef4444'
```

Apply the color map:
- `'#22c55e'` → `'#00ff88'`
- `'#ef4444'` → `'#ff4466'`
- Other colors per map

**Note:** `#f97316` (orange, used for MEDIUM priority border) — intentionally keep as-is.

- [ ] **Step 4: Replace gradient stopColors**

SVG gradient `stopColor` props follow the same map.

- [ ] **Step 5: Run tests**

```bash
npm run test
```
Expected: All tests pass.

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```
Expected: Pre-existing error only.

- [ ] **Step 7: Commit**

```bash
git add "app/(domains)/analytics/page.tsx"
git commit -m "style: analytics Recharts + conditional colors → JARVIS palette"
```

---

## Final Verification

- [ ] **Start dev server and visually confirm JARVIS styling across all domain pages**

```bash
npm run dev
```

Open `http://localhost:3000` and check:
- [ ] All domain page backgrounds are `#050810` dark with hex grid pattern visible
- [ ] Sidebar is dark with cyan border and `◈ GARNET` logo
- [ ] Active nav item shows cyan glow bar
- [ ] Charts show cyan/blue/green palette instead of blue/purple
- [ ] Status badges are dark (not bright pastel)
- [ ] `.surface-note` components are readable (light text on dark tint)
- [ ] Browser scrollbars are dark (native dark mode via `color-scheme: dark`)
- [ ] Agent Shell (`/shell`) is unchanged

- [ ] **Final commit if any visual tweaks were made**

```bash
git add -A
git commit -m "style: JARVIS domain styling rollout complete — visual polish tweaks"
```
