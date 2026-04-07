import { create } from 'zustand';
import type { FlowNode, FlowEdge } from '@/lib/flow/types'

// ── Data types for each panel kind ────────────────────────────────────────────
export type GA4SummaryData    = { metric: string; value: number; wow: number }
export type SeminarStatusData = { sessionId: string; round: number; maxRounds: number; status: string }
export type IntelBriefData    = { trendCount: number; summary: string }
export type VideoStatusData   = { jobId: string; progress: number; url?: string }
export type ApprovalData      = { items: Array<{ id: string; label: string; type: string }> }
export type FlowPreviewData   = {
  nodes: FlowNode[]
  edges: FlowEdge[]
  summary: string
  reasoning?: string
  status: 'preview' | 'running' | 'complete' | 'error'
  runId?: string
}

// ── Discriminated union ───────────────────────────────────────────────────────
export type PanelData =
  | { type: 'ga4';      data: GA4SummaryData }
  | { type: 'seminar';  data: SeminarStatusData }
  | { type: 'intel';    data: IntelBriefData }
  | { type: 'video';    data: VideoStatusData }
  | { type: 'approval'; data: ApprovalData }
  | { type: 'generic';  data: { markdown: string } }
  | { type: 'flow-preview'; data: FlowPreviewData }

export type CanvasPanelStatus = 'loading' | 'active' | 'completed' | 'error'

// ── Full panel type: position + size + lifecycle on top of data ───────────────
export type CanvasPanel = PanelData & {
  id: string
  title: string
  status: CanvasPanelStatus
  position: { x: number; y: number }
  size: { width: number; height: number }
  spawnedAt: number
}

// ── Input type for spawnPanel ─────────────────────────────────────────────────
type SpawnInput = Omit<CanvasPanel, 'id' | 'spawnedAt' | 'status'> & {
  status?: CanvasPanelStatus
}

const MAX_PANELS = 10;

type CanvasStore = {
  panels:  CanvasPanel[]
  history: CanvasPanel[]
  spawnPanel:  (input: SpawnInput) => string
  updatePanel: (id: string, patch: Partial<Omit<CanvasPanel, 'id' | 'type'>>) => void
  removePanel: (id: string) => void
  clearCanvas: () => void
}

export const useCanvasStore = create<CanvasStore>()((set) => ({
  panels:  [],
  history: [],

  spawnPanel: (input) => {
    const id = crypto.randomUUID();
    const panel: CanvasPanel = {
      ...input,
      id,
      status: input.status ?? 'loading',
      spawnedAt: Date.now(),
    } as CanvasPanel;

    set((s) => {
      const next = [panel, ...s.panels].slice(0, MAX_PANELS);
      return { panels: next };
    });

    return id;
  },

  updatePanel: (id, patch) => {
    set((s) => ({
      panels: s.panels.map((p) => (p.id === id ? { ...p, ...patch } : p))
    }));
  },

  removePanel: (id) => {
    set((s) => {
      const panel = s.panels.find((p) => p.id === id);
      return {
        panels:  s.panels.filter((p) => p.id !== id),
        history: panel ? [panel, ...s.history].slice(0, 50) : s.history
      };
    });
  },

  clearCanvas: () => {
    set((s) => ({ panels: [], history: [...s.panels, ...s.history].slice(0, 50) }));
  }
}));

// ── Panel position helper ─────────────────────────────────────────────────────
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
