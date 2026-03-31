# Garnet Agent Shell — JARVIS UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Agent Shell from a terminal-style interface into a JARVIS/Iron Man-style holographic command center with arc reactor cyan palette, hexagon grid canvas, and glowing panels.

**Architecture:** Pure UI/visual overhaul — no store changes, no API changes. Replace CSS variables + add keyframes in globals.css. Replace AmbientBar with SystemBar (56px, scan-line), remove AgentStream sidebar (replaced by fixed SignalFeed overlay). Update Canvas, CanvasPanel, and CommandBar in-place.

**Tech Stack:** Next.js 15, Tailwind CSS, Framer Motion, Zustand (read-only for SignalFeed visibility logic)

**Spec:** `docs/superpowers/specs/2026-03-31-garnet-agent-shell-jarvis-overhaul-design.md`

---

## Chunk 1: CSS foundation + new components

### Task 1: Update CSS — color palette, keyframes, utility classes

**Files:**
- Modify: `app/globals.css` (lines 635–717, the `.shell-theme` block through end of canvas classes)

- [ ] **Step 1: Replace the `.shell-theme` variable block**

Find the existing block (starts at line ~635):
```css
.shell-theme {
  color-scheme: dark;
  --shell-bg: #0a0a0f;
  ...
}
```

Replace it with:
```css
.shell-theme {
  color-scheme: dark;

  --shell-bg: #050810;
  --shell-surface: rgba(0,20,40,0.8);
  --shell-surface-hover: rgba(0,212,255,0.05);
  --shell-border: rgba(0,212,255,0.15);
  --shell-border-active: rgba(0,212,255,0.5);

  --shell-text-primary: #a8d8ff;
  --shell-text-secondary: #6aabcc;
  --shell-text-muted: #3a6080;

  --shell-accent: #00d4ff;
  --shell-accent-secondary: #0066ff;
  --shell-accent-glow: rgba(0,212,255,0.2);
  --shell-glow: rgba(0,212,255,0.2);

  --shell-status-running: #00d4ff;
  --shell-status-success: #00ff88;
  --shell-status-error: #ff4466;
  --shell-status-idle: #3a6080;
}
```

- [ ] **Step 2: Replace canvas-panel CSS block**

Replace the existing `.canvas-panel`, `.canvas-panel[data-status='loading']`, `.canvas-panel[data-status='completed']`, and `@keyframes shell-scan-line` rules (lines ~658–679) with:

```css
/* Canvas panel base */
.canvas-panel {
  background: rgba(0,12,28,0.92);
  border: 1px solid rgba(0,212,255,0.2);
  border-radius: 12px;
  backdrop-filter: blur(16px);
  color: var(--shell-text-primary);
  position: relative;
}

.canvas-panel[data-status='loading'],
.canvas-panel[data-status='active'] {
  animation: panel-glow-pulse 2s ease-in-out infinite;
}
.canvas-panel[data-status='completed'] {
  border-color: rgba(0,255,136,0.2);
}
.canvas-panel[data-status='error'] {
  border-color: rgba(255,68,102,0.3);
}
```

- [ ] **Step 3: Replace canvas-dot-grid with canvas-hex-grid, keep canvas-noise**

Replace:
```css
.canvas-dot-grid {
  background-image: radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px);
  background-size: 28px 28px;
}
```

With:
```css
/* Hexagon grid — pointy-top, tile 80×92px, two staggered hexagons */
.canvas-hex-grid {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='92'%3E%3Cpath d='M20,1 L39,11.5 L39,34.5 L20,45 L1,34.5 L1,11.5 Z' fill='none' stroke='%2300d4ff' stroke-opacity='0.05' stroke-width='0.5'/%3E%3Cpath d='M60,47 L79,57.5 L79,80.5 L60,91 L41,80.5 L41,57.5 Z' fill='none' stroke='%2300d4ff' stroke-opacity='0.05' stroke-width='0.5'/%3E%3C/svg%3E");
  background-size: 80px 92px;
}
```

- [ ] **Step 4: Replace command-bar-input focus rule**

Replace:
```css
.command-bar-input:focus {
  outline: none;
  box-shadow: 0 0 0 1px rgba(49, 130, 246, 0.5), 0 0 16px rgba(49, 130, 246, 0.15);
}
```

