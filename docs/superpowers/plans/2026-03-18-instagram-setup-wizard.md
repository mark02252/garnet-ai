# Instagram 연동 설정 마법사 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/settings` 페이지에 Instagram 연동 설정 마법사(5단계)를 추가하여, 최초 1회 Meta 개발자 앱 셋업 후 이후 OAuth는 버튼 하나로 완료되게 한다.

**Architecture:** `MetaConnectionPanel`(mode='settings')에 마법사 UI를 인라인으로 추가한다. `isConfigured = Boolean(appId && appSecret)` 조건으로 마법사/완료 뷰를 전환한다. BroadcastChannel은 기존 구독 로직을 재활용한다. 페르소나 페이지에는 셋업 상태에 따른 조건부 버튼을 추가한다.

**Tech Stack:** Next.js 15.2 App Router · React 18 · TypeScript · 기존 `lib/meta-connection-storage.ts` · `lib/meta-connection.ts` · BroadcastChannel

---

## 파일 구조

| 파일 | 변경 유형 | 책임 |
|------|---------|------|
| `components/meta-connection-panel.tsx` | Modify | 마법사 5단계 UI + 완료 뷰 + "다시 설정" |
| `app/settings/page.tsx` | Modify (minimal) | MetaConnectionPanel이 mode='settings'로 이미 렌더됨 — 확인 후 필요시 조정 |
| `app/sns/personas/[id]/page.tsx` | Modify | Instagram 연결 섹션 추가 (셋업 여부 조건부) |
| `app/sns/personas/new/page.tsx` | Modify | Step 1에 셋업 미완료 안내 추가 |

새 파일 없음.

---

## Chunk 1: MetaConnectionPanel — 마법사 핵심 로직

### Task 1: `isConfigured` 판단 + 마법사 스텝 상태 추가

**Files:**
- Modify: `components/meta-connection-panel.tsx`

현재 `mode='settings'` 일 때 `showAdminFields`를 펼쳐서 수동 입력 폼을 보여주는 구조다. 이를 마법사 뷰(5단계)와 완료 뷰로 교체한다.

- [ ] **Step 1: `meta-connection-panel.tsx` 상단 상태 변수 추가**

  `MetaConnectionPanel` 함수 내, 기존 상태 선언 블록(`const [draft, ...`) 바로 아래에 추가:

  ```tsx
  // 마법사: settings 모드에서만 사용
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [wizardAppId, setWizardAppId] = useState('');
  const [wizardAppSecret, setWizardAppSecret] = useState('');
  const [wizardConnecting, setWizardConnecting] = useState(false);
  const [wizardError, setWizardError] = useState('');
  ```

- [ ] **Step 2: `isConfigured` 파생 값 추가**

  기존 `const hasSavedToken = Boolean(draft.accessToken);` 바로 위에:

  ```tsx
  const isConfigured = Boolean(draft.appId && draft.appSecret);
  ```

- [ ] **Step 3: draft 로드 완료 시 마법사 input 초기화**

  기존 `useEffect` (loadStoredMetaConnectionDraft 호출)의 `setDraft(next)` 직후에 추가:

  ```tsx
  setWizardAppId(next.appId);
  setWizardAppSecret(next.appSecret);
  ```

- [ ] **Step 4: 수동 확인 — dev 서버 실행 후 `/settings` 접속**

  `npm run dev` → `http://localhost:3000/settings` → 콘솔 오류 없음 확인.

- [ ] **Step 5: 커밋**

  ```bash
  git add components/meta-connection-panel.tsx
  git commit -m "feat(wizard): add wizard state variables and isConfigured derived value"
  ```

---

### Task 2: 마법사 Step 1~3 UI (안내 전용 단계)

**Files:**
- Modify: `components/meta-connection-panel.tsx`

- [ ] **Step 1: `handleWizardReset` 함수 추가**

  `handleSwitchMode` 함수 아래에 추가:

  ```tsx
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
    setWizardStep(1);
  }
  ```

- [ ] **Step 2: `WizardStep` 헬퍼 컴포넌트 추가 (파일 상단, 컴포넌트 함수 밖)**

  `trendLabel` 함수 아래에 추가:

  ```tsx
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
  ```

- [ ] **Step 3: 마법사 렌더 영역 삽입 (settings 모드 + 미설정 상태)**

  기존 `settings` 모드 렌더 블록을 찾는다. 현재 구조:
  ```tsx
  ) : (
    <div className="grid gap-3 md:grid-cols-3">
      ...status tiles...
    </div>
  )}
  ```

  이 `</div>` 닫힘 태그 바로 뒤(JSX에서 status tiles 블록 다음)에 추가:

  ```tsx
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
    </div>
  )}
  ```

