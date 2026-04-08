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

  const PLATFORM_COLORS: Record<string, string> = {
    INSTAGRAM: '#e1306c',
    THREADS: '#000000',
    X: '#1da1f2',
    YOUTUBE: '#ff0000',
  }

  const PLATFORM_ICONS: Record<string, string> = {
    INSTAGRAM: 'IG',
    THREADS: 'TH',
    X: 'X',
    YOUTUBE: 'YT',
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Hero */}
      <header className="ops-zone">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="ops-zone-label">Personas</p>
            <h1 className="mt-1 text-lg font-bold tracking-tight text-[var(--text-strong)]">페르소나</h1>
            <p className="text-[12px] text-[var(--text-muted)]">채널별 브랜드 목소리를 페르소나로 정의하고 콘텐츠 생성에 적용합니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/sns/personas/new" className="button-primary">+ 새 페르소나</Link>
          </div>
        </div>
      </header>

      {/* Search & Platform Filter */}
      <div className="soft-card space-y-3">
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
        <div className="soft-card text-center py-16">
          <div className="text-5xl mb-4">👤</div>
          <p className="text-lg font-semibold text-[var(--text-strong)] mb-2">페르소나가 없습니다</p>
          <p className="text-sm text-[var(--text-muted)] mb-6">페르소나를 만들어 콘텐츠 제작을 시작하세요.</p>
          <Link href="/sns/personas/new" className="button-primary">새 페르소나 만들기</Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-[var(--text-muted)]">검색 결과가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map(p => {
            const keywords = (() => { try { return JSON.parse(p.keywords) as string[] } catch { return [] } })()
            const platformColor = PLATFORM_COLORS[p.platform] || '#6b7280'
            const platformIcon = PLATFORM_ICONS[p.platform] || '?'
            return (
              <div key={p.id} className="soft-card" style={{ borderTop: `4px solid ${platformColor}` }}>
                <div className="flex items-start gap-3 mb-3">
                  {/* Avatar placeholder */}
                  <div
                    className="h-11 w-11 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: platformColor }}
                  >
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="section-title">{p.name}</p>
                      {p.instagramHandle ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">연결됨</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-sub)] text-[var(--text-muted)] font-medium">미연결</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded font-bold"
                        style={{ backgroundColor: `${platformColor}20`, color: platformColor }}
                      >
                        {platformIcon}
                      </span>
                      <p className="text-xs text-[var(--text-muted)]">{PLATFORM_LABEL[p.platform]}</p>
                    </div>
                  </div>
                  <span className="accent-pill text-xs flex-shrink-0">{p._count?.contentDrafts ?? 0}개 초안</span>
                </div>
                {p.brandConcept && (
                  <p className="text-sm text-[var(--text-base)] mb-3 line-clamp-2">{p.brandConcept}</p>
                )}
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {keywords.slice(0, 5).map((kw: string) => (
                      <span key={kw} className="pill-option text-xs">#{kw}</span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-3 border-t border-[var(--border)]">
                  <Link href={`/sns/studio?personaId=${p.id}`} className="button-primary text-sm flex-1 text-center">
                    콘텐츠 제작
                  </Link>
                  <Link href={`/sns/personas/${p.id}`} className="button-secondary text-sm">편집</Link>
                  <button
                    onClick={() => handleDelete(p.id, p.name)}
                    className="button-secondary text-sm text-rose-500 hover:text-rose-700"
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
