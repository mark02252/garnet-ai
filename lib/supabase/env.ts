function cleanEnv(value: string | undefined) {
  return value?.trim() || '';
}

export type SupabasePublicEnv = {
  url: string;
  publishableKey: string;
  keySource: 'publishable' | 'anon' | 'missing';
  isConfigured: boolean;
  isLocal: boolean;
};

export function getSupabasePublicEnv(): SupabasePublicEnv {
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const anonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const resolvedKey = publishableKey || anonKey;

  return {
    url,
    publishableKey: resolvedKey,
    keySource: publishableKey ? 'publishable' : anonKey ? 'anon' : 'missing',
    isConfigured: Boolean(url && resolvedKey),
    isLocal: url.startsWith('http://127.0.0.1:54321') || url.startsWith('http://localhost:54321')
  };
}

export function hasSupabasePublicEnv() {
  return getSupabasePublicEnv().isConfigured;
}