- [ ] **Step 4: 수동 확인 — `/settings` 접속 후 Step 1~3 내비게이션 동작 확인**

  - '다음' 클릭 시 Step 2, 3으로 이동 확인
  - '이전' 클릭 시 되돌아오는지 확인
  - 외부 링크 버튼이 새 탭으로 열리는지 확인

- [ ] **Step 5: 커밋**

  ```bash
  git add components/meta-connection-panel.tsx
  git commit -m "feat(wizard): add WizardStep helper and steps 1-3 guidance UI"
  ```

---

### Task 3: 마법사 Step 4 (App ID / App Secret 입력) + Step 5 (OAuth 테스트)

**Files:**
- Modify: `components/meta-connection-panel.tsx`

- [ ] **Step 1: `handleWizardConnect` 함수 추가**

  `handleWizardReset` 함수 아래에 추가:

  ```tsx
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
  ```

- [ ] **Step 2: 기존 BroadcastChannel 구독에 마법사 완료 처리 추가**

  기존 `handleConnectionPayload` 함수 내, `record.type === 'instagram-connection-complete'` 블록의
  `setMessage(...)` 직후에 추가:

  ```tsx
  // 마법사 모드: Step 5에서 연결 완료 시 wizardConnecting 해제
  setWizardConnecting(false);
  ```

  그리고 `record.type === 'instagram-connection-error'` 블록의 `setError(...)` 직후에:

  ```tsx
  // 마법사 모드: OAuth 실패 시 Step 4로 되돌아가기
  setWizardConnecting(false);
  setWizardError(typeof record.message === 'string' ? record.message : '연결 중 오류가 발생했습니다. App ID/Secret을 다시 확인해 주세요.');
  setWizardStep(4);
  ```

- [ ] **Step 3: Step 4, 5 UI 추가 (기존 soft-panel 블록 내)**

  Task 2에서 만든 `WizardStep` 블록(`!isSocialMode && !isConfigured`) 안, Step 3 다음에 추가:

  ```tsx
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
  ```

- [ ] **Step 4: 수동 확인**

  - Step 4: 빈 입력으로 '다음' → 에러 메시지 표시, Step 4 유지 확인
  - Step 4: App ID/Secret 입력 후 '다음' → Step 5 이동 확인
  - Step 4: Redirect URI 복사 버튼 동작 확인
  - Step 5: '이전' → Step 4로 이동 시 wizardAppId/wizardAppSecret 값 유지 확인

- [ ] **Step 5: 커밋**

  ```bash
  git add components/meta-connection-panel.tsx
  git commit -m "feat(wizard): add steps 4-5 with App ID/Secret input and OAuth connect"
  ```

---

### Task 4: 마법사 완료 뷰 + "다시 설정" 버튼

**Files:**
- Modify: `components/meta-connection-panel.tsx`

- [ ] **Step 1: 완료 뷰 추가 (settings 모드 + isConfigured 상태)**

  Task 2/3의 마법사 블록 바로 아래에 추가:

  ```tsx
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
  ```

- [ ] **Step 2: 수동 확인**

  - 설정된 상태(`appId`, `appSecret` 모두 있음)에서 `/settings` 접속 → 완료 뷰 표시 확인
  - 미설정 상태에서는 마법사 표시 확인
  - '다시 설정' 클릭 → appId/appSecret 초기화 → 마법사 Step 1로 복귀 확인

- [ ] **Step 3: 커밋**

  ```bash
  git add components/meta-connection-panel.tsx
  git commit -m "feat(wizard): add completed state view with reset button"
  ```

---

## Chunk 2: 페르소나 페이지 Instagram 연결 버튼

### Task 5: `app/sns/personas/[id]/page.tsx` — Instagram 연결 섹션

**Files:**
- Modify: `app/sns/personas/[id]/page.tsx`

현재 페이지는 단순 폼 필드 목록이다. 아래 변경을 가한다.

- [ ] **Step 1: `isMetaConfigured` 상태 + 로드 로직 추가**

  파일 상단 import 추가:

  ```tsx
  import { loadStoredMetaConnectionDraft } from '@/lib/meta-connection-storage';
  ```

  컴포넌트 함수 내 상태 선언 블록에 추가:

  ```tsx
  const [isMetaConfigured, setIsMetaConfigured] = useState(false);
  const [connectingIg, setConnectingIg] = useState(false);
  const [igMessage, setIgMessage] = useState('');
  ```

  기존 `useEffect` (fetch persona) 와 별도로 추가:

  ```tsx
  useEffect(() => {
    void loadStoredMetaConnectionDraft(window.location.origin).then((result) => {
      setIsMetaConfigured(Boolean(result.value.appId && result.value.appSecret));
    });
  }, []);
  ```

