# Garnet Agent Shell UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Garnet's dashboard UI into a JARVIS-style personal agent command center — dark canvas with floating result panels, real-time agent stream, and a bottom command bar.

**Architecture:** Three-layer approach: (1) split Next.js route groups so the new Agent Shell gets its own layout independent of the existing AppNav/sidebar, (2) build a Zustand-managed canvas where the agent spawns typed floating panels, (3) connect a streaming SSE endpoint that drives both the stream log and panel lifecycle.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS, Framer Motion, react-rnd, Zustand, native SSE (no extra lib), Vitest for unit tests.

**Spec:** `docs/superpowers/specs/2026-03-31-garnet-agent-shell-ui-design.md`

---

## Chunk 1: Shell Foundation (Phase UI-1)

Route restructure + dark theme + shell skeleton components.

---

### Task 1: Install new dependencies

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install packages**

```bash
cd "/Users/rnr/Documents/New project"
npm install framer-motion react-rnd zustand
```

Expected: no peer-dep errors. React 19 is compatible with all three.

- [ ] **Step 2: Verify installs**

```bash
node -e "require('framer-motion'); require('react-rnd'); require('zustand'); console.log('OK')"
```

Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add framer-motion, react-rnd, zustand"
```

---

### Task 2: Restructure root layout → route groups

**Files:**
- Modify: `app/layout.tsx` — strip to html/body/font/Toaster only
- Create: `app/(shell)/layout.tsx` — Agent Shell layout
- Create: `app/(domains)/layout.tsx` — existing AppNav layout
- Move: `app/page.tsx` → `app/(domains)/home/page.tsx` (temporary holding)

> **Note:** `(shell)` and `(domains)` are Next.js route groups — parentheses mean they don't affect URLs. `/operations` stays `/operations` after moving to `app/(domains)/operations/`.

- [ ] **Step 1: Strip root layout to bare minimum**

Replace the entire content of `app/layout.tsx` with:

```typescript
import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'Garnet',
  description: 'Garnet'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={notoSansKr.variable}>
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Create domains layout**

Create `app/(domains)/layout.tsx`:

```typescript
import { AppNav } from '@/components/app-nav';
import { SupabaseAuthChip } from '@/components/supabase-auth-chip';
import { CommandPalette } from '@/components/command-palette';
import { CopilotSidebar } from '@/components/copilot-sidebar';

export default function DomainsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="app-shell">
        <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[200px_1fr]">
          <AppNav />
          <div className="min-w-0">
            <header className="app-topbar">
              <p className="text-[13px] font-semibold text-[#333d4b]">Garnet</p>
              <SupabaseAuthChip />
            </header>
            <main className="app-main">{children}</main>
          </div>
        </div>
      </div>
      <CommandPalette />
      <CopilotSidebar />
    </>
  );
}
```

- [ ] **Step 3: Handle existing `app/page.tsx`**

The current `app/page.tsx` is a 900+ line war-room/agent-execution form. It must be moved — otherwise both `app/page.tsx` and `app/(shell)/page.tsx` will claim `/`, causing a Next.js route conflict error.

Move it to `app/(domains)/home/page.tsx` (URL changes from `/` to `/home`):

```bash
cd "/Users/rnr/Documents/New project"
mkdir -p "app/(domains)/home"
mv "app/page.tsx" "app/(domains)/home/page.tsx"
```

This is intentional: the new Agent Shell becomes the home at `/`. The old form is still accessible at `/home` and linked from the Domains menu.

- [ ] **Step 4: Move existing domain pages into (domains) group**

Run these moves (URL-transparent in App Router — parenthesised route group folders don't affect URLs):

```bash
cd "/Users/rnr/Documents/New project"
mkdir -p "app/(domains)"

for dir in operations campaigns analytics sns seminar intel dashboard settings \
           history learning content social datasets video notifications goals \
           runs auth meta; do
  if [ -d "app/$dir" ]; then
    mv "app/$dir" "app/(domains)/$dir"
    echo "Moved $dir"
  fi
done
```

- [ ] **Step 5: Verify no route conflicts**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors about duplicate routes. If TypeScript reports module errors about moved paths, ensure `tsconfig.json` paths resolve correctly (the `@/` alias in `tsconfig.json` points to the project root, not `app/`, so existing imports are unaffected).

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx "app/(domains)/"
git commit -m "refactor: split root layout into (shell) and (domains) route groups"
```

---

### Task 3: Add dark theme CSS variables

**Files:**
- Modify: `app/globals.css` — add `.shell-theme` scope with dark vars

> We scope dark vars under `.shell-theme` class on the shell body, so existing domain pages keep their light theme untouched.

- [ ] **Step 1: Add shell theme variables to globals.css**

Append to the end of `app/globals.css`:

```css
/* ── Agent Shell Dark Theme ── */
.shell-theme {
  color-scheme: dark;

  --shell-bg: #0a0a0f;
  --shell-surface: rgba(255, 255, 255, 0.04);
  --shell-surface-hover: rgba(255, 255, 255, 0.06);
  --shell-border: rgba(255, 255, 255, 0.08);
  --shell-border-active: rgba(49, 130, 246, 0.4);

  --shell-text-primary: #e8eaed;
  --shell-text-secondary: #8b949e;
  --shell-text-muted: #484f58;

  --shell-accent: #3182f6;
  --shell-accent-glow: rgba(49, 130, 246, 0.15);

  --shell-status-running: #3182f6;
  --shell-status-success: #22c55e;
  --shell-status-error: #ef4444;
  --shell-status-idle: #484f58;
}

/* Canvas panel base */
.canvas-panel {
  background: var(--shell-surface);
  border: 1px solid var(--shell-border);
  border-radius: 12px;
  backdrop-filter: blur(12px);
  color: var(--shell-text-primary);
}

.canvas-panel[data-status='loading'] {
  animation: shell-scan-line 1.5s linear infinite;
}

.canvas-panel[data-status='completed'] {
  border-color: rgba(34, 197, 94, 0.5);
  transition: border-color 0.3s ease;
}

@keyframes shell-scan-line {
  0%   { border-top-color: rgba(49, 130, 246, 0); }
  50%  { border-top-color: rgba(49, 130, 246, 0.8); }
  100% { border-top-color: rgba(49, 130, 246, 0); }
}

/* Pulse dot animations */
@keyframes shell-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.25; }
}

.dot-running { animation: shell-pulse 1s ease-in-out infinite; }
.dot-error   { animation: shell-pulse 0.5s ease-in-out infinite; }

/* Shell stream monospace text */
.stream-entry {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.6;
}

/* Canvas dot-grid background */
.canvas-dot-grid {
  background-image: radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px);
  background-size: 28px 28px;
}

/* Shell command bar glow on focus-within */
.command-bar-input:focus {
  outline: none;
  box-shadow: 0 0 0 1px rgba(49, 130, 246, 0.5), 0 0 16px rgba(49, 130, 246, 0.15);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat(shell): add dark theme CSS variables and canvas panel styles"
```

---

### Task 4: Zustand canvas store

**Files:**
- Create: `lib/canvas-store.ts`
- Create: `lib/canvas-store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/canvas-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasStore } from './canvas-store';

// Vitest environment is 'node' (see vitest.config.ts) — no DOM, no act() needed
// Zustand setState is synchronous, so direct calls work without act()

beforeEach(() => {
  useCanvasStore.setState({ panels: [], history: [] });
});

