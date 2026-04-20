/**
 * Garnet Phase 7 — Agentic Tool Harness
 * Type definitions for the tool harness system.
 */

/** A tool invocation request from a sub-reasoner. */
export type ToolCall = {
  tool: string;
  params: Record<string, unknown>;
};

/** The result of a tool execution. */
export type ToolResult = {
  tool: string;
  status: 'ok' | 'error';
  data?: unknown;
  error?: string;
  message?: string;
  latencyMs: number;
  cached: boolean;
};

/** Declarative schema for a registered tool. */
export type ToolDeclaration = {
  name: string;
  description: string;
  parameters: Record<
    string,
    {
      type: string;
      description: string;
      required?: boolean;
      enum?: string[];
    }
  >;
};

/** The async handler function backing a tool. */
export type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

/** Loaded from config/tools.yaml — governs harness limits and access control. */
export type HarnessConfig = {
  allowedTools: Record<string, string[]>; // reasoner name → allowed tool names
  maxCallsPerReasoner: number;
  maxCallsPerCycle: number;
  toolTimeout: number; // ms
};

/** Per-cycle metrics emitted by the harness for observability. */
export type HarnessMetrics = {
  cycleId: string;
  toolCalls: Array<{
    tool: string;
    reasoner: string;
    latencyMs: number;
    cached: boolean;
    success: boolean;
  }>;
  cacheHitRate: number;
  rateLimitRejections: number;
  askExpertCalls: number;
  toolCallParseFailures: number;
};
