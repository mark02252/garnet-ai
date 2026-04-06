import { create } from 'zustand'
import type { NodeStatus } from './types'

type FlowRunStore = {
  runId: string | null
  nodeStatuses: Record<string, NodeStatus>
  nodeOutputs: Record<string, string>
  isRunning: boolean
  error: string | null

  startRun: (runId: string) => void
  setNodeStatus: (nodeId: string, status: NodeStatus) => void
  setNodeOutput: (nodeId: string, output: string) => void
  finishRun: () => void
  resetRun: () => void
}

export const useFlowRunStore = create<FlowRunStore>()((set) => ({
  runId: null,
  nodeStatuses: {},
  nodeOutputs: {},
  isRunning: false,
  error: null,

  startRun: (runId) => set({ runId, isRunning: true, error: null, nodeStatuses: {}, nodeOutputs: {} }),

  setNodeStatus: (nodeId, status) =>
    set((s) => ({ nodeStatuses: { ...s.nodeStatuses, [nodeId]: status } })),

  setNodeOutput: (nodeId, output) =>
    set((s) => ({ nodeOutputs: { ...s.nodeOutputs, [nodeId]: output } })),

  finishRun: () => set({ isRunning: false }),

  resetRun: () => set({ runId: null, nodeStatuses: {}, nodeOutputs: {}, isRunning: false, error: null }),
}))
