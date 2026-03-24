import { NextResponse } from 'next/server';
import { getLLMProvider, getMissingEnvKeys } from '@/lib/env';
import { getSupabasePublicEnv } from '@/lib/supabase/env';
import { ensureScheduler } from '@/lib/scheduler/ensure-init';

export async function GET() {
  await ensureScheduler();
  const provider = getLLMProvider();
  const missing = getMissingEnvKeys();
  const supabase = getSupabasePublicEnv();
  return NextResponse.json({
    ok: missing.length === 0,
    provider,
    missing,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    supabase: {
      configured: supabase.isConfigured,
      url: supabase.url || null,
      keySource: supabase.keySource,
      isLocal: supabase.isLocal
    },
    keyStatus: {
      openaiApiKey: Boolean(process.env.OPENAI_API_KEY),
      geminiApiKey: Boolean(process.env.GEMINI_API_KEY),
      geminiModel: Boolean(process.env.GEMINI_MODEL),
      groqApiKey: Boolean(process.env.GROQ_API_KEY),
      groqModel: Boolean(process.env.GROQ_MODEL),
      localBaseUrl: Boolean(process.env.LOCAL_LLM_BASE_URL),
      localModel: Boolean(process.env.LOCAL_LLM_MODEL),
      searchApiKey: Boolean(process.env.SEARCH_API_KEY)
    }
  });
}
