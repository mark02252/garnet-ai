import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { resolveOpenClawBin, withOpenClawEnv } from '@/lib/openclaw-cli';

const execFileAsync = promisify(execFile);

const runtimeSchema = z.object({
  llmProvider: z.enum(['openai', 'gemini', 'groq', 'local', 'openclaw']),
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
  groqApiKey: z.string().optional(),
  localBaseUrl: z.string().optional(),
  localApiKey: z.string().optional(),
  openclawAgent: z.string().optional()
});

function toLocalModelsUrl(baseUrl: string) {
  const base = baseUrl.trim().replace(/\/$/, '');
  if (base.endsWith('/v1')) return `${base}/models`;
  return `${base}/v1/models`;
}

export async function POST(req: Request) {
  try {
    const body = runtimeSchema.parse(await req.json());

    if (body.llmProvider === 'openclaw') {
      const bin = resolveOpenClawBin(process.env.OPENCLAW_BIN);
      try {
        const { stdout } = await execFileAsync(bin, ['models', 'list', '--json'], {
          ...withOpenClawEnv(),
          maxBuffer: 4 * 1024 * 1024
        });
        const parsed = JSON.parse(stdout || '{}') as {
          models?: Array<{ key?: string; available?: boolean }>;
        };
        const models = (parsed.models || [])
          .filter((m) => m.available !== false)
          .map((m) => (m.key || '').trim())
          .filter(Boolean);
        return NextResponse.json({
          ok: true,
          provider: 'openclaw',
          models
        });
      } catch (error) {
        const e = error as { code?: string; message?: string; stderr?: string };
        if (e.code === 'ENOENT') {
          return NextResponse.json(
            { error: 'openclaw 명령을 찾을 수 없습니다. 로컬에 OpenClaw를 먼저 설치해 주세요.' },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: `OpenClaw 모델 조회 실패: ${(e.stderr || e.message || '알 수 없는 오류').toString()}` },
          { status: 400 }
        );
      }
    }

    if (body.llmProvider === 'gemini') {
      const apiKey = body.geminiApiKey?.trim() || process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        return NextResponse.json({ error: 'GEMINI_API_KEY가 없습니다.' }, { status: 400 });
      }

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        cache: 'no-store'
      });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `Gemini 모델 조회 실패 (${res.status}): ${text}` }, { status: 400 });
      }
      const json = (await res.json()) as {
        models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
      };
      const models = (json.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => (m.name || '').replace(/^models\//, ''))
        .filter(Boolean)
        .filter((name) => /gemini/i.test(name))
        .sort();

      return NextResponse.json({
        ok: true,
        provider: 'gemini',
        models
      });
    }

    if (body.llmProvider === 'openai') {
      const apiKey = body.openaiApiKey?.trim() || process.env.OPENAI_API_KEY || '';
      if (!apiKey) {
        return NextResponse.json({ error: 'OPENAI_API_KEY가 없습니다.' }, { status: 400 });
      }

      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store'
      });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `OpenAI 모델 조회 실패 (${res.status}): ${text}` }, { status: 400 });
      }
      const json = (await res.json()) as { data?: Array<{ id?: string }> };
      const models = (json.data || [])
        .map((m) => m.id || '')
        .filter(Boolean)
        .filter((id) => /^gpt|^o\d|^omni/i.test(id))
        .sort();

      return NextResponse.json({
        ok: true,
        provider: 'openai',
        models
      });
    }

    if (body.llmProvider === 'groq') {
      const apiKey = body.groqApiKey?.trim() || process.env.GROQ_API_KEY || '';
      if (!apiKey) {
        return NextResponse.json({ error: 'GROQ_API_KEY가 없습니다.' }, { status: 400 });
      }

      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store'
      });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `Groq 모델 조회 실패 (${res.status}): ${text}` }, { status: 400 });
      }
      const json = (await res.json()) as { data?: Array<{ id?: string }> };
      const models = (json.data || []).map((m) => m.id || '').filter(Boolean).sort();

      return NextResponse.json({
        ok: true,
        provider: 'groq',
        models
      });
    }

    const baseUrl = body.localBaseUrl?.trim() || process.env.LOCAL_LLM_BASE_URL || '';
    if (!baseUrl) {
      return NextResponse.json({ error: 'LOCAL_LLM_BASE_URL이 없습니다.' }, { status: 400 });
    }
    const apiKey = body.localApiKey?.trim() || process.env.LOCAL_LLM_API_KEY || '';
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(toLocalModelsUrl(baseUrl), { headers, cache: 'no-store' });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Local 모델 조회 실패 (${res.status}): ${text}` }, { status: 400 });
    }
    const json = (await res.json()) as { data?: Array<{ id?: string }> };
    const models = (json.data || []).map((m) => m.id || '').filter(Boolean).sort();
    return NextResponse.json({
      ok: true,
      provider: 'local',
      models
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '모델 조회 실패' },
      { status: 500 }
    );
  }
}
