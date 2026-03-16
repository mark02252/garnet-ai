import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { resolveOpenClawBin, withOpenClawEnv } from '@/lib/openclaw-cli';

const execFileAsync = promisify(execFile);

const bodySchema = z
  .object({
    openaiApiKey: z.string().optional(),
    geminiApiKey: z.string().optional(),
    geminiModel: z.string().optional(),
    groqApiKey: z.string().optional(),
    groqModel: z.string().optional(),
    localBaseUrl: z.string().optional(),
    localModel: z.string().optional()
  })
  .optional();

type SuggestedProvider = 'openai' | 'gemini' | 'groq' | 'local' | null;

function hasValue(value?: string) {
  return Boolean(value && value.trim());
}

function getSuggestedProvider(input?: {
  openaiApiKey?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  groqApiKey?: string;
  groqModel?: string;
  localBaseUrl?: string;
  localModel?: string;
}): SuggestedProvider {
  const hasOpenAI = hasValue(input?.openaiApiKey) || Boolean(process.env.OPENAI_API_KEY);
  const hasGemini =
    (hasValue(input?.geminiApiKey) || Boolean(process.env.GEMINI_API_KEY)) &&
    (hasValue(input?.geminiModel) || Boolean(process.env.GEMINI_MODEL));
  const hasGroq = hasValue(input?.groqApiKey) || Boolean(process.env.GROQ_API_KEY);
  const hasLocal =
    (hasValue(input?.localBaseUrl) || Boolean(process.env.LOCAL_LLM_BASE_URL)) &&
    (hasValue(input?.localModel) || Boolean(process.env.LOCAL_LLM_MODEL));

  if (hasGemini) return 'gemini';
  if (hasGroq) return 'groq';
  if (hasOpenAI) return 'openai';
  if (hasLocal) return 'local';
  return null;
}

function formatReason(error: unknown) {
  if (!error || typeof error !== 'object') return '알 수 없는 오류';
  const e = error as { code?: string; message?: string; stderr?: string };
  if (e.code === 'ENOENT') return 'openclaw 명령을 찾지 못했습니다.';
  return (e.stderr || e.message || 'OpenClaw 실행 실패').toString().trim();
}

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    const bin = resolveOpenClawBin(process.env.OPENCLAW_BIN);
    const suggestedProvider = getSuggestedProvider(body);

    try {
      const versionResult = await execFileAsync(bin, ['--version'], {
        ...withOpenClawEnv(),
        timeout: 4000,
        maxBuffer: 512 * 1024
      });
      const version = `${versionResult.stdout || versionResult.stderr || ''}`.trim().split('\n')[0] || 'unknown';

      try {
        const { stdout } = await execFileAsync(bin, ['models', 'list', '--json'], {
          ...withOpenClawEnv(),
          timeout: 8000,
          maxBuffer: 4 * 1024 * 1024
        });
        const parsed = JSON.parse(stdout || '{}') as {
          models?: Array<{ key?: string; available?: boolean }>;
        };
        const models = (parsed.models || []).filter((m) => m.available !== false).map((m) => m.key || '').filter(Boolean);

        if (!models.length) {
          return NextResponse.json({
            ok: true,
            installed: true,
            ready: false,
            version,
            message: 'OpenClaw는 설치되었지만 사용 가능한 모델이 없습니다. OpenClaw 설정/로그인을 확인하세요.',
            suggestedProvider
          });
        }

        return NextResponse.json({
          ok: true,
          installed: true,
          ready: true,
          version,
          modelCount: models.length,
          message: `OpenClaw 정상 작동 중 (사용 가능 모델 ${models.length}개).`,
          suggestedProvider
        });
      } catch (error) {
        return NextResponse.json({
          ok: true,
          installed: true,
          ready: false,
          version,
          message: `OpenClaw 모델 조회 실패: ${formatReason(error)}`,
          suggestedProvider
        });
      }
    } catch (error) {
      return NextResponse.json({
        ok: true,
        installed: false,
        ready: false,
        message: `OpenClaw 미설치 또는 실행 불가: ${formatReason(error)}`,
        suggestedProvider
      });
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'OpenClaw 상태 점검 실패' },
      { status: 500 }
    );
  }
}
