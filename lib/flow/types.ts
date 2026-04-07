export type StartNode = {
  type: 'start'
  id: string
  position: { x: number; y: number }
  data: {
    topic: string
    brand?: string
    region?: string
    goal?: string
  }
}

export type AgentNode = {
  type: 'agent'
  id: string
  position: { x: number; y: number }
  data: {
    role: string
    agentKey?: string
    model: 'claude' | 'gemini' | 'gpt' | 'groq' | 'gemma4'
    systemPrompt: string
  }
}

export type ToolNode = {
  type: 'tool'
  id: string
  position: { x: number; y: number }
  data: { toolType: 'web-search' }
}

export type EndNode = {
  type: 'end'
  id: string
  position: { x: number; y: number }
  data: Record<string, never>
}

export type FlowNode = StartNode | AgentNode | ToolNode | EndNode

export type FlowEdge = {
  id: string
  source: string
  target: string
}

export type NodeStatus = 'idle' | 'running' | 'done' | 'error'

export type FlowRunEvent =
  | { type: 'run-start';     runId: string }
  | { type: 'node-start';    nodeId: string }
  | { type: 'node-done';     nodeId: string; output: string }
  | { type: 'node-error';    nodeId: string; error: string }
  | { type: 'flow-complete'; runId: string }
  | { type: 'flow-error';    error: string }

export type RunInput = {
  topic: string
  brand?: string
  region?: string
  goal?: string
}