describe('canvas store', () => {
  it('spawns a panel with generated id and timestamp', () => {
    useCanvasStore.getState().spawnPanel({
      type: 'generic',
      title: 'Test',
      status: 'loading',
      position: { x: 20, y: 20 },
      size: { width: 380, height: 260 },
      data: { markdown: 'hello' }
    });
    const panels = useCanvasStore.getState().panels;
    expect(panels).toHaveLength(1);
    expect(panels[0].id).toBeTruthy();
    expect(panels[0].spawnedAt).toBeGreaterThan(0);
  });

  it('updates a panel by id', () => {
    useCanvasStore.getState().spawnPanel({
      type: 'generic',
      title: 'Test',
      status: 'loading',
      position: { x: 0, y: 0 },
      size: { width: 380, height: 260 },
      data: { markdown: '' }
    });
    const id = useCanvasStore.getState().panels[0].id;
    useCanvasStore.getState().updatePanel(id, { status: 'completed' });
    expect(useCanvasStore.getState().panels[0].status).toBe('completed');
  });

  it('removes a panel and saves to history', () => {
    useCanvasStore.getState().spawnPanel({
      type: 'generic',
      title: 'Test',
      status: 'completed',
      position: { x: 0, y: 0 },
      size: { width: 380, height: 260 },
      data: { markdown: 'done' }
    });
    const id = useCanvasStore.getState().panels[0].id;
    useCanvasStore.getState().removePanel(id);
    expect(useCanvasStore.getState().panels).toHaveLength(0);
    expect(useCanvasStore.getState().history).toHaveLength(1);
    expect(useCanvasStore.getState().history[0].id).toBe(id);
  });

  it('evicts oldest completed panel when active count >= 4', () => {
    const spawn = useCanvasStore.getState().spawnPanel;
    for (let i = 0; i < 3; i++) {
      spawn({
        type: 'generic', title: `Panel ${i}`, status: 'completed',
        position: { x: i * 400, y: 0 }, size: { width: 380, height: 260 },
        data: { markdown: '' }
      });
    }
    spawn({
      type: 'generic', title: 'Active', status: 'active',
      position: { x: 0, y: 300 }, size: { width: 380, height: 260 },
      data: { markdown: '' }
    });
    // Spawn 5th — should evict oldest completed
    spawn({
      type: 'generic', title: 'New', status: 'loading',
      position: { x: 0, y: 0 }, size: { width: 380, height: 260 },
      data: { markdown: '' }
    });
    expect(useCanvasStore.getState().panels).toHaveLength(4);
    expect(useCanvasStore.getState().history).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "/Users/rnr/Documents/New project"
npx vitest run lib/canvas-store.test.ts 2>&1 | tail -20
```

Expected: FAIL — `canvas-store` module not found.

- [ ] **Step 3: Implement canvas store**

Create `lib/canvas-store.ts`:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// crypto.randomUUID() is a Web Crypto global — available in browser and Node 19+
// Do NOT use `import { randomUUID } from 'node:crypto'` — breaks browser bundle

// ── Panel data discriminated union ──────────────────────────────
export type GA4SummaryData = { metric: string; value: number; wow: number }
export type SeminarStatusData = { sessionId: string; round: number; maxRounds: number; status: string }
export type IntelBriefData = { trendCount: number; summary: string }
export type VideoStatusData = { jobId: string; progress: number; url?: string }
export type ApprovalData = { items: Array<{ id: string; label: string; type: string }> }

export type PanelData =
  | { type: 'ga4';      data: GA4SummaryData }
  | { type: 'seminar';  data: SeminarStatusData }
  | { type: 'intel';    data: IntelBriefData }
  | { type: 'video';    data: VideoStatusData }
  | { type: 'approval'; data: ApprovalData }
  | { type: 'generic';  data: { markdown: string } }

export type PanelStatus = 'loading' | 'active' | 'completed' | 'error'

export type CanvasPanel = {
  id: string
  title: string
  status: PanelStatus
  position: { x: number; y: number }
  size: { width: number; height: number }
  spawnedAt: number
} & PanelData

export type HistoryEntry = {
  id: string
  title: string
  type: PanelData['type']
  closedAt: number
  summary?: string
}

export type SpawnInput = Omit<CanvasPanel, 'id' | 'spawnedAt'>

const MAX_ACTIVE_PANELS = 4

type CanvasStore = {
  panels: CanvasPanel[]
  history: HistoryEntry[]
  spawnPanel: (input: SpawnInput) => string
  updatePanel: (id: string, patch: Partial<Omit<CanvasPanel, 'type' | 'data'>>) => void
  removePanel: (id: string) => void
  clearCompleted: () => void
}

export const useCanvasStore = create<CanvasStore>()(
  persist(
    (set, get) => ({
      panels: [],
      history: [],

      spawnPanel: (input) => {
        const id = crypto.randomUUID();
        const panel: CanvasPanel = { ...input, id, spawnedAt: Date.now() } as CanvasPanel;

        set((state) => {
          let panels = [...state.panels, panel];
          let history = [...state.history];

          // Evict oldest completed panel if at capacity
          if (panels.length > MAX_ACTIVE_PANELS) {
            const oldestCompletedIdx = panels
              .map((p, i) => ({ p, i }))
              .filter(({ p }) => p.status === 'completed')
              .sort((a, b) => a.p.spawnedAt - b.p.spawnedAt)[0]?.i;

            if (oldestCompletedIdx !== undefined) {
              const evicted = panels[oldestCompletedIdx];
              history = [
                { id: evicted.id, title: evicted.title, type: evicted.type,
                  closedAt: Date.now() },
                ...history
              ].slice(0, 100);
              panels = panels.filter((_, i) => i !== oldestCompletedIdx);
            }
          }

          return { panels, history };
        });

        return id;
      },

      updatePanel: (id, patch) => {
        set((state) => ({
          panels: state.panels.map((p) => (p.id === id ? { ...p, ...patch } : p))
        }));
      },

      removePanel: (id) => {
        set((state) => {
          const panel = state.panels.find((p) => p.id === id);
          if (!panel) return state;
          const entry: HistoryEntry = {
            id: panel.id, title: panel.title, type: panel.type, closedAt: Date.now()
          };
          return {
            panels: state.panels.filter((p) => p.id !== id),
            history: [entry, ...state.history].slice(0, 100)
          };
        });
      },

      clearCompleted: () => {
        set((state) => ({
          panels: state.panels.filter((p) => p.status !== 'completed')
        }));
      }
    }),
    { name: 'garnet-canvas-store', partialize: (s) => ({ history: s.history }) }
  )
);

// ── Panel position helper ────────────────────────────────────────
export function getNextPanelPosition(
  activePanels: CanvasPanel[],
  canvasWidth: number
): { x: number; y: number } {
  const PANEL_W = 380;
  const PANEL_H = 260;
  const GAP = 20;
  const cols = Math.max(1, Math.floor((canvasWidth - GAP) / (PANEL_W + GAP)));
  const idx = activePanels.length;
  return {
    x: GAP + (idx % cols) * (PANEL_W + GAP),
    y: GAP + Math.floor(idx / cols) * (PANEL_H + GAP)
  };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run lib/canvas-store.test.ts 2>&1 | tail -10
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas-store.ts lib/canvas-store.test.ts
git commit -m "feat(shell): add Zustand canvas store with panel lifecycle + history"
```

---

### Task 5: Shell layout components

**Files:**
- Create: `components/agent-shell/ambient-bar.tsx`
- Create: `components/agent-shell/agent-stream.tsx`
- Create: `components/agent-shell/canvas.tsx`
- Create: `components/agent-shell/canvas-panel.tsx`
- Create: `components/agent-shell/command-bar.tsx`
- Create: `lib/agent-stream-store.ts`

- [ ] **Step 1: Create agent stream store**

Create `lib/agent-stream-store.ts`:

```typescript
import { create } from 'zustand';

// crypto.randomUUID() is a Web Crypto global — do NOT import from node:crypto
export type StreamStepStatus = 'pending' | 'running' | 'done' | 'error'

export type StreamStep = {
  text: string
  status: StreamStepStatus
}

export type StreamEntry = {
  id: string
  label: string
  steps: StreamStep[]
  status: 'running' | 'done' | 'error'
  panelId?: string
  startedAt: number
}

type StreamStore = {
  entries: StreamEntry[]
  addEntry: (label: string) => string
  addStep: (entryId: string, step: StreamStep) => void
  updateStep: (entryId: string, stepIndex: number, patch: Partial<StreamStep>) => void
  setEntryStatus: (entryId: string, status: StreamEntry['status'], panelId?: string) => void
  clear: () => void
}

export const useStreamStore = create<StreamStore>()((set) => ({
  entries: [],

  addEntry: (label) => {
    const id = crypto.randomUUID();
    set((s) => ({
      entries: [
        { id, label, steps: [], status: 'running', startedAt: Date.now() },
        ...s.entries
      ].slice(0, 50)
    }));
    return id;
  },

  addStep: (entryId, step) => {
    set((s) => ({
      entries: s.entries.map((e) =>
        e.id === entryId ? { ...e, steps: [...e.steps, step] } : e
      )
    }));
  },

  updateStep: (entryId, stepIndex, patch) => {
    set((s) => ({
      entries: s.entries.map((e) =>
        e.id === entryId
          ? { ...e, steps: e.steps.map((st, i) => (i === stepIndex ? { ...st, ...patch } : st)) }
          : e
      )
    }));
  },

  setEntryStatus: (entryId, status, panelId) => {
    set((s) => ({
      entries: s.entries.map((e) =>
        e.id === entryId ? { ...e, status, ...(panelId ? { panelId } : {}) } : e
      )
    }));
  },

  clear: () => set({ entries: [] })
}));
```

- [ ] **Step 2: Create ambient-bar component**

Create `components/agent-shell/ambient-bar.tsx`:

```typescript
'use client';

// TODO Phase UI-2: import { useCanvasStore, getNextPanelPosition } from '@/lib/canvas-store'
// and wire dot clicks to spawnPanel

const JOB_DOTS = [
  { key: 'intel',   label: 'intel' },
  { key: 'seminar', label: 'seminar' },
  { key: 'video',   label: 'video' },
] as const;

export function AmbientBar({ onOpenPalette }: { onOpenPalette?: () => void }) {

  function dotClass(status: 'running' | 'idle' | 'error') {
    if (status === 'running') return 'dot-running text-[var(--shell-status-running)]';
    if (status === 'error')   return 'dot-error text-[var(--shell-status-error)]';
    return 'text-[var(--shell-text-muted)]';
  }

  // For now, all jobs shown as idle — Phase UI-2 will wire to real job state
  return (
    <header
      className="flex items-center justify-between px-4"
      style={{
        height: 40,
        background: 'rgba(0,0,0,0.6)',
        borderBottom: '1px solid var(--shell-border)',
        backdropFilter: 'blur(12px)',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3">
        <span className="text-[var(--shell-accent)] font-bold text-sm tracking-widest">◈ GARNET</span>
        <div className="w-px h-4 bg-[var(--shell-border)]" />
        {JOB_DOTS.map(({ key, label }) => (
          <button
            key={key}
            className={`flex items-center gap-1 text-[11px] ${dotClass('idle')} hover:opacity-80`}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
          >
            <span className={dotClass('idle')}>●</span>
            <span className="text-[var(--shell-text-muted)]">{label}</span>
          </button>
        ))}
      </div>

      {/* Command palette trigger */}
      <button
        onClick={onOpenPalette}
        className="text-[11px] text-[var(--shell-text-muted)] hover:text-[var(--shell-text-secondary)] transition-colors"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--shell-border)',
                 borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
      >
        ⌘K
      </button>
    </header>
  );
}
```

- [ ] **Step 3: Create agent-stream component**

Create `components/agent-shell/agent-stream.tsx`:

```typescript
'use client';

import { useStreamStore, type StreamEntry } from '@/lib/agent-stream-store';
import { useCanvasStore } from '@/lib/canvas-store';

function EntryRow({ entry }: { entry: StreamEntry }) {
  const panels = useCanvasStore((s) => s.panels);
  const spawnPanel = useCanvasStore((s) => s.spawnPanel);

  const statusColor = entry.status === 'running' ? 'var(--shell-status-running)'
    : entry.status === 'error' ? 'var(--shell-status-error)'
    : 'var(--shell-status-success)';

  return (
    <div
      className="stream-entry px-3 py-2 cursor-pointer hover:bg-[var(--shell-surface-hover)] rounded transition-colors"
      onClick={() => {
        if (entry.panelId) {
          // Panel already exists — just highlight it (Phase UI-2 enhancement)
        }
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color: statusColor, fontSize: 10 }}>
          {entry.status === 'running' ? '▸' : entry.status === 'error' ? '✗' : '✓'}
        </span>
        <span className="text-[var(--shell-text-primary)] text-[12px] font-medium truncate">
          {entry.label}
        </span>
      </div>
      {entry.steps.slice(-3).map((step, i) => (
        <div key={i} className="pl-4 text-[11px] text-[var(--shell-text-muted)] truncate">
          {step.status === 'running' && <span className="text-[var(--shell-accent)]">↳ </span>}
          {step.status === 'done'    && <span className="text-[var(--shell-status-success)]">✓ </span>}
          {step.status === 'error'   && <span className="text-[var(--shell-status-error)]">✗ </span>}
          {step.text}
        </div>
      ))}
    </div>
  );
}

export function AgentStream() {
  const entries = useStreamStore((s) => s.entries);

  return (
    <aside
      className="flex flex-col overflow-hidden"
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: '1px solid var(--shell-border)',
        background: 'rgba(0,0,0,0.3)',
      }}
    >
      <div className="px-3 py-2 border-b border-[var(--shell-border)]">
        <span className="text-[10px] font-semibold tracking-widest text-[var(--shell-text-muted)] uppercase">
          Agent Stream
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {entries.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-[var(--shell-text-muted)] text-center">
            대기 중...
          </div>
        ) : (
          entries.map((e) => <EntryRow key={e.id} entry={e} />)
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Create canvas-panel component**

Create `components/agent-shell/canvas-panel.tsx`:

```typescript
'use client';

import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rnd } from 'react-rnd';
import { useCanvasStore, type CanvasPanel as CanvasPanelType } from '@/lib/canvas-store';

const panelVariants = {
  hidden:  { opacity: 0, scale: 0.92, y: 8 },
  visible: { opacity: 1, scale: 1,    y: 0,
             transition: { type: 'spring' as const, stiffness: 300, damping: 25 } },
  exit:    { opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.15 } }
};

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
        style={{ width: '100%', height: '100%' }}
      >
        <div
          className="canvas-panel flex flex-col h-full"
          data-status={panel.status}
        >
          {/* Panel header */}
          <div
            className="flex items-center justify-between px-3 py-2 cursor-move"
            style={{ borderBottom: '1px solid var(--shell-border)', flexShrink: 0 }}
          >
            <div className="flex items-center gap-2">
              {panel.status === 'loading' && (
                <span className="dot-running text-[var(--shell-accent)] text-[10px]">●</span>
              )}
              {panel.status === 'completed' && (
                <span className="text-[var(--shell-status-success)] text-[10px]">●</span>
              )}
              {panel.status === 'error' && (
                <span className="text-[var(--shell-status-error)] text-[10px]">●</span>
              )}
              <span className="text-[12px] font-semibold text-[var(--shell-text-primary)]">
                {panel.title}
              </span>
            </div>
            <button
              onClick={() => removePanel(panel.id)}
              className="text-[var(--shell-text-muted)] hover:text-[var(--shell-text-primary)] transition-colors text-[16px] leading-none"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
            >
              ×
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-auto p-3">
            {panel.status === 'loading' ? (
              <div className="flex items-center gap-2 text-[var(--shell-text-muted)] text-[12px]">
                <span className="dot-running text-[var(--shell-accent)]">●</span>
                처리 중...
              </div>
            ) : panel.type === 'generic' ? (
              <p className="text-[13px] text-[var(--shell-text-secondary)] whitespace-pre-wrap">
                {panel.data.markdown}
              </p>
            ) : (
              <div className="text-[12px] text-[var(--shell-text-muted)]">
                {panel.type} panel — Phase UI-2에서 구현
              </div>
            )}
          </div>
        </div>
        </motion.div>
    </Rnd>
  );
}
```

- [ ] **Step 5: Create canvas component**

Create `components/agent-shell/canvas.tsx`:

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '@/lib/canvas-store';
import { CanvasPanel } from './canvas-panel';

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
      className="canvas-dot-grid flex-1 relative overflow-hidden"
      style={{ background: 'var(--shell-bg)' }}
      data-canvas-width={dims.width}
      data-canvas-height={dims.height}
    >
      <AnimatePresence>
        {panels.map((panel) => (
          <CanvasPanel key={panel.id} panel={panel} />
        ))}
      </AnimatePresence>

      {panels.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-[var(--shell-text-muted)] text-[13px]">
              아래에서 명령을 입력하세요
            </p>
            <p className="text-[var(--shell-text-muted)] text-[11px] mt-1 opacity-50">
              에이전트가 결과를 여기에 표시합니다
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create command-bar component**

Create `components/agent-shell/command-bar.tsx`:

```typescript
'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCanvasStore, getNextPanelPosition } from '@/lib/canvas-store';
import { useStreamStore } from '@/lib/agent-stream-store';

