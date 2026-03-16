import OpenAI from 'openai';
import { resolveOpenClawBin, withOpenClawEnv } from '@/lib/openclaw-cli';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RuntimeConfig } from '@/lib/types';

const execFileAsync = promisify(execFile);

type LlmProvider = 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw';
type RunProfile = 'manual' | 'free';
type ErrorCode =
  | 'MISSING_CONFIG'
  | 'AUTH'
  | 'QUOTA'
  | 'RATE_LIMIT'
  | 'CONTEXT'
  | 'MODEL'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'COOLDOWN'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

class ProviderError extends Error {
  provider: LlmProvider;
  code: ErrorCode;
  raw?: string;

  constructor(provider: LlmProvider, code: ErrorCode, message: string, raw?: string) {
    super(message);
    this.provider = provider;
    this.code = code;
    this.raw = raw;
  }
}

const OPENAI_DEFAULT_MODEL = 'gpt-4.1-mini';
const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const OPENCLAW_DEFAULT_AGENT = 'main';
const MAX_RAW_ERROR_LEN = 600;

function hasValue(value?: string | null) {
  return Boolean(value && value.trim());
}

function pickValue(...values: Array<string | undefined>) {
  for (const value of values) {
    if (hasValue(value)) return value!.trim();
  }
  return '';
}

function normalizeProvider(raw?: string): LlmProvider {
  const value = (raw || '').trim().toLowerCase();
  if (value === 'gemini' || value === 'groq' || value === 'local' || value === 'openclaw') return value;
  return 'openai';
}

function resolveProvider(runtime?: RuntimeConfig): LlmProvider {
  return normalizeProvider(runtime?.llmProvider || process.env.LLM_PROVIDER || 'openai');
}

function resolveRunProfile(runtime?: RuntimeConfig): RunProfile {
  const value = (runtime?.runProfile || process.env.LLM_RUN_PROFILE || 'manual').toLowerCase();
  return value === 'free' ? 'free' : 'manual';
}

function providerLabel(provider: LlmProvider) {
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'gemini') return 'Gemini';
  if (provider === 'groq') return 'Groq';
  if (provider === 'local') return '로컬 LLM';
  return 'OpenClaw';
}

