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

Replace the stub SSE command handler with a real LLM-powered intent classifier (Gemini with keyword fallback), real Prisma/GA4 data fetchers, and a complete command pipeline.

**Architecture decision:** The server fetches panel data and sends it with the `panel` SSE event. Panels receive fully-loaded data immediately — no client-side self-fetch needed. Only `VideoStatusPanel` polls for updates (separate Chunk 6 concern).

---

### Task 11: LLM intent module (`lib/agent-intent.ts`)

**Files:**
- Create: `lib/agent-intent.ts` — Gemini LLM intent parser with keyword fallback

- [ ] **Step 1: Create `lib/agent-intent.ts`**

```typescript
// lib/agent-intent.ts

export type IntentAction =
  | { type: 'panel';    panelType: 'ga4' | 'seminar' | 'intel' | 'video' | 'approval' | 'generic'; title: string }
  | { type: 'navigate'; url: string }
  | { type: 'text';     content: string };

export interface ParsedIntent {
  action: IntentAction;
  reasoning: string;
}

const INTENT_SYSTEM_PROMPT = `
당신은 Garnet 마케팅 플랫폼의 명령 해석기입니다.
사용자의 텍스트 명령을 분석하여 아래 JSON 형식 하나만 반환하세요. 다른 텍스트는 절대 포함하지 마세요.

가능한 action 타입:
1. panel  — 패널을 열어야 할 때
   panelType 값: "ga4" | "seminar" | "intel" | "video" | "approval" | "generic"
   - ga4: 트래픽, 방문자, GA4, 세션, 분석 관련
   - seminar: 세미나, 토론, 라운드 관련
   - intel: 트렌드, 인텔리전스, 마케팅 동향 관련
   - video: 영상 생성, 비디오 관련
   - approval: 승인, 결재, 대기 항목 관련
   - generic: 그 외 질문/대화

2. navigate — 페이지로 이동해야 할 때
   url 값: "/operations" | "/campaigns" | "/analytics" | "/sns/studio" | "/seminar" | "/intel" | "/settings"

3. text — 패널이나 네비게이션 없이 텍스트 답변만 할 때

응답 형식 (JSON only):
{
  "action": { "type": "panel", "panelType": "ga4", "title": "GA4 트래픽 현황" },
  "reasoning": "사용자가 트래픽 현황을 요청했습니다"
}
`;

export async function parseIntent(command: string): Promise<ParsedIntent> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

  if (!apiKey) return keywordFallback(command);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INTENT_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: command }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
      })
    });
    if (!response.ok) return keywordFallback(command);

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = (data.candidates ?? [])
      .flatMap((c) => c.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();

    return safeParseIntent(raw) ?? keywordFallback(command);
  } catch {
    return keywordFallback(command);
  }
}

function safeParseIntent(raw: string): ParsedIntent | null {
  try {
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    const obj = JSON.parse(raw.slice(start, end + 1)) as {
      action?: { type?: string; panelType?: string; title?: string; url?: string; content?: string };
      reasoning?: string;
    };
    if (!obj.action?.type) return null;
    const t = obj.action.type;
    if (t === 'panel' && obj.action.panelType) {
      const validPanels = ['ga4','seminar','intel','video','approval','generic'] as const;
      const pt = obj.action.panelType as typeof validPanels[number];
      if (!(validPanels as readonly string[]).includes(pt)) return null;
      return { action: { type: 'panel', panelType: pt, title: obj.action.title ?? '패널' }, reasoning: obj.reasoning ?? '' };
    }
    if (t === 'navigate' && obj.action.url) {
      return { action: { type: 'navigate', url: obj.action.url }, reasoning: obj.reasoning ?? '' };
    }
    if (t === 'text') {
      return { action: { type: 'text', content: obj.action.content ?? '' }, reasoning: obj.reasoning ?? '' };
    }
    return null;
  } catch { return null; }
}

function keywordFallback(command: string): ParsedIntent {
  const lower = command.toLowerCase();
  if (/캠페인|campaign/.test(lower)) return { action: { type: 'navigate', url: '/campaigns' }, reasoning: '캠페인 키워드' };
  if (/설정|settings/.test(lower))   return { action: { type: 'navigate', url: '/settings' },  reasoning: '설정 키워드' };
  if (/운영|브리핑|operations/.test(lower)) return { action: { type: 'navigate', url: '/operations' }, reasoning: '운영 키워드' };
  if (/sns|소셜|콘텐츠/.test(lower))  return { action: { type: 'navigate', url: '/sns/studio' }, reasoning: 'SNS 키워드' };
  if (/ga4|트래픽|방문자/.test(lower)) return { action: { type: 'panel', panelType: 'ga4',      title: 'GA4 트래픽 현황' }, reasoning: 'GA4 키워드' };
  if (/세미나|토론|라운드/.test(lower)) return { action: { type: 'panel', panelType: 'seminar',  title: '세미나 현황' },     reasoning: '세미나 키워드' };
  if (/트렌드|인텔|intel/.test(lower)) return { action: { type: 'panel', panelType: 'intel',    title: '마케팅 인텔리전스' }, reasoning: '인텔 키워드' };
  if (/영상|비디오|video/.test(lower)) return { action: { type: 'panel', panelType: 'video',    title: '영상 생성 현황' },   reasoning: '영상 키워드' };
  if (/승인|결재|approval/.test(lower)) return { action: { type: 'panel', panelType: 'approval', title: '승인 대기 항목' },  reasoning: '승인 키워드' };
  return { action: { type: 'panel', panelType: 'generic', title: '응답' }, reasoning: '기본 generic' };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "lib/agent-intent" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/agent-intent.ts
git commit -m "feat(agent): add Gemini intent parser with keyword fallback (lib/agent-intent.ts)"
```

