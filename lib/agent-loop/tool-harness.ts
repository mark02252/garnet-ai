/**
 * Garnet Phase 7 — Agentic Tool Harness
 * ToolHarness: orchestrates tool execution with caching, rate limiting, and metrics.
 */

import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ToolCall,
  ToolResult,
  ToolDeclaration,
  ToolHandler,
  HarnessConfig,
  HarnessMetrics,
} from './tool-types';

// ── Constants ──────────────────────────────────────────────────────────────

const CONFIG_PATH = path.resolve(process.cwd(), 'config/tools.yaml');
const METRICS_PATH = path.resolve(process.cwd(), '.garnet-config/harness-metrics.json');

const DEFAULT_CONFIG: HarnessConfig = {
  allowedTools: {},
  maxCallsPerReasoner: 3,
  maxCallsPerCycle: 15,
  toolTimeout: 5000,
};

// ── Sliding Window Rate Limiter (token bucket) ─────────────────────────────

type RateLimitState = {
  windowMs: number;
  maxCalls: number;
  calls: number[];
};

function createRateLimiter(maxCalls: number, windowMs: number): RateLimitState {
  return { windowMs, maxCalls, calls: [] };
}

function tryConsumeToken(state: RateLimitState): boolean {
  const now = Date.now();
  state.calls = state.calls.filter((t) => now - t < state.windowMs);
  if (state.calls.length >= state.maxCalls) return false;
  state.calls.push(now);
  return true;
}

// ── YAML config loader ─────────────────────────────────────────────────────

type RawToolsConfig = {
  max_calls_per_reasoner?: number;
  max_calls_per_cycle?: number;
  tool_timeout?: number;
  sub_reasoners?: Record<string, { tools: string[] }>;
};

function loadConfig(): HarnessConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = yaml.load(raw) as RawToolsConfig;

    const allowedTools: Record<string, string[]> = {};
    for (const [reasoner, def] of Object.entries(parsed.sub_reasoners ?? {})) {
      allowedTools[reasoner] = def.tools ?? [];
    }

    return {
      allowedTools,
      maxCallsPerReasoner: parsed.max_calls_per_reasoner ?? DEFAULT_CONFIG.maxCallsPerReasoner,
      maxCallsPerCycle: parsed.max_calls_per_cycle ?? DEFAULT_CONFIG.maxCallsPerCycle,
      toolTimeout: parsed.tool_timeout ?? DEFAULT_CONFIG.toolTimeout,
    };
  } catch {
    // Fallback: config file absent or malformed
    return DEFAULT_CONFIG;
  }
}

// ── ToolHarness ────────────────────────────────────────────────────────────

export class ToolHarness {
  private readonly cycleId: string;
  private readonly config: HarnessConfig;

  private readonly registry = new Map<string, { declaration: ToolDeclaration; handler: ToolHandler }>();
  private readonly cache = new Map<string, unknown>();

  // Per-reasoner call counters (this cycle)
  private readonly reasonerCallCounts = new Map<string, number>();
  private cycleCallCount = 0;

  // External API sliding-window rate limiters
  private readonly apiRateLimiters: Record<string, RateLimitState> = {
    ga4_query: createRateLimiter(10, 60_000),   // 10 calls / min
    ga4_funnel: createRateLimiter(10, 60_000),  // shared GA4 limit
    web_search: createRateLimiter(5, 60_000),   // 5 calls / min
  };

  // Metrics accumulators
  private readonly callLog: HarnessMetrics['toolCalls'] = [];
  private rateLimitRejections = 0;
  private askExpertCalls = 0;
  private toolCallParseFailures = 0;

  constructor(cycleId: string) {
    this.cycleId = cycleId;
    this.config = loadConfig();
  }

  // ── Registration ──────────────────────────────────────────────────────────

  registerTool(declaration: ToolDeclaration, handler: ToolHandler): void {
    this.registry.set(declaration.name, { declaration, handler });
  }

  // ── Tool discovery ────────────────────────────────────────────────────────

  getToolDeclarations(reasonerName: string): ToolDeclaration[] {
    const allowed = this.config.allowedTools[reasonerName];
    if (!allowed) return [];
    return allowed
      .map((name) => this.registry.get(name)?.declaration)
      .filter((d): d is ToolDeclaration => d !== undefined);
  }

  // ── Execution pipeline ────────────────────────────────────────────────────