With (keep `.command-bar-input:focus` selector but remove — the CommandBar redesign no longer uses this class on the input directly; the focus is handled via wrapper state. Delete this rule entirely):
```css
/* command-bar-input focus rule removed — handled by wrapper div in component */
```

- [ ] **Step 5: Add all new keyframes and utility classes**

Append at the end of the file (after the `.canvas-noise::after` rule):

```css
/* ── JARVIS UI — keyframes and utilities ── */

/* Logo pulse */
@keyframes logo-pulse {
  0%, 100% { opacity: 1 }
  50%       { opacity: 0.6 }
}
.logo-pulse { animation: logo-pulse 3s ease-in-out infinite; }

/* Scan-line sweep — SystemBar (default 56px/4s), overridable via CSS vars */
@keyframes scan-line-sweep {
  0%   { transform: translateY(0); opacity: 1 }
  80%  { opacity: 1 }
  100% { transform: translateY(var(--scan-height, 56px)); opacity: 0 }
}
.scan-line-sweep {
  animation: scan-line-sweep var(--scan-duration, 4s) linear infinite;
}

/* Arc ring rotation */
@keyframes arc-rotate {
  0%   { transform: rotate(0deg) }
  100% { transform: rotate(360deg) }
}

/* Arc reactor idle breathe */
@keyframes arc-reactor-breathe {
  0%, 100% { opacity: 0.5; transform: scale(1) }
  50%       { opacity: 0.9; transform: scale(1.04) }
}
.arc-reactor-breathe { animation: arc-reactor-breathe 2s ease-in-out infinite; }

/* Panel glow pulse */
@keyframes panel-glow-pulse {
  0%, 100% {
    box-shadow: 0 0 8px rgba(0,212,255,0.15), inset 0 0 8px rgba(0,212,255,0.03);
  }
  50% {
    box-shadow: 0 0 20px rgba(0,212,255,0.3), inset 0 0 12px rgba(0,212,255,0.06);
  }
}

/* CommandBar typing glow */
@keyframes cmd-glow {
  0%, 100% { border-color: rgba(0,212,255,0.4) }
  50%       { border-color: rgba(0,212,255,0.7) }
}
.cmd-typing { animation: cmd-glow 1.5s ease-in-out infinite; }

/* Spinner for loading state */
@keyframes spin {
  0%   { transform: rotate(0deg) }
  100% { transform: rotate(360deg) }
}

/* L-bracket corner decorations for canvas panels */
.lb-tl, .lb-tr, .lb-bl, .lb-br {
  position: absolute;
  width: 12px;
  height: 12px;
  pointer-events: none;
  z-index: 1;
}
.lb-tl { top: 0; left: 0; }
.lb-tl::before {
  content: '';
  position: absolute;
  top: 0; left: 0;
  width: 12px; height: 2px;
  background: #00d4ff;
}
.lb-tl::after {
  content: '';
  position: absolute;
  top: 0; left: 0;
  width: 2px; height: 12px;
  background: #00d4ff;
}

.lb-tr { top: 0; right: 0; }
.lb-tr::before {
  content: '';
  position: absolute;
  top: 0; right: 0;
  width: 12px; height: 2px;
  background: #00d4ff;
}
.lb-tr::after {
  content: '';
  position: absolute;
  top: 0; right: 0;
  width: 2px; height: 12px;
  background: #00d4ff;
}

.lb-bl { bottom: 0; left: 0; }
.lb-bl::before {
  content: '';
  position: absolute;
  bottom: 0; left: 0;
  width: 12px; height: 2px;
  background: #00d4ff;
}
.lb-bl::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0;
  width: 2px; height: 12px;
  background: #00d4ff;
}

.lb-br { bottom: 0; right: 0; }
.lb-br::before {
  content: '';
  position: absolute;
  bottom: 0; right: 0;
  width: 12px; height: 2px;
  background: #00d4ff;
}
.lb-br::after {
  content: '';
  position: absolute;
  bottom: 0; right: 0;
  width: 2px; height: 12px;
  background: #00d4ff;
}

/* Thin scrollbar for SignalFeed */
.signal-feed-scroll {
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(0,212,255,0.2) transparent;
}
```

- [ ] **Step 6: Verify build compiles**