---

### Task 12: Panel data fetchers (`lib/agent-panel-data.ts`)

**Files:**
- Create: `lib/agent-panel-data.ts` — per-panel Prisma/GA4 fetchers that return canvas-store compatible shapes

- [ ] **Step 1: Create `lib/agent-panel-data.ts`**

```typescript
// lib/agent-panel-data.ts
// Fetches live data for each panel type and maps to canvas-store.ts data shapes.
import { prisma } from '@/lib/prisma';
import { isGA4Configured, fetchDailyTraffic } from '@/lib/ga4-client';
import type { GA4SummaryData, SeminarStatusData, IntelBriefData, VideoStatusData, ApprovalData } from '@/lib/canvas-store';

export async function fetchGA4Data(): Promise<GA4SummaryData> {
  if (!isGA4Configured()) {
    return { metric: 'Sessions (미설정)', value: 0, wow: 0 };
  }
  const [recent, prior] = await Promise.all([
    fetchDailyTraffic('7daysAgo', 'today'),
    fetchDailyTraffic('14daysAgo', '8daysAgo'),
  ]);
  const recentSessions = recent.reduce((s, d) => s + (d.sessions ?? 0), 0);
  const priorSessions  = prior.reduce((s, d) => s + (d.sessions ?? 0), 0);
  const wow = priorSessions > 0 ? Math.round(((recentSessions - priorSessions) / priorSessions) * 100) : 0;
  return { metric: 'Sessions (7d)', value: recentSessions, wow };
}

export async function fetchSeminarData(): Promise<SeminarStatusData> {
  const session = await prisma.seminarSession.findFirst({
    where: { status: { in: ['RUNNING', 'PAUSED', 'SCHEDULED'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, completedRounds: true, maxRounds: true, status: true }
  });
  if (!session) {
    return { sessionId: '', round: 0, maxRounds: 0, status: '진행 중인 세미나 없음' };
  }
  return { sessionId: session.id, round: session.completedRounds, maxRounds: session.maxRounds, status: session.status };
}

export async function fetchIntelData(): Promise<IntelBriefData> {
  const items = await prisma.marketingIntel.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    select: { title: true },
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  const summary = items.length > 0 ? items[0].title : '최근 인텔 없음';
  return { trendCount: items.length, summary };
}

export async function fetchVideoData(): Promise<VideoStatusData> {
  const job = await prisma.videoGeneration.findFirst({
    where: { status: { in: ['PENDING', 'PROCESSING'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, videoUrl: true }
  });
  if (!job) return { jobId: '', progress: 0 };
  const progress = job.status === 'PROCESSING' ? 50 : 0;
  return { jobId: job.id, progress, url: job.videoUrl ?? undefined };
}

export async function fetchApprovalData(): Promise<ApprovalData> {
  const decisions = await prisma.approvalDecision.findMany({
    select: { id: true, itemType: true, itemId: true, label: true },
    orderBy: { updatedAt: 'desc' },
    take: 10
  });
  return {
    items: decisions.map((d) => ({ id: d.id, label: d.label ?? d.itemType, type: d.itemType }))
  };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "lib/agent-panel-data" | head -5
```

Expected: no errors. If Prisma model fields mismatch, fix by running `grep -A 30 "model SeminarSession" prisma/schema.prisma`.

