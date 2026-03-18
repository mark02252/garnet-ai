'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Slide = { title: string; body: string; imagePrompt: string; imageUrl?: string }
type DraftData = {
  id: string; type: string; title: string | null; content: string | null;
  slides: string | null; status: string
}

type AspectRatio = '1:1' | '4:5' | '9:16'

const ASPECT_RATIO_CSS: Record<AspectRatio, string> = {
  '1:1': '1/1',
  '4:5': '4/5',
  '9:16': '9/16',
}

const ASPECT_RATIO_LABELS: Record<AspectRatio, string> = {
  '1:1': '1:1 (피드)',
  '4:5': '4:5 (세로)',
  '9:16': '9:16 (릴스/스토리)',
}

const DEFAULT_HASHTAGS = [
  '#인스타그램', '#소통', '#일상', '#팔로우', '#좋아요',
  '#daily', '#instadaily', '#instagood', '#follow', '#like4like',
]

export default function DraftEditorPage() {
  const { draftId } = useParams<{ draftId: string }>()
  const router = useRouter()
  const [draft, setDraft] = useState<DraftData | null>(null)
  const [slides, setSlides] = useState<Slide[]>([])
  const [textContent, setTextContent] = useState('')
  const [textTitle, setTextTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [generatingAll, setGeneratingAll] = useState(false)
  const [captionOpen, setCaptionOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/sns/content/${draftId}`)
      .then(r => r.json())
      .then((data: DraftData) => {
        setDraft(data)
        setTextTitle(data.title || '')
        if (data.type === 'CAROUSEL' && data.slides) {
          try { setSlides(JSON.parse(data.slides)) } catch { setSlides([]) }
        }
        if (data.type === 'TEXT') {
          setTextContent(data.content || '')
        }
        setLoading(false)
      })
  }, [draftId])

  /* Feature 2: Slide reorder */
  function moveSlide(from: number, direction: 'up' | 'down') {
    const to = direction === 'up' ? from - 1 : from + 1
    if (to < 0 || to >= slides.length) return
    setSlides(prev => {
      const next = [...prev]
      ;[next[from], next[to]] = [next[to], next[from]]
      return next
    })
  }

  /* Feature 3: Add/delete slides */
  function addSlide() {
    setSlides(prev => [...prev, { title: '', body: '', imagePrompt: '' }])
  }

  function deleteSlide(idx: number) {
    if (!confirm(`슬라이드 ${idx + 1}을(를) 삭제하시겠습니까?`)) return
    setSlides(prev => prev.filter((_, i) => i !== idx))
  }

  /* Image generation (updated to include aspect ratio) */
  async function generateImage(idx: number) {
    const slide = slides[idx]
    if (!slide?.imagePrompt) return
    setGeneratingIdx(idx)
    try {
      const promptWithRatio = `${slide.imagePrompt}, aspect ratio ${aspectRatio}, Instagram post format`
      const res = await fetch(`/api/sns/content/${draftId}/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slideIndex: idx, imagePrompt: promptWithRatio }),
      })
      const { url } = await res.json()
      setSlides(prev => prev.map((s, i) => i === idx ? { ...s, imageUrl: url } : s))
    } finally {
      setGeneratingIdx(null)
    }
  }

  /* Feature 4: Bulk image generation */
  async function generateAllImages() {
    setGeneratingAll(true)
    try {
      for (let i = 0; i < slides.length; i++) {
        if (!slides[i].imageUrl && slides[i].imagePrompt) {
          await generateImage(i)
        }
      }
    } finally {
      setGeneratingAll(false)
    }
  }

  /* Feature 5: Caption preview */
  function buildCaption(): string {
    return slides.map(s => {
      const parts: string[] = []
      if (s.title) parts.push(s.title)
      if (s.body) parts.push(s.body)
      return parts.join('\n')
    }).filter(Boolean).join('\n\n')
  }

  /* Feature 6: Auto hashtag insertion */
  function insertAutoHashtags() {
    if (slides.length === 0) return
    const topicWords = (textTitle || '').split(/\s+/).filter(Boolean)
    const topicTags = topicWords
      .filter(w => w.length >= 2)
      .slice(0, 5)
      .map(w => `#${w.replace(/^#/, '')}`)
    const tags = [...new Set([...topicTags, ...DEFAULT_HASHTAGS])].slice(0, 15)
    const tagStr = '\n\n' + tags.join(' ')
    const lastIdx = slides.length - 1
    setSlides(prev => prev.map((s, i) => {
      if (i !== lastIdx) return s
      // Avoid appending duplicate hashtag block
      const body = s.body.replace(/\n\n#[\s\S]*$/, '')
      return { ...s, body: body + tagStr }
    }))
  }

  async function save() {
    setSaving(true)
    const body: Record<string, unknown> = { title: textTitle }
    if (draft?.type === 'CAROUSEL') {
      body.slides = JSON.stringify(slides)
    } else {
      body.content = textContent
    }
    await fetch(`/api/sns/content/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    router.push('/sns/studio')
  }

  if (loading) return <div className="p-6 text-[var(--text-muted)]">불러오는 중...</div>

  const isCarousel = draft?.type === 'CAROUSEL'
  const caption = buildCaption()
  const captionLen = caption.length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="dashboard-eyebrow">SNS 스튜디오 · 콘텐츠 제작소</p>
          <h1 className="dashboard-title">{isCarousel ? '카드뉴스 편집' : '텍스트 콘텐츠 편집'}</h1>
        </div>
        <div className="flex gap-2">
          <button className="button-secondary" onClick={() => router.back()}>취소</button>
          <button className="button-primary" onClick={save} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* Feature 1: Aspect ratio selector */}
      {isCarousel && (
        <div className="card mb-4">
          <label className="text-xs text-[var(--text-muted)] block mb-2">이미지 비율</label>
          <div className="flex gap-2">
            {(Object.keys(ASPECT_RATIO_LABELS) as AspectRatio[]).map(ratio => (
              <button
                key={ratio}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  aspectRatio === ratio
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface-sub)] text-[var(--text-muted)] hover:bg-[var(--surface-sub-hover)]'
                }`}
                onClick={() => setAspectRatio(ratio)}
              >
                {ASPECT_RATIO_LABELS[ratio]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Feature 4: Bulk image generation button */}
      {isCarousel && slides.length > 0 && (
        <div className="mb-4">
          <button
            className="button-secondary text-sm w-full"
            onClick={generateAllImages}
            disabled={generatingAll || generatingIdx !== null}
          >
            {generatingAll ? '모든 슬라이드 이미지 생성 중...' : '모든 슬라이드 이미지 생성'}
          </button>
        </div>
      )}

      {/* 제목 */}
      <div className="card mb-4">
        <label className="text-xs text-[var(--text-muted)] block mb-1">제목</label>
        <input className="input w-full" value={textTitle}
          onChange={e => setTextTitle(e.target.value)} />
      </div>

      {/* 텍스트형 */}
      {!isCarousel && (
        <div className="card">
          <label className="text-xs text-[var(--text-muted)] block mb-1">본문</label>
          <textarea
            className="input w-full min-h-[300px] text-sm leading-relaxed"
            value={textContent}
            onChange={e => setTextContent(e.target.value)}
          />
          <p className="text-xs text-[var(--text-muted)] mt-2">{textContent.length}자</p>
        </div>
      )}

      {/* 캐러셀형 */}
      {isCarousel && (
        <div className="space-y-4">
          {slides.map((slide, idx) => (
            <div key={idx} className="card">
              <div className="flex items-center gap-2 mb-3">
                <span className="accent-pill text-xs">슬라이드 {idx + 1}</span>
                {/* Feature 2: Reorder buttons */}
                <button
                  className="px-1.5 py-0.5 text-xs rounded bg-[var(--surface-sub)] text-[var(--text-muted)] hover:bg-[var(--surface-sub-hover)] disabled:opacity-30"
                  onClick={() => moveSlide(idx, 'up')}
                  disabled={idx === 0}
                  title="위로 이동"
                >&#9650;</button>
                <button
                  className="px-1.5 py-0.5 text-xs rounded bg-[var(--surface-sub)] text-[var(--text-muted)] hover:bg-[var(--surface-sub-hover)] disabled:opacity-30"
                  onClick={() => moveSlide(idx, 'down')}
                  disabled={idx === slides.length - 1}
                  title="아래로 이동"
                >&#9660;</button>
                <div className="flex-1" />
                {/* Feature 3: Delete slide button */}
                <button
                  className="px-2 py-0.5 text-xs rounded bg-red-500/10 text-red-500 hover:bg-red-500/20"
                  onClick={() => deleteSlide(idx)}
                >삭제</button>
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
                    <textarea className="input w-full min-h-[120px] text-sm leading-relaxed" value={slide.body}
                      onChange={e => setSlides(prev => prev.map((s, i) => i === idx ? { ...s, body: e.target.value } : s))} />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] block mb-1">이미지 프롬프트 (영문)</label>
                    <input className="input w-full text-sm font-mono" value={slide.imagePrompt}
                      onChange={e => setSlides(prev => prev.map((s, i) => i === idx ? { ...s, imagePrompt: e.target.value } : s))} />
                  </div>
                  <button className="button-secondary text-sm w-full" onClick={() => generateImage(idx)}
                    disabled={generatingIdx === idx || generatingAll}>
                    {generatingIdx === idx ? '이미지 생성 중...' : '이미지 생성'}
                  </button>
                </div>
                {/* Image preview with aspect ratio */}
                <div
                  className="flex items-center justify-center bg-[var(--surface-sub)] rounded-lg min-h-[200px] overflow-hidden"
                  style={{ aspectRatio: ASPECT_RATIO_CSS[aspectRatio] }}
                >
                  {slide.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={slide.imageUrl} alt={`slide ${idx + 1}`} className="w-full h-full rounded object-cover" />
                  ) : (
                    <p className="text-xs text-[var(--text-muted)]">이미지 없음</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Feature 3: Add slide button */}
          <button
            className="button-secondary text-sm w-full py-3"
            onClick={addSlide}
          >+ 슬라이드 추가</button>

          {slides.length === 0 && (
            <div className="soft-card text-center py-12">
              <p className="text-[var(--text-muted)]">슬라이드가 없습니다.</p>
            </div>
          )}

          {/* Feature 5: Caption preview */}
          {slides.length > 0 && (
            <div className="card">
              <button
                className="flex items-center justify-between w-full text-left"
                onClick={() => setCaptionOpen(prev => !prev)}
              >
                <span className="text-xs font-medium text-[var(--text-muted)]">
                  캡션 미리보기 ({captionLen}/2200자)
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {captionOpen ? '▲ 접기' : '▼ 펼치기'}
                </span>
              </button>
              {captionOpen && (
                <div className="mt-3">
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed bg-[var(--surface-sub)] rounded-lg p-4 max-h-[300px] overflow-y-auto">
                    {caption || '(캡션 내용이 없습니다)'}
                  </pre>
                  {captionLen > 2200 && (
                    <p className="text-xs text-red-500 mt-2">
                      Instagram 캡션 제한(2200자)을 초과했습니다. ({captionLen - 2200}자 초과)
                    </p>
                  )}
                  {/* Feature 6: Auto hashtag button */}
                  <button
                    className="button-secondary text-sm mt-3"
                    onClick={insertAutoHashtags}
                  >해시태그 자동 추가</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
