/**
 * Garnet Phase 7 — A2A Protocol
 * a2a-protocol.ts: Agent-to-Agent communication via ask_expert.
 *
 * Enables sub-reasoners to consult domain experts during analysis.
 * Cache is cleared at each cycle start to ensure fresh responses.
 */

import { runLLM } from '@/lib/llm';
import type { ToolHarness } from './tool-harness';

// ── Types ──────────────────────────────────────────────────────────────────

export type A2ARequest = {
  from: string;
  expert: string;
  question: string;
};

export type A2AResponse = {
  expert: string;
  answer: string;
  confidence: number;
};

// ── Expert Prompts ─────────────────────────────────────────────────────────

const EXPERT_PROMPTS: Record<string, string> = {
  analysis: '데이터 분석 전문가. 수치 기반 패턴과 이상치를 찾는다. 한국어.',
  content: '콘텐츠 전략가. 포맷, 채널, 메시지 최적화. 한국어.',
  strategy: '마케팅 전략가. 시장 포지셔닝과 성장 전략. 한국어.',
  cro: 'CRO 전문가. 전환 병목과 최적화. 한국어.',
  psychology: '소비자 심리 전문가. 인지 편향과 행동경제학. 한국어.',
};

// ── Module-level cache ─────────────────────────────────────────────────────

const expertCache = new Map<string, A2AResponse>();

export function clearExpertCache(): void {
  expertCache.clear();
}

// ── Core ask_expert ────────────────────────────────────────────────────────

export async function askExpert(
  request: A2ARequest,
  harness?: ToolHarness,
): Promise<A2AResponse> {
  const { from, expert, question } = request;
  const cacheKey = `${expert}:${question}`;

  // Check cache first
  const cached = expertCache.get(cacheKey);
  if (cached) return cached;

  // Unknown expert guard
  const systemPrompt = EXPERT_PROMPTS[expert];
  if (!systemPrompt) {
    return { expert, answer: `알 수 없는 전문가: ${expert}`, confidence: 0 };
  }

  // Consume A2A slot from harness if provided
  if (harness) {
    harness.consumeAskExpertSlot(from);
  }

  try {
    const answer = await Promise.race<string>([
      runLLM(systemPrompt, question, 0.4, 400),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 8000),
      ),
    ]);

    const response: A2AResponse = { expert, answer: answer.trim(), confidence: 0.8 };
    expertCache.set(cacheKey, response);
    return response;
  } catch {
    return { expert, answer: '응답 시간 초과', confidence: 0 };
  }
}

// ── Stub functions for future external A2A ─────────────────────────────────

export async function askExternal(_request: A2ARequest): Promise<A2AResponse> {
  throw new Error('External A2A not yet implemented');
}

// TODO: register an external agent endpoint for future multi-agent federation
export function registerExternalAgent(
  _agentId: string,
  _endpoint: string,
): void {
  // no-op
}