type QuickAction = { label: string; href?: string; badge?: number }

export function CommandBar() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
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
    } catch (err) {
      setEntryStatus(entryId, 'error');
    } finally {
      setLoading(false);
    }
  }, [loading, panels, spawnPanel, addEntry, addStep, setEntryStatus, router]);

  const quickActions: QuickAction[] = [
    { label: 'Domains', href: '/operations' },
    { label: `History (${history.length})` },
  ];

  return (
    <div
      style={{
        borderTop: '1px solid var(--shell-border)',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px)',
        flexShrink: 0,
      }}
    >
      <div className="px-4 py-3">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(input); } }}
          placeholder="Garnet에게 지시하세요..."
          disabled={loading}
          className="command-bar-input w-full bg-transparent text-[var(--shell-text-primary)] placeholder-[var(--shell-text-muted)] text-[14px]"
          style={{ border: 'none', outline: 'none' }}
        />
      </div>
      <div className="flex items-center gap-2 px-4 pb-3">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => action.href ? router.push(action.href) : undefined}
            className="text-[11px] text-[var(--shell-text-muted)] hover:text-[var(--shell-text-secondary)] transition-colors"
            style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid var(--shell-border)',
              borderRadius: 4, padding: '2px 8px', cursor: 'pointer'
            }}
          >
            {action.label} ↗
          </button>
        ))}
      </div>
    </div>
  );
}