function compact(text: string, max = 220) {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

function truncateRawError(text?: string) {
  if (!text) return '';
  return compact(text, MAX_RAW_ERROR_LEN);
}

function parseJsonLoosely(text: string): unknown {
  const direct = safeJson(text);
  if (direct) return direct;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return safeJson(text.slice(start, end + 1));
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeContent(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return '';
        const p = part as Record<string, unknown>;
        if (typeof p.text === 'string') return p.text;
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}

function isGeminiQuota(errorText: string) {
  const normalized = errorText.toLowerCase();
  return (
    normalized.includes('resource_exhausted') ||
    normalized.includes('quota') ||
    normalized.includes('429') ||
    normalized.includes('retry in')
  );
}

function mapOpenClawError(rawText: string): ProviderError {
  const normalized = rawText.toLowerCase();

  if (normalized.includes('unknown agent id')) {
    return new ProviderError(
      'openclaw',
      'MISSING_CONFIG',
      'OpenClaw 에이전트 ID를 찾지 못했습니다. 설정에서 에이전트 값을 확인해 주세요.',
      rawText
    );
  }
  if (normalized.includes('provider openai-codex is in cooldown') || normalized.includes('cooldown')) {
    return new ProviderError(
      'openclaw',
      'COOLDOWN',
      'OpenClaw가 현재 쿨다운 상태입니다. 잠시 후 재시도하거나 다른 LLM으로 자동 전환합니다.',
      rawText
    );
  }
  if (normalized.includes('no api key found for provider "openai"') || normalized.includes('(auth)')) {
    return new ProviderError(
      'openclaw',
      'AUTH',
      'OpenClaw 내장 대체 모델 인증에 실패했습니다. OpenClaw 로그인 상태를 확인하거나 다른 LLM 키를 사용해 주세요.',
      rawText
    );
  }
  if (normalized.includes('context window too small') || normalized.includes('maximum context')) {
    return new ProviderError(
      'openclaw',
      'CONTEXT',
      '현재 OpenClaw 모델의 컨텍스트가 부족합니다. 더 큰 모델로 변경하거나 다른 LLM을 사용해 주세요.',
      rawText
    );
  }
  if (normalized.includes('rate_limit') || normalized.includes('429')) {
    return new ProviderError(
      'openclaw',
      'RATE_LIMIT',
      'OpenClaw 호출이 일시적으로 제한되었습니다. 자동 대체 provider를 사용합니다.',
      rawText
    );
  }
  if (normalized.includes('all models failed')) {
    return new ProviderError(
      'openclaw',
      'UNAVAILABLE',
      'OpenClaw 모델 라우팅이 모두 실패했습니다. 자동 대체 provider를 시도합니다.',
      rawText
    );
  }
  if (normalized.includes('enoent') || normalized.includes('not found') || normalized.includes('command not found')) {
    return new ProviderError('openclaw', 'UNAVAILABLE', 'OpenClaw 실행 파일을 찾지 못했습니다.', rawText);
  }
  if (normalized.includes('timed out') || normalized.includes('timeout')) {
    return new ProviderError('openclaw', 'TIMEOUT', 'OpenClaw 응답 시간이 초과되었습니다.', rawText);
  }
  return new ProviderError(
    'openclaw',
    'UNKNOWN',
    `OpenClaw 실행에 실패했습니다. (${compact(rawText, 120) || '원인 확인 필요'})`,
    rawText
  );
}

function mapOpenAIError(error: unknown): ProviderError {
  const e = error as { status?: number; code?: string; message?: string };
  const status = Number(e?.status || 0);
  const code = String(e?.code || '').toLowerCase();
  const message = String(e?.message || '');

  if (status === 401 || status === 403) {
    return new ProviderError('openai', 'AUTH', 'OpenAI API 키 인증에 실패했습니다.', message);
  }
  if (status === 429 && code === 'insufficient_quota') {
    return new ProviderError('openai', 'QUOTA', 'OpenAI 할당량이 초과되었습니다.', message);
  }
  if (status === 429) {
    return new ProviderError('openai', 'RATE_LIMIT', 'OpenAI 요청 한도가 일시적으로 초과되었습니다.', message);
  }
  if (status >= 500) {
    return new ProviderError('openai', 'UNAVAILABLE', 'OpenAI 서버 응답이 불안정합니다.', message);
  }
  if (message.toLowerCase().includes('context')) {
    return new ProviderError('openai', 'CONTEXT', 'OpenAI 모델 컨텍스트 한도를 초과했습니다.', message);
  }
  return new ProviderError('openai', 'UNKNOWN', `OpenAI 오류: ${compact(message || '실행 실패')}`, message);
}

function mapGeminiHttpError(status: number, rawText: string): ProviderError {
  const lower = rawText.toLowerCase();
  if (status === 401 || status === 403) {
    return new ProviderError('gemini', 'AUTH', 'Gemini API 키 인증에 실패했습니다.', rawText);
  }
  if (status === 429 || isGeminiQuota(rawText)) {
    return new ProviderError('gemini', 'QUOTA', 'Gemini 할당량이 초과되었습니다.', rawText);
  }
  if (status === 404 || lower.includes('not found')) {
    return new ProviderError('gemini', 'MODEL', 'Gemini 모델명을 찾지 못했습니다.', rawText);
  }
  if (status >= 500) {
    return new ProviderError('gemini', 'UNAVAILABLE', 'Gemini 서버 응답이 불안정합니다.', rawText);
  }
  return new ProviderError('gemini', 'UNKNOWN', `Gemini 오류(${status}): ${compact(rawText || '실행 실패')}`, rawText);
}

function mapGroqHttpError(status: number, rawText: string): ProviderError {
  const lower = rawText.toLowerCase();
  if (status === 401 || status === 403) {
    return new ProviderError('groq', 'AUTH', 'Groq API 키 인증에 실패했습니다.', rawText);
  }
  if (status === 429 || lower.includes('rate limit') || lower.includes('quota')) {
    return new ProviderError('groq', 'RATE_LIMIT', 'Groq 요청 한도가 일시적으로 초과되었습니다.', rawText);
  }
  if (status === 404 || lower.includes('model') && lower.includes('not found')) {
    return new ProviderError('groq', 'MODEL', 'Groq 모델명을 찾지 못했습니다.', rawText);
  }
  if (status >= 500) {
    return new ProviderError('groq', 'UNAVAILABLE', 'Groq 서버 응답이 불안정합니다.', rawText);
  }
  if (lower.includes('context') || lower.includes('maximum context')) {
    return new ProviderError('groq', 'CONTEXT', 'Groq 모델 컨텍스트 한도를 초과했습니다.', rawText);
  }
  return new ProviderError('groq', 'UNKNOWN', `Groq 오류(${status}): ${compact(rawText || '실행 실패')}`, rawText);
}

function mapLocalHttpError(status: number, rawText: string): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError('local', 'AUTH', '로컬 LLM 인증이 실패했습니다.', rawText);
  }
  if (status === 404) {
    return new ProviderError('local', 'MODEL', '로컬 LLM 모델 또는 엔드포인트를 찾지 못했습니다.', rawText);
  }
  if (status === 429) {
    return new ProviderError('local', 'RATE_LIMIT', '로컬 LLM 요청이 과도합니다.', rawText);
  }
  if (status >= 500) {
    return new ProviderError('local', 'UNAVAILABLE', '로컬 LLM 서버가 응답하지 않습니다.', rawText);
  }
  return new ProviderError('local', 'UNKNOWN', `로컬 LLM 오류(${status}): ${compact(rawText || '실행 실패')}`, rawText);
}

