'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  buildInstagramConnectionOAuthUrl,
  createDefaultMetaConnectionDraft,
  getDefaultScopesForConnectionMode,
  isLikelyMetaAppId,
  type InstagramConnectionMode,
  type MetaConnectedInstagramAccount,
  type MetaConnectionDraft
} from '@/lib/meta-connection';
import { loadStoredMetaConnectionDraft, saveStoredMetaConnectionDraft } from '@/lib/meta-connection-storage';

function formatConnectedAt(value: string) {
  if (!value) return '아직 연결 전';
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatScopeList(scopes: string[]) {
  return scopes.join(', ');
}

function getConnectionModeLabel(mode: InstagramConnectionMode) {
  return mode === 'instagram_login' ? '인스타그램 로그인' : 'Meta 비즈니스 연결';
}

function getConnectionModeSummary(mode: InstagramConnectionMode) {
  return mode === 'instagram_login'
    ? '사내 관리 계정 1개를 연결해 인사이트를 보는 기본 방식입니다.'
    : '여러 페이지나 자산을 함께 다뤄야 할 때 쓰는 고급 방식입니다.';
}

type InstagramReachApiResponse = {
  ok?: boolean;
  error?: string;
  accountId?: string;
  since?: string;
  until?: string;
  summary?: string;
  stats?: {
    days: number;
    averageReach: number;
    latestReach: number;
    previousReach: number | null;
    dayOverDayChangePct: number | null;
    sevenDayAverage: number | null;
    trendDirection: 'UP' | 'DOWN' | 'FLAT';
    anomalies: Array<{ date: string; reach: number; zScore: number }>;
  };
  latestAnalysis?: {
    id: string;
    createdAt: string;
    summary: string;
    trendDirection: 'UP' | 'DOWN' | 'FLAT';
    averageReach: number;
    latestReach: number;
    dayOverDayChangePct: number | null;
    sevenDayAverage: number | null;
    anomalyCount: number;
  } | null;
};

function trendLabel(direction: 'UP' | 'DOWN' | 'FLAT' | undefined) {
  if (direction === 'UP') return { label: '상승 추세', tone: 'text-emerald-700' };
  if (direction === 'DOWN') return { label: '하락 추세', tone: 'text-rose-700' };
  return { label: '보합 추세', tone: 'text-[var(--text-base)]' };
}

function WizardStep({
  stepNum,
  current,
  title,
  description,
  actionLabel,
  actionHref,
  onNext,
  onBack,
  children,
}: {
  stepNum: number;
  current: number;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onNext: () => void;
  onBack?: () => void;
  children?: React.ReactNode;
}) {
  if (stepNum !== current) return null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="accent-pill">Step {stepNum} / 5</span>
        <h4 className="text-sm font-semibold text-[var(--text-strong)]">{title}</h4>
      </div>
      <p className="text-sm leading-6 text-[var(--text-base)]">{description}</p>
      {children}
      <div className="flex gap-2">
        {onBack && (
          <button type="button" className="button-secondary" onClick={onBack}>
            이전
          </button>
        )}
        {actionLabel && actionHref && (
          <a href={actionHref} target="_blank" rel="noopener noreferrer" className="button-secondary">
            {actionLabel} →
          </a>
        )}
        <button type="button" className="button-primary" onClick={onNext}>
          다음
        </button>
      </div>
    </div>
  );
}

type MetaConnectionPanelProps = {
  mode?: 'social' | 'settings';
};

