'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageTransition } from '@/components/page-transition'

type FlowTemplateListItem = {
  id: string
  name: string
  nodes: string
  lastRunAt: string | null
  updatedAt: string
}

export default function FlowListPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<FlowTemplateListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/flow-templates')
      .then(r => {
        if (!r.ok) throw new Error(`API error: ${r.status}`)
        return r.json()
      })
      .then(d => setTemplates(d.templates ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }, [])

  async function createFlow() {
    setCreating(true)
    try {
      const res = await fetch('/api/flow-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '새 플로우' }),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()
      if (!data?.id) throw new Error('응답에 id가 없습니다')
      router.push(`/flow/${data.id}`)
    } catch (err) {
      console.error('플로우 생성 실패:', err)
    } finally {
      setCreating(false)
    }
  }

  function getNodeCount(nodesJson: string): number {
    try { return JSON.parse(nodesJson).length } catch { return 0 }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '실행 기록 없음'
    return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <PageTransition>
    <div className="space-y-3">
      <header className="ops-zone">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="ops-zone-label">Flow Builder</p>
            <h1 className="mt-1 text-lg font-bold tracking-tight text-[var(--text-strong)]">플로우 빌더</h1>
          </div>
          <button
            onClick={createFlow}
            disabled={creating}
            className="button-primary px-3 py-2 text-xs"
          >
            {creating ? '생성 중…' : '+ 새 플로우'}
          </button>
        </div>
      </header>

      {loading ? (
        <div className="ops-zone px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">불러오는 중…</div>
      ) : templates.length === 0 ? (
        <div className="ops-zone flex flex-col items-center gap-3 px-4 py-12 text-center">
          <p className="text-[13px] text-[var(--text-muted)]">저장된 플로우가 없습니다</p>
          <button onClick={createFlow} disabled={creating} className="button-primary px-3 py-2 text-xs">
            + 새 플로우 만들기
          </button>
        </div>
      ) : (
        <div className="ops-zone">
          <div className="ops-zone-head">
            <span className="ops-zone-label">템플릿</span>
            <span className="text-[10px] font-semibold tabular-nums text-[var(--text-disabled)]">{templates.length}</span>
          </div>
          <div className="grid gap-px bg-[var(--surface-border)] sm:grid-cols-2 lg:grid-cols-3">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => router.push(`/flow/${t.id}`)}
                className="flex flex-col gap-1.5 bg-[var(--surface)] p-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
              >
                <p className="text-[13px] font-semibold text-[var(--text-strong)]">{t.name}</p>
                <div className="flex items-center gap-3 text-[10px] text-[var(--text-disabled)]">
                  <span>노드 {getNodeCount(t.nodes)}개</span>
                  <span>{formatDate(t.lastRunAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
    </PageTransition>
  )
}