```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Run tests to confirm no regressions**

```bash
cd "/Users/rnr/Documents/New project" && npx vitest run
```

Expected: all tests pass (CSS changes don't affect logic tests)

- [ ] **Step 8: Commit**

```bash
cd "/Users/rnr/Documents/New project"
git add app/globals.css
git commit -m "feat(shell): update CSS — JARVIS palette, hex grid, all keyframes"
```

---

### Task 2: Create SystemBar component

**Files:**
- Create: `components/agent-shell/system-bar.tsx`

- [ ] **Step 1: Create the file**

Create `components/agent-shell/system-bar.tsx` with the full content:

```tsx
'use client';

import { useEffect, useState } from 'react';

type DotStatus = 'running' | 'idle' | 'error';

export function SystemBar({ onOpenPalette }: { onOpenPalette?: () => void }) {
  const [statuses, setStatuses] = useState<Record<string, DotStatus>>({});
  const [clock, setClock] = useState('');

  // Poll job status every 30s — same endpoint as old AmbientBar
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/agent/job-status');
        if (res.ok) setStatuses(await res.json());
      } catch {}
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  // Live clock — HH:MM:SS
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(
        [now.getHours(), now.getMinutes(), now.getSeconds()]
          .map((n) => String(n).padStart(2, '0'))
          .join(':')
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const runningCount = Object.values(statuses).filter((s) => s === 'running').length;
  const isRunning = runningCount > 0;

  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        background: 'rgba(0,8,20,0.9)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0,212,255,0.2)',
        boxShadow: '0 1px 0 rgba(0,212,255,0.1), 0 4px 20px rgba(0,212,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
      }}
    >
      {/* Scan-line sweep */}
      <div
        className="scan-line-sweep"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 2,
          background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.6), transparent)',
          pointerEvents: 'none',
        }}
      />

      {/* Left: logo + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          className="logo-pulse"
          style={{
            color: 'var(--shell-accent)',
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '0.2em',
          }}
        >
          ◈ GARNET
        </span>
        <div style={{ width: 1, height: 16, background: 'rgba(0,212,255,0.2)' }} />
        <span
          style={{
            fontSize: 11,
            color: isRunning ? 'var(--shell-accent)' : 'var(--shell-text-muted)',
            letterSpacing: '0.1em',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span className={isRunning ? 'dot-running' : ''} style={{ fontSize: 8 }}>●</span>
          {isRunning
            ? `SYSTEM ACTIVE ● ${runningCount} JOB${runningCount > 1 ? 'S' : ''} RUNNING`
            : 'SYSTEM ACTIVE ● STANDBY'}
        </span>
      </div>

      {/* Center: clock */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          color: 'var(--shell-text-muted)',
          letterSpacing: '0.2em',
        }}
      >
        {clock}
      </div>

      {/* Right: ⌘K button */}
      <button
        onClick={onOpenPalette}
        style={{
          fontSize: 11,
          color: 'var(--shell-text-muted)',
          background: 'rgba(0,212,255,0.05)',
          border: '1px solid rgba(0,212,255,0.25)',
          borderRadius: 6,
          padding: '2px 8px',
          cursor: 'pointer',
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLButtonElement).style.background = 'rgba(0,212,255,0.1)';
          (e.target as HTMLButtonElement).style.color = 'var(--shell-text-primary)';
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLButtonElement).style.background = 'rgba(0,212,255,0.05)';
          (e.target as HTMLButtonElement).style.color = 'var(--shell-text-muted)';
        }}
      >
        ⌘K
      </button>
    </header>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd "/Users/rnr/Documents/New project"
git add components/agent-shell/system-bar.tsx
git commit -m "feat(shell): add SystemBar — JARVIS header with scan-line, clock, job status"
```

---

### Task 3: Create SignalFeed component

**Files:**
- Create: `components/agent-shell/signal-feed.tsx`

- [ ] **Step 1: Create the file**

Create `components/agent-shell/signal-feed.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStreamStore, type StreamEntry } from '@/lib/agent-stream-store';

