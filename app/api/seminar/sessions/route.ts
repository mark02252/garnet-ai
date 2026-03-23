import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runSeminarSchedulerTick, startSeminarScheduler } from '@/lib/seminar-scheduler';
import { createSeminarSession, listSeminarSessions } from '@/lib/seminar-storage';
import {
  hasAgentExecution,
  hasBusinessContext,
  hasDomainAgentPoolConfig,
  sanitizeAgentExecution,
  sanitizeBusinessContext,
  sanitizeDomainAgentPoolConfig
} from '@/lib/agent-config';
import type { RuntimeConfig } from '@/lib/types';

const runtimeSchema = z
  .object({
    runProfile: z.enum(['manual', 'free']).optional(),
    llmProvider: z.enum(['openai', 'gemini', 'groq', 'local', 'openclaw']).optional(),
    openaiApiKey: z.string().optional(),
    openaiModel: z.string().optional(),
    geminiApiKey: z.string().optional(),
    geminiModel: z.string().optional(),
    groqApiKey: z.string().optional(),
    groqModel: z.string().optional(),
    localBaseUrl: z.string().optional(),
    localModel: z.string().optional(),
    localApiKey: z.string().optional(),
    openclawAgent: z.string().optional(),
    searchApiKey: z.string().optional(),
    searchProvider: z.enum(['serper', 'brave', 'naver']).optional(),
    searchIncludeDomains: z.string().optional(),
    searchExcludeDomains: z.string().optional(),
    seminarDebateCycles: z.number().min(1).max(3).optional(),
    domainAgentPoolConfig: z.unknown().optional(),
    businessContext: z.unknown().optional(),
    agentExecution: z.unknown().optional()
  })
  .optional();

const createSchema = z.object({
  title: z.string().optional(),
  topic: z.string().min(1),
  brand: z.string().optional(),
  region: z.string().optional(),
  goal: z.string().optional(),
  durationHours: z.number().min(1).max(72).default(24),
  intervalMinutes: z.number().min(10).max(360).default(60),
  startsAt: z.string().datetime().optional(),
  runtime: runtimeSchema
});

function normalizeRuntime(runtime?: RuntimeConfig) {
  if (!runtime) return null;
  const trimmed = Object.fromEntries(
    Object.entries(runtime).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
  ) as RuntimeConfig;
  if (trimmed.seminarDebateCycles !== undefined) {
    trimmed.seminarDebateCycles = Math.max(1, Math.min(3, Math.floor(Number(trimmed.seminarDebateCycles) || 1)));
  }
  const domainAgentPoolConfig = sanitizeDomainAgentPoolConfig(trimmed.domainAgentPoolConfig);
  const businessContext = sanitizeBusinessContext(trimmed.businessContext);
  const agentExecution = sanitizeAgentExecution(trimmed.agentExecution);
  trimmed.domainAgentPoolConfig = hasDomainAgentPoolConfig(domainAgentPoolConfig) ? domainAgentPoolConfig : undefined;
  trimmed.businessContext = hasBusinessContext(businessContext) ? businessContext || undefined : undefined;
  trimmed.agentExecution = hasAgentExecution(agentExecution) ? agentExecution || undefined : undefined;

  const hasAny = Object.values(trimmed).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return Boolean(value);
  });
  return hasAny ? trimmed : null;
}

export async function GET() {
  startSeminarScheduler();
  const sessions = await listSeminarSessions(40);
  return NextResponse.json({ sessions });
}

export async function POST(req: Request) {
  try {
    startSeminarScheduler();
    const json = await req.json();
    const input = createSchema.parse(json);

    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const endsAt = new Date(startsAt.getTime() + input.durationHours * 60 * 60 * 1000);
    const maxRounds = Math.max(1, Math.floor((input.durationHours * 60) / input.intervalMinutes));

    const created = await createSeminarSession({
      title: input.title,
      topic: input.topic,
      brand: input.brand,
      region: input.region,
      goal: input.goal,
      startsAt,
      endsAt,
      intervalMinutes: input.intervalMinutes,
      maxRounds,
      runtimeConfig: normalizeRuntime(input.runtime as RuntimeConfig | undefined)
    });
    await runSeminarSchedulerTick();

    return NextResponse.json({ ok: true, session: created });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '세미나 세션 생성에 실패했습니다.' },
      { status: 400 }
    );
  }
}
