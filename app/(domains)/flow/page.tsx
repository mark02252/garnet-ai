'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

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
      .then(r => r.json())
      .then(d => setTemplates(d.templates ?? []))
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
      const data = await res.json()
      router.push(`/flow/${data.id}`)
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
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">플로우 빌더</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">에이전트 파이프라인을 직접 구성하고 실행하세요</p>
        </div>
        <button
          onClick={createFlow}
          disabled={creating}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {creating ? '생성 중…' : '+ 새 플로우'}
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-[var(--text-muted)]">불러오는 중…</div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-[var(--surface-border)] py-16 text-center">
          <p className="text-[var(--text-muted)]">저장된 플로우가 없습니다</p>
          <button
            onClick={createFlow}
            disabled={creating}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            + 새 플로우 만들기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => router.push(`/flow/${t.id}`)}
              className="flex flex-col gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] p-4 text-left hover:border-[var(--accent)] transition-colors"
            >
              <div className="font-medium text-[var(--text-primary)]">{t.name}</div>
              <div className="text-xs text-[var(--text-muted)]">
                노드 {getNodeCount(t.nodes)}개
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                {formatDate(t.lastRunAt)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
