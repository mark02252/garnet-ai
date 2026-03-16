import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { runMarketingMeeting } from '@/lib/pipeline';
import { upsertRunProgress } from '@/lib/run-progress';
import { inferDomainRoute } from '@/lib/domain-router';
import { resolveOpenClawBin, withOpenClawEnv } from '@/lib/openclaw-cli';
import { resolveSearchContext } from '@/lib/search';
import {
  hasAgentExecution,
  hasBusinessContext,
  hasDomainAgentPoolConfig,
  sanitizeAgentExecution,
  sanitizeBusinessContext,
  sanitizeDomainAgentPoolConfig
} from '@/lib/agent-config';
import type { RuntimeConfig } from '@/lib/types';

const execFileAsync = promisify(execFile);

type LlmProvider = 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw';
type RunProfile = 'manual' | 'free';

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
    searchProvider: z.enum(['serper']).optional(),
    searchIncludeDomains: z.string().optional(),
    searchExcludeDomains: z.string().optional()
  })
  .optional();

const runSchema = z.object({
  topic: z.string().min(1),
  brand: z.string().optional(),
  region: z.string().optional(),
  goal: z.string().optional(),
  domainOverride: z
    .enum([
      'AUTO',
      'MARKETING_GROWTH',
      'PRICING_PROCUREMENT',
      'OPERATIONS_EXPANSION',
      'FINANCE_STRATEGY',
      'GENERAL_STRATEGY'
    ])
    .optional(),
  domainSpecialistOverrides: z
    .object({
      MARKETING_GROWTH: z
        .array(
          z.object({
            id: z.string().min(1).max(80),
            name: z.string().min(1).max(80),
            specialty: z.string().min(1).max(160),
            expectedOutput: z.string().min(1).max(160)
          })
        )
        .max(12)
        .optional(),
      PRICING_PROCUREMENT: z
        .array(
          z.object({
            id: z.string().min(1).max(80),
            name: z.string().min(1).max(80),
            specialty: z.string().min(1).max(160),
            expectedOutput: z.string().min(1).max(160)
          })
        )
        .max(12)
        .optional(),
      OPERATIONS_EXPANSION: z
        .array(
          z.object({
            id: z.string().min(1).max(80),
            name: z.string().min(1).max(80),
            specialty: z.string().min(1).max(160),
            expectedOutput: z.string().min(1).max(160)
          })
        )
        .max(12)
        .optional(),
      FINANCE_STRATEGY: z
        .array(
          z.object({
            id: z.string().min(1).max(80),
            name: z.string().min(1).max(80),
            specialty: z.string().min(1).max(160),
            expectedOutput: z.string().min(1).max(160)
          })
        )
        .max(12)
        .optional(),
      GENERAL_STRATEGY: z
        .array(
          z.object({
            id: z.string().min(1).max(80),
            name: z.string().min(1).max(80),
            specialty: z.string().min(1).max(160),
            expectedOutput: z.string().min(1).max(160)
          })
        )
        .max(12)
        .optional()
    })
    .optional(),
  attachments: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        mimeType: z.string().max(120).optional(),
        content: z.string().min(1).max(20000)
      })
    )
    .max(6)
    .optional(),
  domainAgentPoolConfig: z.unknown().optional(),
  businessContext: z.unknown().optional(),
  agentExecution: z.unknown().optional(),
  runtime: runtimeSchema
});

function parseProvider(raw: string): LlmProvider {
  if (raw === 'gemini' || raw === 'groq' || raw === 'local' || raw === 'openclaw') return raw;
  return 'openai';
}

function parseRunProfile(raw: string): RunProfile {
  return raw.toLowerCase() === 'free' ? 'free' : 'manual';
}

function hasValue(value?: string) {
  return Boolean(value && value.trim());
}

function isTrue(raw: string | undefined, defaultValue = false) {
  if (!raw) return defaultValue;
  const normalized = raw.toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes';
}

