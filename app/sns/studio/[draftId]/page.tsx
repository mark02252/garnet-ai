'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Slide = { title: string; body: string; imagePrompt: string; imageUrl?: string }

export default function CarouselEditorPage() {
  const { draftId } = useParams<{ draftId: string }>()
  const router = useRouter()
  const [slides, setSlides] = useState<Slide[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/sns/content/${draftId}`)
      .then(r => r.json())
      .then(data => {
        if (data.slides) {
          try { setSlides(JSON.parse(data.slides)) } catch { setSlides([]) }
        }
        setLoading(false)
      })
  }, [draftId])

  async function generateImage(idx: number) {
    const slide = slides[idx]
    if (!slide?.imagePrompt) return
    setGeneratingIdx(idx)
    try {
      const res = await fetch(`/api/sns/content/${draftId}/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slideIndex: idx, imagePrompt: slide.imagePrompt }),
      })
      const { url } = await res.json()
      setSlides(prev => prev.map((s, i) => i === idx ? { ...s, imageUrl: url } : s))
    } finally {
      setGeneratingIdx(null)
    }
  }

  async function save() {
    setSaving(true)
    await fetch(`/api/sns/content/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides: JSON.stringify(slides) }),
    })
    setSaving(false)
    router.push('/sns/studio')
  }

  if (loading) return <div className="p-6 text-[var(--text-muted)]">불러오는 중...</div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="dashboard-eyebrow">SNS 스튜디오 · 콘텐츠 제작소</p>
          <h1 className="dashboard-title">카드뉴스 편집</h1>
        </div>
        <div className="flex gap-2">
          <button className="button-secondary" onClick={() => router.back()}>취소</button>
          <button className="button-primary" onClick={save} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {slides.map((slide, idx) => (
          <div key={idx} className="card">
            <div className="flex items-center gap-2 mb-3">
              <span className="accent-pill text-xs">슬라이드 {idx + 1}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[var(--text-muted)] block mb-1">제목</label>
                  <input className="input w-full" value={slide.title}
                    onChange={e => setSlides(prev => prev.map((s, i) => i === idx ? { ...s, title: e.target.value } : s))} />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)] block mb-1">본문</label>
                  <textarea className="input w-full min-h-[80px]" value={slide.body}
                    onChange={e => setSlides(prev => prev.map((s, i) => i === idx ? { ...s, body: e.target.value } : s))} />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)] block mb-1">이미지 프롬프트 (영문)</label>
                  <input className="input w-full text-sm font-mono" value={slide.imagePrompt}
                    onChange={e => setSlides(prev => prev.map((s, i) => i === idx ? { ...s, imagePrompt: e.target.value } : s))} />
                </div>
                <button className="button-secondary text-sm w-full" onClick={() => generateImage(idx)}
                  disabled={generatingIdx === idx}>
                  {generatingIdx === idx ? '나노바나나 생성 중...' : '이미지 생성'}
                </button>
              </div>
              <div className="flex items-center justify-center bg-[var(--surface-sub)] rounded-lg min-h-[200px]">
                {slide.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={slide.imageUrl} alt={`slide ${idx + 1}`} className="max-w-full max-h-[240px] rounded object-contain" />
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">이미지 없음</p>
                )}
              </div>
            </div>
          </div>
        ))}
        {slides.length === 0 && (
          <div className="soft-card text-center py-12">
            <p className="text-[var(--text-muted)]">슬라이드가 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}
