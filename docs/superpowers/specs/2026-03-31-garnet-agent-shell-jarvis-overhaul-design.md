# Garnet Agent Shell — JARVIS UI Overhaul Design

> Date: 2026-03-31
> Status: Approved

---

## 1. Overview

Transform the Agent Shell from a terminal-like interface into a JARVIS/Iron Man-style holographic command center. The current design (dark sidebar + dot grid canvas) reads as a developer terminal. The target aesthetic is a futuristic AI cockpit — glowing cyan arcs, holographic glass panels, pulsing arc reactor idle state.

**Goal:** Every surface should feel like it was designed for an AI that never sleeps.

---

## 2. Color Palette

Replace current CSS variables in `app/globals.css` `.shell-theme` block:

| Token | Value | Usage |
|-------|-------|-------|
| `--shell-bg` | `#050810` | Page background (deep blue-black) |
| `--shell-accent` | `#00d4ff` | Primary accent — arc reactor cyan |
| `--shell-accent-secondary` | `#0066ff` | Secondary accent — electric blue |
| `--shell-text-primary` | `#a8d8ff` | Body text — blue-tinted white |
| `--shell-text-secondary` | `#6aabcc` | Secondary text |
| `--shell-text-muted` | `#3a6080` | Muted/placeholder text |
| `--shell-border` | `rgba(0,212,255,0.15)` | Panel/component borders |
| `--shell-surface` | `rgba(0,20,40,0.8)` | Panel background |
| `--shell-surface-hover` | `rgba(0,212,255,0.05)` | Hover surface |
| `--shell-glow` | `rgba(0,212,255,0.2)` | Glow/shadow color |
| `--shell-status-running` | `#00d4ff` | Running — cyan pulse |
| `--shell-status-success` | `#00ff88` | Success — neon green |
| `--shell-status-error` | `#ff4466` | Error — neon red |
| `--shell-status-idle` | `#3a6080` | Idle — muted blue |

---

## 3. Layout Redesign

### Current Structure

```
[AmbientBar 40px]
[AgentStream 260px] | [Canvas flex-1]
                    | [CommandBar]
```

### New Structure

```
[SystemBar 56px — full width]
[Canvas flex-1 — full width]
[CommandBar 80px — full width]
[SignalFeed overlay — right-bottom, execution-only, fixed position]
```

**Key change:** Remove the `AgentStream` permanent sidebar. Replace with `SignalFeed` overlay that appears only during command execution and auto-hides 3 seconds after completion.

### Layout file changes (`app/(shell)/layout.tsx`)

- Replace `<AmbientBar onOpenPalette={openCommandPalette} />` → `<SystemBar onOpenPalette={openCommandPalette} />`
- Remove `<AgentStream />` and the wrapping flex container (the `<div className="flex flex-1 overflow-hidden">` with the sidebar)
- Canvas takes full width — `<Canvas />` and `<CommandBar />` are direct children of the outer flex column
- Add `<SignalFeed />` as a sibling (fixed-position, no layout impact)
- Import `SystemBar` from `@/components/agent-shell/system-bar`
- Import `SignalFeed` from `@/components/agent-shell/signal-feed`

---

## 4. Component Specifications

### 4.1 SystemBar (`components/agent-shell/system-bar.tsx`)

Replaces `AmbientBar`. Accepts same prop: `onOpenPalette?: () => void`.

Height: 56px (was 40px).

**Left section:**
- `◈ GARNET` logo in `--shell-accent` cyan — add CSS class `logo-pulse` (see §5)
- Separator `|`
- Status text derived from `/api/agent/job-status` polled every 30s (same endpoint as current `AmbientBar`). Count `N` = number of keys where `value === 'running'`. Display: `"SYSTEM ACTIVE ● N JOBS RUNNING"`. When N = 0: `"SYSTEM ACTIVE ● STANDBY"`. The `●` dot uses `dot-running` class (existing) when N > 0.

**Center section:**
- Live clock: `HH:MM:SS` updated every second via `setInterval`
- Font: `font-mono`, 12px, `--shell-text-muted`, `tracking-widest`

