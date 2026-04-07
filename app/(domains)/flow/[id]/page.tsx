'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { FlowNode, FlowEdge } from '@/lib/flow/types'
import { useFlowRunStore } from '@/lib/flow/run-store'

// ReactFlow must be client-only (no SSR)
const FlowCanvas = dynamic(() => import('./components/FlowCanvas'), { ssr: false })
const NodePalette = dynamic(() => import('./components/NodePalette'), { ssr: false })
const NodeConfigPanel = dynamic(() => import('./components/NodeConfigPanel'), { ssr: false })
const RunModal = dynamic(() => import('./components/RunModal'), { ssr: false })

type Template = {
  id: string
  name: string
  nodes: string
  edges: string
}

export default function FlowEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [template, setTemplate] = useState<Template | null>(null)
  const [nodes, setNodes] = useState<FlowNode[]>([])
  const [edges, setEdges] = useState<FlowEdge[]>([])
  const [name, setName] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [runModalOpen, setRunModalOpen] = useState(false)
  const completedRunId = useFlowRunStore(s => s.runId)
  const isRunning = useFlowRunStore(s => s.isRunning)

  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/flow-templates/${id}`)
      .then(r => {
        if (!r.ok) throw new Error(`API error: ${r.status}`)
        return r.json()
      })
      .then((t: Template) => {
        setTemplate(t)
        setName(t.name)
        setNodes(JSON.parse(t.nodes))
        setEdges(JSON.parse(t.edges))
      })
      .catch((err) => {
        console.error('[flow-editor] load error:', err)
        setLoadError(err instanceof Error ? err.message : '플로우를 불러올 수 없습니다.')
      })
  }, [id])

  const save = useCallback(async (overrideNodes?: FlowNode[], overrideEdges?: FlowEdge[]) => {
    setSaving(true)
    try {
      await fetch(`/api/flow-templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          nodes: JSON.stringify(overrideNodes ?? nodes),
          edges: JSON.stringify(overrideEdges ?? edges),
        }),
      })
    } finally {
      setSaving(false)
    }
  }, [id, name, nodes, edges])

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) ?? null : null

  const updateNode = useCallback((nodeId: string, data: Partial<FlowNode['data']>) => {
    setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...data } as FlowNode['data'] } : n) as FlowNode[])
  }, [])

  if (loadError) {
    return <div className="flex h-full items-center justify-center text-sm text-red-400">{loadError}</div>
  }

  if (!template) {
    return <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">불러오는 중…</div>
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--surface-border)] bg-[var(--surface-base)] px-4 py-3">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="flex-1 rounded bg-transparent px-2 py-1 text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <button
          onClick={() => save()}
          disabled={saving}
          className="rounded-lg border border-[var(--surface-border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        <button
          onClick={() => setRunModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          ▶ 실행
        </button>
      </div>

      {/* Body: palette | canvas | config */}
      <div className="flex flex-1 overflow-hidden">
        <NodePalette
          onAddNode={(node) => {
            setNodes(ns => [...ns, node] as FlowNode[])
          }}
        />
        <div className="flex-1">
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={setNodes}
            onEdgesChange={setEdges}
            onNodeSelect={setSelectedNodeId}
            onSave={save}
          />
        </div>
        <NodeConfigPanel
          node={selectedNode}
          onUpdate={updateNode}
        />
      </div>

      {/* Bottom completion bar — shown after flow-complete */}
      {completedRunId && !isRunning && (
        <div className="flex items-center justify-between border-t border-[var(--surface-border)] bg-[var(--surface-base)] px-4 py-2">
          <span className="text-xs text-green-400">✓ 실행 완료</span>
          <a
            href={`/seminar/${completedRunId}`}
            className="text-xs text-[var(--accent)] underline hover:opacity-80"
          >
            결과 보기 →
          </a>
        </div>
      )}

      {runModalOpen && (
        <RunModal
          templateId={id}
          defaultTopic={nodes.find(n => n.type === 'start')?.data?.topic ?? ''}
          onClose={() => setRunModalOpen(false)}
        />
      )}
    </div>
  )
}
