'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadStoredMetaConnectionDraft } from '@/lib/meta-connection-storage'

type Step = 1 | 2 | 3
type LearnMode = 'FROM_POSTS' | 'FROM_TEMPLATE'

export default function NewPersonaPage() {
  const router = useRouter()
  const [isMetaConfigured, setIsMetaConfigured] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [mode, setMode] = useState<LearnMode>('FROM_TEMPLATE')
  const [name, setName] = useState('')
  const [instagramHandle, setInstagramHandle] = useState('')
  const [postsText, setPostsText] = useState('')
  const [brandName, setBrandName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [target, setTarget] = useState('')
  const [language, setLanguage] = useState('한국어')
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void loadStoredMetaConnectionDraft(window.location.origin).then((result) => {
      setIsMetaConfigured(Boolean(result.value.appId && result.value.appSecret));
    });
  }, []);

  async function handleAnalyze() {
    if (!name.trim()) { setError('페르소나 이름을 입력하세요.'); return }
    setLoading(true)
    setError('')
    try {
      const createRes = await fetch('/api/sns/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, learnMode: mode, instagramHandle }),
      })
      const persona = await createRes.json()
      if (!createRes.ok) throw new Error(persona.error)

      const learnBody = mode === 'FROM_POSTS'
        ? { mode, posts: postsText.split('\n---\n').filter(Boolean) }
        : { mode, brandName, purpose, target, language }

      const learnRes = await fetch(`/api/sns/personas/${persona.id}/learn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(learnBody),
      })
      const learnData = await learnRes.json()
      if (!learnRes.ok) throw new Error(learnData.error)
      setAnalysis(learnData.analysis)
      setStep(3)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <p className="dashboard-eyebrow mb-1">SNS 스튜디오 · 페르소나</p>
      <h1 className="dashboard-title mb-6">새 페르소나 만들기</h1>

      {step === 1 && (
        <div className="card space-y-4">
          <h2 className="section-title">Step 1 — 기본 정보</h2>
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">페르소나 이름 *</label>
            <input className="input w-full" value={name} onChange={e => setName(e.target.value)} placeholder="예: 브랜드A 공식계정" />
          </div>
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Instagram 핸들 (선택)</label>
            <input className="input w-full" value={instagramHandle} onChange={e => setInstagramHandle(e.target.value)} placeholder="@username" />
          </div>
          <h2 className="section-title pt-2">Step 2 — 학습 모드 선택</h2>
          <div className="grid grid-cols-2 gap-3">
            {([
              ['FROM_TEMPLATE', '신규 생성', '목적/타겟 설정으로 AI가 페르소나 제안'],
              ['FROM_POSTS', '내 계정 분석', '과거 포스팅 5개↑ 업로드로 패턴 학습'],
            ] as const).map(([val, label, desc]) => (
              <button
                key={val}
                onClick={() => setMode(val)}
                className={`soft-card text-left p-4 border-2 transition-colors ${mode === val ? 'border-[var(--accent)]' : 'border-transparent'}`}
              >
                <p className="font-medium text-sm mb-1">{label}</p>
                <p className="text-xs text-[var(--text-muted)]">{desc}</p>
              </button>
            ))}
          </div>
          {!isMetaConfigured && (
            <p className="text-xs text-[var(--text-muted)]">
              Instagram 계정 연결을 위해{' '}
              <a href="/settings" className="text-[var(--accent)] underline">
                먼저 Instagram 연동을 설정
              </a>
              해 주세요. (선택 사항 — 나중에 해도 됩니다.)
            </p>
          )}
          <button className="button-primary w-full" onClick={() => setStep(2)}>다음</button>
        </div>
      )}

      {step === 2 && (
        <div className="card space-y-4">
          <h2 className="section-title">Step 2 — 데이터 입력</h2>
          {mode === 'FROM_TEMPLATE' ? (
            <>
              <div>
                <label className="text-sm text-[var(--text-muted)] block mb-1">브랜드명 *</label>
                <input className="input w-full" value={brandName} onChange={e => setBrandName(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-[var(--text-muted)] block mb-1">운영 목적 *</label>
                <input className="input w-full" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="예: 뷰티 제품 홍보, 팔로워 성장" />
              </div>
              <div>
                <label className="text-sm text-[var(--text-muted)] block mb-1">타겟 오디언스</label>
                <input className="input w-full" value={target} onChange={e => setTarget(e.target.value)} placeholder="예: 20-30대 여성, 뷰티 관심층" />
              </div>
              <div>
                <label className="text-sm text-[var(--text-muted)] block mb-1">언어</label>
                <select className="input w-full" value={language} onChange={e => setLanguage(e.target.value)}>
                  <option>한국어</option><option>English</option><option>日本語</option>
                </select>
              </div>
            </>
          ) : (
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">
                과거 포스팅 텍스트 (구분자: --- 빈 줄)
              </label>
              <textarea
                className="input w-full h-64 font-mono text-sm"
                value={postsText}
                onChange={e => setPostsText(e.target.value)}
                placeholder={'포스팅 1 내용\n---\n포스팅 2 내용\n---\n포스팅 3 내용'}
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {postsText.split('\n---\n').filter(Boolean).length}개 입력됨 (최소 5개 권장)
              </p>
            </div>
          )}
          {error && <p className="text-rose-500 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button className="button-secondary flex-1" onClick={() => setStep(1)}>이전</button>
            <button className="button-primary flex-1" onClick={handleAnalyze} disabled={loading}>
              {loading ? 'AI 분석 중...' : 'AI 분석 시작'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && analysis && (
        <div className="card space-y-4">
          <h2 className="section-title">Step 3 — 페르소나 프리뷰</h2>
          <div className="soft-card p-4 space-y-3">
            {[
              ['브랜드 컨셉', analysis.brandConcept as string],
              ['타겟 오디언스', analysis.targetAudience as string],
              ['글쓰기 스타일', analysis.writingStyle as string],
              ['톤', analysis.tone as string],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-[var(--text-muted)]">{label}</p>
                <p className="text-sm text-[var(--text-strong)]">{value}</p>
              </div>
            ))}
            <div>
              <p className="text-xs text-[var(--text-muted)]">키워드</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {(analysis.keywords as string[]).map(kw => (
                  <span key={kw} className="pill-option text-xs">{kw}</span>
                ))}
              </div>
            </div>
          </div>
          <button className="button-primary w-full" onClick={() => router.push('/sns/personas')}>
            완료 — 페르소나 목록으로
          </button>
        </div>
      )}
    </div>
  )
}
