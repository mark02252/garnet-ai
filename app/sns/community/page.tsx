'use client'

import { useState, useEffect } from 'react'

type Comment = { id: string; text: string; username: string; timestamp: string }
type Reply = { commentId: string; username: string; originalText: string; reply: string }
type Persona = { id: string; name: string }

export default function CommunityPage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [personaId, setPersonaId] = useState('')
  const [mediaId, setMediaId] = useState('')
  const [comments, setComments] = useState<Comment[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [replies, setReplies] = useState<Map<string, string>>(new Map())
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sns/personas').then(r => r.json()).then((data: Persona[]) => {
      setPersonas(data)
      if (data.length > 0) setPersonaId(data[0].id)
    })
  }, [])

  async function loadComments() {
    if (!mediaId.trim()) return
    const res = await fetch(`/api/sns/community/comments?mediaId=${mediaId}`)
    const data = await res.json()
    setComments(data.data || [])
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

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="dashboard-eyebrow">SNS 스튜디오</p>
        <h1 className="dashboard-title">커뮤니티</h1>
      </div>

      {/* 컨트롤 */}
      <div className="card mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1">페르소나</label>
          <select className="input" value={personaId} onChange={e => setPersonaId(e.target.value)}>
            {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1">포스팅 ID (Media ID)</label>
          <input className="input" value={mediaId} onChange={e => setMediaId(e.target.value)} placeholder="17896..." />
        </div>
        <button className="button-secondary" onClick={loadComments}>댓글 불러오기</button>
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

      {comments.length === 0 && (
        <div className="soft-card text-center py-12">
          <p className="text-[var(--text-muted)]">포스팅 ID를 입력하고 댓글을 불러오세요.</p>
        </div>
      )}
    </div>
  )
}
