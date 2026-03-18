'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { loadStoredMetaConnectionDraft } from '@/lib/meta-connection-storage'

type Draft = {
  id: string; type: string; title: string | null; content: string | null
  slides: string | null; status: string; createdAt: string
  persona?: { name: string } | null
}
type Persona = { id: string; name: string }

function StudioContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initPersonaId = searchParams.get('personaId') || ''

  const [personas, setPersonas] = useState<Persona[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [personaId, setPersonaId] = useState(initPersonaId)
  const [type, setType] = useState<'TEXT' | 'CAROUSEL'>('TEXT')
  const [prompt, setPrompt] = useState('')
  const [slideCount, setSlideCount] = useState(5)
  const [generating, setGenerating] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [publishingId, setPublishingId] = useState<string | null>(null)

  const STATUS_FILTERS = [
    { key: 'ALL', label: '전체' },
    { key: 'DRAFT', label: '초안' },
    { key: 'SCHEDULED', label: '예약됨' },
    { key: 'PUBLISHED', label: '발행됨' },
  ] as const

  const loadDrafts = useCallback(() => {
    const url = personaId ? `/api/sns/content?personaId=${personaId}` : '/api/sns/content'
    fetch(url).then(r => r.json()).then(setDrafts)
  }, [personaId])

  useEffect(() => {
    fetch('/api/sns/personas').then(r => r.json()).then(setPersonas)
  }, [])

  useEffect(() => { loadDrafts() }, [loadDrafts])

  const filteredDrafts = statusFilter === 'ALL'
    ? drafts
    : drafts.filter(d => d.status === statusFilter)

  async function publishDraft(draftId: string) {
    setPublishingId(draftId)
    try {
      const { value: conn } = await loadStoredMetaConnectionDraft(window.location.origin)
      const res = await fetch(`/api/sns/content/${draftId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: conn.accessToken,
          businessAccountId: conn.instagramBusinessAccountId,
        }),
      })
      if (!res.ok) throw new Error('발행 실패')
      loadDrafts()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '발행 중 오류가 발생했습니다')
    } finally {
      setPublishingId(null)
    }
  }

  async function generate() {
    if (!prompt.trim()) return
    setGenerating(true)
    try {
      const res = await fetch('/api/sns/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: personaId || null, type, prompt, slideCount }),
      })
      const draft = await res.json()
      setDrafts(prev => [draft, ...prev])
      setPrompt('')
      if (type === 'CAROUSEL') router.push(`/sns/studio/${draft.id}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="dashboard-eyebrow">SNS 스튜디오</p>
          <h1 className="dashboard-title">콘텐츠 제작소</h1>
        </div>
      </div>

      {/* 생성 패널 */}
      <div className="card mb-6 space-y-4">
        <div className="flex gap-3 flex-wrap">
          <select className="input" value={personaId} onChange={e => setPersonaId(e.target.value)}>
            <option value="">페르소나 없음</option>
            {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex gap-1">
            {(['TEXT', 'CAROUSEL'] as const).map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`pill-option ${type === t ? 'bg-[var(--accent)] text-white' : ''}`}>
                {t === 'TEXT' ? '텍스트' : '카드뉴스'}
              </button>
            ))}
          </div>
          {type === 'CAROUSEL' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text-muted)]">슬라이드</span>
              <input type="number" className="input w-16" min={3} max={10} value={slideCount}
                onChange={e => setSlideCount(Number(e.target.value))} />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <input className="input flex-1" value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder={type === 'TEXT' ? '오늘의 마케팅 팁을 작성해줘' : '상위 1% 마케터의 5가지 비밀'}
            onKeyDown={e => e.key === 'Enter' && generate()} />
          <button className="button-primary px-6" onClick={generate} disabled={generating}>
            {generating ? '생성 중...' : '생성'}
          </button>
        </div>
      </div>

      {/* 상태 필터 */}
      <div className="flex gap-1 mb-4">
        {STATUS_FILTERS.map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            className={`pill-option ${statusFilter === f.key ? 'bg-[var(--accent)] text-white' : ''}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* 초안 목록 */}
      <div className="space-y-3">
        {filteredDrafts.map(d => {
          const slides = d.slides ? (() => { try { return JSON.parse(d.slides) as unknown[] } catch { return [] } })() : []
          const preview = d.type === 'CAROUSEL'
            ? `${slides.length}장 슬라이드`
            : d.content
              ? d.content.length > 60 ? d.content.slice(0, 60) + '…' : d.content
              : null
          return (
            <div key={d.id} className="card flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="accent-pill text-xs">{d.type === 'TEXT' ? '텍스트' : '카드뉴스'}</span>
                  {d.persona && <span className="text-xs text-[var(--text-muted)]">{d.persona.name}</span>}
                  <span className={`text-xs ${d.status === 'PUBLISHED' ? 'text-emerald-600' : 'text-[var(--text-muted)]'}`}>{d.status}</span>
                </div>
                <p className="text-sm font-medium truncate">{d.title || '제목 없음'}</p>
                {preview && <p className="text-xs text-[var(--text-muted)] line-clamp-2 mt-1">{preview}</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                {d.type === 'CAROUSEL' && (
                  <button className="button-secondary text-xs" onClick={() => router.push(`/sns/studio/${d.id}`)}>편집</button>
                )}
                {(d.status === 'DRAFT' || d.status === 'SCHEDULED') && (
                  <button className="button-primary text-xs" disabled={publishingId === d.id}
                    onClick={() => publishDraft(d.id)}>
                    {publishingId === d.id ? '발행 중...' : '발행'}
                  </button>
                )}
                <button className="button-secondary text-xs"
                  onClick={() => router.push(`/sns/calendar?draftId=${d.id}`)}>예약</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function StudioPage() {
  return <Suspense><StudioContent /></Suspense>
}