function getFreeModeOrder() {
  const envRaw = process.env.FREE_MODE_PROVIDER_ORDER || '';
  const order = envRaw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => {
      if (item === 'openclaw' || item === 'groq' || item === 'gemini' || item === 'local' || item === 'openai') {
        return item as LlmProvider;
      }
      return null;
    })
    .filter((provider): provider is LlmProvider => Boolean(provider))
    .filter((provider, index, list) => list.indexOf(provider) === index)
    .slice(0, 4);
  if (order.length) return order;
  return ['openclaw', 'groq', 'gemini', 'local'] as LlmProvider[];
}

function resolveFallbackProvider(
  runtime: RuntimeConfig | undefined,
  envHas: Record<string, boolean>
): Exclude<LlmProvider, 'openclaw'> | null {
  const hasOpenAI = hasValue(runtime?.openaiApiKey) || envHas.OPENAI_API_KEY;
  const hasGemini =
    (hasValue(runtime?.geminiApiKey) || envHas.GEMINI_API_KEY) &&
    (hasValue(runtime?.geminiModel) || envHas.GEMINI_MODEL);
  const hasGroq = hasValue(runtime?.groqApiKey) || envHas.GROQ_API_KEY;
  const hasLocal =
    (hasValue(runtime?.localBaseUrl) || envHas.LOCAL_LLM_BASE_URL) &&
    (hasValue(runtime?.localModel) || envHas.LOCAL_LLM_MODEL);

  const envPreferred = parseProvider((process.env.LLM_PROVIDER || '').toLowerCase());
  if (envPreferred === 'openai' && hasOpenAI) return 'openai';
  if (envPreferred === 'gemini' && hasGemini) return 'gemini';
  if (envPreferred === 'groq' && hasGroq) return 'groq';
  if (envPreferred === 'local' && hasLocal) return 'local';

  if (hasGemini) return 'gemini';
  if (hasGroq) return 'groq';
  if (hasOpenAI) return 'openai';
  if (hasLocal) return 'local';
  return null;
}

function resolveFreeModeProvider(params: {
  runtime: RuntimeConfig | undefined;
  envHas: Record<string, boolean>;
  openclawReady: boolean;
}) {
  const { runtime, envHas, openclawReady } = params;
  const hasOpenAI = hasValue(runtime?.openaiApiKey) || envHas.OPENAI_API_KEY;
  const hasGemini =
    (hasValue(runtime?.geminiApiKey) || envHas.GEMINI_API_KEY) &&
    (hasValue(runtime?.geminiModel) || envHas.GEMINI_MODEL);
  const hasGroq = hasValue(runtime?.groqApiKey) || envHas.GROQ_API_KEY;
  const hasLocal =
    (hasValue(runtime?.localBaseUrl) || envHas.LOCAL_LLM_BASE_URL) &&
    (hasValue(runtime?.localModel) || envHas.LOCAL_LLM_MODEL);

  const availability: Record<LlmProvider, boolean> = {
    openclaw: openclawReady,
    groq: hasGroq,
    gemini: hasGemini,
    local: hasLocal,
    openai: hasOpenAI
  };

  const freeOrder = getFreeModeOrder();
  for (const provider of freeOrder) {
    if (availability[provider]) return provider;
  }

  if (isTrue(process.env.FREE_MODE_ALLOW_PAID_FALLBACK, false) && availability.openai) {
    return 'openai' as LlmProvider;
  }

  return null;
}