// SSE event handler — Phase UI-2 will flesh this out with real panel types
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
      const d = event.data as { type: string; title: string };
      const pos = getNextPanelPosition(panels, 800);
      const panelId = spawnPanel({
        type: d.type as never, title: d.title, status: 'loading',
        position: pos, size: { width: 380, height: 260 }, data: d as never
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

- [ ] **Step 7: Create shell layout and home page**

Create `app/(shell)/layout.tsx`:

```typescript
import { CommandPalette } from '@/components/command-palette';
import { AmbientBar } from '@/components/agent-shell/ambient-bar';
import { AgentStream } from '@/components/agent-shell/agent-stream';
import { Canvas } from '@/components/agent-shell/canvas';
import { CommandBar } from '@/components/agent-shell/command-bar';

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="shell-theme flex flex-col"
      style={{ height: '100dvh', background: 'var(--shell-bg)', overflow: 'hidden' }}
    >
      <AmbientBar />
      <div className="flex flex-1 overflow-hidden">
        <AgentStream />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Canvas />
          <CommandBar />
        </div>
      </div>
      <CommandPalette />
      {children}
    </div>
  );
}
```

Create `app/(shell)/page.tsx`:

```typescript
// Agent Shell home — Canvas + Stream + CommandBar rendered by layout
// Children here are intentionally empty; all UI is in the shell layout
export default function AgentShellPage() {
  return null;
}
```

- [ ] **Step 8: Verify shell renders at localhost:3001**

Open http://localhost:3001 — should show dark canvas with ambient bar, empty stream, command bar at bottom.

- [ ] **Step 9: Commit**

```bash
git add components/agent-shell/ lib/agent-stream-store.ts app/(shell)/
git commit -m "feat(shell): add Agent Shell layout — ambient bar, stream, canvas, command bar"
```

---

## Chunk 2: Panel System + Command API (Phase UI-2)

Typed result panels + SSE `/api/agent/command` endpoint.

---

### Task 6: Stub `/api/agent/command` SSE endpoint

**Files:**
- Create: `app/api/agent/command/route.ts`

> This stub returns a simple "thinking → done" stream so the full pipeline can be tested before LLM integration.

- [ ] **Step 1: Create SSE route**

Create `app/api/agent/command/route.ts`:

```typescript
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { text } = await req.json() as { text: string };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ event, data })}\n\n`)
        );
      };

      // Route simple navigation commands
      const lower = text.toLowerCase();
      if (lower.includes('캠페인')) {
        send('navigate', { url: '/campaigns' });
        send('done', { entryId: 'n/a' });
        controller.close();
        return;
      }
      if (lower.includes('analytics') || lower.includes('분석') || lower.includes('ga4')) {
        send('navigate', { url: '/analytics' });
        send('done', { entryId: 'n/a' });
        controller.close();
        return;
      }

      // Generic response — spawn a generic panel
      const entryId = `entry-${Date.now()}`;
      send('step', { entryId, step: { text: '명령을 처리하는 중...', status: 'running' } });

      await new Promise((r) => setTimeout(r, 600));

      send('step', { entryId, step: { text: '응답 생성 완료', status: 'done' } });
      send('panel', {
        type: 'generic',
        title: text.slice(0, 30),
        status: 'active',
        position: { x: 20, y: 20 },
        size: { width: 380, height: 260 },
        data: { markdown: `**명령:** ${text}\n\n*Phase UI-2에서 LLM 연동 예정*` }
      });
      send('done', { entryId });

      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
```

- [ ] **Step 2: Test command from command bar**

Open http://localhost:3001, type "안녕" in command bar, press Enter.
Expected: stream entry appears in Agent Stream, generic panel appears on canvas.

- [ ] **Step 3: Commit**

```bash
git add app/api/agent/command/
git commit -m "feat(shell): add stub SSE command API endpoint"
```

---

### Task 7: Typed result panels

**Files:**
- Create: `components/panels/ga4-summary-panel.tsx`
- Create: `components/panels/seminar-status-panel.tsx`
- Create: `components/panels/intel-brief-panel.tsx`
- Create: `components/panels/approval-panel.tsx`
- Modify: `components/agent-shell/canvas-panel.tsx` — wire panel type → component

- [ ] **Step 1: Create GA4 summary panel**

Create `components/panels/ga4-summary-panel.tsx`:

```typescript
import type { GA4SummaryData } from '@/lib/canvas-store';

export function GA4SummaryPanel({ data }: { data: GA4SummaryData }) {
  const wowSign = data.wow >= 0 ? '+' : '';
  const wowColor = data.wow >= 0 ? 'var(--shell-status-success)' : 'var(--shell-status-error)';

  return (
    <div className="p-1">
      <div className="text-[28px] font-bold text-[var(--shell-text-primary)]">
        {data.value.toLocaleString()}
      </div>
      <div className="text-[12px] text-[var(--shell-text-muted)] mt-1">{data.metric}</div>
      <div className="text-[13px] font-semibold mt-2" style={{ color: wowColor }}>
        {wowSign}{data.wow}% WoW
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create seminar status panel**

Create `components/panels/seminar-status-panel.tsx`:

```typescript
import type { SeminarStatusData } from '@/lib/canvas-store';

export function SeminarStatusPanel({ data }: { data: SeminarStatusData }) {
  const progress = (data.round / data.maxRounds) * 100;

  return (
    <div className="p-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] text-[var(--shell-text-muted)]">Round</span>
        <span className="text-[13px] font-semibold text-[var(--shell-text-primary)]">
          {data.round} / {data.maxRounds}
        </span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--shell-border)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${progress}%`, background: 'var(--shell-accent)' }}
        />
      </div>
      <div className="text-[11px] text-[var(--shell-text-muted)] mt-2">{data.status}</div>
    </div>
  );
}
```

- [ ] **Step 3: Create intel brief panel**

Create `components/panels/intel-brief-panel.tsx`:

```typescript
import type { IntelBriefData } from '@/lib/canvas-store';

export function IntelBriefPanel({ data }: { data: IntelBriefData }) {
  return (
    <div className="p-1">
      <div className="text-[24px] font-bold text-[var(--shell-accent)]">{data.trendCount}</div>
      <div className="text-[11px] text-[var(--shell-text-muted)] mb-2">트렌드 감지됨</div>
      <p className="text-[12px] text-[var(--shell-text-secondary)] leading-relaxed">{data.summary}</p>
    </div>
  );
}
```

- [ ] **Step 4: Create video status panel**

Create `components/panels/video-status-panel.tsx`:

```typescript
import type { VideoStatusData } from '@/lib/canvas-store';

