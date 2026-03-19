'use client'

import { useState, useEffect } from 'react'
import { loadStoredMetaConnectionDraft } from '@/lib/meta-connection-storage'
import { EmptyState } from '@/components/empty-state'

type Comment = { id: string; text: string; username: string; timestamp: string }
type Reply = { commentId: string; username: string; originalText: string; reply: string }
type Persona = { id: string; name: string }
type MediaItem = { id: string; timestamp: string; caption?: string; media_type?: string; comments_count?: number }

export default function CommunityPage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [personaId, setPersonaId] = useState('')
  const [mediaList, setMediaList] = useState<MediaItem[]>([])
  const [selectedMediaId, setSelectedMediaId] = useState('')
  const [mediaId, setMediaId] = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [replies, setReplies] = useState<Map<string, string>>(new Map())
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [loadingMedia, setLoadingMedia] = useState(false)

  useEffect(() => {
    fetch('/api/sns/personas').then(r => r.json()).then((data: Persona[]) => {
      setPersonas(data)
      if (data.length > 0) setPersonaId(data[0].id)
    })
  }, [])

  // Fetch recent media list on mount
  useEffect(() => {
    void (async () => {
      setLoadingMedia(true)
      try {
        const draft = await loadStoredMetaConnectionDraft(window.location.origin)
        const accessToken = draft.value.accessToken || ''
        const businessAccountId = draft.value.instagramBusinessAccountId || ''
        if (!accessToken || !businessAccountId) {
          setLoadingMedia(false)
          return
        }
        const res = await fetch(`/api/sns/community/media`)
        if (res.ok) {
          const data = await res.json()
          setMediaList(data.data || [])
        }
      } catch {
        // silently fail — user can use manual input
      }
      setLoadingMedia(false)
    })()
  }, [])

  // Auto-load comments when a media is selected from the dropdown
  useEffect(() => {
    if (selectedMediaId) {
      loadCommentsFor(selectedMediaId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMediaId])

  async function loadCommentsFor(id: string) {
    if (!id.trim()) return
    const res = await fetch(`/api/sns/community/comments?mediaId=${id}`)
    const data = await res.json()
    setComments(data.data || [])
    setSelected(new Set())
    setReplies(new Map())
  }

  async function loadComments() {
    if (!mediaId.trim()) return
    await loadCommentsFor(mediaId)
  }

  async function generateReplies() {
    if (!personaId || selected.size === 0) return
    setGenerating(true)
    const selectedComments = comments.filter(c => selected.has(c.id))
    const res = await fetch('/api/sns/community/comments/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personaId, comments: selectedComments }),
    })
    const data: Reply[] = await res.json()
    const newReplies = new Map(replies)
    data.forEach(r => newReplies.set(r.commentId, r.reply))
    setReplies(newReplies)
    setGenerating(false)
  }

  async function publishReply(commentId: string) {
    const text = replies.get(commentId)
    if (!text) return
    setPublishing(commentId)
    await fetch(`/api/sns/community/comments/${commentId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    setPublishing(null)
    setComments(prev => prev.filter(c => c.id !== commentId))
    const newReplies = new Map(replies)
    newReplies.delete(commentId)
    setReplies(newReplies)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function formatMediaLabel(m: MediaItem) {
    const caption = m.caption ? m.caption.slice(0, 40) : '(캡션 없음)'
    const date = new Date(m.timestamp).toLocaleDateString()
    const type = m.media_type ?? ''
    const commentCount = m.comments_count ?? 0
    return `${caption} · ${date} · ${type} · 댓글 ${commentCount}개`
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="dashboard-eyebrow">SNS 스튜디오</p>
        <h1 className="dashboard-title">커뮤니티</h1>
      </div>

      {/* 컨트롤 */}
      <div className="card mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">페르소나</label>
            <select className="input" value={personaId} onChange={e => setPersonaId(e.target.value)}>
              {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-[var(--text-muted)] block mb-1">최근 포스팅</label>
            {loadingMedia ? (
              <p className="text-xs text-[var(--text-muted)] py-2">미디어 불러오는 중...</p>
            ) : mediaList.length > 0 ? (
              <select
                className="input w-full"
                value={selectedMediaId}
                onChange={e => setSelectedMediaId(e.target.value)}
              >
                <option value="">포스팅을 선택하세요</option>
                {mediaList.map(m => (
                  <option key={m.id} value={m.id}>{formatMediaLabel(m)}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-[var(--text-muted)] py-2">
                연동된 미디어가 없습니다. 아래 직접 입력을 사용하세요.
              </p>
            )}
          </div>
        </div>

        {/* 직접 입력 (collapsed fallback) */}
        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-base)]">
            직접 입력
          </summary>
          <div className="flex flex-wrap gap-3 items-end mt-2">
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">포스팅 ID (Media ID)</label>
              <input className="input" value={mediaId} onChange={e => setMediaId(e.target.value)} placeholder="17896..." />
            </div>
            <button className="button-secondary" onClick={loadComments}>댓글 불러오기</button>
          </div>
        </details>
      </div>

      {/* 댓글 목록 */}
      {comments.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox"
                checked={selected.size === comments.length}
                onChange={e => setSelected(e.target.checked ? new Set(comments.map(c => c.id)) : new Set())}
              />
              전체 선택 ({selected.size}/{comments.length})
            </label>
            <button className="button-primary text-sm" onClick={generateReplies}
              disabled={generating || selected.size === 0}>
              {generating ? 'AI 생성 중...' : `선택 항목 일괄 AI 답변 생성 (${selected.size})`}
            </button>
          </div>

          <div className="space-y-3">
            {comments.map(c => (
              <div key={c.id} className={`card ${selected.has(c.id) ? 'border-[var(--accent)]' : ''}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">@{c.username}</span>
                      <span className="text-xs text-[var(--text-muted)]">{new Date(c.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-[var(--text-base)] mb-2">{c.text}</p>
                    {replies.has(c.id) && (
                      <div className="bg-[var(--surface-sub)] rounded p-2 mb-2">
                        <p className="text-xs text-[var(--text-muted)] mb-1">AI 답변 초안</p>
                        <textarea
                          className="input w-full text-sm min-h-[60px]"
                          value={replies.get(c.id) || ''}
                          onChange={e => {
                            const next = new Map(replies)
                            next.set(c.id, e.target.value)
                            setReplies(next)
                          }}
                        />
                        <button
                          className="button-primary text-xs mt-2"
                          onClick={() => publishReply(c.id)}
                          disabled={publishing === c.id}
                        >
                          {publishing === c.id ? '발행 중...' : '발행'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {comments.length === 0 && !selectedMediaId && !mediaId && (
        <EmptyState icon="💬" title="포스팅을 선택하면 댓글을 자동으로 불러옵니다" />
      )}
      {comments.length === 0 && (selectedMediaId || mediaId) && (
        <EmptyState icon="📭" title="이 게시물의 댓글을 불러올 수 없습니다." description="댓글 관리 기능은 Facebook 연동 후 사용할 수 있습니다." />
      )}
    </div>
  )
}