**Right section:**
- ⌘K button, calls `onOpenPalette` on click
- Style: `border: 1px solid rgba(0,212,255,0.25)`, `border-radius: 6px`, `padding: 2px 8px`, background `rgba(0,212,255,0.05)`
- Hover: background → `rgba(0,212,255,0.1)`

**Scan-line animation:**
- A `<div>` inside the header with `position: absolute`, `inset-x: 0`, `height: 2px`, `background: linear-gradient(90deg, transparent, rgba(0,212,255,0.6), transparent)`, `pointer-events: none`
- Uses CSS class `scan-line-sweep` (see §5 for keyframe)
- Animation: `scan-line-sweep 4s linear infinite` — sweeps from `translateY(0)` to `translateY(56px)` (the full bar height), looping

**Background:**
- `background: rgba(0,8,20,0.9)`, `backdrop-filter: blur(20px)`
- `border-bottom: 1px solid rgba(0,212,255,0.2)`
- `box-shadow: 0 1px 0 rgba(0,212,255,0.1), 0 4px 20px rgba(0,212,255,0.05)`

### 4.2 Canvas (`components/agent-shell/canvas.tsx`)

**Background layer — Hexagon grid:**
- Replace `canvas-dot-grid` className with `canvas-hex-grid`
- CSS class provides SVG `background-image` using the full inline data URI below (see §5)
- Pointy-top hexagons, tile size `80px × 92px`, stroke `rgba(0,212,255,0.05)` at `stroke-width="0.5"`

**Middle layer — Arc ring overlay:**
- A `<svg>` element: `position: absolute`, `inset: 0`, `width: 100%`, `height: 100%`, `pointer-events: none`
- Two `<circle>` elements, each wrapped in a `<g>` with `style={{ transformOrigin: 'center' }}`
  - Outer circle: `cx="50%" cy="50%" r="42%"`, `fill="none"`, `stroke="rgba(0,212,255,0.06)"`, `strokeWidth="1"`, `animation: arc-rotate 60s linear infinite`
  - Inner circle: `cx="50%" cy="50%" r="27%"`, `fill="none"`, `stroke="rgba(0,212,255,0.04)"`, `strokeWidth="0.5"`, `animation: arc-rotate 40s linear reverse infinite`

**Empty state — Arc reactor idle:**
- Shown when `panels.length === 0`; replaces the plain text placeholder
- A centered `<div>` with `position: absolute`, `inset: 0`, `display: flex`, `align-items: center`, `justify-content: center`, `pointer-events: none`, `flexDirection: column`, `gap: 16px`
- Three concentric rings rendered as `<div>` elements with `border-radius: 50%`, `position: absolute`:
  - Inner: `width: 48px`, `height: 48px`, `border: 1px solid rgba(0,212,255,0.5)`, `box-shadow: 0 0 8px rgba(0,212,255,0.4), inset 0 0 8px rgba(0,212,255,0.2)`
  - Middle: `width: 80px`, `height: 80px`, `border: 1px solid rgba(0,212,255,0.3)`, `box-shadow: 0 0 12px rgba(0,212,255,0.2)`
  - Outer: `width: 112px`, `height: 112px`, `border: 1px solid rgba(0,212,255,0.15)`
- Center dot: `width: 8px`, `height: 8px`, `border-radius: 50%`, `background: #00d4ff`, `box-shadow: 0 0 12px #00d4ff`, `position: absolute`
- Wrap all rings + dot in a `<div>` with `position: relative`, `width: 112px`, `height: 112px` and class `arc-reactor-breathe`
- Below wrapper: `<p>STANDBY</p>` — 10px, `tracking-[0.3em]`, `--shell-text-muted`

### 4.3 CanvasPanel (`components/agent-shell/canvas-panel.tsx`)