function EntryRow({ entry }: { entry: StreamEntry }) {
  const statusColor =
    entry.status === 'running' ? 'var(--shell-status-running)'
    : entry.status === 'error' ? 'var(--shell-status-error)'
    : 'var(--shell-status-success)';

  return (
    <div
      className="stream-entry px-3 py-2 rounded"
      style={{ cursor: 'default' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ color: statusColor, fontSize: 10 }}>
          {entry.status === 'running' ? '▸' : entry.status === 'error' ? '✗' : '✓'}
        </span>
        <span
          style={{
            color: 'var(--shell-text-primary)',
            fontSize: 12,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 220,
          }}
        >
          {entry.label}
        </span>
      </div>
      {entry.steps.slice(-3).map((step, i) => (
        <div
          key={i}
          style={{
            paddingLeft: 16,
            fontSize: 11,
            color: 'var(--shell-text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {step.status === 'running' && (
            <span style={{ color: 'var(--shell-accent)' }}>↳ </span>
          )}
          {step.status === 'done' && (
            <span style={{ color: 'var(--shell-status-success)' }}>✓ </span>
          )}
          {step.status === 'error' && (
            <span style={{ color: 'var(--shell-status-error)' }}>✗ </span>
          )}
          {step.text}
        </div>
      ))}
    </div>
  );
}

