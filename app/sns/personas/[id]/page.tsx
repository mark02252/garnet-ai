'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { loadStoredMetaConnectionDraft, saveStoredMetaConnectionDraft } from '@/lib/meta-connection-storage'
import { buildInstagramConnectionOAuthUrl, getDefaultScopesForConnectionMode } from '@/lib/meta-connection'

type Persona = {
  id: string; name: string; platform: string; brandConcept: string | null
  targetAudience: string | null; writingStyle: string | null; tone: string | null
  keywords: string; sampleSentences: string; instagramHandle: string | null
}

export default function PersonaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [persona, setPersona] = useState<Persona | null>(null)
  const [saving, setSaving] = useState(false)
  const [isMetaConfigured, setIsMetaConfigured] = useState(false);
  const [connectingIg, setConnectingIg] = useState(false);
  const [igMessage, setIgMessage] = useState('');
  const [igError, setIgError] = useState('');

  useEffect(() => {
    fetch(`/api/sns/personas/${id}`).then(r => r.json()).then(setPersona)
  }, [id])

  useEffect(() => {
    void loadStoredMetaConnectionDraft(window.location.origin).then((result) => {
      setIsMetaConfigured(Boolean(result.value.appId && result.value.appSecret));
    });
  }, []);

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
        setIgError('');
        setConnectingIg(false);
      }
      if (record.type === 'instagram-connection-error') {
        setIgError('Instagram 연결 중 오류가 발생했습니다.');
        setIgMessage('');
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

  async function handleSave() {
    if (!persona) return
    setSaving(true)
    await fetch(`/api/sns/personas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...persona,
        keywords: (() => { try { return JSON.parse(persona.keywords) } catch { return [] } })(),
        sampleSentences: (() => { try { return JSON.parse(persona.sampleSentences) } catch { return [] } })(),
      }),
    })
    setSaving(false)
    router.push('/sns/personas')
  }

  async function handleInstagramConnect() {
    const stored = await loadStoredMetaConnectionDraft(window.location.origin);
    const draft = stored.value;
    if (!draft.appId || !draft.appSecret) {
      setIgError('Meta 앱이 설정되지 않았습니다. 설정 페이지에서 먼저 완료해 주세요.');
      return;
    }
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
    if (!url) { setIgError('로그인 URL을 만들지 못했습니다.'); return; }
    setIgError('');
    setConnectingIg(true);
    setIgMessage('');
    const popup = window.open(url, 'instagram-connect', 'width=540,height=760');
    if (!popup) window.location.href = url;
    else popup.focus();
  }

  if (!persona) return <div className="p-6 text-[var(--text-muted)]">불러오는 중...</div>

  const keywords: string[] = (() => { try { return JSON.parse(persona.keywords) } catch { return [] } })()

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <p className="dashboard-eyebrow mb-1">SNS 스튜디오 · 페르소나</p>
      <h1 className="dashboard-title mb-6">{persona.name}</h1>
      <div className="card space-y-4">
        {[
          ['name', '페르소나 이름', persona.name],
          ['brandConcept', '브랜드 컨셉', persona.brandConcept ?? ''],
          ['targetAudience', '타겟 오디언스', persona.targetAudience ?? ''],
          ['writingStyle', '글쓰기 스타일', persona.writingStyle ?? ''],
          ['tone', '톤', persona.tone ?? ''],
          ['instagramHandle', 'Instagram 핸들', persona.instagramHandle ?? ''],
        ].map(([field, label, value]) => (
          <div key={field}>
            <label className="text-sm text-[var(--text-muted)] block mb-1">{label}</label>
            <input
              className="input w-full"
              value={value}
              onChange={e => setPersona(prev => prev ? { ...prev, [field]: e.target.value } : prev)}
            />
          </div>
        ))}
        <div className="pt-1 border-t border-[var(--border-subtle)]">
          <p className="text-sm font-semibold text-[var(--text-strong)] mb-2">Instagram 계정 연결</p>
          {isMetaConfigured ? (
            <div className="space-y-2">
              {persona.instagramHandle ? (
                <div className="flex items-center gap-2">
                  <span className="accent-pill">연결됨</span>
                  <span className="text-sm text-[var(--text-base)]">{persona.instagramHandle}</span>
                </div>
              ) : (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={async () => {
                    const draft = await loadStoredMetaConnectionDraft(window.location.origin)
                    const accounts = draft.value.connectedAccounts || []
                    if (accounts.length > 0) {
                      const handle = `@${accounts[0].username}`
                      setPersona(prev => prev ? { ...prev, instagramHandle: handle } : prev)
                      setIgMessage(`${handle} 연결됨 — 저장 버튼을 눌러 확정하세요.`)
                    } else {
                      // connectedAccounts가 없으면 instagramBusinessAccountId로 직접 설정
                      const accountId = draft.value.instagramBusinessAccountId
                      if (accountId) {
                        try {
                          const token = draft.value.accessToken
                          const res = await fetch(`https://graph.instagram.com/v19.0/${accountId}?fields=username&access_token=${token}`)
                          if (res.ok) {
                            const data = await res.json() as { username?: string }
                            if (data.username) {
                              const handle = `@${data.username}`
                              setPersona(prev => prev ? { ...prev, instagramHandle: handle } : prev)
                              setIgMessage(`${handle} 연결됨 — 저장 버튼을 눌러 확정하세요.`)
                              return
                            }
                          }
                        } catch {}
                      }
                      setIgError('연결된 Instagram 계정을 찾을 수 없습니다. 설정 페이지에서 먼저 연동하세요.')
                    }
                  }}
                >
                  설정에서 연결된 계정 가져오기
                </button>
              )}
              {igMessage && <p className="text-xs text-emerald-700">{igMessage}</p>}
              {igError && <p className="text-xs text-rose-700">{igError}</p>}
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
        <div>
          <label className="text-sm text-[var(--text-muted)] block mb-1">키워드 (쉼표 구분)</label>
          <input
            className="input w-full"
            value={keywords.join(', ')}
            onChange={e => setPersona(prev => prev ? {
              ...prev,
              keywords: JSON.stringify(e.target.value.split(',').map(k => k.trim()).filter(Boolean))
            } : prev)}
          />
        </div>
        <div className="flex gap-2 pt-2">
          <button className="button-secondary flex-1" onClick={() => router.back()}>취소</button>
          <button className="button-primary flex-1" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
