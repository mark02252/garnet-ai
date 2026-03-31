import { Suspense } from 'react';
import { SupabaseAuthCallback } from '@/components/supabase-auth-callback';

export default function AuthCallbackPage() {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <Suspense
        fallback={
          <section className="panel space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Supabase Auth</p>
            <h2 className="text-[1.6rem] font-semibold tracking-[-0.04em] text-[var(--text-strong)]">로그인 확인 중</h2>
            <p className="text-sm leading-7 text-[var(--text-base)]">인증 결과를 확인하고 있습니다.</p>
          </section>
        }
      >
        <SupabaseAuthCallback />
      </Suspense>
    </div>
  );
}