- [ ] **Step 2: BroadcastChannel 구독 useEffect 추가**

  ```tsx
  useEffect(() => {
    function handlePayload(data: unknown) {
      if (!data || typeof data !== 'object') return;
      const record = data as Record<string, unknown>;
      if (record.type === 'instagram-connection-complete') {
        const payload = record.payload as { accounts?: Array<{ username: string; instagramBusinessAccountId: string }> };
        const handle = payload?.accounts?.[0]?.username;
        if (handle) {
          setPersona((prev) => prev ? { ...prev, instagramHandle: `@${handle}` } : prev);
          setIgMessage(`@${handle} 계정이 연결되었습니다. 저장 버튼을 눌러 확정하세요.`);
        }
        setConnectingIg(false);
      }
      if (record.type === 'instagram-connection-error') {
        setIgMessage('Instagram 연결 중 오류가 발생했습니다.');
        setConnectingIg(false);
      }
    }

    let channel: BroadcastChannel | null = null;
    if ('BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel('instagram-connect');
        channel.onmessage = (e) => handlePayload(e.data);
      } catch { channel = null; }
    }
    function handleWindowMessage(e: MessageEvent) {
      if (e.origin === window.location.origin) handlePayload(e.data);
    }
    window.addEventListener('message', handleWindowMessage);

    return () => {
      channel?.close();
      window.removeEventListener('message', handleWindowMessage);
    };
  }, []);
  ```

- [ ] **Step 3: `handleInstagramConnect` 함수 추가**

  `handleSave` 함수 아래에:

  ```tsx
  async function handleInstagramConnect() {
    const stored = await loadStoredMetaConnectionDraft(window.location.origin);
    const draft = stored.value;
    if (!draft.appId) {
      setIgMessage('Meta 앱이 설정되지 않았습니다. 설정 페이지에서 먼저 완료해 주세요.');
      return;
    }
    const { buildInstagramConnectionOAuthUrl, getDefaultScopesForConnectionMode } = await import('@/lib/meta-connection');
    const { saveStoredMetaConnectionDraft } = await import('@/lib/meta-connection-storage');
    const state = window.crypto.randomUUID();
    const nextDraft = {
      ...draft,
      loginMode: 'instagram_login' as const,
      redirectUri: draft.redirectUri || `${window.location.origin}/meta/connect`,
      lastOauthState: state,
      scopes: getDefaultScopesForConnectionMode('instagram_login')
    };
    await saveStoredMetaConnectionDraft(nextDraft);
    const url = buildInstagramConnectionOAuthUrl(nextDraft, state);
    if (!url) { setIgMessage('로그인 URL을 만들지 못했습니다.'); return; }
    setConnectingIg(true);
    setIgMessage('');
    const popup = window.open(url, 'instagram-connect', 'width=540,height=760');
    if (!popup) window.location.href = url;
    else popup.focus();
  }
  ```

  > **Note:** dynamic import 사용 이유 — 기존 파일이 lib/meta-connection을 import하지 않아 최소 변경 원칙 유지. 또는 상단에 정적 import해도 무방.

- [ ] **Step 4: Instagram 연결 섹션 JSX 추가**

  기존 `instagramHandle` 입력 필드 블록 (`['instagramHandle', ...]`) **다음**, 즉 `.map(...)` 블록 바깥이자 `<div>` (키워드 입력) 바로 위에 추가:

  ```tsx
  <div className="pt-1 border-t border-[var(--border-subtle)]">
    <p className="text-sm font-semibold text-[var(--text-strong)] mb-2">Instagram 계정 연결</p>
    {isMetaConfigured ? (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="button-secondary"
          onClick={() => void handleInstagramConnect()}
          disabled={connectingIg}
        >
          {connectingIg ? 'OAuth 창 열리는 중...' : 'Instagram 계정 연결'}
        </button>
        {igMessage && <p className="text-xs text-emerald-700">{igMessage}</p>}
      </div>
    ) : (
      <p className="text-xs text-[var(--text-muted)]">
        Instagram 연동 설정이 필요합니다.{' '}
        <a href="/settings" className="text-[var(--accent)] underline">
          설정 페이지에서 완료하기 →
        </a>
      </p>
    )}
  </div>
  ```

