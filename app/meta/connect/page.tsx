'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { loadStoredMetaConnectionDraft, saveStoredMetaConnectionDraft } from '@/lib/meta-connection-storage';

type ExchangeResponse = {
  ok?: boolean;
  error?: string;
  accessToken?: string;
  expiresIn?: number | null;
  tokenSource?: 'oauth_short_lived' | 'oauth_long_lived';
  accounts?: Array<{
    pageId: string;
    pageName: string;
    instagramBusinessAccountId: string;
    username: string;
    profilePictureUrl?: string;
  }>;
};

function getModeText(mode: 'instagram_login' | 'meta_business') {
  return mode === 'instagram_login' ? '인스타그램 로그인' : 'Meta 비즈니스 연결';
}

function broadcastConnectionMessage(payload: unknown) {
  if (typeof window === 'undefined') return;

  try {
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('instagram-connect');
      channel.postMessage(payload);
      channel.close();
    }
  } catch {
    // Ignore BroadcastChannel availability issues.
  }
}

function MetaConnectContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('인스타그램 연결 결과를 확인하는 중입니다.');
  const [accounts, setAccounts] = useState<ExchangeResponse['accounts']>([]);
  const [loginMode, setLoginMode] = useState<'instagram_login' | 'meta_business'>('instagram_login');

  // 개발 모드: https://localhost → http://localhost 자동 리다이렉트
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && window.location.hostname === 'localhost') {
      window.location.href = window.location.href.replace('https://', 'http://');
      return;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const fragmentParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const oauthError =
        fragmentParams.get('error_description') ||
        searchParams.get('error_description') ||
        fragmentParams.get('error') ||
        searchParams.get('error');
      const code = searchParams.get('code') || '';
      const state = fragmentParams.get('state') || searchParams.get('state') || '';
      const shortLivedToken = fragmentParams.get('access_token') || '';
      const longLivedToken = fragmentParams.get('long_lived_token') || '';
      const effectiveToken = longLivedToken || shortLivedToken;
      const tokenSource = longLivedToken ? 'oauth_long_lived' : shortLivedToken ? 'oauth_short_lived' : undefined;
      const expiresInRaw = Number(fragmentParams.get('expires_in') || '');
      const expiresIn = Number.isFinite(expiresInRaw) ? expiresInRaw : null;

      if (oauthError) {
        if (!cancelled) {
          setStatus('error');
          setMessage(oauthError);
          window.opener?.postMessage({ type: 'instagram-connection-error', message: oauthError }, window.location.origin);
          broadcastConnectionMessage({ type: 'instagram-connection-error', message: oauthError });
        }
        return;
      }

      const loaded = await loadStoredMetaConnectionDraft(window.location.origin);
      if (cancelled) return;

      setLoginMode(loaded.value.loginMode);

      if (loaded.value.lastOauthState && state && loaded.value.lastOauthState !== state) {
        setStatus('error');
        setMessage('로그인 상태 값이 일치하지 않습니다. 다시 시도해 주세요.');
        return;
      }

      const needsAppSecret = loaded.value.loginMode === 'meta_business';
      if (
        !loaded.value.appId ||
        (needsAppSecret && !loaded.value.appSecret) ||
        !loaded.value.redirectUri
      ) {
        setStatus('error');
        setMessage(
          loaded.value.loginMode === 'instagram_login'
            ? '인스타그램 로그인에 필요한 앱 연결 정보가 부족합니다. 관리자 설정에서 App ID와 Redirect URI를 먼저 저장해 주세요.'
            : `${getModeText(loaded.value.loginMode)}에 필요한 앱 연결 정보가 부족합니다. 관리자 설정에서 App ID, App Secret, Redirect URI를 먼저 저장해 주세요.`
        );
        return;
      }

      if (loaded.value.loginMode === 'instagram_login' && !effectiveToken && !code) {
        setStatus('error');
        setMessage('로그인 토큰이 전달되지 않았습니다. Redirect URI와 Instagram Login 설정을 다시 확인해 주세요.');
        return;
      }

      if (loaded.value.loginMode === 'meta_business' && !code) {
        setStatus('error');
        setMessage('인증 코드가 전달되지 않았습니다. 다시 시도해 주세요.');
        return;
      }

      const response = await fetch('/api/meta/oauth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: loaded.value.appId,
          appSecret: loaded.value.appSecret,
          redirectUri: loaded.value.redirectUri,
          graphApiVersion: loaded.value.graphApiVersion,
          code,
          accessToken: effectiveToken,
          tokenSource,
          expiresIn,
          loginMode: loaded.value.loginMode
        })
      });

      const data = (await response.json().catch(() => null)) as ExchangeResponse | null;
      if (!response.ok || !data?.ok || !data.accessToken) {
        const errorMessage = data?.error || `${getModeText(loaded.value.loginMode)} 토큰 교환에 실패했습니다.`;
        setStatus('error');
        setMessage(errorMessage);
        window.opener?.postMessage({ type: 'instagram-connection-error', message: errorMessage }, window.location.origin);
        broadcastConnectionMessage({ type: 'instagram-connection-error', message: errorMessage });
        return;
      }

      const nextDraft = {
        ...loaded.value,
        accessToken: data.accessToken,
        tokenSource: data.tokenSource || 'oauth_short_lived',
        tokenExpiresIn: typeof data.expiresIn === 'number' ? data.expiresIn : null,
        connectedAccounts: data.accounts || [],
        instagramBusinessAccountId:
          loaded.value.instagramBusinessAccountId || data.accounts?.[0]?.instagramBusinessAccountId || '',
        lastConnectedAt: new Date().toISOString(),
        lastOauthState: ''
      };

      await saveStoredMetaConnectionDraft(nextDraft);
      if (cancelled) return;

      setAccounts(data.accounts || []);
      setStatus('success');
      setMessage(
        data.accounts?.length
          ? `${getModeText(loaded.value.loginMode)}이 완료되었습니다. 연결된 인스타그램 계정 ${data.accounts.length}개를 확인했습니다.`
          : `${getModeText(loaded.value.loginMode)}은 완료됐지만, 분석에 사용할 인스타그램 계정 정보를 찾지 못했습니다.`
      );

      window.opener?.postMessage(
        {
          type: 'instagram-connection-complete',
          payload: {
            accessToken: data.accessToken,
            tokenSource: data.tokenSource,
            expiresIn: data.expiresIn,
            accounts: data.accounts || [],
            loginMode: loaded.value.loginMode
          }
        },
        window.location.origin
      );
      broadcastConnectionMessage({
        type: 'instagram-connection-complete',
        payload: {
          accessToken: data.accessToken,
          tokenSource: data.tokenSource,
          expiresIn: data.expiresIn,
          accounts: data.accounts || [],
          loginMode: loaded.value.loginMode
        }
      });

      if (window.opener) {
        window.setTimeout(() => window.close(), 1200);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center gap-4 px-4 py-8">
      <section className="dashboard-hero">
        <p className="dashboard-eyebrow">{loginMode === 'instagram_login' ? 'Instagram Connect' : 'Meta Connect'}</p>
        <h1 className="dashboard-title">
          {status === 'loading' ? '연결 확인 중' : status === 'success' ? '연결 완료' : '연결 실패'}
        </h1>
        <p className="dashboard-copy mt-3">{message}</p>
      </section>

      {accounts && accounts.length > 0 && (
        <section className="panel space-y-3">
          <h2 className="section-title">확인된 인스타그램 계정</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {accounts.map((account) => (
              <div key={account.instagramBusinessAccountId} className="list-card">
                <p className="text-sm font-semibold text-[var(--text-strong)]">@{account.username}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{account.pageName || '연결된 Instagram Professional 계정'}</p>
                <p className="mt-2 text-[11px] text-[var(--text-muted)]">IG Account ID: {account.instagramBusinessAccountId}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function MetaConnectPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center gap-4 px-4 py-8">
          <section className="dashboard-hero">
            <p className="dashboard-eyebrow">Instagram Connect</p>
            <h1 className="dashboard-title">연결 확인 중</h1>
            <p className="dashboard-copy mt-3">인스타그램 연결 결과를 확인하는 중입니다.</p>
          </section>
        </div>
      }
    >
      <MetaConnectContent />
    </Suspense>
  );
}