function parseCommaList(input?: string) {
  if (!hasValue(input)) return [];
  return input!
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function hasConfig(provider: LlmProvider, runtime?: RuntimeConfig) {
  if (provider === 'openai') {
    return hasValue(pickValue(runtime?.openaiApiKey, process.env.OPENAI_API_KEY));
  }
  if (provider === 'gemini') {
    return (
      hasValue(pickValue(runtime?.geminiApiKey, process.env.GEMINI_API_KEY)) &&
      hasValue(pickValue(runtime?.geminiModel, process.env.GEMINI_MODEL, GEMINI_DEFAULT_MODEL))
    );
  }
  if (provider === 'groq') {
    return hasValue(pickValue(runtime?.groqApiKey, process.env.GROQ_API_KEY));
  }
  if (provider === 'local') {
    return (
      hasValue(pickValue(runtime?.localBaseUrl, process.env.LOCAL_LLM_BASE_URL)) &&
      hasValue(pickValue(runtime?.localModel, process.env.LOCAL_LLM_MODEL))
    );
  }
  return true;
}

function getPrimaryFallbackOrder(primary: LlmProvider) {
  if (primary === 'openclaw') return ['gemini', 'groq', 'openai', 'local'] as LlmProvider[];
  if (primary === 'gemini') return ['groq', 'openclaw', 'openai', 'local'] as LlmProvider[];
  if (primary === 'groq') return ['gemini', 'openai', 'openclaw', 'local'] as LlmProvider[];
  if (primary === 'openai') return ['groq', 'gemini', 'openclaw', 'local'] as LlmProvider[];
  return ['openclaw', 'groq', 'gemini', 'openai'] as LlmProvider[];
}

function parseFallbackOrderFromEnv(primary: LlmProvider) {
  const raw = process.env.LLM_FALLBACK_ORDER || '';
  const values = parseCommaList(raw)
    .map((v) => normalizeProvider(v))
    .filter((provider, idx, list) => list.indexOf(provider) === idx && provider !== primary);
  if (!values.length) return getPrimaryFallbackOrder(primary).slice(0, 4);
  return values.slice(0, 4);
}

function parseFreeFallbackOrderFromEnv(primary: LlmProvider) {
  const raw = process.env.LLM_FALLBACK_ORDER_FREE || '';
  const values = parseCommaList(raw)
    .map((v) => normalizeProvider(v))
    .filter((provider, idx, list) => list.indexOf(provider) === idx && provider !== primary);
  if (values.length) return values.slice(0, 4);
  return ['openclaw', 'groq', 'gemini', 'local', 'openai']
    .filter((provider) => provider !== primary)
    .slice(0, 4) as LlmProvider[];
}

function shouldUseOpenClawFallbackOnGeminiQuota() {
  const raw = (process.env.OPENCLAW_FALLBACK_ON_GEMINI_QUOTA || 'true').toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

function shouldAllowPaidFallbackInFreeMode() {
  const raw = (process.env.FREE_MODE_ALLOW_PAID_FALLBACK || 'false').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

function normalizeUnknownError(provider: LlmProvider, error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  const message = error instanceof Error ? error.message : String(error || '알 수 없는 오류');
  const normalized = message.toLowerCase();

  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return new ProviderError(provider, 'TIMEOUT', `${providerLabel(provider)} 응답 시간이 초과되었습니다.`, message);
  }
  if (normalized.includes('network') || normalized.includes('fetch failed') || normalized.includes('econnrefused')) {
    return new ProviderError(provider, 'NETWORK', `${providerLabel(provider)} 연결에 실패했습니다.`, message);
  }

  return new ProviderError(provider, 'UNKNOWN', `${providerLabel(provider)} 실행 중 오류가 발생했습니다.`, message);
}

async function runOpenAI(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
  runtime?: RuntimeConfig
) {
  const apiKey = pickValue(runtime?.openaiApiKey, process.env.OPENAI_API_KEY);
  if (!apiKey) {
    throw new ProviderError('openai', 'MISSING_CONFIG', 'OpenAI API 키가 없습니다.');
  }
  const model = pickValue(runtime?.openaiModel, process.env.OPENAI_MODEL, OPENAI_DEFAULT_MODEL);
  const client = new OpenAI({ apiKey });

  try {
    const response = await client.responses.create({
      model,
      temperature,
      max_output_tokens: maxTokens,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const output = (response.output_text || '').trim();
    if (!output) {
      throw new ProviderError('openai', 'UNKNOWN', 'OpenAI 응답이 비어 있습니다.');
    }
    return output;
  } catch (error) {
    throw mapOpenAIError(error);
  }
}

async function runGemini(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
  runtime?: RuntimeConfig
) {
  const apiKey = pickValue(runtime?.geminiApiKey, process.env.GEMINI_API_KEY);
  const model = pickValue(runtime?.geminiModel, process.env.GEMINI_MODEL, GEMINI_DEFAULT_MODEL);
  if (!apiKey) {
    throw new ProviderError('gemini', 'MISSING_CONFIG', 'Gemini API 키가 없습니다.');
  }
  if (!model) {
    throw new ProviderError('gemini', 'MISSING_CONFIG', 'Gemini 모델명이 없습니다.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens
      }
    })
  });

  if (!response.ok) {
    const rawText = await response.text();
    throw mapGeminiHttpError(response.status, rawText);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || '')
    .join('\n')
    .trim();
  if (!text) {
    throw new ProviderError('gemini', 'UNKNOWN', 'Gemini 응답이 비어 있습니다.');
  }
  return text;
}

async function runGroq(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
  runtime?: RuntimeConfig
) {
  const apiKey = pickValue(runtime?.groqApiKey, process.env.GROQ_API_KEY);
  const model = pickValue(runtime?.groqModel, process.env.GROQ_MODEL, GROQ_DEFAULT_MODEL);
  if (!apiKey) {
    throw new ProviderError('groq', 'MISSING_CONFIG', 'GROQ_API_KEY가 없습니다.');
  }
  if (!model) {
    throw new ProviderError('groq', 'MISSING_CONFIG', 'Groq 모델명이 없습니다.');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const rawText = await response.text();
    throw mapGroqHttpError(response.status, rawText);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = normalizeContent(data.choices?.[0]?.message?.content);
  if (!content) {
    throw new ProviderError('groq', 'UNKNOWN', 'Groq 응답이 비어 있습니다.');
  }
  return content;
}

function localCompletionsUrl(baseUrl: string) {
  const clean = baseUrl.trim().replace(/\/$/, '');
  if (clean.endsWith('/v1')) return `${clean}/chat/completions`;
  return `${clean}/v1/chat/completions`;
}

async function runLocal(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
  runtime?: RuntimeConfig
) {
  const baseUrl = pickValue(runtime?.localBaseUrl, process.env.LOCAL_LLM_BASE_URL);
  const model = pickValue(runtime?.localModel, process.env.LOCAL_LLM_MODEL);
  const apiKey = pickValue(runtime?.localApiKey, process.env.LOCAL_LLM_API_KEY);

  if (!baseUrl) {
    throw new ProviderError('local', 'MISSING_CONFIG', 'LOCAL_LLM_BASE_URL이 없습니다.');
  }
  if (!model) {
    throw new ProviderError('local', 'MISSING_CONFIG', 'LOCAL_LLM_MODEL이 없습니다.');
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(localCompletionsUrl(baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const rawText = await response.text();
    throw mapLocalHttpError(response.status, rawText);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = normalizeContent(data.choices?.[0]?.message?.content);
  if (!content) {
    throw new ProviderError('local', 'UNKNOWN', '로컬 LLM 응답이 비어 있습니다.');
  }
  return content;
}

async function runOpenClaw(
  systemPrompt: string,
  userPrompt: string,
  _temperature: number,
  _maxTokens: number,
  runtime?: RuntimeConfig
) {
  const bin = resolveOpenClawBin(pickValue(process.env.OPENCLAW_BIN, 'openclaw'));
  const agent = pickValue(runtime?.openclawAgent, process.env.OPENCLAW_AGENT_ID, OPENCLAW_DEFAULT_AGENT);
  const timeoutSec = Number(process.env.OPENCLAW_TIMEOUT_SEC || 120);
  const safeTimeoutSec = Number.isFinite(timeoutSec) ? Math.max(10, Math.min(600, Math.floor(timeoutSec))) : 120;
  const combinedPrompt = [
    '[SYSTEM]',
    systemPrompt,
    '',
    '[USER]',
    userPrompt,
    '',
    '반드시 요청된 출력 형식을 유지하고 한국어로 답변하세요.'
  ].join('\n');

  try {
    const { stdout, stderr } = await execFileAsync(
      bin,
      ['agent', '--agent', agent, '--message', combinedPrompt, '--json', '--timeout', String(safeTimeoutSec)],
      withOpenClawEnv({
        timeout: (safeTimeoutSec + 5) * 1000,
        maxBuffer: 12 * 1024 * 1024
      })
    );

    const output = `${stdout || ''}`.trim();
    if (!output) {
      throw new ProviderError('openclaw', 'UNKNOWN', 'OpenClaw 응답이 비어 있습니다.', stderr || '');
    }

    const parsed = parseJsonLoosely(output) as
      | {
          status?: string;
          result?: { payloads?: Array<{ text?: string | null }> };
          error?: string;
        }
      | null;

    if (!parsed) {
      const combined = truncateRawError([output, stderr || ''].filter(Boolean).join('\n').trim());
      throw mapOpenClawError(combined || 'OpenClaw JSON 파싱 실패');
    }

    if (parsed.status && parsed.status !== 'ok') {
      const raw = truncateRawError(parsed.error || output || stderr || '');
      throw mapOpenClawError(raw || 'OpenClaw 상태 오류');
    }

    const text = ((parsed.result?.payloads || []).map((payload) => payload.text || '').filter(Boolean).join('\n\n') || '').trim();
    if (!text) {
      throw new ProviderError('openclaw', 'UNKNOWN', 'OpenClaw 결과 텍스트가 비어 있습니다.', output);
    }
    return text;
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    const e = error as { code?: string; message?: string; stdout?: string; stderr?: string; signal?: string };
    const raw = truncateRawError([e.stderr, e.stdout, e.message, e.signal].filter(Boolean).join('\n').trim());
    if (e.code === 'ENOENT') {
      throw new ProviderError('openclaw', 'UNAVAILABLE', 'OpenClaw가 설치되어 있지 않거나 PATH에 없습니다.', raw);
    }
    throw mapOpenClawError(raw || 'OpenClaw 실행 실패');
  }
}

async function runByProvider(
  provider: LlmProvider,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
  runtime?: RuntimeConfig
) {
  if (provider === 'openai') return runOpenAI(systemPrompt, userPrompt, temperature, maxTokens, runtime);
  if (provider === 'gemini') return runGemini(systemPrompt, userPrompt, temperature, maxTokens, runtime);
  if (provider === 'groq') return runGroq(systemPrompt, userPrompt, temperature, maxTokens, runtime);
  if (provider === 'local') return runLocal(systemPrompt, userPrompt, temperature, maxTokens, runtime);
  return runOpenClaw(systemPrompt, userPrompt, temperature, maxTokens, runtime);
}

function shouldTryFallback(primary: LlmProvider, error: ProviderError) {
  if (error.code === 'MISSING_CONFIG') return true;
  if (error.code === 'AUTH') return true;
  if (error.code === 'QUOTA') return true;
  if (error.code === 'RATE_LIMIT') return true;
  if (error.code === 'COOLDOWN') return true;
  if (error.code === 'UNAVAILABLE') return true;
  if (error.code === 'TIMEOUT' || error.code === 'NETWORK') return true;
  if ((primary === 'gemini' || primary === 'groq') && error.code === 'CONTEXT') return true;
  return false;
}

function formatPrimaryFailure(error: ProviderError) {
  if (error.code === 'QUOTA') {
    return `${providerLabel(error.provider)} 할당량이 초과되었습니다.`;
  }
  if (error.code === 'AUTH') {
    return `${providerLabel(error.provider)} 인증에 실패했습니다.`;
  }
  if (error.code === 'MISSING_CONFIG') {
    return `${providerLabel(error.provider)} 설정이 누락되었습니다.`;
  }
  return error.message;
}

function formatFinalError(primaryError: ProviderError, fallbackErrors: ProviderError[]) {
  const prefix = formatPrimaryFailure(primaryError);
  if (!fallbackErrors.length) {
    return `${prefix} 설정 > 실행 키 설정에서 API 키/모델을 확인해 주세요.`;
  }

  const summary = fallbackErrors
    .slice(0, 3)
    .map((item) => `${providerLabel(item.provider)}:${item.code}`)
    .join(', ');

  const hasQuota = [primaryError, ...fallbackErrors].some((item) => item.code === 'QUOTA' || item.code === 'RATE_LIMIT');
  const action = hasQuota
    ? '할당량/요청 제한 상태를 확인하거나 다른 provider를 선택해 주세요.'
    : '설정 > 실행 키 설정에서 API 키/모델을 확인해 주세요.';

  return `${prefix} 자동 대체 실행도 실패했습니다(${summary}). ${action}`;
}

function isGeminiQuotaError(error: ProviderError) {
  return error.provider === 'gemini' && (error.code === 'QUOTA' || error.code === 'RATE_LIMIT');
}

function buildFallbackProviders(primary: LlmProvider, runtime?: RuntimeConfig, primaryError?: ProviderError) {
  const runProfile = resolveRunProfile(runtime);
  let order = runProfile === 'free' ? parseFreeFallbackOrderFromEnv(primary) : parseFallbackOrderFromEnv(primary);

  if (primary === 'gemini' && primaryError && isGeminiQuotaError(primaryError) && !shouldUseOpenClawFallbackOnGeminiQuota()) {
    order = order.filter((provider) => provider !== 'openclaw');
  }

  if (runProfile === 'free' && !shouldAllowPaidFallbackInFreeMode()) {
    order = order.filter((provider) => provider !== 'openai');
  } else if (runProfile === 'free' && shouldAllowPaidFallbackInFreeMode()) {
    if (!order.includes('openai')) {
      order.push('openai');
    }
  }

  return order
    .filter((provider, index, list) => list.indexOf(provider) === index && hasConfig(provider, runtime))
    .slice(0, 4);
}

export async function runLLM(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.35,
  maxTokens = 2400,
  runtime?: RuntimeConfig
) {
  const primary = resolveProvider(runtime);

  try {
    return await runByProvider(primary, systemPrompt, userPrompt, temperature, maxTokens, runtime);
  } catch (error) {
    const primaryError = normalizeUnknownError(primary, error);

    if (!shouldTryFallback(primary, primaryError)) {
      throw new Error(formatPrimaryFailure(primaryError));
    }

    const fallbackProviders = buildFallbackProviders(primary, runtime, primaryError);
    const fallbackErrors: ProviderError[] = [];
    for (const provider of fallbackProviders) {
      try {
        return await runByProvider(provider, systemPrompt, userPrompt, temperature, maxTokens, runtime);
      } catch (fallbackError) {
        fallbackErrors.push(normalizeUnknownError(provider, fallbackError));
      }
    }

    throw new Error(formatFinalError(primaryError, fallbackErrors));
  }
}
