export function getLLMProvider() {
  return (process.env.LLM_PROVIDER || 'openai').toLowerCase();
}

export function getMissingEnvKeys() {
  const missing: string[] = [];

  const provider = getLLMProvider();
  if (provider === 'local') {
    if (!process.env.LOCAL_LLM_BASE_URL) missing.push('LOCAL_LLM_BASE_URL');
    if (!process.env.LOCAL_LLM_MODEL) missing.push('LOCAL_LLM_MODEL');
  } else if (provider === 'groq') {
    if (!process.env.GROQ_API_KEY) missing.push('GROQ_API_KEY');
  } else if (provider === 'openclaw') {
    // OpenClaw는 로컬 로그인 기반이므로 별도 API 키가 필수는 아님.
  } else if (provider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
    if (!process.env.GEMINI_MODEL) missing.push('GEMINI_MODEL');
  } else {
    if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  }

  if (!process.env.SEARCH_API_KEY) missing.push('SEARCH_API_KEY');
  return missing;
}

export function getSearchProvider() {
  return (process.env.SEARCH_PROVIDER || 'serper').toLowerCase();
}
