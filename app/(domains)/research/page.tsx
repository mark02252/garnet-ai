'use client'

import { useState, useEffect, useCallback } from 'react'

type ResearchItem = {
  id: string
  title: string
  content: string | null
  url: string | null
  type: 'external' | 'internal'
  tags: string[]
  source: string | null
  savedAt: string
}

type FormState = {
  title: string
  content: string
  url: string
  type: 'external' | 'internal'
  tags: string
  source: string
}

const EMPTY_FORM: FormState = {
  title: '', content: '', url: '', type: 'external', tags: '', source: ''
}

export default function ResearchPage() {
  const [items, setItems] = useState<ResearchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'external' | 'internal'>('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<ResearchItem | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [fetchingMeta, setFetchingMeta] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (typeFilter !== 'all') params.set('type', typeFilter)
      const res = await fetch(`/api/research?${params.toString()}`)
      const data = await res.json()
      setItems(data.items || [])
    } finally {
      setLoading(false)
    }
  }, [q, typeFilter])

  useEffect(() => { fetchItems() }, [fetchItems])

  async function handleFetchMeta() {
    if (!form.url) return
    setFetchingMeta(true)
    try {
      const res = await fetch('/api/research/fetch-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: form.url }),
      })
      const meta = await res.json()
      if (meta.title) setForm((f) => ({ ...f, title: f.title || meta.title, content: f.content || meta.description || '' }))
    } finally {
      setFetchingMeta(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim() || undefined,
        url: form.url.trim() || undefined,
        type: form.type,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        source: form.source.trim() || undefined,
      }

      if (editing) {
        await fetch(`/api/research/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetch('/api/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      setShowModal(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      fetchItems()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/research/${id}`, { method: 'DELETE' })
    fetchItems()
  }

  function openEdit(item: ResearchItem) {
    setEditing(item)
    setForm({
      title: item.title,
      content: item.content || '',
      url: item.url || '',
      type: item.type,
      tags: item.tags.join(', '),
      source: item.source || '',
    })
    setShowModal(true)
  }

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">리서치 메모리</h1>
          <p className="text-sm text-zinc-400 mt-1">외부 아티클 · 트렌드 · 내부 인사이트 저장소</p>
        </div>
        <button
          onClick={openNew}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-colors"
        >
          + 새 항목 추가
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <input
          type="text"
          placeholder="검색..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 min-w-48 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
        />
        {(['all', 'external', 'internal'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${
              typeFilter === t
                ? 'bg-cyan-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700'
            }`}
          >
            {t === 'all' ? '전체' : t === 'external' ? '외부' : '내부'}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center text-zinc-500 py-16">로딩 중...</div>
      ) : items.length === 0 ? (
        <div className="text-center text-zinc-500 py-16">
          저장된 항목이 없습니다. 아티클이나 인사이트를 추가해보세요.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      item.type === 'external'
                        ? 'bg-blue-900/50 text-blue-300'
                        : 'bg-purple-900/50 text-purple-300'
                    }`}>
                      {item.type === 'external' ? '외부' : '내부'}
                    </span>
                    {item.source && (
                      <span className="text-xs text-zinc-500">{item.source}</span>
                    )}
                    <span className="text-xs text-zinc-600">
                      {new Date(item.savedAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  <h3 className="text-white font-medium text-sm leading-snug">
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 transition-colors">
                        {item.title}
                      </a>
                    ) : item.title}
                  </h3>
                  {item.content && (
                    <p className="text-zinc-400 text-xs mt-1 line-clamp-2">{item.content}</p>
                  )}
                  {item.tags.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {item.tags.map((tag) => (
                        <span key={tag} className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(item)}
                    className="text-xs px-2 py-1 text-zinc-500 hover:text-white transition-colors"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-xs px-2 py-1 text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg p-6">
            <h2 className="text-white font-semibold mb-4">
              {editing ? '항목 수정' : '새 항목 추가'}
            </h2>

            <div className="space-y-3">
              {/* URL */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">URL (선택)</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://..."
                    value={form.url}
                    onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                    className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={handleFetchMeta}
                    disabled={!form.url || fetchingMeta}
                    className="px-3 py-2 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {fetchingMeta ? '...' : '제목 가져오기'}
                  </button>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">제목 *</label>
                <input
                  type="text"
                  placeholder="제목을 입력하세요"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Content */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">내용/요약 (선택)</label>
                <textarea
                  placeholder="내용이나 메모를 입력하세요"
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>

              {/* Type + Source */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-zinc-400 mb-1 block">타입</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'external' | 'internal' }))}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="external">외부</option>
                    <option value="internal">내부</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-zinc-400 mb-1 block">출처 (선택)</label>
                  <input
                    type="text"
                    placeholder="예: Instagram Blog"
                    value={form.source}
                    onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">태그 (쉼표로 구분)</label>
                <input
                  type="text"
                  placeholder="릴스, 알고리즘, 2026"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5 justify-end">
              <button
                onClick={() => { setShowModal(false); setEditing(null); setForm(EMPTY_FORM) }}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={!form.title.trim() || saving}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
              >
                {saving ? '저장 중...' : editing ? '수정 완료' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