export function MetaConnectionPanel({ mode = 'social' }: MetaConnectionPanelProps) {
  const isSocialMode = mode === 'social';
  const envAppId = process.env.NEXT_PUBLIC_META_APP_ID || ''
  const envAppSecret = process.env.NEXT_PUBLIC_META_APP_SECRET || ''
  const [draft, setDraft] = useState<MetaConnectionDraft>(() => createDefaultMetaConnectionDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [runningAnalysis, setRunningAnalysis] = useState(false);
  const [refreshingAnalysis, setRefreshingAnalysis] = useState(false);
  const [showAdminFields, setShowAdminFields] = useState(mode === 'settings');
  // 마법사: settings 모드에서만 사용
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [wizardAppId, setWizardAppId] = useState('');
  const [wizardAppSecret, setWizardAppSecret] = useState('');
  const [wizardConnecting, setWizardConnecting] = useState(false);
  const [wizardError, setWizardError] = useState('');
  const [lookbackDays, setLookbackDays] = useState(30);
  const [latestAnalysis, setLatestAnalysis] = useState<InstagramReachApiResponse['latestAnalysis']>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const loaded = await loadStoredMetaConnectionDraft(window.location.origin);
      if (cancelled) return;

      let next =
        loaded.value.redirectUri || !window.location.origin
          ? loaded.value
          : {
              ...loaded.value,
              redirectUri: `${window.location.origin}/meta/connect`
            };

      if (envAppId && !next.appId) next = { ...next, appId: envAppId }
      if (envAppSecret && !next.appSecret) next = { ...next, appSecret: envAppSecret }

      setDraft(next);
      setWizardAppId(next.appId);
      setWizardAppSecret(next.appSecret);
      if (next.instagramBusinessAccountId) {
        void fetchLatestAnalysis(next.instagramBusinessAccountId);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function fetchLatestAnalysis(accountId: string) {
    if (!accountId) return;
    setRefreshingAnalysis(true);
    try {
      const res = await fetch(
        `/api/instagram/reach/agent?days=${encodeURIComponent(String(lookbackDays))}&accountId=${encodeURIComponent(accountId)}`
      );
      const data = (await res.json().catch(() => null)) as InstagramReachApiResponse | null;
      if (!res.ok) {
        throw new Error(data?.error || '최근 인스타그램 분석을 불러오지 못했습니다.');
      }
      setLatestAnalysis(data?.latestAnalysis || null);
    } catch {
      setLatestAnalysis(null);
    } finally {
      setRefreshingAnalysis(false);
    }
  }

  useEffect(() => {
    function handleConnectionPayload(data: unknown) {
      if (!data || typeof data !== 'object') return;
      const record = data as Record<string, unknown>;

      if (record.type === 'instagram-connection-complete') {
        const payload = record.payload as {
          accessToken?: string;
          tokenSource?: MetaConnectionDraft['tokenSource'];
          expiresIn?: number | null;
          accounts?: MetaConnectedInstagramAccount[];
          loginMode?: InstagramConnectionMode;
        };

        setDraft((prev) => {
          const next = {
            ...prev,
            loginMode: payload.loginMode || prev.loginMode,
            accessToken: payload.accessToken || prev.accessToken,
            tokenSource: payload.tokenSource || prev.tokenSource,
            tokenExpiresIn: typeof payload.expiresIn === 'number' ? payload.expiresIn : prev.tokenExpiresIn,
            connectedAccounts: payload.accounts || prev.connectedAccounts,
            instagramBusinessAccountId:
              prev.instagramBusinessAccountId || payload.accounts?.[0]?.instagramBusinessAccountId || '',
            lastConnectedAt: new Date().toISOString(),
            lastOauthState: ''
          };

          void saveStoredMetaConnectionDraft(next);
          return next;
        });

        setLaunching(false);
        setError('');
        setMessage('인스타그램 연결이 완료되었습니다. 연결된 계정 목록을 확인해 주세요.');
        setWizardConnecting(false);
      }

      if (record.type === 'instagram-connection-error') {
        setLaunching(false);
        setError(typeof record.message === 'string' ? record.message : '인스타그램 로그인 중 오류가 발생했습니다.');
        setWizardConnecting(false);
        setWizardError(typeof record.message === 'string' ? record.message : '연결 중 오류가 발생했습니다. App ID/Secret을 다시 확인해 주세요.');
        if (!isSocialMode) {
          setWizardStep(4);
        }
      }
    }

    function handleWindowMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      handleConnectionPayload(event.data);
    }

    let channel: BroadcastChannel | null = null;
    if ('BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel('instagram-connect');
        channel.onmessage = (event) => handleConnectionPayload(event.data);
      } catch {
        channel = null;
      }
    }

    window.addEventListener('message', handleWindowMessage);
    return () => {
      window.removeEventListener('message', handleWindowMessage);
      channel?.close();
    };
  }, []);

  async function tryExchangeForLongLivedToken(draft: MetaConnectionDraft): Promise<MetaConnectionDraft> {
    if (!draft.accessToken || !draft.appSecret) return draft;
    // 이미 장기 토큰이면 스킵
    if (draft.tokenSource === 'oauth_long_lived') return draft;

    try {
      const res = await fetch('/api/meta/token/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: draft.accessToken, appSecret: draft.appSecret }),
      });
      if (!res.ok) return draft;
      const data = await res.json() as { accessToken?: string; expiresIn?: number };
      if (data.accessToken) {
        return {
          ...draft,
          accessToken: data.accessToken,
          tokenSource: 'oauth_long_lived',
          tokenExpiresIn: data.expiresIn ?? null,
        };
      }
    } catch { /* 교환 실패 시 기존 토큰 유지 */ }
    return draft;
  }

  async function persist(nextDraft: MetaConnectionDraft, successMessage: string) {
    setSaving(true);
    setError('');
    setMessage('');

    // 단기 토큰이면 장기 토큰으로 자동 교환 시도
    const exchanged = await tryExchangeForLongLivedToken(nextDraft);
    const tokenExchanged = exchanged.tokenSource === 'oauth_long_lived' && nextDraft.tokenSource !== 'oauth_long_lived';

    const result = await saveStoredMetaConnectionDraft(exchanged);
    if (result.ok) {
      setDraft(exchanged);
      setMessage(tokenExchanged
        ? `${successMessage} (장기 토큰으로 자동 교환됨 — 약 60일 유효)`
        : successMessage);

      // 파일 백업: dev 서버 재시작 시에도 토큰 유지
      void fetch('/api/meta/connection/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: exchanged.appId,
          appSecret: exchanged.appSecret,
          accessToken: exchanged.accessToken,
          instagramBusinessAccountId: exchanged.instagramBusinessAccountId,
          loginMode: exchanged.loginMode,
          tokenSource: exchanged.tokenSource,
          tokenExpiresIn: exchanged.tokenExpiresIn,
          lastConnectedAt: exchanged.lastConnectedAt,
        }),
      }).catch(() => {});
    } else {
      setError(result.message || '연결 정보를 저장하지 못했습니다.');
    }
    setSaving(false);
  }

  async function handleSave() {
    const nextDraft = {
      ...draft,
      appId: draft.appId.trim(),
      appSecret: draft.appSecret.trim(),
      redirectUri: (draft.redirectUri || `${window.location.origin}/meta/connect`).trim(),
      graphApiVersion: draft.graphApiVersion.trim() || 'v25.0',
      instagramBusinessAccountId: draft.instagramBusinessAccountId.trim(),
      accessToken: draft.accessToken.trim(),
      tokenSource: draft.accessToken
        ? draft.tokenSource === 'none'
          ? ('manual' as const)
          : draft.tokenSource
        : ('none' as const)
    };

    if (nextDraft.appId && !isLikelyMetaAppId(nextDraft.appId)) {
      setError('App ID는 Meta 개발자 대시보드의 숫자형 App ID여야 합니다. 인스타그램 계정 ID나 비즈니스 계정 ID가 아닙니다.');
      return;
    }

    await persist(nextDraft, '연결 정보를 안전 저장소에 저장했습니다.');
  }

  const loginReady = draft.loginMode === 'instagram_login' ? Boolean(draft.appId) : Boolean(draft.appId && draft.appSecret);

  async function handleStartLogin() {
    if (!loginReady) {
      setError(
        draft.loginMode === 'instagram_login'
          ? '인스타그램 로그인에는 App ID가 필요합니다.'
          : 'Meta 비즈니스 연결에는 App ID와 App Secret이 모두 필요합니다.'
      );
      return;
    }

    const state = window.crypto.randomUUID();
    const nextDraft = {
      ...draft,
      appId: draft.appId.trim(),
      appSecret: draft.appSecret.trim(),
      redirectUri: (draft.redirectUri || `${window.location.origin}/meta/connect`).trim(),
      lastOauthState: state
    };

    if (!isLikelyMetaAppId(nextDraft.appId)) {
      setError('App ID 형식이 올바르지 않습니다. Meta App Dashboard의 숫자형 App ID를 입력해 주세요.');
      return;
    }

    const url = buildInstagramConnectionOAuthUrl(nextDraft, state);
    if (!url) {
      setError('로그인 URL을 만들지 못했습니다. 입력값을 확인해 주세요.');
      return;
    }

    setLaunching(true);
    setError('');
    setMessage('');
    const result = await saveStoredMetaConnectionDraft(nextDraft);
    if (!result.ok) {
      setLaunching(false);
      setError(result.message || '로그인 전에 연결 정보를 저장하지 못했습니다.');
      return;
    }

    setDraft(nextDraft);
    const popup = window.open(url, 'instagram-connect', 'width=540,height=760');
    if (!popup) {
      window.location.href = url;
      return;
    }
    popup.focus();
    setMessage(`${getConnectionModeLabel(nextDraft.loginMode)} 창을 열었습니다. 연결이 끝나면 이 화면에 자동으로 반영됩니다.`);
  }

  async function handleSelectAccount(accountId: string) {
    const nextDraft = {
      ...draft,
      instagramBusinessAccountId: accountId
    };
    await persist(nextDraft, '기본 인스타그램 분석 계정을 저장했습니다.');
    await fetchLatestAnalysis(accountId);
  }

  async function handleRunAnalysis() {
    if (!draft.accessToken || !draft.instagramBusinessAccountId) {
      setError('로그인 또는 기본 인스타그램 계정 선택을 먼저 완료해 주세요.');
      return;
    }

    setRunningAnalysis(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch('/api/instagram/reach/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lookbackDays,
          accessToken: draft.accessToken,
          instagramBusinessAccountId: draft.instagramBusinessAccountId,
          graphApiVersion: draft.graphApiVersion,
          connectionMode: draft.loginMode
        })
      });

      const data = (await res.json().catch(() => null)) as InstagramReachApiResponse | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || '인스타그램 분석 실행에 실패했습니다.');
      }

      setLatestAnalysis(
        data.stats
          ? {
              id: 'latest',
              createdAt: new Date().toISOString(),
              summary: data.summary || '',
              trendDirection: data.stats.trendDirection,
              averageReach: data.stats.averageReach,
              latestReach: data.stats.latestReach,
              dayOverDayChangePct: data.stats.dayOverDayChangePct,
              sevenDayAverage: data.stats.sevenDayAverage,
              anomalyCount: data.stats.anomalies.length
            }
          : null
      );
      setMessage('인스타그램 도달 분석을 실행했고 결과를 저장했습니다. 현재는 개발 예정 화면과 내부 데이터에만 반영됩니다.');
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : '인스타그램 분석 실행 중 오류가 발생했습니다.');
    } finally {
      setRunningAnalysis(false);
    }
  }

  function handleSwitchMode(nextMode: InstagramConnectionMode) {
    setDraft((prev) => ({
      ...prev,
      loginMode: nextMode,
      scopes: getDefaultScopesForConnectionMode(nextMode),
      accessToken: '',
      instagramBusinessAccountId: '',
      connectedAccounts: [],
      tokenSource: 'none',
      tokenExpiresIn: null,
      lastConnectedAt: '',
      lastOauthState: ''
    }));
    setLatestAnalysis(null);
    setError('');
    setMessage(`${getConnectionModeLabel(nextMode)} 중심으로 연결 방식을 바꿨습니다. 저장 후 새로 로그인해 주세요.`);
  }

  async function handleWizardReset() {
    const next = {
      ...draft,
      appId: '',
      appSecret: '',
      loginMode: 'instagram_login' as const,
      connectedAccounts: [],
      accessToken: '',
      tokenSource: 'none' as const,
      tokenExpiresIn: null,
      lastConnectedAt: '',
      lastOauthState: ''
    };
    await persist(next, 'Instagram 연동 설정이 초기화되었습니다.');
    setWizardAppId('');
    setWizardAppSecret('');
    setWizardError('');
    setWizardStep(1);
  }

  async function handleWizardConnect() {
    const appId = wizardAppId.trim();
    const appSecret = wizardAppSecret.trim();

    if (!appId || !appSecret) {
      setWizardError('App ID와 App Secret을 모두 입력해 주세요.');
      return;
    }
    if (!isLikelyMetaAppId(appId)) {
      setWizardError('App ID 형식이 올바르지 않습니다. Meta 개발자 대시보드의 숫자형 App ID를 입력해 주세요.');
      return;
    }

    const redirectUri = `${window.location.origin}/meta/connect`;
    const state = window.crypto.randomUUID();
    const nextDraft = {
      ...draft,
      appId,
      appSecret,
      loginMode: 'instagram_login' as const,
      redirectUri,
      lastOauthState: state,
      scopes: getDefaultScopesForConnectionMode('instagram_login')
    };

    setWizardError('');
    setWizardConnecting(true);

    const saveResult = await saveStoredMetaConnectionDraft(nextDraft);
    if (!saveResult.ok) {
      setWizardConnecting(false);
      setWizardError(saveResult.message || '연결 정보를 저장하지 못했습니다.');
      return;
    }
    setDraft(nextDraft);

    const url = buildInstagramConnectionOAuthUrl(nextDraft, state);
    if (!url) {
      setWizardConnecting(false);
      setWizardError('로그인 URL을 만들지 못했습니다. 입력값을 다시 확인해 주세요.');
      return;
    }

    const popup = window.open(url, 'instagram-connect', 'width=540,height=760');
    if (!popup) {
      window.location.href = url;
    } else {
      popup.focus();
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="text-sm text-[var(--text-muted)]">{isSocialMode ? '인스타그램 연결 정보를 불러오는 중...' : '인스타그램 연결 설정을 불러오는 중...'}</p>
      </section>
    );
  }

  const isConfigured = Boolean(draft.appId && draft.appSecret);
  const hasSavedToken = Boolean(draft.accessToken);
  const hasDefaultAccount = Boolean(draft.instagramBusinessAccountId);

  return (
    <section className="panel space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="section-title">{isSocialMode ? '인스타그램 인사이트' : '인스타그램 채널 연결'}</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {isSocialMode
              ? '연결, 분석 실행, 최근 추세 확인까지 한 화면에서 관리합니다.'
              : '관리자용 연결 정보와 기본 분석 계정을 관리하는 영역입니다.'}
          </p>
        </div>
        <span className="accent-pill">
          {hasDefaultAccount ? '분석 준비 완료' : hasSavedToken ? '계정 선택 필요' : '연결 전'}
        </span>
      </div>

      {isSocialMode ? (
        <>
          <section className="dashboard-hero">
            <p className="dashboard-eyebrow">Social Lab</p>
            <h2 className="dashboard-title">{getConnectionModeLabel(draft.loginMode)} 기반의 소셜 연동 실험 공간입니다.</h2>
            <p className="dashboard-copy">
              {draft.loginMode === 'instagram_login'
                ? '단일 관리 계정을 붙이는 가장 단순한 흐름이지만, 현재는 권한 확보 전이라 연구용 메뉴로만 남겨둡니다.'
                : '여러 페이지나 비즈니스 자산을 함께 다루는 고급 흐름이며, 현재는 준비 단계로만 보관합니다.'}
            </p>
            <div className="dashboard-chip-grid">
              <div className="dashboard-chip">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">연결 방식</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{getConnectionModeLabel(draft.loginMode)}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{getConnectionModeSummary(draft.loginMode)}</p>
              </div>
              <div className="dashboard-chip">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">로그인 상태</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{hasSavedToken ? '연결됨' : '로그인 필요'}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">마지막 연결 {formatConnectedAt(draft.lastConnectedAt)}</p>
              </div>
              <div className="dashboard-chip">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">분석 대상 계정</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{hasDefaultAccount ? '기본 계정 선택됨' : '계정 선택 필요'}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">연결된 계정 {draft.connectedAccounts.length}개</p>
              </div>
            </div>
          </section>

          <div className="surface-note">
            {draft.loginMode === 'instagram_login'
              ? '공식 문서 기준으로 Business Login for Instagram 토큰은 보통 짧게 유지됩니다. 로그인 흐름이 아직 준비되지 않았다면 App Dashboard의 Instagram API setup with Instagram business login 화면에서 Generate token으로 토큰을 만들어 붙여넣을 수도 있습니다.'
              : 'Meta 비즈니스 연결은 페이지와 자산 선택이 필요한 고급 흐름입니다. 외부 브랜드나 여러 계정을 함께 다룰 때 더 적합합니다.'}
          </div>
        </>
      ) : (
        <>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="status-tile">
            <p className="metric-label">연결 방식</p>
            <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{getConnectionModeLabel(draft.loginMode)}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{getConnectionModeSummary(draft.loginMode)}</p>
          </div>
          <div className="status-tile">
            <p className="metric-label">계정 로그인 상태</p>
            <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{hasSavedToken ? '연결됨' : '연결 전'}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">마지막 연결: {formatConnectedAt(draft.lastConnectedAt)}</p>
          </div>
          <div className="status-tile">
            <p className="metric-label">기본 분석 계정</p>
            <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{hasDefaultAccount ? '선택 완료' : '미선택'}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{draft.instagramBusinessAccountId || '선택된 계정이 없습니다.'}</p>
          </div>
        </div>
        {!isSocialMode && !isConfigured && (
          <div className="soft-panel space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Instagram 연동 설정 마법사</p>
            <WizardStep
              stepNum={1}
              current={wizardStep}
              title="Meta 개발자 계정 만들기"
              description="Meta for Developers에서 개발자 계정을 만듭니다. Facebook 계정으로 로그인하면 됩니다. 이미 있다면 바로 다음으로 넘어가세요."
              actionLabel="developers.facebook.com 열기"
              actionHref="https://developers.facebook.com"
              onNext={() => setWizardStep(2)}
            />
            <WizardStep
              stepNum={2}
              current={wizardStep}
              title="Business 앱 만들기"
              description="개발자 대시보드 → 'My Apps' → '앱 만들기' → 앱 유형 'Business' 선택 → 앱 이름·연락처 이메일 입력 후 생성합니다."
              actionLabel="Meta App Dashboard 열기"
              actionHref="https://developers.facebook.com/apps"
              onBack={() => setWizardStep(1)}
              onNext={() => setWizardStep(3)}
            />
            <WizardStep
              stepNum={3}
              current={wizardStep}
              title="Instagram 제품 추가"
              description="앱 대시보드 → 왼쪽 사이드바 '제품 추가' → 'Instagram' (Instagram Login for Business) → '설정'을 클릭합니다."
              actionLabel="Meta App Dashboard 열기"
              actionHref="https://developers.facebook.com/apps"
              onBack={() => setWizardStep(2)}
              onNext={() => setWizardStep(4)}
            />
            {wizardStep === 4 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="accent-pill">Step 4 / 5</span>
                  <h4 className="text-sm font-semibold text-[var(--text-strong)]">App ID / App Secret 입력</h4>
                </div>
                <p className="text-sm leading-6 text-[var(--text-base)]">
                  앱 대시보드 → 앱 설정 → 기본 설정에서 App ID와 App Secret을 복사해 붙여넣으세요.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Meta App ID</label>
                    <input
                      className="input"
                      value={wizardAppId}
                      onChange={(e) => setWizardAppId(e.target.value)}
                      placeholder="숫자형 App ID (예: 1234567890)"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">App Secret</label>
                    <input
                      className="input"
                      type="password"
                      value={wizardAppSecret}
                      onChange={(e) => setWizardAppSecret(e.target.value)}
                      placeholder="App Secret"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">Redirect URI (Meta 콘솔에 등록)</label>
                    <div className="flex items-center gap-2">
                      <input
                        className="input flex-1 bg-[var(--surface-subtle)] cursor-default"
                        readOnly
                        value={typeof window !== 'undefined' ? `${window.location.origin}/meta/connect` : '/meta/connect'}
                      />
                      <button
                        type="button"
                        className="button-secondary shrink-0"
                        onClick={() => {
                          void navigator.clipboard.writeText(`${window.location.origin}/meta/connect`);
                        }}
                      >
                        복사
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">
                      Meta 콘솔 → Instagram → OAuth 리디렉션 URI 설정에 이 값을 추가해 주세요.
                    </p>
                  </div>
                </div>
                {wizardError && <p className="text-xs text-rose-700">{wizardError}</p>}
                <div className="flex gap-2">
                  <button type="button" className="button-secondary" onClick={() => { setWizardError(''); setWizardStep(3); }}>
                    이전
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => {
                      const id = wizardAppId.trim();
                      const secret = wizardAppSecret.trim();
                      if (!id || !secret) {
                        setWizardError('App ID와 App Secret을 모두 입력해 주세요.');
                        return;
                      }
                      if (!isLikelyMetaAppId(id)) {
                        setWizardError('App ID 형식이 올바르지 않습니다. Meta 개발자 대시보드의 숫자형 App ID를 입력해 주세요.');
                        return;
                      }
                      setWizardError('');
                      setWizardStep(5);
                    }}
                  >
                    다음
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 5 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="accent-pill">Step 5 / 5</span>
                  <h4 className="text-sm font-semibold text-[var(--text-strong)]">연결 테스트</h4>
                </div>
                <p className="text-sm leading-6 text-[var(--text-base)]">
                  아래 버튼을 눌러 Instagram OAuth 팝업을 열고 내 계정으로 로그인하세요. 연결이 완료되면 이 화면이 자동으로 바뀝니다.
                </p>
                {wizardError && <p className="text-xs text-rose-700">{wizardError}</p>}
                <div className="flex gap-2">
                  <button type="button" className="button-secondary" onClick={() => { setWizardError(''); setWizardStep(4); }}>
                    이전
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => void handleWizardConnect()}
                    disabled={wizardConnecting}
                  >
                    {wizardConnecting ? 'OAuth 창 열리는 중...' : 'Instagram 연결 테스트'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {!isSocialMode && isConfigured && (
          <div className="soft-panel flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="accent-pill">Meta 앱 설정됨</span>
              <p className="text-sm text-[var(--text-base)]">Instagram 연동 준비 완료. 이제 페르소나에서 계정을 연결하세요.</p>
            </div>
            <button
              type="button"
              className="button-secondary text-xs"
              onClick={() => void handleWizardReset()}
              disabled={saving}
            >
              {saving ? '초기화 중...' : '다시 설정'}
            </button>
          </div>
        )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isSocialMode ? (
          <>
            <button type="button" className="button-primary" onClick={handleStartLogin} disabled={launching || !loginReady}>
              {launching
                ? '공식 연결 창 여는 중...'
                : loginReady
                  ? `${getConnectionModeLabel(draft.loginMode)} 시작`
                  : '관리자 준비 필요'}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => void fetchLatestAnalysis(draft.instagramBusinessAccountId)}
              disabled={refreshingAnalysis || !draft.instagramBusinessAccountId}
            >
              {refreshingAnalysis ? '불러오는 중...' : '최근 결과 새로고침'}
            </button>
            <button type="button" className="button-secondary" onClick={() => setShowAdminFields((prev) => !prev)}>
              {showAdminFields ? '관리자 설정 접기' : '관리자용 연결 설정'}
            </button>
            <Link href="/operations" className="button-secondary">
              오늘의 브리핑 보기
            </Link>
          </>
        ) : (
          <>
            <button type="button" className="button-primary" onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '연결 정보 저장'}
            </button>
            <button type="button" className="button-secondary" onClick={handleStartLogin} disabled={launching || !loginReady}>
              {launching ? '공식 연결 창 여는 중...' : `${getConnectionModeLabel(draft.loginMode)} 열기`}
            </button>
            <Link href="/social" className="button-secondary">
              개발 예정 화면 보기
            </Link>
          </>
        )}
      </div>

      {message && <p className="text-xs text-emerald-700">{message}</p>}
      {error && <p className="text-xs text-rose-700">{error}</p>}

      {showAdminFields && (
        <div className="space-y-4 soft-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text-strong)]">관리자용 연결 설정</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                사내 앱 운영자는 한 번만 준비해 두고, 이후 사용자는 로그인과 계정 선택만 진행하면 됩니다.
              </p>
            </div>
            <span className="pill-option">고급 설정</span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              className={draft.loginMode === 'instagram_login' ? 'list-card list-card-active text-left' : 'list-card text-left'}
              onClick={() => handleSwitchMode('instagram_login')}
            >
              <p className="text-sm font-semibold text-[var(--text-strong)]">인스타그램 로그인</p>
              <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
                단일 계정 분석에 가장 단순합니다. 공식 문서 기준으로 Instagram Professional 계정 인사이트에 맞는 기본 흐름입니다.
              </p>
            </button>
            <button
              type="button"
              className={draft.loginMode === 'meta_business' ? 'list-card list-card-active text-left' : 'list-card text-left'}
              onClick={() => handleSwitchMode('meta_business')}
            >
              <p className="text-sm font-semibold text-[var(--text-strong)]">Meta 비즈니스 연결</p>
              <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
                페이지와 비즈니스 자산 선택이 필요한 고급 연결 방식입니다.
              </p>
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Meta App ID</label>
              {envAppId ? (
                <p className="text-sm text-emerald-600 py-2">환경변수에서 자동 설정됨</p>
              ) : (
                <>
                  <input
                    className="input"
                    value={draft.appId}
                    onChange={(e) => setDraft((prev) => ({ ...prev, appId: e.target.value }))}
                    placeholder="Meta 개발자 앱 대시보드의 숫자형 App ID"
                  />
                  <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">
                    인스타그램 계정 ID나 비즈니스 계정 ID가 아니라, Meta for Developers 앱의 숫자형 `App ID`를 넣어야 합니다.
                  </p>
                </>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                App Secret {draft.loginMode === 'instagram_login' ? <span className="text-[var(--text-muted)]">(고급 연결용)</span> : null}
              </label>
              {envAppSecret ? (
                <p className="text-sm text-emerald-600 py-2">환경변수에서 자동 설정됨</p>
              ) : (
                <input
                  className="input"
                  type="password"
                  value={draft.appSecret}
                  onChange={(e) => setDraft((prev) => ({ ...prev, appSecret: e.target.value }))}
                  placeholder="개발자 앱의 App Secret"
                />
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Redirect URI</label>
              <input
                className="input"
                value={draft.redirectUri}
                onChange={(e) => setDraft((prev) => ({ ...prev, redirectUri: e.target.value }))}
                placeholder={`${typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3000'}/meta/connect`}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Graph API 버전</label>
              <input
                className="input"
                value={draft.graphApiVersion}
                onChange={(e) => setDraft((prev) => ({ ...prev, graphApiVersion: e.target.value }))}
                placeholder="v25.0"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Instagram Account ID</label>
              <input
                className="input"
                value={draft.instagramBusinessAccountId}
                onChange={(e) => setDraft((prev) => ({ ...prev, instagramBusinessAccountId: e.target.value }))}
                placeholder="로그인 후 자동 선택하거나 직접 입력"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Access Token</label>
              <input
                className="input"
                type="password"
                value={draft.accessToken}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    accessToken: e.target.value,
                    tokenSource: e.target.value ? 'manual' : 'none'
                  }))
                }
                placeholder={
                  draft.loginMode === 'instagram_login'
                    ? '로그인으로 채우거나 대시보드 Generate token 값을 붙여넣기'
                    : 'Meta 로그인으로 채우거나 수동으로 붙여넣기'
                }
              />
            </div>
          </div>

          <div className="soft-panel">
            <p className="text-sm font-semibold text-[var(--text-strong)]">로그인 권한 범위</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
              {formatScopeList(draft.scopes)}.{' '}
              {draft.loginMode === 'instagram_login'
                ? '공식 문서 기준으로 이 흐름은 Facebook Page 연결 없이도 시작할 수 있습니다.'
                : '이 흐름은 페이지와 비즈니스 자산 연결이 필요한 경우에 적합합니다.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="button-primary" onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '연결 정보 저장'}
            </button>
            {!isSocialMode && (
              <button type="button" className="button-secondary" onClick={handleStartLogin} disabled={launching || !loginReady}>
                {launching ? '공식 연결 창 여는 중...' : `${getConnectionModeLabel(draft.loginMode)} 열기`}
              </button>
            )}
          </div>
        </div>
      )}

      {draft.connectedAccounts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-[var(--text-strong)]">연결된 인스타그램 계정</h4>
            <span className="text-xs text-[var(--text-muted)]">기본 계정을 하나 선택해 두면 이후 분석에 사용하기 쉽습니다.</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {draft.connectedAccounts.map((account) => {
              const active = draft.instagramBusinessAccountId === account.instagramBusinessAccountId;
              return (
                <button
                  key={account.instagramBusinessAccountId}
                  type="button"
                  className={active ? 'list-card list-card-active text-left' : 'list-card text-left'}
                  onClick={() => void handleSelectAccount(account.instagramBusinessAccountId)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-strong)]">@{account.username}</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {account.pageName || (draft.loginMode === 'instagram_login' ? '연결된 Instagram Professional 계정' : '연결된 Meta 페이지')}
                      </p>
                      <p className="mt-2 text-[11px] text-[var(--text-muted)]">IG Account ID: {account.instagramBusinessAccountId}</p>
                    </div>
                    <span className={active ? 'accent-pill' : 'pill-option'}>{active ? '기본 계정' : '선택'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isSocialMode && (
        <div className="space-y-4 soft-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text-strong)]">도달 분석 실행</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">선택한 인스타그램 계정 기준으로 최근 구간을 불러와 저장합니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-[var(--text-muted)]">조회 기간</label>
              <input
                className="input w-24"
                type="number"
                min={2}
                max={120}
                value={lookbackDays}
                onChange={(e) => setLookbackDays(Math.max(2, Math.min(120, Number(e.target.value || 30))))}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="button-primary"
              onClick={handleRunAnalysis}
              disabled={runningAnalysis || !hasSavedToken || !hasDefaultAccount}
            >
              {runningAnalysis ? '분석 실행 중...' : '최근 도달 분석 실행'}
            </button>
            <Link href="/operations" className="button-secondary">
              오늘의 브리핑 보기
            </Link>
          </div>

          {latestAnalysis && (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="status-tile">
                <p className="metric-label">추세</p>
                <p className={`mt-2 text-base font-semibold ${trendLabel(latestAnalysis.trendDirection).tone}`}>
                  {trendLabel(latestAnalysis.trendDirection).label}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{formatConnectedAt(latestAnalysis.createdAt)}</p>
              </div>
              <div className="status-tile">
                <p className="metric-label">최신 도달</p>
                <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">
                  {Math.round(latestAnalysis.latestReach).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  전일 대비{' '}
                  {latestAnalysis.dayOverDayChangePct == null
                    ? '비교 불가'
                    : `${latestAnalysis.dayOverDayChangePct > 0 ? '+' : ''}${latestAnalysis.dayOverDayChangePct.toFixed(2)}%`}
                </p>
              </div>
              <div className="status-tile">
                <p className="metric-label">7일 평균 / 이상치</p>
                <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">
                  {latestAnalysis.sevenDayAverage == null
                    ? '데이터 부족'
                    : Math.round(latestAnalysis.sevenDayAverage).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">이상치 {latestAnalysis.anomalyCount}건</p>
              </div>
              <div className="md:col-span-3">
                <div className="soft-panel">
                  <p className="text-sm font-semibold text-[var(--text-strong)]">최근 분석 요약</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{latestAnalysis.summary}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