export function VideoStatusPanel({ data }: { data: VideoStatusData }) {
  return (
    <div className="p-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] text-[var(--shell-text-muted)]">진행률</span>
        <span className="text-[13px] font-semibold text-[var(--shell-text-primary)]">
          {data.progress}%
        </span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--shell-border)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${data.progress}%`, background: 'var(--shell-accent)' }}
        />
      </div>
      {data.url && (
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] mt-2 block"
          style={{ color: 'var(--shell-accent)' }}
        >
          영상 다운로드 →
        </a>
      )}
      <div className="text-[11px] text-[var(--shell-text-muted)] mt-1">Job: {data.jobId}</div>
    </div>
  );
}
```

- [ ] **Step 5: Create approval panel**

Create `components/panels/approval-panel.tsx`:

```typescript
import type { ApprovalData } from '@/lib/canvas-store';

export function ApprovalPanel({ data }: { data: ApprovalData }) {
  return (
    <div className="p-1 flex flex-col gap-2">
      {data.items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between rounded"
          style={{ background: 'var(--shell-surface-hover)', padding: '8px 10px' }}
        >
          <span className="text-[12px] text-[var(--shell-text-primary)]">{item.label}</span>
          <div className="flex gap-1">
            <button
              className="text-[11px] px-2 py-1 rounded"
              style={{ background: 'var(--shell-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              승인
            </button>
            <button
              className="text-[11px] px-2 py-1 rounded"
              style={{ background: 'var(--shell-border)', color: 'var(--shell-text-muted)',
                       border: 'none', cursor: 'pointer' }}
            >
              거절
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Wire panel types in canvas-panel.tsx**

Replace the content section in `components/agent-shell/canvas-panel.tsx` (the `panel.status === 'loading' ?` block) with:

```typescript
// Add these imports at the top of canvas-panel.tsx:
import { GA4SummaryPanel } from '@/components/panels/ga4-summary-panel';
import { SeminarStatusPanel } from '@/components/panels/seminar-status-panel';
import { IntelBriefPanel } from '@/components/panels/intel-brief-panel';
import { VideoStatusPanel } from '@/components/panels/video-status-panel';
import { ApprovalPanel } from '@/components/panels/approval-panel';

// Replace the content section (all 6 panel types — exhaustive):
{panel.status === 'loading' ? (
  <div className="flex items-center gap-2 text-[var(--shell-text-muted)] text-[12px]">
    <span className="dot-running text-[var(--shell-accent)]">●</span>
    처리 중...
  </div>
) : panel.type === 'ga4' ? (
  <GA4SummaryPanel data={panel.data} />
) : panel.type === 'seminar' ? (
  <SeminarStatusPanel data={panel.data} />
) : panel.type === 'intel' ? (
  <IntelBriefPanel data={panel.data} />
) : panel.type === 'video' ? (
  <VideoStatusPanel data={panel.data} />
) : panel.type === 'approval' ? (
  <ApprovalPanel data={panel.data} />
) : panel.type === 'generic' ? (
  <p className="text-[13px] text-[var(--shell-text-secondary)] whitespace-pre-wrap">
    {panel.data.markdown}
  </p>
) : null}
```

- [ ] **Step 7: Verify panels render**

Open http://localhost:3001. Run this in browser console to test panel spawn:

```javascript
// Paste in browser console
fetch('/api/agent/command', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({ text: '테스트' })
}).then(r => r.body.getReader()).then(async reader => {
  const dec = new TextDecoder();
  while(true) {
    const {done, value} = await reader.read();
    if (done) break;
    console.log(dec.decode(value));
  }
});
```

Expected: SSE events logged, panel appears on canvas.

- [ ] **Step 8: Commit**

```bash
git add components/panels/ components/agent-shell/canvas-panel.tsx
git commit -m "feat(shell): add typed result panels — GA4, seminar, intel, video, approval"
```

---

## Chunk 3: Polish + Mobile Fallback (Phase UI-3)

Ambient canvas background + panel minimize + mobile fallback.

---

### Task 8: Canvas ambient background

**Files:**
- Modify: `components/agent-shell/canvas.tsx` — add subtle noise overlay

- [ ] **Step 1: Add noise texture to canvas**

Add to `app/globals.css` (append):

```css
/* Canvas noise texture */
.canvas-noise::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.025;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
}
```

Modify `components/agent-shell/canvas.tsx` — add `canvas-noise` to the className.

- [ ] **Step 2: Commit**

```bash
git add components/agent-shell/canvas.tsx app/globals.css
git commit -m "feat(shell): add ambient noise texture to canvas background"
```

---

### Task 9: Mobile fallback

**Files:**
- Modify: `app/(shell)/layout.tsx` — redirect to /operations on small screens

- [ ] **Step 1: Add viewport fallback for small screens**

Add a `<style>` block in the shell layout that hides the shell and shows a fallback prompt below 1024px. Shell components still hydrate on mobile (acceptable trade-off per spec — desktop first), but the user sees a redirect message instead of the broken layout:

```typescript
// Inside ShellLayout, above the main div:
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
    flexDirection: 'column', gap: 12, background: '#0a0a0f', color: '#8b949e',
    fontSize: 14, textAlign: 'center', padding: 24
  }}
>
  <span style={{ fontSize: 32 }}>◈</span>
  <p>Agent Shell은 데스크탑(1024px+)에서 사용하세요.</p>
  <a href="/operations" style={{ color: '#3182f6', textDecoration: 'none' }}>
    → 기존 화면으로 이동
  </a>
</div>
```

Wrap the main shell div with `className="shell-wrapper"`.

- [ ] **Step 2: Commit**

```bash
git add "app/(shell)/layout.tsx"
git commit -m "feat(shell): add mobile fallback for viewports < 1024px"
```

---

### Task 10: Wire ambient bar to real cron job status

**Files:**
- Modify: `components/agent-shell/ambient-bar.tsx` — poll `/api/env-status` or cron status

- [ ] **Step 1: Add real job status polling**

Modify `components/agent-shell/ambient-bar.tsx` to fetch cron job status every 30s:

```typescript
'use client';

import { useEffect, useState } from 'react';
// TODO Phase UI-2: import { useCanvasStore, getNextPanelPosition } from '@/lib/canvas-store'
// and wire dot clicks to spawnPanel

type JobStatus = 'running' | 'idle' | 'error';

const JOBS = [
  { key: 'intel',   label: 'intel' },
  { key: 'seminar', label: 'seminar' },
  { key: 'video',   label: 'video' },
] as const;