async function getOpenClawReadyStatus() {
  const bin = resolveOpenClawBin(process.env.OPENCLAW_BIN);
  try {
    await execFileAsync(bin, ['--version'], withOpenClawEnv({ timeout: 4000, maxBuffer: 512 * 1024 }));
  } catch {
    return { ready: false, reason: 'OpenClaw 미설치 또는 실행 불가' };
  }

  try {
    const { stdout } = await execFileAsync(bin, ['models', 'list', '--json'], {
      ...withOpenClawEnv(),
      timeout: 8000,
      maxBuffer: 4 * 1024 * 1024
    });
    const parsed = JSON.parse(stdout || '{}') as {
      models?: Array<{ key?: string; available?: boolean }>;
    };
    const modelCount = (parsed.models || []).filter((m) => m.available !== false).length;
    if (!modelCount) {
      return { ready: false, reason: 'OpenClaw 사용 가능 모델 없음' };
    }
    return { ready: true, reason: '' };
  } catch {
    return { ready: false, reason: 'OpenClaw 모델 조회 실패' };
  }
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = runSchema.parse(json);
    const runtime = input.runtime as RuntimeConfig | undefined;
    const resolvedSearch = resolveSearchContext(input.topic, input.brand, input.region, input.goal);
    const domainAgentPoolConfig = sanitizeDomainAgentPoolConfig(input.domainAgentPoolConfig);
    const businessContext = sanitizeBusinessContext(input.businessContext);
    const agentExecution = sanitizeAgentExecution(input.agentExecution);
    const meetingInput = {
      topic: input.topic,
      brand: input.brand || resolvedSearch.effectiveBrand || undefined,
      region: input.region || resolvedSearch.effectiveRegion || undefined,
      goal: input.goal,
      domainOverride: input.domainOverride,
      domainSpecialistOverrides: input.domainSpecialistOverrides,
      domainAgentPoolConfig: hasDomainAgentPoolConfig(domainAgentPoolConfig) ? domainAgentPoolConfig : undefined,
      businessContext: hasBusinessContext(businessContext) ? businessContext || undefined : undefined,
      agentExecution: hasAgentExecution(agentExecution) ? agentExecution || undefined : undefined,
      attachments: (input.attachments || [])
        .map((attachment) => ({
          name: attachment.name.trim(),
          mimeType: (attachment.mimeType || 'text/plain').trim(),
          content: attachment.content.trim().slice(0, 20000)
        }))
        .filter((attachment) => attachment.name && attachment.content)
    };
    const routed = inferDomainRoute(meetingInput);
    const requestedProvider = parseProvider(
      (runtime?.llmProvider || (process.env.LLM_PROVIDER || 'openai').toLowerCase()).toLowerCase()
    );
    const runProfile = parseRunProfile(runtime?.runProfile || process.env.LLM_RUN_PROFILE || 'manual');

    const missing: string[] = [];
    const envHas: Record<string, boolean> = {
      OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
      GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
      GEMINI_MODEL: Boolean(process.env.GEMINI_MODEL),
      GROQ_API_KEY: Boolean(process.env.GROQ_API_KEY),
      GROQ_MODEL: Boolean(process.env.GROQ_MODEL),
      LOCAL_LLM_BASE_URL: Boolean(process.env.LOCAL_LLM_BASE_URL),
      LOCAL_LLM_MODEL: Boolean(process.env.LOCAL_LLM_MODEL),
      SEARCH_API_KEY: Boolean(process.env.SEARCH_API_KEY)
    };

    const has = (value?: string, key?: string) => {
      if (hasValue(value)) return true;
      if (key && envHas[key]) return true;
      return false;
    };

    let effectiveProvider: LlmProvider = requestedProvider;
    let providerNotice = '';
    const openclawStatus = await getOpenClawReadyStatus();

    if (runProfile === 'free') {
      const freeProvider = resolveFreeModeProvider({
        runtime,
        envHas,
        openclawReady: openclawStatus.ready
      });
      if (freeProvider) {
        effectiveProvider = freeProvider;
        if (freeProvider !== requestedProvider) {
          providerNotice = `무료모드로 ${freeProvider.toUpperCase()} provider를 자동 선택했습니다.`;
        }
      } else {
        missing.push('무료모드 실행 가능 provider가 없습니다 (OpenClaw/Groq/Gemini/Local).');
      }
    } else if (requestedProvider === 'openclaw') {
      if (!openclawStatus.ready) {
        const fallbackProvider = resolveFallbackProvider(runtime, envHas);
        if (fallbackProvider) {
          effectiveProvider = fallbackProvider;
          providerNotice = `${openclawStatus.reason}로 ${fallbackProvider.toUpperCase()} provider로 자동 전환했습니다.`;
        } else {
          missing.push(`${openclawStatus.reason}(대체 API 키 없음)`);
        }
      }
    }

    if (effectiveProvider === 'gemini') {
      if (!has(runtime?.geminiApiKey, 'GEMINI_API_KEY')) missing.push('GEMINI_API_KEY');
      if (!has(runtime?.geminiModel, 'GEMINI_MODEL')) missing.push('GEMINI_MODEL');
    } else if (effectiveProvider === 'groq') {
      if (!has(runtime?.groqApiKey, 'GROQ_API_KEY')) missing.push('GROQ_API_KEY');
    } else if (effectiveProvider === 'local') {
      if (!has(runtime?.localBaseUrl, 'LOCAL_LLM_BASE_URL')) missing.push('LOCAL_LLM_BASE_URL');
      if (!has(runtime?.localModel, 'LOCAL_LLM_MODEL')) missing.push('LOCAL_LLM_MODEL');
    } else if (effectiveProvider === 'openclaw') {
      // OpenClaw는 로컬 OAuth/게이트웨이 기반으로 실행되어 별도 LLM 키를 강제하지 않음.
    } else {
      if (!has(runtime?.openaiApiKey, 'OPENAI_API_KEY')) missing.push('OPENAI_API_KEY');
    }

    if (!has(runtime?.searchApiKey, 'SEARCH_API_KEY')) {
      missing.push('SEARCH_API_KEY');
    }

    if (missing.length) {
      return NextResponse.json(
        { error: `실행에 필요한 키가 없습니다: ${missing.join(', ')}`, missing },
        { status: 400 }
      );
    }

    const runtimeToUse: RuntimeConfig = {
      ...(runtime || {}),
      runProfile,
      llmProvider: effectiveProvider
    };

    const run = await prisma.run.create({
      data: {
        topic: meetingInput.topic,
        brand: meetingInput.brand,
        region: meetingInput.region,
        goal: meetingInput.goal
      }
    });

    if (meetingInput.attachments && meetingInput.attachments.length > 0) {
      await prisma.runAttachment.createMany({
        data: meetingInput.attachments.map((attachment) => ({
          runId: run.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          content: attachment.content
        }))
      });
    }

    await upsertRunProgress({
      runId: run.id,
      status: 'PENDING',
      stepKey: 'web_research',
      stepLabel: '회의 실행 대기',
      progressPct: 2,
      message: '회의 실행을 준비 중입니다.'
    });

    void runMarketingMeeting(
      meetingInput,
      runtimeToUse,
      {
        mode: 'deliberation',
        reviewCycles: 1,
        onProgress: async (update) => {
          await upsertRunProgress({
            runId: run.id,
            status: update.status,
            stepKey: update.stepKey,
            stepLabel: update.stepLabel,
            progressPct: update.progressPct,
            message: update.message,
            finishedAt: update.status === 'COMPLETED' ? new Date().toISOString() : null
          });
        }
      },
      run.id
    ).catch(async (error) => {
      const message = error instanceof Error ? error.message : '회의 실행 중 오류가 발생했습니다.';
      await upsertRunProgress({
        runId: run.id,
        status: 'FAILED',
        stepKey: 'meeting',
        stepLabel: '회의 실행 실패',
        progressPct: 100,
        message,
        finishedAt: new Date().toISOString()
      });
    });

    return NextResponse.json({
      runId: run.id,
      runProfile,
      requestedProvider,
      effectiveProvider,
      routedDomain: routed.domain,
      routedConfidence: routed.confidence,
      routedMode: routed.routingMode,
      resolvedBrand: meetingInput.brand || '',
      resolvedRegion: meetingInput.region || '',
      resolvedBranch: resolvedSearch.inferredBranch || '',
      resolutionConfidence: resolvedSearch.confidence,
      providerNotice: providerNotice || undefined,
      queued: true
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '회의 실행에 실패했습니다.' },
      { status: 500 }
    );
  }
}
