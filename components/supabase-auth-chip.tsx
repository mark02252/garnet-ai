'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type ChipState = {
  configured: boolean;
  loading: boolean;
  email: string;
};

export function SupabaseAuthChip() {
  const [state, setState] = useState<ChipState>({
    configured: true,
    loading: true,
    email: ''
  });

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setState({
        configured: false,
        loading: false,
        email: ''
      });
      return;
    }

    const supabaseClient = client;
    let disposed = false;

    async function refreshSession() {
      const { data, error } = await supabaseClient.auth.getSession();
      if (disposed) return;

      setState({
        configured: true,
        loading: false,
        email: error ? '' : data.session?.user.email || ''
      });
    }

    void refreshSession();

    const { data: listener } = supabaseClient.auth.onAuthStateChange(() => {
      window.setTimeout(() => {
        void refreshSession();
      }, 0);
    });

    return () => {
      disposed = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const isConnected = Boolean(state.email);
  const label = !state.configured
    ? 'Supabase 준비 중'
    : state.loading
      ? '세션 확인 중'
      : isConnected
        ? state.email
        : '팀 로그인 대기';

  return (
    <Link
      href="/settings"
      className="hidden items-center gap-2 rounded-full border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-base)] md:flex"
    >
      <span className={`inline-block h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500' : state.configured ? 'bg-amber-400' : 'bg-[var(--surface-border)]'}`} />
      {label}
    </Link>
  );
}
