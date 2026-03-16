'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type WorkspaceProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  default_organization_id: string | null;
};

type WorkspaceOrganization = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

function extractErrorMessage(error: unknown) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return '알 수 없는 오류가 발생했습니다.';
}

function formatWorkspaceError(error: unknown) {
  const message = extractErrorMessage(error);
  if (!message) return 'Supabase 상태를 확인하지 못했습니다.';

  if (
    /create_organization_with_owner/i.test(message) ||
    /Could not find the function/i.test(message)
  ) {
    return '원격 Supabase 프로젝트에 조직 생성 함수가 아직 적용되지 않았습니다. 다음 단계에서 원격 마이그레이션을 올리면 바로 활성화됩니다.';
  }

  if (
    /organization_memberships/i.test(message) ||
    /organizations/i.test(message) ||
    /profiles/i.test(message) ||
    /relation .* does not exist/i.test(message) ||
    /schema cache/i.test(message)
  ) {
    return '로그인은 가능하지만 협업 테이블이 아직 원격 프로젝트에 올라가지 않았습니다. 원격 마이그레이션 적용 후 조직 생성과 공유 동기화가 켜집니다.';
  }

  return message;
}

function slugifyOrganization(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeOrganizations(rows: unknown): WorkspaceOrganization[] {
  if (!Array.isArray(rows)) return [];

  const map = new Map<string, WorkspaceOrganization>();

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const role = typeof record.role === 'string' ? record.role : 'member';
    const orgValue = Array.isArray(record.organization) ? record.organization[0] : record.organization;

    if (!orgValue || typeof orgValue !== 'object') continue;

    const organization = orgValue as Record<string, unknown>;
    const id = typeof organization.id === 'string' ? organization.id : '';
    const name = typeof organization.name === 'string' ? organization.name : '';
    const slug = typeof organization.slug === 'string' ? organization.slug : '';

    if (!id || !name) continue;

    map.set(id, { id, name, slug, role });
  }

  return Array.from(map.values());
}