**L-bracket corner decorations:**
- Create a `LBracketCorners` sub-component in the same file
- Renders 4 `<span>` elements (`.lb-tl`, `.lb-tr`, `.lb-bl`, `.lb-br`), each absolutely positioned inside `.canvas-panel`
- Each `<span>` is `12px × 12px`, `position: absolute`, `pointer-events: none`, uses `::before` / `::after` for the two lines
- All pseudo-elements share: `content: ''`, `position: absolute`, `background: #00d4ff`
- Full CSS for all four corners (add to `app/globals.css`):
  ```css
  .lb-tl, .lb-tr, .lb-bl, .lb-br {
    position: absolute; width: 12px; height: 12px; pointer-events: none;
  }
  .lb-tl { top: 0; left: 0; }
  .lb-tl::before { content: ''; position: absolute; top: 0; left: 0; width: 12px; height: 2px; background: #00d4ff; }
  .lb-tl::after  { content: ''; position: absolute; top: 0; left: 0; width: 2px; height: 12px; background: #00d4ff; }

  .lb-tr { top: 0; right: 0; }
  .lb-tr::before { content: ''; position: absolute; top: 0; right: 0; width: 12px; height: 2px; background: #00d4ff; }
  .lb-tr::after  { content: ''; position: absolute; top: 0; right: 0; width: 2px; height: 12px; background: #00d4ff; }

  .lb-bl { bottom: 0; left: 0; }
  .lb-bl::before { content: ''; position: absolute; bottom: 0; left: 0; width: 12px; height: 2px; background: #00d4ff; }
  .lb-bl::after  { content: ''; position: absolute; bottom: 0; left: 0; width: 2px; height: 12px; background: #00d4ff; }

  .lb-br { bottom: 0; right: 0; }
  .lb-br::before { content: ''; position: absolute; bottom: 0; right: 0; width: 12px; height: 2px; background: #00d4ff; }
  .lb-br::after  { content: ''; position: absolute; bottom: 0; right: 0; width: 2px; height: 12px; background: #00d4ff; }
  ```
- Render `<LBracketCorners />` inside `.canvas-panel` div, before the header. The JSX is:
  ```tsx
  function LBracketCorners() {
    return <>
      <span className="lb-tl" /><span className="lb-tr" />
      <span className="lb-bl" /><span className="lb-br" />
    </>;
  }
  ```

**Border and glow:**
- Base border: `1px solid rgba(0,212,255,0.2)`
- Glow pulse: only applies to `data-status="loading"` and `data-status="active"` via CSS (see §5)
- `data-status="completed"` and `data-status="error"` get **no** glow animation — static border only
- Error status gets static `border-color: rgba(255,68,102,0.3)`

**Spawn scan-line:**
- A `motion.div` sibling to the panel content, rendered inside `motion.div` (the animation wrapper), **above** `.canvas-panel`
- Style: `position: absolute`, `inset-x: 0`, `height: 2px`, `background: linear-gradient(90deg, transparent, rgba(0,212,255,0.8), transparent)`, `pointerEvents: 'none'`, `zIndex: 11`
- Framer Motion: `initial={{ top: 0, opacity: 1 }}` → `animate={{ top: '100%', opacity: 0 }}` → `transition={{ duration: 0.3, ease: 'linear' }}`
- This runs once on mount (no `exit`, no loop)

**Background:**
- `rgba(0,12,28,0.92)` with `backdrop-filter: blur(16px)`

### 4.4 SignalFeed (`components/agent-shell/signal-feed.tsx`)

Replaces `AgentStream` sidebar. A `position: fixed` overlay.

**Positioning:**
```css
position: fixed;
bottom: 96px;   /* clears the 80px CommandBar + 16px gap */
right: 16px;
width: 300px;
max-height: 280px;
z-index: 50;
```

**Visibility logic:**
```typescript
const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const [visible, setVisible] = useState(false);

const hasRunning = entries.some(e => e.status === 'running');

useEffect(() => {
  if (hasRunning) {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
    setVisible(true);
  } else if (visible) {
    hideTimerRef.current = setTimeout(() => setVisible(false), 3000);
  }
  return () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  };
}, [hasRunning, visible]);
```

- `hideTimerRef` (a `useRef`) ensures the timeout ID is shared across renders, making cancellation reliable.
- If a new running entry arrives while the 3s hide timer is counting down, the timer is cancelled and the feed stays visible.
- After hiding, on the next show, render all entries currently in `useStreamStore` (no clearing — the store manages its own capacity of 50 entries).
- `AnimatePresence` wraps the feed div: `initial={{ opacity:0, x:20 }}` → `animate={{ opacity:1, x:0 }}` → `exit={{ opacity:0, x:20 }}` with `transition={{ duration: 0.2 }}`

