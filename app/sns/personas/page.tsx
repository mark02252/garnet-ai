'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

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
  _count?: { contentDrafts: number }
}

const PLATFORM_LABEL: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  THREADS: 'Threads',
  X: 'X (Twitter)',
  YOUTUBE: 'YouTube',
}

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/sns/personas')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => Array.isArray(data) ? setPersonas(data) : void 0)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="dashboard-eyebrow">SNS 스튜디오</p>
          <h1 className="dashboard-title">페르소나</h1>
        </div>
        <Link href="/sns/personas/new" className="button-primary">+ 새 페르소나</Link>
      </div>

      {loading ? (
        <p className="text-[var(--text-muted)]">불러오는 중...</p>
      ) : personas.length === 0 ? (
        <div className="soft-card text-center py-16">
          <p className="text-[var(--text-muted)] mb-4">등록된 페르소나가 없습니다.</p>
          <Link href="/sns/personas/new" className="button-primary">첫 페르소나 만들기</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {personas.map(p => {
            const keywords = (() => { try { return JSON.parse(p.keywords) as string[] } catch { return [] } })()
            return (
              <div key={p.id} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="section-title">{p.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{PLATFORM_LABEL[p.platform]}</p>
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
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