- [ ] **Step 5: 수동 확인**

  - 미설정 상태 → `/settings` 링크 표시 확인
  - 설정 완료 상태 → 'Instagram 계정 연결' 버튼 표시 확인
  - OAuth 팝업 열림 확인 (appId가 있을 때)

- [ ] **Step 6: 커밋**

  ```bash
  git add app/sns/personas/[id]/page.tsx
  git commit -m "feat(personas): add Instagram account connect button with setup guard"
  ```

---

### Task 6: `app/sns/personas/new/page.tsx` — Step 1에 셋업 안내 추가

**Files:**
- Modify: `app/sns/personas/new/page.tsx`

- [ ] **Step 1: isMetaConfigured 상태 추가**

  import 추가:

  ```tsx
  import { loadStoredMetaConnectionDraft } from '@/lib/meta-connection-storage';
  import { useEffect } from 'react';
  ```
  > `useEffect`는 이미 import되지 않았으므로 추가. `useState`는 이미 있음.

  상태 추가:

  ```tsx
  const [isMetaConfigured, setIsMetaConfigured] = useState(false);
  ```

  컴포넌트 최상단에 useEffect 추가:

  ```tsx
  useEffect(() => {
    void loadStoredMetaConnectionDraft(window.location.origin).then((result) => {
      setIsMetaConfigured(Boolean(result.value.appId && result.value.appSecret));
    });
  }, []);
  ```

- [ ] **Step 2: Step 1 UI에 Instagram 설정 안내 추가**

  기존 Step 1 블록 (`{step === 1 && (`)에서, `instagramHandle` 입력 필드 (`<div>`) 바로 아래 (이미 있는 `<button>다음</button>` 바로 위) 에 추가:

  ```tsx
  {!isMetaConfigured && (
    <p className="text-xs text-[var(--text-muted)]">
      Instagram 계정 연결을 위해{' '}
      <a href="/settings" className="text-[var(--accent)] underline">
        먼저 Instagram 연동을 설정
      </a>
      해 주세요. (선택 사항 — 나중에 해도 됩니다.)
    </p>
  )}
  ```

- [ ] **Step 3: 수동 확인**

  - 미설정 상태 → 안내 문구 + /settings 링크 표시 확인
  - 설정 완료 상태 → 안내 문구 숨김 확인

- [ ] **Step 4: 커밋**

  ```bash
  git add app/sns/personas/new/page.tsx
  git commit -m "feat(personas): show Instagram setup notice in new persona wizard"
  ```

---

## Chunk 3: 통합 검증

### Task 7: `app/settings/page.tsx` — MetaConnectionPanel mode 확인

**Files:**
- Modify (확인 only): `app/settings/page.tsx`

- [ ] **Step 1: settings 페이지에서 MetaConnectionPanel 렌더 확인**

  파일을 열어 `MetaConnectionPanel`이 `mode="settings"`로 렌더되고 있는지 확인한다.
  이미 그렇게 되어 있으면 변경 없음. 만약 `mode` prop이 없거나 `mode="social"`이면 아래와 같이 수정:

  ```tsx
  // 변경 전 (있을 경우)
  <MetaConnectionPanel />
  // 변경 후
  <MetaConnectionPanel mode="settings" />
  ```

- [ ] **Step 2: 커밋 (변경이 있을 경우만)**

  ```bash
  git add app/settings/page.tsx
  git commit -m "fix(settings): ensure MetaConnectionPanel renders in settings mode"
  ```

---

### Task 8: 전체 흐름 수동 E2E 확인 (이전 Task 7)

- [ ] **Step 1: 미설정 상태 전체 확인**

  1. `localStorage`에서 `meta_connection_v1` 키 삭제 (또는 appId/appSecret 비움)
  2. `/settings` → 마법사 Step 1 표시 확인
  3. Step 1→2→3→4→5 내비게이션 확인
  4. Step 4: App ID/Secret 입력 후 Step 5 이동
  5. `/sns/personas/new` → "Instagram 연동 설정 필요" 안내 + `/settings` 링크 확인
  6. `/sns/personas/{id}` → "설정 필요" 안내 + `/settings` 링크 확인

- [ ] **Step 2: 설정 완료 상태 전체 확인**

  1. `/settings` → "Meta 앱 설정됨" 완료 뷰 확인
  2. '다시 설정' → 마법사 Step 1 복귀 확인
  3. `/sns/personas/{id}` → "Instagram 계정 연결" 버튼 표시 확인

- [ ] **Step 3: 최종 커밋**

  ```bash
  git add -A
  git commit -m "feat: Instagram setup wizard complete — settings wizard + persona connect button"
  ```