**Visual:**
- Background: `rgba(0,12,28,0.92)`, `backdrop-filter: blur(20px)`
- Border: `1px solid rgba(0,212,255,0.2)`, `border-radius: 8px`
- Header row: `"SIGNAL FEED"` left, tiny countdown `"CLOSING IN Ns"` right (shown only during 3s hide countdown)
- Header scan-line: a `<div>` with class `scan-line-sweep`. Header height is 36px. Set inline styles `--scan-height: 36px; --scan-duration: 6s` on the scan-line element (overrides the 56px / 4s defaults). Same gradient background as SystemBar.
- Entry rows: same content as current `AgentStream.EntryRow`
- `overflow-y: auto`, thin scrollbar: `scrollbar-width: thin; scrollbar-color: rgba(0,212,255,0.2) transparent`

### 4.5 CommandBar (`components/agent-shell/command-bar.tsx`)

**Outer container height:** 80px total — set with `minHeight: 80px`, centered content via `display: flex; flex-direction: column; justify-content: center`

**Input wrapper:**
- Wrap the `<input>` in a `<div>` with:
  - `width: 80%`, `margin: 0 auto`
  - `border: 1px solid rgba(0,212,255,0.25)`, `border-radius: 12px`
  - `background: rgba(0,15,30,0.8)`, `padding: 12px 20px`
  - `display: flex; align-items: center; gap: 12px; position: relative`
- On focus (track via state + `onFocus`/`onBlur`): `border-color: rgba(0,212,255,0.6)`, `box-shadow: 0 0 0 1px rgba(0,212,255,0.2), 0 0 20px rgba(0,212,255,0.1)`

**Typing glow:**
- When `input.length > 0`, add class `cmd-typing` to the input wrapper div (see §5 keyframe)

**Loading spinner:**
- Visible only when `loading === true`
- A `<span>` inside the input wrapper (left of the `<input>`): `width: 16px`, `height: 16px`, `border-radius: 50%`, `border: 2px solid rgba(0,212,255,0.15)`, `border-top-color: #00d4ff`, `animation: spin 0.8s linear infinite`, `flex-shrink: 0`
- `@keyframes spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }`
- When loading: placeholder text → `"Processing..."`, placeholder color (via CSS var override) → `#00d4ff`

**Submit ripple:**
- Track ripple state: `const [ripple, setRipple] = useState(false)`
- On submit: `setRipple(true)` → after 400ms: `setRipple(false)`
- A `motion.div` inside the input wrapper, `position: absolute`, `inset: 0`, `border-radius: 12px`, `pointerEvents: 'none'`
- When `ripple`: `animate={{ scale: 1.02, opacity: 0 }}` from `initial={{ scale: 1, opacity: 0.3 }}` with `background: rgba(0,212,255,0.15)`, `transition={{ duration: 0.4 }}`

**Context chips (below input wrapper):**
- `width: 80%`, `margin: 0 auto`, `padding-top: 6px`, `display: flex; gap: 8px`
- Each chip: `padding: 3px 12px`, `border-radius: 20px`, `border: 1px solid rgba(0,212,255,0.15)`, `background: rgba(0,212,255,0.05)`, `font-size: 11px`, `color: var(--shell-text-muted)`, `cursor: pointer`
- Hover: `border-color: rgba(0,212,255,0.4)`, `background: rgba(0,212,255,0.1)`, `color: var(--shell-text-primary)`

---

## 5. CSS Additions (`app/globals.css`)

All new additions go in the `.shell-theme` block or as global keyframes.