- [ ] **Step 3: Commit**

```bash
git add lib/agent-panel-data.ts
git commit -m "feat(agent): add panel data fetchers for all 5 panel types (lib/agent-panel-data.ts)"
```

---

### Task 13: Replace command route with full LLM pipeline

**Files:**
- Modify: `app/api/agent/command/route.ts` — replace stub

- [ ] **Step 1: Replace command route**

Replace the entire content of `app/api/agent/command/route.ts`:

```typescript
import { parseIntent } from '@/lib/agent-intent';
import { fetchGA4Data, fetchSeminarData, fetchIntelData, fetchVideoData, fetchApprovalData } from '@/lib/agent-panel-data';
import { runLLM } from '@/lib/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// IMPORTANT: { event, data } nested structure — matches handleSSEEvent in command-bar.tsx
const encoder = new TextEncoder();
function send(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, data })}\n\n`));
}

export async function POST(req: Request) {
  const { text } = (await req.json()) as { text: string };
  if (!text?.trim()) {
    return new Response(JSON.stringify({ error: 'text required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await processCommand(text.trim(), controller);
      } catch (err) {
        const message = err instanceof Error ? err.message : '알 수 없는 오류';
        send(controller, 'error', { message });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }
  });
}

async function processCommand(text: string, controller: ReadableStreamDefaultController) {
  // Step 1: parse intent (Gemini or keyword fallback)
  const serverEntryId = crypto.randomUUID();
  send(controller, 'step', { entryId: serverEntryId, step: { text: '명령을 분석하는 중...', status: 'running' } });
  const intent = await parseIntent(text);
  send(controller, 'step', { entryId: serverEntryId, step: { text: `의도 파악: ${intent.reasoning}`, status: 'done' } });

  const { action } = intent;

  // Navigate
  if (action.type === 'navigate') {
    send(controller, 'navigate', { url: action.url });
    send(controller, 'done', {});
    return;
  }

  // Text-only
  if (action.type === 'text') {
    send(controller, 'step', { entryId: serverEntryId, step: { text: '답변 생성 중...', status: 'running' } });
    const reply = await runLLM(
      '당신은 Garnet AI 어시스턴트입니다. 간결한 한국어 답변을 마크다운으로 제공하세요.',
      text, 0.5, 800
    );
    send(controller, 'step', { entryId: serverEntryId, step: { text: '답변 완료', status: 'done' } });
    send(controller, 'panel', {
      type: 'generic', title: '응답', status: 'active',
      position: { x: 80, y: 80 }, size: { width: 480, height: 340 },
      data: { markdown: reply }
    });
    send(controller, 'done', {});
    return;
  }

  // Panel — fetch real data server-side
  const { panelType, title } = action;
  send(controller, 'step', { entryId: serverEntryId, step: { text: `${title} 데이터 로드 중...`, status: 'running' } });

  let panelData: unknown = {};
  if (panelType === 'ga4')      panelData = await fetchGA4Data();
  if (panelType === 'seminar')  panelData = await fetchSeminarData();
  if (panelType === 'intel')    panelData = await fetchIntelData();
  if (panelType === 'video')    panelData = await fetchVideoData();
  if (panelType === 'approval') panelData = await fetchApprovalData();

  if (panelType === 'generic') {
    send(controller, 'step', { entryId: serverEntryId, step: { text: '답변 생성 중...', status: 'running' } });
    const reply = await runLLM(
      '당신은 Garnet AI 어시스턴트입니다. 간결한 한국어 답변을 마크다운으로 제공하세요.',
      text, 0.5, 800
    );
    panelData = { markdown: reply };
  }

  send(controller, 'step', { entryId: serverEntryId, step: { text: `${title} 데이터 로드 완료`, status: 'done' } });
  send(controller, 'panel', {
    type: panelType, title, status: 'active',
    position: { x: 80 + Math.floor(Math.random() * 60), y: 80 + Math.floor(Math.random() * 40) },
    size: { width: panelType === 'approval' ? 520 : 400, height: panelType === 'approval' ? 400 : 300 },
    data: panelData
  });
  send(controller, 'done', {});
}
```

- [ ] **Step 2: Smoke test**

Start dev server and run:

```bash
curl -s -N -X POST http://localhost:3000/api/agent/command \
  -H "Content-Type: application/json" \
  -d '{"text":"GA4 트래픽 보여줘"}' --no-buffer
```

Expected: SSE stream with `step` events → `panel` (type: "ga4", status: "active", non-empty data) → `done`. No `error` event.

- [ ] **Step 3: Commit**

```bash
git add app/api/agent/command/route.ts
git commit -m "feat(agent): wire LLM intent + real panel data fetchers into command route"
```

---

## Chunk 5: Panel Display Components (Phase UI-4 cont.)

Panel components render the server-fetched data from canvas-store. No HTTP self-fetch needed — data arrives fully loaded from the SSE pipeline. `VideoStatusPanel` polls for live progress updates.

---

### Task 14: Wire typed panel display components

**Files:**
- Modify: `components/panels/ga4-summary-panel.tsx`
- Modify: `components/panels/seminar-status-panel.tsx`
- Modify: `components/panels/intel-brief-panel.tsx`
- Modify: `components/panels/video-status-panel.tsx` — polling refresh
- Modify: `components/panels/approval-panel.tsx` — approve action
- Modify: `components/agent-shell/canvas-panel.tsx` — fix loading guard + wire TypedPanelContent

- [ ] **Step 1: Update GA4SummaryPanel**

Replace content of `components/panels/ga4-summary-panel.tsx`:

```typescript
import type { GA4SummaryData } from '@/lib/canvas-store';

export function GA4SummaryPanel({ data }: { data: GA4SummaryData }) {
  const wowSign  = data.wow >= 0 ? '+' : '';
  const wowColor = data.wow >= 0 ? 'var(--shell-status-success)' : 'var(--shell-status-error)';
  return (
    <div className="p-1">
      <div className="text-[28px] font-bold text-[var(--shell-text-primary)]">{data.value.toLocaleString()}</div>
      <div className="text-[12px] text-[var(--shell-text-muted)] mt-1">{data.metric}</div>
      <div className="text-[13px] font-semibold mt-2" style={{ color: wowColor }}>{wowSign}{data.wow}% WoW</div>
    </div>
  );
}
```

- [ ] **Step 2: Update SeminarStatusPanel**

Replace content of `components/panels/seminar-status-panel.tsx`:

```typescript
import type { SeminarStatusData } from '@/lib/canvas-store';

export function SeminarStatusPanel({ data }: { data: SeminarStatusData }) {
  if (!data.sessionId) {
    return <div className="p-1 text-[12px] text-[var(--shell-text-muted)]">진행 중인 세미나 없음</div>;
  }
  const progress = data.maxRounds > 0 ? (data.round / data.maxRounds) * 100 : 0;
  return (
    <div className="p-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] text-[var(--shell-text-muted)]">Round</span>
        <span className="text-[13px] font-semibold text-[var(--shell-text-primary)]">{data.round} / {data.maxRounds}</span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--shell-border)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: 'var(--shell-accent)' }} />
      </div>
      <div className="text-[11px] text-[var(--shell-text-muted)] mt-2">{data.status}</div>
    </div>
  );
}
```

- [ ] **Step 3: Update IntelBriefPanel**

Replace content of `components/panels/intel-brief-panel.tsx`:

```typescript
import type { IntelBriefData } from '@/lib/canvas-store';

