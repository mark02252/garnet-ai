'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const OTP_TYPES = new Set<EmailOtpType>(['email', 'recovery', 'invite', 'email_change']);

function extractErrorMessage(error: unknown) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return '인증을 완료하지 못했습니다.';
}

export function SupabaseAuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('인증 결과를 확인하고 있습니다.');

  useEffect(() => {
    let disposed = false;
    const client = getSupabaseBrowserClient();

    if (!client) {
      setStatus('error');
      setMessage('Supabase 공개 설정이 아직 연결되지 않았습니다.');
      return;
    }

    const supabaseClient = client;

    async function finishAuth() {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const errorDescription = searchParams.get('error_description') || hashParams.get('error_description');

      if (errorDescription) {
        if (!disposed) {
          setStatus('error');
          setMessage(errorDescription);
        }
        return;
      }

      const code = searchParams.get('code');
      const tokenHash = searchParams.get('token_hash');
      const otpType = searchParams.get('type');

      let authError: unknown = null;

      if (code) {
        const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
        authError = error;
      } else if (tokenHash && otpType && OTP_TYPES.has(otpType as EmailOtpType)) {
        const { error } = await supabaseClient.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType as EmailOtpType
        });
        authError = error;
      } else {
        const { data, error } = await supabaseClient.auth.getSession();
        authError = error || (!data.session ? new Error('세션 정보를 찾지 못했습니다.') : null);
      }

      if (disposed) return;

      if (authError) {
        setStatus('error');
        setMessage(extractErrorMessage(authError));
        return;
      }

      setStatus('success');
      setMessage('인증이 완료됐습니다. 설정 화면으로 돌아가 팀 워크스페이스를 이어서 구성하세요.');

      window.setTimeout(() => {
        router.replace('/settings?supabase=connected');
      }, 1400);
    }

    void finishAuth();

    return () => {
      disposed = true;
    };
  }, [router, searchParams]);

  return (
    <section className="panel space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Supabase Auth</p>
      <h2 className="text-[1.6rem] font-semibold tracking-[-0.04em] text-[var(--text-strong)]">
        {status === 'processing' ? '로그인 확인 중' : status === 'success' ? '로그인 완료' : '로그인 확인 실패'}
      </h2>
      <p className="text-sm leading-7 text-[var(--text-base)]">{message}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/settings" className="button-primary">
          설정으로 돌아가기
        </Link>
        <Link href="/operations" className="button-secondary">
          오늘의 브리핑으로 이동
        </Link>
      </div>
    </section>
  );
}
