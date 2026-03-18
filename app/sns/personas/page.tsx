'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'

type Persona = {
  id: string
  name: string
  platform: string
  learnMode: string
  brandConcept: string | null
  tone: string | null
  keywords: string
  isActive: boolean
  createdAt: string
  instagramHandle?: string | null
  _count?: { contentDrafts: number }
}

const PLATFORM_LABEL: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  THREADS: 'Threads',
  X: 'X (Twitter)',
  YOUTUBE: 'YouTube',
}

const PLATFORM_FILTERS = [
  { value: '', label: '전체' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'THREADS', label: 'Threads' },
  { value: 'X', label: 'X' },
  { value: 'YOUTUBE', label: 'YouTube' },
] as const

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')

  useEffect(() => {
    fetch('/api/sns/personas')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => Array.isArray(data) ? setPersonas(data) : void 0)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return personas.filter(p => {
      if (platformFilter && p.platform !== platformFilter) return false
      if (!q) return true
      const keywords: string[] = (() => { try { return JSON.parse(p.keywords) as string[] } catch { return [] } })()
      return (
        p.name.toLowerCase().includes(q) ||
        keywords.some(kw => kw.toLowerCase().includes(q))
      )
    })
  }, [personas, search, platformFilter])

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 페르소나를 삭제하시겠습니까?`)) return
    const res = await fetch(`/api/sns/personas/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setPersonas(prev => prev.filter(p => p.id !== id))
    } else {
      alert('삭제에 실패했습니다.')
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="dashboard-eyebrow">SNS 스튜디오</p>
          <h1 className="dashboard-title">페르소나</h1>
        </div>
        <Link href="/sns/personas/new" className="button-primary">+ 새 페르소나</Link>
      </div>

      {/* Search & Platform Filter */}
      <div className="mb-6 space-y-3">
        <input
          type="text"
          className="input w-full"
          placeholder="이름 또는 키워드로 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {PLATFORM_FILTERS.map(f => (
            <button
              key={f.value}
              className={platformFilter === f.value ? 'accent-pill text-xs' : 'pill-option text-xs'}
              onClick={() => setPlatformFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-[var(--text-muted)]">불러오는 중...</p>
      ) : personas.length === 0 ? (
        <EmptyState icon="👤" title="페르소나가 없습니다" actionLabel="새 페르소나 만들기" actionHref="/sns/personas/new" />
      ) : filtered.length === 0 ? (
        <p className="text-[var(--text-muted)]">검색 결과가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(p => {
            const keywords = (() => { try { return JSON.parse(p.keywords) as string[] } catch { return [] } })()
            return (
              <div key={p.id} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="section-title">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-[var(--text-muted)]">{PLATFORM_LABEL[p.platform]}</p>
                      {p.instagramHandle ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-600/20 text-green-400">연결됨</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-600/20 text-gray-400">미연결</span>
                      )}
                    </div>
                  </div>
                  <span className="accent-pill text-xs">{p._count?.contentDrafts ?? 0}개 초안</span>
                </div>
                {p.brandConcept && (
                  <p className="text-sm text-[var(--text-base)] mb-3 line-clamp-2">{p.brandConcept}</p>
                )}
                <div className="flex flex-wrap gap-1 mb-4">
                  {keywords.slice(0, 4).map((kw: string) => (
                    <span key={kw} className="pill-option text-xs">{kw}</span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Link href={`/sns/studio?personaId=${p.id}`} className="button-primary text-sm flex-1 text-center">
                    콘텐츠 제작
                  </Link>
                  <Link href={`/sns/personas/${p.id}`} className="button-secondary text-sm">편집</Link>
                  <button
                    onClick={() => handleDelete(p.id, p.name)}
                    className="button-secondary text-sm text-red-400 hover:text-red-300"
                  >
                    삭제
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