export function AmbientBar({ onOpenPalette }: { onOpenPalette?: () => void }) {
  const [jobStatuses, setJobStatuses] = useState<Record<string, JobStatus>>({
    intel: 'idle', seminar: 'idle', video: 'idle'
  });

  // Poll cron status (extend in Phase F with real scheduler status API)
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/env-status');
        if (res.ok) {
          // For now, show all as idle; Phase F will wire real job statuses
        }
      } catch {}
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  function dotClass(status: JobStatus) {
    if (status === 'running') return 'dot-running';
    if (status === 'error')   return 'dot-error';
    return '';
  }

  function dotColor(status: JobStatus) {
    if (status === 'running') return 'var(--shell-status-running)';
    if (status === 'error')   return 'var(--shell-status-error)';
    return 'var(--shell-status-idle)';
  }

  return (
    <header
      className="flex items-center justify-between px-4"
      style={{
        height: 40, flexShrink: 0,
        background: 'rgba(0,0,0,0.6)',
        borderBottom: '1px solid var(--shell-border)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-[var(--shell-accent)] font-bold text-sm tracking-widest">◈ GARNET</span>
        <div className="w-px h-4 bg-[var(--shell-border)]" />
        {JOBS.map(({ key, label }) => {
          const status = jobStatuses[key] ?? 'idle';
          return (
            <button
              key={key}
              className={`flex items-center gap-1 text-[11px] hover:opacity-80 transition-opacity ${dotClass(status)}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
                       color: dotColor(status) }}
            >
              <span>●</span>
              <span className="text-[var(--shell-text-muted)]">{label}</span>
            </button>
          );
        })}
      </div>
      <button
        onClick={onOpenPalette}
        className="text-[11px] text-[var(--shell-text-muted)] hover:text-[var(--shell-text-secondary)] transition-colors"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--shell-border)',
                 borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
      >
        ⌘K
      </button>
    </header>
  );
}
```

- [ ] **Step 2: Final smoke test**

Open http://localhost:3001. Verify:
- [ ] Dark canvas loads at `/`
- [ ] Typing a command and pressing Enter shows stream entry + panel
- [ ] Panel is draggable
- [ ] Closing panel (×) removes it
- [ ] Navigating to `/operations` shows old UI with AppNav (domains layout)
- [ ] `⌘K` opens CommandPalette

- [ ] **Step 3: Final commit**

```bash
git add components/agent-shell/ambient-bar.tsx
git commit -m "feat(shell): wire ambient bar job status + Phase UI-3 complete"
```

---

## Chunk 4: LLM Command Processing (Phase UI-4)

Replace the stub SSE command handler with a real LLM-powered intent classifier that routes commands to typed panels.

---

### Task 11: LLM intent classifier

**Files:**
- Create: `lib/agent-command.ts` — intent classification + panel spawn logic
- Modify: `app/api/agent/command/route.ts` — replace stub with real LLM pipeline

- [ ] **Step 1: Write failing test for intent classifier**

Create `lib/agent-command.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { classifyIntent } from './agent-command';

describe('classifyIntent', () => {
  it('returns ga4_summary for analytics keywords', () => {
    expect(classifyIntent('GA4 트래픽 보여줘')).toBe('ga4_summary');
    expect(classifyIntent('어제 방문자 수')).toBe('ga4_summary');
  });

  it('returns seminar_status for seminar keywords', () => {
    expect(classifyIntent('세미나 상태')).toBe('seminar_status');
    expect(classifyIntent('학습 진행 어때')).toBe('seminar_status');
  });

  it('returns intel_brief for intel keywords', () => {
    expect(classifyIntent('트렌드 뭐야')).toBe('intel_brief');
    expect(classifyIntent('인텔 브리핑')).toBe('intel_brief');
  });

  it('returns video_status for video keywords', () => {
    expect(classifyIntent('영상 상태')).toBe('video_status');
    expect(classifyIntent('비디오 생성 중이야?')).toBe('video_status');
  });

  it('returns approval for approval keywords', () => {
    expect(classifyIntent('승인 대기 목록')).toBe('approval');
    expect(classifyIntent('보류 항목 보여줘')).toBe('approval');
  });

  it('returns generic for unrecognized input', () => {
    expect(classifyIntent('안녕')).toBe('generic');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run lib/agent-command.test.ts 2>&1 | tail -5
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement intent classifier**

Create `lib/agent-command.ts`:

```typescript
export type PanelIntent =
  | 'ga4_summary'
  | 'seminar_status'
  | 'intel_brief'
  | 'video_status'
  | 'approval'
  | 'generic';

const INTENT_PATTERNS: Array<{ intent: PanelIntent; patterns: RegExp[] }> = [
  {
    intent: 'ga4_summary',
    patterns: [/ga4/i, /트래픽/i, /웹.*분석/i, /사용자.*수/i, /방문자/i, /페이지뷰/i, /전환율/i]
  },
  {
    intent: 'seminar_status',
    patterns: [/세미나/i, /학습/i, /스터디/i, /라운드/i]
  },
  {
    intent: 'intel_brief',
    patterns: [/인텔/i, /트렌드/i, /브리핑/i, /키워드/i, /동향/i]
  },
  {
    intent: 'video_status',
    patterns: [/영상/i, /비디오/i, /video/i, /kling/i, /minimax/i, /luma/i]
  },
  {
    intent: 'approval',
    patterns: [/승인/i, /보류/i, /결재/i, /대기/i]
  }
];

export function classifyIntent(text: string): PanelIntent {
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(text))) return intent;
  }
  return 'generic';
}

// Maps intent → panel title and API endpoint to hit for data
export const INTENT_CONFIG: Record<
  PanelIntent,
  { title: string; apiPath: string | null; panelType: string }
> = {
  // panelType values MUST match canvas-store.ts PanelData discriminant union: 'ga4' | 'seminar' | 'intel' | 'video' | 'approval' | 'generic'
  ga4_summary:    { title: 'GA4 트래픽',     apiPath: '/api/ga4/report',         panelType: 'ga4' },
  seminar_status: { title: '세미나 상태',    apiPath: '/api/seminar/sessions',   panelType: 'seminar' },
  intel_brief:    { title: '인텔 브리프',    apiPath: '/api/intel/digests',      panelType: 'intel' },
  video_status:   { title: '영상 생성 상태', apiPath: '/api/video/status',       panelType: 'video' },
  approval:       { title: '승인 대기',      apiPath: '/api/approvals',          panelType: 'approval' },
  generic:        { title: '응답',           apiPath: null,                      panelType: 'generic' }
};
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run lib/agent-command.test.ts 2>&1 | tail -5
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Replace stub SSE command route with real LLM pipeline**

Replace the entire content of `app/api/agent/command/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { streamLLM } from '@/lib/llm';
import { classifyIntent, INTENT_CONFIG } from '@/lib/agent-command';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ text: z.string().min(1).max(2000) });

const SYSTEM_PROMPT = `당신은 Garnet 개인 에이전트 어시스턴트입니다.
사용자의 명령에 간결하고 핵심적인 답변을 제공하고, 데이터 패널을 자동으로 표시합니다.
답변은 한국어로, 2-3문장 이내로 작성하세요. 마크다운을 최소화하세요.`;

// IMPORTANT: Use { event, data } nested structure — matches handleSSEEvent in command-bar.tsx
const encoder = new TextEncoder();
function send(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, data })}\n\n`));
}

export async function POST(req: NextRequest) {
  const body = bodySchema.safeParse(await req.json());
  if (!body.success) {
    return new Response(JSON.stringify({ error: 'Invalid input' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { text } = body.data;
  const intent = classifyIntent(text);
  const config = INTENT_CONFIG[intent];

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 1. Announce intent classification as a stream step
        // Note: entryId here is server-generated; client maps it via 'step' event.
        // Client's own entryId (from addEntry) handles the stream entry lifecycle.
        const serverEntryId = crypto.randomUUID();
        send(controller, 'step', {
          entryId: serverEntryId,
          step: { text: `의도 분석: ${config.title}`, status: 'running' }
        });

        // 2. Call LLM — accumulate response for generic panel
        let fullText = '';
        for await (const chunk of streamLLM(SYSTEM_PROMPT, text, 0.35, 800)) {
          fullText += chunk;
        }

        // 3. Mark step done
        send(controller, 'step', {
          entryId: serverEntryId,
          step: { text: `${config.title} 패널 생성 완료`, status: 'done' }
        });

        // 4. Spawn panel — use 'panel' event (matches existing client case 'panel' handler)
        const panelData = intent === 'generic'
          ? { markdown: fullText }
          : {};  // non-generic panels self-fetch via usePanelFetch hook

        send(controller, 'panel', {
          type: config.panelType,   // short names: 'ga4' | 'seminar' | 'intel' | 'video' | 'approval' | 'generic'
          title: config.title,
          status: intent === 'generic' ? 'active' : 'loading',
          position: { x: 20, y: 20 },
          size: { width: 380, height: intent === 'approval' ? 320 : 260 },
          data: panelData
        });

        // 5. Done
        send(controller, 'done', {});
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Command failed';
        send(controller, 'error', { message });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/agent-command.ts lib/agent-command.test.ts app/api/agent/command/route.ts
git commit -m "feat(shell): replace command stub with LLM intent classifier + streaming pipeline"
```

---

## Chunk 5: Panel Data Pipeline (Phase UI-4 cont.)

Panels self-fetch their own data on mount rather than receiving static data from the SSE event. This decouples live data freshness from the command dispatch lifecycle.

---

### Task 12: Panel self-fetch hook + approvals API

**Files:**
- Create: `hooks/use-panel-fetch.ts` — generic polling fetch hook
- Create: `app/api/approvals/route.ts` — list pending approval items
- Modify: `components/panels/ga4-summary-panel.tsx` — self-fetch
- Modify: `components/panels/seminar-status-panel.tsx` — self-fetch
- Modify: `components/panels/intel-brief-panel.tsx` — self-fetch
- Modify: `components/panels/approval-panel.tsx` — self-fetch with approve action

- [ ] **Step 1: Create approvals GET route**

Create `app/api/approvals/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { listApprovalDecisions } from '@/lib/approval-actions';

export async function GET() {
  try {
    // Return last 20 decisions across all types
    const decisions = await listApprovalDecisions({ limit: 20 });
    return NextResponse.json({ items: decisions });
  } catch (error) {
    return NextResponse.json({ items: [] });
  }
}
```

- [ ] **Step 2: Create use-panel-fetch hook**

Create `hooks/use-panel-fetch.ts`:

```typescript
'use client';

import { useEffect, useState } from 'react';

type FetchState<T> =
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'error'; message: string };

export function usePanelFetch<T>(
  url: string,
  options?: { refreshMs?: number; enabled?: boolean }
): FetchState<T> {
  const { refreshMs, enabled = true } = options ?? {};
  const [state, setState] = useState<FetchState<T>>({ status: 'loading' });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: T = await res.json();
        if (!cancelled) setState({ status: 'ok', data });
      } catch (err) {
        if (!cancelled)
          setState({ status: 'error', message: err instanceof Error ? err.message : 'Fetch failed' });
      }
    };

    load();
    if (refreshMs) {
      const id = setInterval(load, refreshMs);
      return () => { cancelled = true; clearInterval(id); };
    }
    return () => { cancelled = true; };
  }, [url, refreshMs, enabled]);

  return state;
}
```

- [ ] **Step 3: Update GA4 summary panel to self-fetch**

Replace the content of `components/panels/ga4-summary-panel.tsx`:

```typescript
'use client';

import { usePanelFetch } from '@/hooks/use-panel-fetch';

type GA4ReportResponse = {
  sessions?: number;
  users?: number;
  sessionsPrev?: number;
  usersPrev?: number;
};

export function GA4SummaryPanel() {
  const state = usePanelFetch<GA4ReportResponse>('/api/ga4/report');

  if (state.status === 'loading') {
    return <div className="p-1 text-[12px] text-[var(--shell-text-muted)] animate-pulse">데이터 로딩 중…</div>;
  }
  if (state.status === 'error') {
    return <div className="p-1 text-[12px]" style={{ color: 'var(--shell-status-error)' }}>⚠ {state.message}</div>;
  }

  const { data } = state;
  const value = data.sessions ?? data.users ?? 0;
  const prev = data.sessionsPrev ?? data.usersPrev ?? 0;
  const wow = prev > 0 ? Math.round(((value - prev) / prev) * 100) : 0;
  const wowSign = wow >= 0 ? '+' : '';
  const wowColor = wow >= 0 ? 'var(--shell-status-success)' : 'var(--shell-status-error)';
  const metric = data.sessions != null ? '세션' : '사용자';

  return (
    <div className="p-1">
      <div className="text-[28px] font-bold text-[var(--shell-text-primary)]">
        {value.toLocaleString()}
      </div>
      <div className="text-[12px] text-[var(--shell-text-muted)] mt-1">{metric} (오늘)</div>
      {prev > 0 && (
        <div className="text-[13px] font-semibold mt-2" style={{ color: wowColor }}>
          {wowSign}{wow}% WoW
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update seminar status panel to self-fetch**

Replace the content of `components/panels/seminar-status-panel.tsx`:

```typescript
'use client';

import { usePanelFetch } from '@/hooks/use-panel-fetch';

type SessionRow = { id: string; status: string; currentRound: number; maxRounds: number };
type SessionsResponse = { sessions: SessionRow[] };

export function SeminarStatusPanel() {
  const state = usePanelFetch<SessionsResponse>('/api/seminar/sessions');

  if (state.status === 'loading') {
    return <div className="p-1 text-[12px] text-[var(--shell-text-muted)] animate-pulse">로딩 중…</div>;
  }
  if (state.status === 'error') {
    return <div className="p-1 text-[12px]" style={{ color: 'var(--shell-status-error)' }}>⚠ {state.message}</div>;
  }

  const sessions = state.data.sessions ?? [];
  if (sessions.length === 0) {
    return <div className="p-1 text-[12px] text-[var(--shell-text-muted)]">진행 중인 세미나 없음</div>;
  }

  const latest = sessions[0];
  const progress = (latest.currentRound / latest.maxRounds) * 100;

  return (
    <div className="p-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] text-[var(--shell-text-muted)]">Round</span>
        <span className="text-[13px] font-semibold text-[var(--shell-text-primary)]">
          {latest.currentRound} / {latest.maxRounds}
        </span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--shell-border)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${progress}%`, background: 'var(--shell-accent)' }}
        />
      </div>
      <div className="text-[11px] text-[var(--shell-text-muted)] mt-2">{latest.status}</div>
    </div>
  );
}
```

- [ ] **Step 5: Update intel brief panel to self-fetch**

Replace the content of `components/panels/intel-brief-panel.tsx`:

```typescript
'use client';

import { usePanelFetch } from '@/hooks/use-panel-fetch';

type DigestsResponse = { digests: Array<{ id: string; summary?: string; title?: string }> };

export function IntelBriefPanel() {
  const state = usePanelFetch<DigestsResponse>('/api/intel/digests');

  if (state.status === 'loading') {
    return <div className="p-1 text-[12px] text-[var(--shell-text-muted)] animate-pulse">로딩 중…</div>;
  }
  if (state.status === 'error') {
    return <div className="p-1 text-[12px]" style={{ color: 'var(--shell-status-error)' }}>⚠ {state.message}</div>;
  }

  const digests = state.data.digests ?? [];
  const latest = digests[0];

  return (
    <div className="p-1">
      <div className="text-[24px] font-bold text-[var(--shell-accent)]">{digests.length}</div>
      <div className="text-[11px] text-[var(--shell-text-muted)] mb-2">최근 인텔 브리프</div>
      {latest && (
        <p className="text-[12px] text-[var(--shell-text-secondary)] leading-relaxed">
          {latest.summary ?? latest.title ?? '요약 없음'}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Update approval panel to self-fetch + wire approve action**

Replace the content of `components/panels/approval-panel.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { usePanelFetch } from '@/hooks/use-panel-fetch';
import type { ApprovalDecision } from '@/lib/approval-actions';

type ApprovalsResponse = { items: ApprovalDecision[] };

export function ApprovalPanel() {
  const state = usePanelFetch<ApprovalsResponse>('/api/approvals');
  const [approving, setApproving] = useState<string | null>(null);

  if (state.status === 'loading') {
    return <div className="p-1 text-[12px] text-[var(--shell-text-muted)] animate-pulse">로딩 중…</div>;
  }
  if (state.status === 'error') {
    return <div className="p-1 text-[12px]" style={{ color: 'var(--shell-status-error)' }}>⚠ {state.message}</div>;
  }

  const items = state.data.items ?? [];
  if (items.length === 0) {
    return <div className="p-1 text-[12px] text-[var(--shell-text-muted)]">대기 중인 승인 없음</div>;
  }

  const handleApprove = async (item: ApprovalDecision) => {
    setApproving(item.id);
    try {
      await fetch('/api/approvals/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: item.itemType, targetId: item.itemId, label: item.label })
      });
    } finally {
      setApproving(null);
    }
  };

  return (
    <div className="p-1 flex flex-col gap-2">
      {items.slice(0, 5).map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between rounded"
          style={{ background: 'var(--shell-surface-hover)', padding: '8px 10px' }}
        >
          <span className="text-[12px] text-[var(--shell-text-primary)] truncate max-w-[180px]">
            {item.label ?? item.itemType}
          </span>
          <button
            onClick={() => handleApprove(item)}
            disabled={approving === item.id}
            className="text-[11px] px-2 py-1 rounded"
            style={{
              background: approving === item.id ? 'var(--shell-border)' : 'var(--shell-accent)',
              color: '#fff', border: 'none', cursor: approving === item.id ? 'not-allowed' : 'pointer'
            }}
          >
            {approving === item.id ? '처리 중…' : '승인'}
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Update VideoStatusPanel to self-fetch**

Replace the content of `components/panels/video-status-panel.tsx` to self-fetch from `/api/video/status`:

```typescript
'use client';

import { usePanelFetch } from '@/hooks/use-panel-fetch';

type VideoStatusResponse = {
  jobId?: string;
  progress?: number;
  url?: string;
  status?: string;
};

export function VideoStatusPanel() {
  const state = usePanelFetch<VideoStatusResponse>('/api/video/status', { refreshMs: 10_000 });

  if (state.status === 'loading') {
    return <div className="p-1 text-[12px] text-[var(--shell-text-muted)] animate-pulse">로딩 중…</div>;
  }
  if (state.status === 'error') {
    return <div className="p-1 text-[12px]" style={{ color: 'var(--shell-status-error)' }}>⚠ {state.message}</div>;
  }

  const { data } = state;
  if (!data.jobId) {
    return <div className="p-1 text-[12px] text-[var(--shell-text-muted)]">진행 중인 영상 작업 없음</div>;
  }

  const progress = data.progress ?? 0;

  return (
    <div className="p-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] text-[var(--shell-text-muted)]">진행률</span>
        <span className="text-[13px] font-semibold text-[var(--shell-text-primary)]">{progress}%</span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--shell-border)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${progress}%`, background: 'var(--shell-accent)' }}
        />
      </div>
      {data.url && (
        <a href={data.url} target="_blank" rel="noopener noreferrer"
          className="text-[11px] mt-2 block" style={{ color: 'var(--shell-accent)' }}>
          영상 다운로드 →
        </a>
      )}
      <div className="text-[11px] text-[var(--shell-text-muted)] mt-1">Job: {data.jobId}</div>
    </div>
  );
}
```

- [ ] **Step 8: Update canvas-panel.tsx — fix loading guard + wire typed panels**

In `components/agent-shell/canvas-panel.tsx`, the current content area uses a `panel.status === 'loading'` guard that blocks all typed content. Self-fetching panels own their own loading spinners, so the guard must be restructured.

Update the panel content area (the `<div className="flex-1 overflow-auto p-3">` block) to:

```typescript
{/* Panel content — generic shows loading spinner, typed panels self-fetch */}
<div className="flex-1 overflow-auto p-3">
  {panel.type === 'generic' ? (
    panel.status === 'loading' ? (
      <div className="flex items-center gap-2 text-[var(--shell-text-muted)] text-[12px]">
        <span className="dot-running text-[var(--shell-accent)]">●</span>
        처리 중...
      </div>
    ) : (
      <p className="text-[13px] text-[var(--shell-text-secondary)] whitespace-pre-wrap">
        {panel.data.markdown}
      </p>
    )
  ) : (
    // Typed panels render immediately and handle their own loading state via usePanelFetch
    <TypedPanelContent panel={panel} />
  )}
</div>
```

Add the panel component imports at the **top** of `canvas-panel.tsx` (alongside existing imports). `CanvasPanel` is already imported — do not duplicate it:

```typescript
// Add to existing imports section at top of file:
import { GA4SummaryPanel } from '@/components/panels/ga4-summary-panel';
import { SeminarStatusPanel } from '@/components/panels/seminar-status-panel';
import { IntelBriefPanel } from '@/components/panels/intel-brief-panel';
import { VideoStatusPanel } from '@/components/panels/video-status-panel';
import { ApprovalPanel } from '@/components/panels/approval-panel';
```

Add the `TypedPanelContent` function at the **bottom** of `canvas-panel.tsx` (after the main export):

```typescript
function TypedPanelContent({ panel }: { panel: CanvasPanel }) {
  switch (panel.type) {
    case 'ga4':      return <GA4SummaryPanel />;
    case 'seminar':  return <SeminarStatusPanel />;
    case 'intel':    return <IntelBriefPanel />;
    case 'video':    return <VideoStatusPanel />;
    case 'approval': return <ApprovalPanel />;
    default:         return null;
  }
}
```

> This pattern gives each self-fetching component full control over its loading/error/data states. `status: 'loading'` on the panel only applies to generic text panels waiting for LLM output. Typed panels are rendered immediately and show their own inline spinners via `usePanelFetch`.

- [ ] **Step 9: Commit**

```bash
git add hooks/use-panel-fetch.ts app/api/approvals/route.ts components/panels/ components/agent-shell/canvas-panel.tsx
git commit -m "feat(shell): self-fetching panels + approvals API + use-panel-fetch hook"
```

---

## Chunk 6: Real Cron Job Status API (Phase UI-4 cont.)

Replace the `/api/env-status` polling stub in AmbientBar with a dedicated job status endpoint that queries actual `JobRun` records.

---

### Task 13: Job status API + live ambient bar

**Files:**
- Create: `app/api/agent/job-status/route.ts` — aggregated job status for shell dots
- Modify: `components/agent-shell/ambient-bar.tsx` — poll real endpoint

- [ ] **Step 1: Create job status route**

Create `app/api/agent/job-status/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getJobStatuses } from '@/lib/scheduler/engine';

// Maps scheduler job IDs to the 3 shell dot keys.
// IMPORTANT: Run `grep -rn "registerJob" lib/scheduler/` to verify actual job IDs
// before implementing — the values below are examples based on naming conventions.
const JOB_KEY_MAP: Record<string, 'intel' | 'seminar' | 'video'> = {
  'intel-collect':     'intel',
  'intel-digest':      'intel',
  'seminar-tick':      'seminar',
  'seminar-scheduler': 'seminar',
  'video-generate':    'video',
  'video-check':       'video',
};

type DotStatus = 'running' | 'idle' | 'error';

export async function GET() {
  try {
    const jobs = await getJobStatuses();
    const result: Record<string, DotStatus> = { intel: 'idle', seminar: 'idle', video: 'idle' };

    for (const job of jobs) {
      const key = JOB_KEY_MAP[job.id];
      if (!key) continue;

      // Running wins over any prior status
      if (job.isRunning) { result[key] = 'running'; continue; }

      // Only downgrade from idle → error, never from running → error
      if (result[key] !== 'running' && job.lastStatus === 'FAILED') {
        result[key] = 'error';
      }
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ intel: 'idle', seminar: 'idle', video: 'idle' });
  }
}
```

- [ ] **Step 2: Update AmbientBar to poll real endpoint**

Replace the entire content of `components/agent-shell/ambient-bar.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';

type DotStatus = 'running' | 'idle' | 'error';

const JOBS = [
  { key: 'intel',   label: 'intel' },
  { key: 'seminar', label: 'seminar' },
  { key: 'video',   label: 'video' },
] as const;

function dotColor(status: DotStatus) {
  if (status === 'running') return 'var(--shell-status-running)';
  if (status === 'error')   return 'var(--shell-status-error)';
  return 'var(--shell-status-idle)';
}

export function AmbientBar({ onOpenPalette }: { onOpenPalette?: () => void }) {
  const [statuses, setStatuses] = useState<Record<string, DotStatus>>({
    intel: 'idle', seminar: 'idle', video: 'idle'
  });

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

  return (
    <header
      className="flex items-center justify-between px-4"
      style={{
        height: 40, flexShrink: 0,
        background: 'rgba(0,0,0,0.6)',
        borderBottom: '1px solid var(--shell-border)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-[var(--shell-accent)] font-bold text-sm tracking-widest">◈ GARNET</span>
        <div className="w-px h-4 bg-[var(--shell-border)]" />
        {JOBS.map(({ key, label }) => {
          const status = statuses[key] ?? 'idle';
          return (
            <span
              key={key}
              className="flex items-center gap-1 text-[11px]"
              style={{ color: dotColor(status) }}
            >
              <span>●</span>
              <span className="text-[var(--shell-text-muted)]">{label}</span>
            </span>
          );
        })}
      </div>
      <button
        onClick={onOpenPalette}
        className="text-[11px] text-[var(--shell-text-muted)] hover:text-[var(--shell-text-secondary)] transition-colors"
        style={{
          background: 'rgba(255,255,255,0.05)', border: '1px solid var(--shell-border)',
          borderRadius: 6, padding: '2px 8px', cursor: 'pointer'
        }}
      >
        ⌘K
      </button>
    </header>
  );
}
```

- [ ] **Step 3: Smoke test ambient dots**

Open http://localhost:3001. Verify:
- [ ] Dots render with correct colors (idle = dim, error = red, running = pulse)
- [ ] Network tab shows `/api/agent/job-status` polling every 30s

- [ ] **Step 4: Commit**

```bash
git add app/api/agent/job-status/route.ts components/agent-shell/ambient-bar.tsx
git commit -m "feat(shell): real job status API + ambient bar live polling"
```

---

## Chunk 7: Safe Navigation Migration (Phase UI-4 cont.)

After route restructure, `"/"` resolves to the Agent Shell. Four existing domain pages have `href="/"` links that were intended for the old home dashboard. This chunk audits and corrects them.

---

### Task 14: Fix "/" navigation in domain pages

**Files:**
- Modify: `app/datasets/page.tsx` — update back link
- Modify: `app/operations/page.tsx` — update "캠페인 스튜디오" link target
- Modify: `app/history/page.tsx` — update back link
- Modify: `app/campaigns/page.tsx` — update "새 브리프" link target

> **Context:** These files live under `app/(domains)/` after Task 2 restructure. `href="/"` now routes to the Agent Shell (`app/(shell)/page.tsx`), which is intentional for back-to-home flows. The one exception is `operations/page.tsx` which links "캠페인 스튜디오" to `/` — that should go to `/campaigns`.

- [ ] **Step 1: Audit all "/" links**

```bash
grep -rn 'href="/"' app/ --include="*.tsx"
```

Expected output (4 files):
```
app/datasets/page.tsx:...     href="/"  (홈으로 돌아가기)
app/operations/page.tsx:...   href="/"  (캠페인 스튜디오)
app/history/page.tsx:...      href="/"  (홈으로)
app/campaigns/page.tsx:...    href="/"  (새 브리프)
```

- [ ] **Step 2: Fix all four "캠페인 스튜디오" / campaign links**

All four `href="/"` links were intended to open Campaign Studio (which previously lived at `/`). After route restructure `/` = Agent Shell. Fix all four:

In `app/operations/page.tsx` (~line 408):
```tsx
// Before: <Link href="/" className="button-primary">캠페인 스튜디오</Link>
// After:
<Link href="/campaigns" className="button-primary">캠페인 스튜디오</Link>
```

In `app/datasets/page.tsx` (~line 353):
```tsx
// Before: <Link href="/" className="button-secondary">캠페인 스튜디오</Link>
// After:
<Link href="/campaigns" className="button-secondary">캠페인 스튜디오</Link>
```

In `app/history/page.tsx` (~line 143):
```tsx
// Before: <Link href="/" className="button-primary">캠페인 스튜디오 열기</Link>
// After:
<Link href="/campaigns" className="button-primary">캠페인 스튜디오 열기</Link>
```

In `app/campaigns/page.tsx` (~line 36):
```tsx
// Before: <Link href="/" className="button-secondary">새 브리프</Link>
// After: This link is within /campaigns, so it should go to a fresh brief state or stay as-is.
// The safest default: keep href="/campaigns" (reload the campaigns page)
<Link href="/campaigns" className="button-secondary">새 브리프</Link>
```

> Verify each file's exact label by reading it first — the line numbers above are approximate.

- [ ] **Step 3: Verify no remaining "/" links in domain pages**

```bash
grep -rn 'href="/"' app/ --include="*.tsx"
```

Expected: no output (all fixed).

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/operations/page.tsx app/datasets/page.tsx app/history/page.tsx app/campaigns/page.tsx
git commit -m "fix(nav): update all domain pages — campaign CTA links from '/' to '/campaigns'"
```

---

## Summary

| Phase | Tasks | Deliverable |
|-------|-------|-------------|
| UI-1 | 1–5 | Dark Agent Shell loads at `/`, canvas + stream + command bar working |
| UI-2 | 6–7 | SSE pipeline + typed panels + command routing |
| UI-3 | 8–10 | Ambient polish + mobile fallback + job status wiring (stub) |
| UI-4 | 11–14 | LLM intent classifier, self-fetching panels, real job status API, nav fix |

**Not in this plan (future phases):**
- History panel component (`type: 'history'` in canvas store)
- Panel minimize/snap interactions (react-rnd advanced features)
- Multi-turn conversation memory in command bar
- DB-backed history persistence