export function IntelBriefPanel({ data }: { data: IntelBriefData }) {
  return (
    <div className="p-1">
      <div className="text-[24px] font-bold text-[var(--shell-accent)]">{data.trendCount}</div>
      <div className="text-[11px] text-[var(--shell-text-muted)] mb-2">트렌드 감지됨 (24h)</div>
      <p className="text-[12px] text-[var(--shell-text-secondary)] leading-relaxed">{data.summary}</p>
    </div>
  );
}
```

- [ ] **Step 4: Update VideoStatusPanel with polling refresh**

Replace content of `components/panels/video-status-panel.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import type { VideoStatusData } from '@/lib/canvas-store';

export function VideoStatusPanel({ data: initial }: { data: VideoStatusData }) {
  const [data, setData] = useState<VideoStatusData>(initial);

  // Poll every 10s while job is in progress
  useEffect(() => {
    if (!data.jobId || data.progress >= 100) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/video/status');
        if (res.ok) {
          const d = (await res.json()) as { jobId?: string; progress?: number; url?: string };
          if (d.jobId === data.jobId) {
            setData((prev) => ({ ...prev, progress: d.progress ?? prev.progress, url: d.url }));
          }
        }
      } catch {}
    }, 10_000);
    return () => clearInterval(id);
  }, [data.jobId, data.progress]);

  if (!data.jobId) return <div className="p-1 text-[12px] text-[var(--shell-text-muted)]">진행 중인 영상 없음</div>;
  return (
    <div className="p-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] text-[var(--shell-text-muted)]">진행률</span>
        <span className="text-[13px] font-semibold text-[var(--shell-text-primary)]">{data.progress}%</span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--shell-border)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${data.progress}%`, background: 'var(--shell-accent)' }} />
      </div>
      {data.url && (
        <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-[11px] mt-2 block" style={{ color: 'var(--shell-accent)' }}>
          영상 다운로드 →
        </a>
      )}
      <div className="text-[11px] text-[var(--shell-text-muted)] mt-1">Job: {data.jobId}</div>
    </div>
  );
}
```