export function SupabaseAuthPanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [organizations, setOrganizations] = useState<WorkspaceOrganization[]>([]);
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingLink, setSendingLink] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [workspaceMessage, setWorkspaceMessage] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');

  async function refreshWorkspace() {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setLoading(false);
      setSession(null);
      setProfile(null);
      setOrganizations([]);
      setWorkspaceError('Supabase 공개 설정이 아직 연결되지 않았습니다.');
      return;
    }

    setLoading(true);

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) {
      setAuthError(extractErrorMessage(sessionError));
      setSession(null);
      setProfile(null);
      setOrganizations([]);
      setLoading(false);
      return;
    }

    const activeSession = sessionData.session;
    setSession(activeSession);
    setAuthError('');

    if (activeSession?.user.email) {
      setEmail((prev) => prev || activeSession.user.email || '');
    }

    if (!activeSession) {
      setProfile(null);
      setOrganizations([]);
      setWorkspaceMessage('');
      setWorkspaceError('');
      setLoading(false);
      return;
    }

    const profileResponse = await client
      .from('profiles')
      .select('id, email, display_name, default_organization_id')
      .eq('id', activeSession.user.id)
      .maybeSingle();

    if (profileResponse.error) {
      setProfile(null);
      setWorkspaceError(formatWorkspaceError(profileResponse.error));
      setOrganizations([]);
      setLoading(false);
      return;
    }

    setProfile((profileResponse.data || null) as WorkspaceProfile | null);

    const membershipResponse = await client
      .from('organization_memberships')
      .select('role, organization:organizations(id, name, slug)')
      .eq('user_id', activeSession.user.id)
      .order('created_at', { ascending: true });

    if (membershipResponse.error) {
      setOrganizations([]);
      setWorkspaceError(formatWorkspaceError(membershipResponse.error));
      setLoading(false);
      return;
    }

    const nextOrganizations = normalizeOrganizations(membershipResponse.data);
    setOrganizations(nextOrganizations);
    setWorkspaceError('');
    setWorkspaceMessage(
      nextOrganizations.length > 0
        ? '팀 워크스페이스가 연결되어 오늘의 브리핑과 승인 흐름을 서버 기반으로 옮길 준비가 되었습니다.'
        : '로그인은 완료됐습니다. 첫 팀 워크스페이스를 만들면 공유 운영 데이터 동기화를 시작할 수 있습니다.'
    );
    setLoading(false);
  }

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setLoading(false);
      setWorkspaceError('Supabase 공개 URL과 공개 키를 먼저 연결해야 합니다.');
      return;
    }

    let disposed = false;

    void refreshWorkspace();

    const { data: listener } = client.auth.onAuthStateChange(() => {
      window.setTimeout(() => {
        if (!disposed) {
          void refreshWorkspace();
        }
      }, 0);
    });

    return () => {
      disposed = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function sendMagicLink() {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setAuthError('Supabase 공개 설정이 아직 연결되지 않았습니다.');
      return;
    }

    const sanitizedEmail = email.trim();
    if (!sanitizedEmail) {
      setAuthError('로그인에 사용할 이메일을 입력해주세요.');
      return;
    }

    setSendingLink(true);
    setAuthError('');
    setAuthMessage('');

    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await client.auth.signInWithOtp({
      email: sanitizedEmail,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true
      }
    });

    if (error) {
      setAuthError(extractErrorMessage(error));
    } else {
      setAuthMessage('로그인 링크를 보냈습니다. 메일에서 링크를 열거나 인증 코드가 오면 아래에서 바로 확인할 수 있습니다.');
    }

    setSendingLink(false);
  }

  async function verifyOtpCode() {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setAuthError('Supabase 공개 설정이 아직 연결되지 않았습니다.');
      return;
    }

    const sanitizedEmail = email.trim();
    const sanitizedCode = otpCode.trim();
    if (!sanitizedEmail || !sanitizedCode) {
      setAuthError('이메일과 인증 코드를 모두 입력해주세요.');
      return;
    }

    setVerifyingCode(true);
    setAuthError('');
    setAuthMessage('');

    const { error } = await client.auth.verifyOtp({
      email: sanitizedEmail,
      token: sanitizedCode,
      type: 'email'
    });

    if (error) {
      setAuthError(extractErrorMessage(error));
    } else {
      setOtpCode('');
      setAuthMessage('인증이 완료됐습니다. 현재 앱 세션에 바로 반영합니다.');
      await refreshWorkspace();
    }

    setVerifyingCode(false);
  }

  async function signOut() {
    const client = getSupabaseBrowserClient();
    if (!client) return;

    const { error } = await client.auth.signOut();
    if (error) {
      setAuthError(extractErrorMessage(error));
    } else {
      setAuthMessage('팀 계정 연결을 해제했습니다.');
      setWorkspaceMessage('');
      setProfile(null);
      setOrganizations([]);
      setSession(null);
    }
  }

  async function createOrganization() {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setWorkspaceError('Supabase 공개 설정이 아직 연결되지 않았습니다.');
      return;
    }

    if (!session) {
      setWorkspaceError('먼저 팀 계정으로 로그인해주세요.');
      return;
    }

    const sanitizedName = organizationName.trim();
    const sanitizedSlug = organizationSlug.trim();

    if (!sanitizedName) {
      setWorkspaceError('워크스페이스 이름을 입력해주세요.');
      return;
    }

    setCreatingOrganization(true);
    setWorkspaceError('');
    setWorkspaceMessage('');

    const { error } = await client.rpc('create_organization_with_owner', {
      p_name: sanitizedName,
      p_slug: sanitizedSlug || slugifyOrganization(sanitizedName) || null
    });

    if (error) {
      setWorkspaceError(formatWorkspaceError(error));
    } else {
      setOrganizationName('');
      setOrganizationSlug('');
      setWorkspaceMessage('첫 워크스페이스를 만들었습니다. 이제 공유 데이터 이전 단계를 바로 붙일 수 있습니다.');
      await refreshWorkspace();
    }

    setCreatingOrganization(false);
  }

  const isConfigured = Boolean(getSupabaseBrowserClient());
  const defaultOrganization = profile?.default_organization_id
    ? organizations.find((item) => item.id === profile.default_organization_id) || null
    : organizations[0] || null;

  return (
    <section className="panel space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Cloud Backend</p>
          <h3 className="mt-2 text-[1.25rem] font-semibold tracking-[-0.03em] text-[var(--text-strong)]">팀 계정과 협업 백엔드</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            개인 Mac 안에 있던 운영 데이터를 Supabase 기반 팀 워크스페이스로 옮기기 위한 첫 단계입니다. 로그인은 먼저 붙이고,
            조직/공유 데이터는 원격 마이그레이션이 적용되는 순간 이어집니다.
          </p>
        </div>
        <div className="status-tile min-w-[220px]">
          <p className="metric-label">현재 연결</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">
            {!isConfigured ? '설정 필요' : session ? '로그인됨' : loading ? '확인 중' : '로그인 대기'}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {session?.user.email || '사내 구성원이 같은 데이터와 승인 흐름을 공유하게 됩니다.'}
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="soft-panel space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">팀 로그인 이메일</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="team@company.com"
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">현재는 이메일 기반 로그인부터 붙였습니다. 이후 SSO나 조직 초대 흐름으로 확장할 수 있습니다.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">인증 코드 입력(선택)</label>
              <input
                className="input"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
                placeholder="현재는 보통 비워둬도 됩니다"
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                현재 Supabase 기본 설정은 메일 속 로그인 링크를 누르는 방식입니다. 이 입력칸은 나중에 이메일 템플릿을 OTP 코드 방식으로 바꿨을 때만 사용합니다.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="button-primary" onClick={sendMagicLink} disabled={sendingLink || !isConfigured}>
              {sendingLink ? '로그인 메일 전송 중...' : '로그인 메일 보내기'}
            </button>
            <button type="button" className="button-secondary" onClick={verifyOtpCode} disabled={verifyingCode || !isConfigured}>
              {verifyingCode ? '코드 확인 중...' : '코드 방식으로 로그인'}
            </button>
            <button type="button" className="button-secondary" onClick={() => void refreshWorkspace()} disabled={!isConfigured || loading}>
              {loading ? '상태 확인 중...' : '상태 새로고침'}
            </button>
            {session && (
              <button type="button" className="button-secondary" onClick={signOut}>
                로그아웃
              </button>
            )}
          </div>

          {authMessage && <p className="text-xs text-emerald-700">{authMessage}</p>}
          {authError && <p className="text-xs text-rose-700">{authError}</p>}

          <div className="surface-note">
            <strong>현재 기본 로그인 방식</strong>은 메일에 도착한 링크를 누르는 것입니다. 링크를 누르면
            [auth/callback](/Users/rnr/Documents/New%20project/app/auth/callback/page.tsx) 를 거쳐 설정 화면으로 돌아오고 세션이 연결됩니다.
          </div>
        </div>

        <div className="space-y-3">
          <div className="status-tile">
            <p className="metric-label">프로젝트 URL</p>
            <p className="mt-2 break-all text-sm font-semibold text-[var(--text-strong)]">pwllacujwgzulkelqfrq.supabase.co</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">제공해주신 hosted Supabase 프로젝트 기준으로 연결돼 있습니다.</p>
          </div>
          <div className="status-tile">
            <p className="metric-label">기본 워크스페이스</p>
            <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{defaultOrganization?.name || '아직 없음'}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {defaultOrganization ? `${defaultOrganization.slug} · ${defaultOrganization.role}` : '첫 워크스페이스를 만들면 승인/브리핑 데이터 공유를 시작합니다.'}
            </p>
          </div>
          <div className="status-tile">
            <p className="metric-label">다음 백엔드 단계</p>
            <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">공유 운영 데이터 이전</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Run, Deliverable, Approval, Seminar 흐름을 순차적으로 Supabase로 옮길 예정입니다.</p>
          </div>
        </div>
      </div>

      {workspaceMessage && <p className="text-xs text-emerald-700">{workspaceMessage}</p>}
      {workspaceError && <div className="surface-note text-rose-700">{workspaceError}</div>}

      {session && organizations.length === 0 && !workspaceError && (
        <div className="soft-panel space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-[var(--text-strong)]">첫 팀 워크스페이스 만들기</h4>
            <p className="mt-1 text-xs text-[var(--text-muted)]">회사나 브랜드 단위 이름을 한 번만 정하면 이후 승인, 브리핑, 히스토리를 이 단위에 묶을 수 있습니다.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">워크스페이스 이름</label>
              <input
                className="input"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                placeholder="예: Growth Ops Team"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">슬러그(선택)</label>
              <input
                className="input"
                value={organizationSlug}
                onChange={(event) => setOrganizationSlug(event.target.value)}
                placeholder="미입력 시 자동 생성"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="button-primary" onClick={createOrganization} disabled={creatingOrganization}>
              {creatingOrganization ? '워크스페이스 생성 중...' : '워크스페이스 만들기'}
            </button>
          </div>
        </div>
      )}

      {organizations.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {organizations.map((organization) => (
            <div key={organization.id} className="list-card list-card-active">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{organization.slug}</p>
                  <p className="mt-1 text-base font-semibold text-[var(--text-strong)]">{organization.name}</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">역할: {organization.role}</p>
                </div>
                <span className="accent-pill">{organization.id === defaultOrganization?.id ? '기본' : '연결됨'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
