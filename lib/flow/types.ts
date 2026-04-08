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

export type DebateNode = {
  type: 'debate'
  id: string
  position: { x: number; y: number }
  data: {
    topic: string
    rounds: number
    model: AgentNode['data']['model']
    proSystemPrompt: string
    conSystemPrompt: string
  }
}

export type JudgeNode = {
  type: 'judge'
  id: string
  position: { x: number; y: number }
  data: {
    criteria: string
    threshold: number  // 0-100, 이 점수 미만이면 재생성
    maxRetries: number // 최대 재시도 횟수
    model: AgentNode['data']['model']
  }
}

export type FlowNode = StartNode | AgentNode | ToolNode | EndNode | DebateNode | JudgeNode

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
  | { type: 'debate-turn';   nodeId: string; speaker: 'pro' | 'con' | 'moderator'; round: number; content: string }
  | { type: 'judge-score';   nodeId: string; score: number; feedback: string; retry: number }

export type RunInput = {
  topic: string
  brand?: string
  region?: string
  goal?: string
}