```css
/* Hex grid background — pointy-top hexagons, tile 80×92px */
.canvas-hex-grid {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='92'%3E%3Cpath d='M20,1 L39,11.5 L39,34.5 L20,45 L1,34.5 L1,11.5 Z' fill='none' stroke='%2300d4ff' stroke-opacity='0.05' stroke-width='0.5'/%3E%3Cpath d='M60,47 L79,57.5 L79,80.5 L60,91 L41,80.5 L41,57.5 Z' fill='none' stroke='%2300d4ff' stroke-opacity='0.05' stroke-width='0.5'/%3E%3C/svg%3E");
  background-size: 80px 92px;
}

/* Logo pulse */
@keyframes logo-pulse {
  0%, 100% { opacity: 1 }
  50% { opacity: 0.6 }
}
.logo-pulse { animation: logo-pulse 3s ease-in-out infinite; }

/* Scan-line sweep — used by SystemBar (4s) and SignalFeed header (6s) */
@keyframes scan-line-sweep {
  0%   { transform: translateY(0); opacity: 1 }
  80%  { opacity: 1 }
  100% { transform: translateY(var(--scan-height, 56px)); opacity: 0 }
}
.scan-line-sweep { animation: scan-line-sweep var(--scan-duration, 4s) linear infinite; }

/* Arc ring rotation */
@keyframes arc-rotate {
  0%   { transform: rotate(0deg) }
  100% { transform: rotate(360deg) }
}

/* Arc reactor breathe */
@keyframes arc-reactor-breathe {
  0%, 100% { opacity: 0.5; transform: scale(1) }
  50%       { opacity: 0.9; transform: scale(1.04) }
}
.arc-reactor-breathe { animation: arc-reactor-breathe 2s ease-in-out infinite; }

/* Panel glow pulse — active/loading only */
@keyframes panel-glow-pulse {
  0%, 100% { box-shadow: 0 0 8px rgba(0,212,255,0.15), inset 0 0 8px rgba(0,212,255,0.03) }
  50%       { box-shadow: 0 0 20px rgba(0,212,255,0.3), inset 0 0 12px rgba(0,212,255,0.06) }
}
.canvas-panel[data-status="loading"],
.canvas-panel[data-status="active"] {
  animation: panel-glow-pulse 2s ease-in-out infinite;
}
.canvas-panel[data-status="completed"] {
  /* Static border, no glow */
  border-color: rgba(0,255,136,0.2);
}
.canvas-panel[data-status="error"] {
  /* Static border, no glow */
  border-color: rgba(255,68,102,0.3);
}

/* CommandBar typing glow */
@keyframes cmd-glow {
  0%, 100% { border-color: rgba(0,212,255,0.4) }
  50%       { border-color: rgba(0,212,255,0.7) }
}
.cmd-typing { animation: cmd-glow 1.5s ease-in-out infinite; }

/* Spinner */
@keyframes spin {
  0%   { transform: rotate(0deg) }
  100% { transform: rotate(360deg) }
}

/* Thin scrollbar for SignalFeed */
.signal-feed-scroll {
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(0,212,255,0.2) transparent;
}
```

---

## 6. Files Affected

| File | Change |
|------|--------|
| `app/globals.css` | Replace color palette tokens, add all keyframes and utility classes above |
| `app/(shell)/layout.tsx` | Replace `AmbientBar` → `SystemBar` (same `onOpenPalette` prop); remove `AgentStream` and sidebar flex wrapper; add `<SignalFeed />`; update imports |
| `components/agent-shell/ambient-bar.tsx` | Delete — replaced by `system-bar.tsx` |
| `components/agent-shell/system-bar.tsx` | Create: prop `onOpenPalette?: () => void`, height 56px, left/center/right sections, scan-line |
| `components/agent-shell/agent-stream.tsx` | Delete — replaced by `signal-feed.tsx` |
| `components/agent-shell/signal-feed.tsx` | Create: fixed overlay, visibility state machine, `AnimatePresence`, entry rows |
| `components/agent-shell/canvas.tsx` | Replace `canvas-dot-grid` with `canvas-hex-grid`; add arc ring SVG; replace empty placeholder with arc reactor idle |
| `components/agent-shell/canvas-panel.tsx` | Add `LBracketCorners` sub-component (`<span>` based); add spawn scan-line `motion.div`; update `data-status` styling |
| `components/agent-shell/command-bar.tsx` | 80px height; wrap input in styled div (80% width, centered); loading spinner; submit ripple; restyle chips |

---

## 7. Non-Goals

- No changes to panel content components (`GA4SummaryPanel`, `SeminarStatusPanel`, etc.)
- No changes to store logic (`canvas-store.ts`, `agent-stream-store.ts`)
- No new API endpoints
- No mobile layout changes (shell is desktop-only ≥1024px, existing media query preserved)
- No changes to `CommandPalette`