  async execute(reasonerName: string, call: ToolCall): Promise<ToolResult> {
    const startMs = Date.now();

    const finish = (
      status: 'ok' | 'error',
      payload: { data?: unknown; error?: string; message?: string },
      cached: boolean,
    ): ToolResult => {
      const latencyMs = Date.now() - startMs;
      this.callLog.push({
        tool: call.tool,
        reasoner: reasonerName,
        latencyMs,
        cached,
        success: status === 'ok',
      });
      return { tool: call.tool, status, latencyMs, cached, ...payload };
    };

    // 1. Cache check
    const cacheKey = canonicalKey(call.tool, call.params);
    if (this.cache.has(cacheKey)) {
      return finish('ok', { data: this.cache.get(cacheKey) }, true);
    }

    // 2. Whitelist check
    const allowed = this.config.allowedTools[reasonerName] ?? [];
    if (!allowed.includes(call.tool)) {
      this.rateLimitRejections++;
      return finish('error', { error: 'tool_not_allowed', message: `Tool "${call.tool}" is not permitted for reasoner "${reasonerName}"` }, false);
    }

    // 3. Per-reasoner rate limit
    const reasonerCount = this.reasonerCallCounts.get(reasonerName) ?? 0;
    if (reasonerCount >= this.config.maxCallsPerReasoner) {
      this.rateLimitRejections++;
      return finish('error', { error: 'rate_limit_reasoner', message: `Reasoner "${reasonerName}" exceeded ${this.config.maxCallsPerReasoner} calls/cycle` }, false);
    }

    // 4. Per-cycle rate limit
    if (this.cycleCallCount >= this.config.maxCallsPerCycle) {
      this.rateLimitRejections++;
      return finish('error', { error: 'rate_limit_cycle', message: `Cycle "${this.cycleId}" exceeded ${this.config.maxCallsPerCycle} total calls` }, false);
    }

    // 5. External API sliding-window rate limit
    const limiter = this.apiRateLimiters[call.tool];
    if (limiter && !tryConsumeToken(limiter)) {
      this.rateLimitRejections++;
      return finish('error', { error: 'rate_limit_api', message: `External API rate limit reached for tool "${call.tool}"` }, false);
    }

    // Increment counters before execution
    this.reasonerCallCounts.set(reasonerName, reasonerCount + 1);
    this.cycleCallCount++;

    // 6. Tool execution with timeout
    const entry = this.registry.get(call.tool);
    if (!entry) {
      return finish('error', { error: 'tool_not_registered', message: `Tool "${call.tool}" is not registered` }, false);
    }

    try {
      const data = await withTimeout(entry.handler(call.params), this.config.toolTimeout);
      this.cache.set(cacheKey, data);
      return finish('ok', { data }, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return finish('error', { error: 'execution_error', message }, false);
    }
  }

  // ── A2A ask-expert slot ───────────────────────────────────────────────────

  consumeAskExpertSlot(reasonerName: string): boolean {
    const count = this.reasonerCallCounts.get(reasonerName) ?? 0;
    if (count >= this.config.maxCallsPerReasoner) return false;
    this.askExpertCalls++;
    this.reasonerCallCounts.set(reasonerName, count + 1);
    return true;
  }

  // ── Parse failure tracking ─────────────────────────────────────────────────

  recordParseFailure(): void {
    this.toolCallParseFailures++;
  }

  // ── Metrics persistence ────────────────────────────────────────────────────

  saveMetrics(): void {
    const total = this.callLog.length;
    const hits = this.callLog.filter((c) => c.cached).length;

    const metrics: HarnessMetrics = {
      cycleId: this.cycleId,
      toolCalls: this.callLog,
      cacheHitRate: total > 0 ? hits / total : 0,
      rateLimitRejections: this.rateLimitRejections,
      askExpertCalls: this.askExpertCalls,
      toolCallParseFailures: this.toolCallParseFailures,
    };

    try {
      const dir = path.dirname(METRICS_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(METRICS_PATH, JSON.stringify(metrics, null, 2), 'utf8');
    } catch (err) {
      console.error('[ToolHarness] Failed to save metrics:', err);
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Produce a deterministic cache key by sorting param keys. */
function canonicalKey(tool: string, params: Record<string, unknown>): string {
  const sorted = Object.fromEntries(
    Object.entries(params).sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify({ tool, params: sorted });
}

/** Reject a promise if it doesn't resolve within `ms` milliseconds. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Tool timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