- [ ] **Step 5: Update ApprovalPanel with approve action**

Replace content of `components/panels/approval-panel.tsx`:

```typescript
'use client';

import { useState } from 'react';
import type { ApprovalData } from '@/lib/canvas-store';

export function ApprovalPanel({ data }: { data: ApprovalData }) {
  const [approving, setApproving] = useState<string | null>(null);

  if (data.items.length === 0) {
    return <div className="p-1 text-[12px] text-[var(--shell-text-muted)]">대기 중인 승인 없음</div>;
  }

  const handleApprove = async (item: { id: string; label: string; type: string }) => {
    setApproving(item.id);
    try {
      await fetch('/api/approvals/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: item.type, targetId: item.id, label: item.label })
      });
    } finally {
      setApproving(null);
    }
  };

  return (
    <div className="p-1 flex flex-col gap-2">
      {data.items.slice(0, 5).map((item) => (
        <div key={item.id} className="flex items-center justify-between rounded"
          style={{ background: 'var(--shell-surface-hover)', padding: '8px 10px' }}>
          <span className="text-[12px] text-[var(--shell-text-primary)] truncate max-w-[180px]">{item.label}</span>
          <button onClick={() => handleApprove(item)} disabled={approving === item.id}
            className="text-[11px] px-2 py-1 rounded"
            style={{ background: approving === item.id ? 'var(--shell-border)' : 'var(--shell-accent)',
                     color: '#fff', border: 'none', cursor: approving === item.id ? 'not-allowed' : 'pointer' }}>
            {approving === item.id ? '처리 중\u2026' : '승인'}
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Update canvas-panel.tsx — fix loading guard + wire TypedPanelContent**

The current content area has a `panel.status === 'loading'` guard blocking typed content. Since panels now arrive server-fetched with `status: 'active'`, the guard is only needed for generic panels awaiting LLM output.

Add imports at the **top** of `canvas-panel.tsx` (with existing imports):

```typescript
import { GA4SummaryPanel } from '@/components/panels/ga4-summary-panel';
import { SeminarStatusPanel } from '@/components/panels/seminar-status-panel';
import { IntelBriefPanel } from '@/components/panels/intel-brief-panel';
import { VideoStatusPanel } from '@/components/panels/video-status-panel';
import { ApprovalPanel } from '@/components/panels/approval-panel';
```

Replace the content area (`<div className="flex-1 overflow-auto p-3">` block):

```typescript
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
    <TypedPanelContent panel={panel} />
  )}
</div>
```

Add at the **bottom** of `canvas-panel.tsx` (after the main export). `CanvasPanel` is already imported — do not add a second import:

```typescript
function TypedPanelContent({ panel }: { panel: CanvasPanel }) {
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

- [ ] **Step 7: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "error TS" | head -10
```

Expected: no errors. If canvas-store data shape mismatches, check that `lib/agent-panel-data.ts` return types match `GA4SummaryData`, `SeminarStatusData`, etc. defined in `lib/canvas-store.ts`.

- [ ] **Step 8: Smoke test full pipeline**

Open http://localhost:3001, type "GA4 트래픽 보여줘", press Enter. Verify:
- [ ] Stream entry appears with step events
- [ ] GA4 panel spawns with `status: 'active'` and real metric data (not empty)
- [ ] Panel shows session count + WoW %

- [ ] **Step 9: Commit**

```bash
git add components/panels/ components/agent-shell/canvas-panel.tsx
git commit -m "feat(shell): wire typed panel display components with server-fetched canvas-store data"
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
| UI-4 | 11–17 | Gemini intent parser, data fetchers, LLM pipeline, typed panel display, job status API, nav fix |

**Not in this plan (future phases):**
- History panel component (`type: 'history'` in canvas store)
- Panel minimize/snap interactions (react-rnd advanced features)
- Multi-turn conversation memory in command bar
- DB-backed history persistence