export function SignalFeed() {
  const entries = useStreamStore((s) => s.entries);
  const [visible, setVisible] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasRunning = entries.some((e) => e.status === 'running');

  useEffect(() => {
    if (hasRunning) {
      // Cancel any pending hide timer
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      hideTimerRef.current = null;
      countdownRef.current = null;
      setCountdown(null);
      setVisible(true);
    } else if (visible) {
      // Start 3s hide countdown
      let secs = 3;
      setCountdown(secs);
      countdownRef.current = setInterval(() => {
        secs -= 1;
        if (secs <= 0) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          setCountdown(null);
        } else {
          setCountdown(secs);
        }
      }, 1000);
      hideTimerRef.current = setTimeout(() => {
        setVisible(false);
      }, 3000);
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [hasRunning, visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed',
            bottom: 96,
            right: 16,
            width: 300,
            maxHeight: 280,
            zIndex: 50,
            background: 'rgba(0,12,28,0.92)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(0,212,255,0.2)',
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              height: 36,
              flexShrink: 0,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
              borderBottom: '1px solid rgba(0,212,255,0.1)',
            }}
          >
            {/* Header scan-line — 36px height, 6s loop */}
            <div
              className="scan-line-sweep"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: 2,
                background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)',
                pointerEvents: 'none',
                '--scan-height': '36px',
                '--scan-duration': '6s',
              } as React.CSSProperties}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.25em',
                color: 'var(--shell-text-muted)',
              }}
            >
              SIGNAL FEED
            </span>
            {countdown !== null && (
              <span style={{ fontSize: 10, color: 'var(--shell-text-muted)' }}>
                CLOSING IN {countdown}s
              </span>
            )}
          </div>

          {/* Entries */}
          <div className="signal-feed-scroll" style={{ flex: 1, padding: '4px 0' }}>
            {entries.length === 0 ? (
              <div
                style={{
                  padding: '12px',
                  fontSize: 11,
                  color: 'var(--shell-text-muted)',
                  textAlign: 'center',
                }}
              >
                대기 중...
              </div>
            ) : (
              entries.map((e) => <EntryRow key={e.id} entry={e} />)
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd "/Users/rnr/Documents/New project"
git add components/agent-shell/signal-feed.tsx
git commit -m "feat(shell): add SignalFeed overlay — execution-only, auto-hides 3s after done"
```

---

## Chunk 2: Layout wiring + component updates + cleanup

### Task 4: Update Shell layout

**Files:**
- Modify: `app/(shell)/layout.tsx`

- [ ] **Step 1: Rewrite the layout file**

Replace the entire contents of `app/(shell)/layout.tsx` with:

```tsx
'use client';

import { CommandPalette } from '@/components/command-palette';
import { SystemBar } from '@/components/agent-shell/system-bar';
import { Canvas } from '@/components/agent-shell/canvas';
import { CommandBar } from '@/components/agent-shell/command-bar';
import { SignalFeed } from '@/components/agent-shell/signal-feed';

function openCommandPalette() {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
  );
}

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @media (max-width: 1023px) {
          .shell-wrapper { display: none !important; }
          .shell-mobile-fallback { display: flex !important; }
        }
        .shell-mobile-fallback { display: none; }
      `}</style>
      <div
        className="shell-mobile-fallback"
        style={{
          height: '100dvh', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12, background: '#050810', color: '#3a6080',
          fontSize: 14, textAlign: 'center', padding: 24
        }}
      >
        <span style={{ fontSize: 32 }}>◈</span>
        <p>Agent Shell은 데스크탑(1024px+)에서 사용하세요.</p>
        <a href="/operations" style={{ color: '#00d4ff', textDecoration: 'none' }}>
          → 기존 화면으로 이동
        </a>
      </div>
      <div
        className="shell-wrapper shell-theme flex flex-col"
        style={{ height: '100dvh', background: 'var(--shell-bg)', overflow: 'hidden' }}
      >
        <SystemBar onOpenPalette={openCommandPalette} />
        <Canvas />
        <CommandBar />
        <SignalFeed />
        <CommandPalette />
        {children}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Run tests**

```bash
cd "/Users/rnr/Documents/New project" && npx vitest run
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
cd "/Users/rnr/Documents/New project"
git add app/(shell)/layout.tsx
git commit -m "feat(shell): update layout — SystemBar + full-width Canvas + SignalFeed overlay"
```

---

### Task 5: Update Canvas — hex grid + arc rings + arc reactor idle

**Files:**
- Modify: `components/agent-shell/canvas.tsx`

- [ ] **Step 1: Rewrite canvas.tsx**

Replace the entire contents of `components/agent-shell/canvas.tsx` with:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '@/lib/canvas-store';
import { CanvasPanel } from './canvas-panel';

function ArcReactorIdle() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 20,
        pointerEvents: 'none',
      }}
    >
      {/* Concentric rings */}
      <div className="arc-reactor-breathe" style={{ position: 'relative', width: 112, height: 112 }}>
        {/* Outer ring */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '1px solid rgba(0,212,255,0.15)',
          }}
        />
        {/* Middle ring */}
        <div
          style={{
            position: 'absolute',
            inset: 16,
            borderRadius: '50%',
            border: '1px solid rgba(0,212,255,0.3)',
            boxShadow: '0 0 12px rgba(0,212,255,0.2)',
          }}
        />
        {/* Inner ring */}
        <div
          style={{
            position: 'absolute',
            inset: 32,
            borderRadius: '50%',
            border: '1px solid rgba(0,212,255,0.5)',
            boxShadow: '0 0 8px rgba(0,212,255,0.4), inset 0 0 8px rgba(0,212,255,0.2)',
          }}
        />
        {/* Center dot */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#00d4ff',
            boxShadow: '0 0 12px #00d4ff',
          }}
        />
      </div>
      <p
        style={{
          fontSize: 10,
          letterSpacing: '0.3em',
          color: 'var(--shell-text-muted)',
          margin: 0,
        }}
      >
        STANDBY
      </p>
    </div>
  );
}

export function Canvas() {
  const panels = useCanvasStore((s) => s.panels);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setDims({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="canvas-hex-grid canvas-noise flex-1 relative overflow-hidden"
      style={{ background: 'var(--shell-bg)' }}
      data-canvas-width={dims.width}
      data-canvas-height={dims.height}
    >
      {/* Arc ring overlay — two rotating concentric circles */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        <g style={{ transformOrigin: 'center', animation: 'arc-rotate 60s linear infinite' }}>
          <circle
            cx="50%"
            cy="50%"
            r="42%"
            fill="none"
            stroke="rgba(0,212,255,0.06)"
            strokeWidth="1"
          />
        </g>
        <g style={{ transformOrigin: 'center', animation: 'arc-rotate 40s linear reverse infinite' }}>
          <circle
            cx="50%"
            cy="50%"
            r="27%"
            fill="none"
            stroke="rgba(0,212,255,0.04)"
            strokeWidth="0.5"
          />
        </g>
      </svg>

      <AnimatePresence>
        {panels.map((panel) => (
          <CanvasPanel key={panel.id} panel={panel} />
        ))}
      </AnimatePresence>

      {panels.length === 0 && <ArcReactorIdle />}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd "/Users/rnr/Documents/New project"
git add components/agent-shell/canvas.tsx
git commit -m "feat(shell): update Canvas — hex grid bg, rotating arc rings, arc reactor idle state"
```

---

### Task 6: Update CanvasPanel — L-brackets + spawn scan-line + updated styles

**Files:**
- Modify: `components/agent-shell/canvas-panel.tsx`

- [ ] **Step 1: Rewrite canvas-panel.tsx**

Replace the entire contents of `components/agent-shell/canvas-panel.tsx` with:

```tsx
'use client';

import { motion } from 'framer-motion';
import { Rnd } from 'react-rnd';
import { useCanvasStore, type CanvasPanel as CanvasPanelType } from '@/lib/canvas-store';
import { GA4SummaryPanel } from '@/components/panels/ga4-summary-panel';
import { SeminarStatusPanel } from '@/components/panels/seminar-status-panel';
import { IntelBriefPanel } from '@/components/panels/intel-brief-panel';
import { VideoStatusPanel } from '@/components/panels/video-status-panel';
import { ApprovalPanel } from '@/components/panels/approval-panel';

const panelVariants = {
  hidden:  { opacity: 0, scale: 0.92, y: 8 },
  visible: { opacity: 1, scale: 1,    y: 0,
             transition: { type: 'spring' as const, stiffness: 300, damping: 25 } },
  exit:    { opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.15 } }
};

// L-bracket corner decorations — four cyan corner accents
function LBracketCorners() {
  return (
    <>
      <span className="lb-tl" />
      <span className="lb-tr" />
      <span className="lb-bl" />
      <span className="lb-br" />
    </>
  );
}

export function CanvasPanel({ panel }: { panel: CanvasPanelType }) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const removePanel = useCanvasStore((s) => s.removePanel);

  // IMPORTANT: Rnd owns absolute positioning (x, y). The motion.div handles
  // only opacity/scale animation — no left/top on motion.div to avoid double-offset.
  return (
    <Rnd
      position={{ x: panel.position.x, y: panel.position.y }}
      size={{ width: panel.size.width, height: panel.size.height }}
      minWidth={280}
      minHeight={180}
      bounds="parent"
      onDragStop={(_, d) => updatePanel(panel.id, { position: { x: d.x, y: d.y } })}
      onResizeStop={(_, __, ref, ___, pos) =>
        updatePanel(panel.id, {
          size: { width: ref.offsetWidth, height: ref.offsetHeight },
          position: { x: pos.x, y: pos.y }
        })
      }
      style={{ position: 'absolute', zIndex: 10 }}
    >
      <motion.div
        key={panel.id}
        variants={panelVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        style={{ width: '100%', height: '100%', position: 'relative' }}
      >
        {/* Spawn scan-line — sweeps top to bottom once on mount */}
        <motion.div
          initial={{ top: 0, opacity: 1 }}
          animate={{ top: '100%', opacity: 0 }}
          transition={{ duration: 0.3, ease: 'linear' }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 2,
            background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.8), transparent)',
            pointerEvents: 'none',
            zIndex: 11,
          }}
        />

        <div
          className="canvas-panel flex flex-col h-full"
          data-status={panel.status}
        >
          <LBracketCorners />

          {/* Panel header */}
          <div
            className="flex items-center justify-between px-3 py-2 cursor-move"
            style={{ borderBottom: '1px solid rgba(0,212,255,0.1)', flexShrink: 0 }}
          >
            <div className="flex items-center gap-2">
              {panel.status === 'loading' && (
                <span className="dot-running" style={{ color: 'var(--shell-accent)', fontSize: 10 }}>●</span>
              )}
              {panel.status === 'completed' && (
                <span style={{ color: 'var(--shell-status-success)', fontSize: 10 }}>●</span>
              )}
              {panel.status === 'error' && (
                <span style={{ color: 'var(--shell-status-error)', fontSize: 10 }}>●</span>
              )}
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--shell-text-primary)' }}>
                {panel.title}
              </span>
            </div>
            <button
              onClick={() => removePanel(panel.id)}
              style={{
                color: 'var(--shell-text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0 2px',
                fontSize: 16,
                lineHeight: 1,
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--shell-text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--shell-text-muted)')}
            >
              ×
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-auto p-3">
            {panel.type === 'generic' ? (
              panel.status === 'loading' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--shell-text-muted)', fontSize: 12 }}>
                  <span className="dot-running" style={{ color: 'var(--shell-accent)' }}>●</span>
                  처리 중...
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--shell-text-secondary)', whiteSpace: 'pre-wrap' }}>
                  {panel.data.markdown}
                </p>
              )
            ) : (
              <TypedPanelContent panel={panel} />
            )}
          </div>
        </div>
      </motion.div>
    </Rnd>
  );
}

function TypedPanelContent({ panel }: { panel: CanvasPanelType }) {
  switch (panel.type) {
    case 'ga4':      return <GA4SummaryPanel data={panel.data} />;
    case 'seminar':  return <SeminarStatusPanel data={panel.data} />;
    case 'intel':    return <IntelBriefPanel data={panel.data} />;
    case 'video':    return <VideoStatusPanel data={panel.data} />;
    case 'approval': return <ApprovalPanel data={panel.data} />;
    default:         return null;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd "/Users/rnr/Documents/New project"
git add components/agent-shell/canvas-panel.tsx
git commit -m "feat(shell): update CanvasPanel — L-brackets, spawn scan-line, cyan border pulse"
```

---

### Task 7: Update CommandBar — 80px, centered input, typing glow, ripple, chips

**Files:**
- Modify: `components/agent-shell/command-bar.tsx`

- [ ] **Step 1: Rewrite command-bar.tsx**

Replace the entire contents of `components/agent-shell/command-bar.tsx` with:

```tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useCanvasStore, getNextPanelPosition } from '@/lib/canvas-store';
import { useStreamStore } from '@/lib/agent-stream-store';

export function CommandBar() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [ripple, setRipple] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const panels = useCanvasStore((s) => s.panels);
  const spawnPanel = useCanvasStore((s) => s.spawnPanel);
  const history = useCanvasStore((s) => s.history);
  const addEntry = useStreamStore((s) => s.addEntry);
  const addStep = useStreamStore((s) => s.addStep);
  const setEntryStatus = useStreamStore((s) => s.setEntryStatus);

  const handleSubmit = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    setInput('');
    setLoading(true);
    setRipple(true);
    setTimeout(() => setRipple(false), 400);

    const entryId = addEntry(text.trim());

    try {
      const res = await fetch('/api/agent/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() })
      });

      if (!res.ok || !res.body) throw new Error('Command failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            handleSSEEvent(event, entryId, panels, spawnPanel, addStep, setEntryStatus, router);
          } catch {}
        }
      }
    } catch {
      setEntryStatus(entryId, 'error');
    } finally {
      setLoading(false);
    }
  }, [loading, panels, spawnPanel, addEntry, addStep, setEntryStatus, router]);

  // Input wrapper border: focused state > typing glow > default
  const wrapperBorder = focused && !loading
    ? 'rgba(0,212,255,0.6)'
    : 'rgba(0,212,255,0.25)';
  const wrapperShadow = focused && !loading
    ? '0 0 0 1px rgba(0,212,255,0.2), 0 0 20px rgba(0,212,255,0.1)'
    : 'none';

  return (
    <div
      style={{
        flexShrink: 0,
        minHeight: 80,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        background: 'rgba(0,5,15,0.9)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(0,212,255,0.1)',
        padding: '0 0 8px',
      }}
    >
      {/* Input wrapper — 80% width, centered */}
      <div
        style={{
          width: '80%',
          margin: '0 auto',
          position: 'relative',
        }}
      >
        <div
          className={input.length > 0 && !loading ? 'cmd-typing' : ''}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            border: `1px solid ${wrapperBorder}`,
            borderRadius: 12,
            background: 'rgba(0,15,30,0.8)',
            padding: '12px 20px',
            boxShadow: wrapperShadow,
            transition: 'border-color 0.2s, box-shadow 0.2s',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Ripple overlay on submit — key forces re-mount to re-trigger animation */}
          <motion.div
            key={ripple ? 'ripple-on' : 'ripple-off'}
            initial={{ scale: 1, opacity: ripple ? 0.3 : 0 }}
            animate={ripple ? { scale: 1.02, opacity: 0 } : { scale: 1, opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 12,
              background: 'rgba(0,212,255,0.15)',
              pointerEvents: 'none',
            }}
          />

          {/* Loading spinner */}
          {loading && (
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                border: '2px solid rgba(0,212,255,0.15)',
                borderTopColor: '#00d4ff',
                animation: 'spin 0.8s linear infinite',
                flexShrink: 0,
                display: 'block',
              }}
            />
          )}

          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(input);
              }
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={loading ? 'Processing...' : 'Garnet에게 지시하세요...'}
            disabled={loading}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 14,
              color: 'var(--shell-text-primary)',
              caretColor: '#00d4ff',
              '--placeholder-color': loading ? '#00d4ff' : 'var(--shell-text-muted)',
            } as React.CSSProperties}
            className="command-bar-input"
          />
        </div>
      </div>

      {/* Context chips */}
      <div
        style={{
          width: '80%',
          margin: '6px auto 0',
          display: 'flex',
          gap: 8,
        }}
      >
        <Chip label="Domains ↗" onClick={() => router.push('/operations')} />
        <Chip label={`History (${history.length})`} onClick={undefined} />
      </div>
    </div>
  );
}

function Chip({ label, onClick }: { label: string; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontSize: 11,
        padding: '3px 12px',
        borderRadius: 20,
        border: `1px solid ${hovered ? 'rgba(0,212,255,0.4)' : 'rgba(0,212,255,0.15)'}`,
        background: hovered ? 'rgba(0,212,255,0.1)' : 'rgba(0,212,255,0.05)',
        color: hovered ? 'var(--shell-text-primary)' : 'var(--shell-text-muted)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

// SSE event handler
function handleSSEEvent(
  event: Record<string, unknown>,
  entryId: string,
  panels: ReturnType<typeof useCanvasStore.getState>['panels'],
  spawnPanel: ReturnType<typeof useCanvasStore.getState>['spawnPanel'],
  addStep: ReturnType<typeof useStreamStore.getState>['addStep'],
  setEntryStatus: ReturnType<typeof useStreamStore.getState>['setEntryStatus'],
  router: ReturnType<typeof useRouter>
) {
  switch (event.event) {
    case 'step': {
      const d = event.data as { entryId: string; step: { text: string; status: string } };
      addStep(d.entryId, { text: d.step.text, status: d.step.status as never });
      break;
    }
    case 'panel': {
      const d = event.data as { type: string; title: string; data: unknown };
      const pos = getNextPanelPosition(panels, 800);
      const panelId = spawnPanel({
        type: d.type as never, title: d.title, status: 'active',
        position: pos, size: { width: 380, height: 260 }, data: d.data as never
      });
      setEntryStatus(entryId, 'running', panelId);
      break;
    }
    case 'done':
      setEntryStatus(entryId, 'done');
      break;
    case 'error': {
      const d = event.data as { message: string };
      setEntryStatus(entryId, 'error');
      addStep(entryId, { text: d.message, status: 'error' });
      break;
    }
    case 'navigate': {
      const d = event.data as { url: string };
      router.push(d.url);
      break;
    }
  }
}
```

Note: Add the placeholder color CSS to globals.css. Append in the JARVIS section after the `.signal-feed-scroll` rule:

```css
/* CommandBar placeholder color override for loading state */
.command-bar-input::placeholder {
  color: var(--placeholder-color, var(--shell-text-muted));
}
```

- [ ] **Step 2: Add placeholder CSS to globals.css**

Append the above rule to `app/globals.css` at the very end.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd "/Users/rnr/Documents/New project"
git add components/agent-shell/command-bar.tsx app/globals.css
git commit -m "feat(shell): update CommandBar — 80px hero, centered input, typing glow, ripple"
```

---

### Task 8: Delete old components + final verification

**Files:**
- Delete: `components/agent-shell/ambient-bar.tsx`
- Delete: `components/agent-shell/agent-stream.tsx`

- [ ] **Step 1: Delete the replaced files**

```bash
cd "/Users/rnr/Documents/New project"
rm components/agent-shell/ambient-bar.tsx
rm components/agent-shell/agent-stream.tsx
```

- [ ] **Step 2: Verify no import references remain**

```bash
cd "/Users/rnr/Documents/New project"
grep -r "ambient-bar\|AmbientBar\|agent-stream\|AgentStream" --include="*.tsx" --include="*.ts" -l | grep -v node_modules
```

Expected: no output (zero files import these)

- [ ] **Step 3: Full TypeScript check**

```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run full test suite**

```bash
cd "/Users/rnr/Documents/New project" && npx vitest run
```

Expected: all 30 tests pass

- [ ] **Step 5: Commit deletions**

```bash
cd "/Users/rnr/Documents/New project"
git add -u components/agent-shell/ambient-bar.tsx components/agent-shell/agent-stream.tsx
git commit -m "chore(shell): remove AmbientBar and AgentStream (replaced by SystemBar + SignalFeed)"
```

- [ ] **Step 6: Final build check**

```bash
cd "/Users/rnr/Documents/New project" && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no errors
