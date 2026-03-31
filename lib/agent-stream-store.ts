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
    const newEntry: StreamEntry = { id, label, steps: [], status: 'running', startedAt: Date.now() };
    set((s) => ({
      entries: [newEntry, ...s.entries].slice(0, 50)
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
