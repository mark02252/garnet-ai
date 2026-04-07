'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { kahnSort } from '@/lib/flow/graph'
import { useFlowRunStore } from '@/lib/flow/run-store'
import type { FlowNode, FlowEdge, NodeStatus } from '@/lib/flow/types'
import type { FlowPreviewData } from '@/lib/canvas-store'

type Props = {
  data: FlowPreviewData
  onClose?: () => void
}

const STATUS_COLOR: Record<NodeStatus | 'idle', string> = {
  idle: '#4a6a7a',
  running: '#00d4ff',
  done: '#22c55e',
  error: '#ef4444',
}

function MiniFlowDiagram({ nodes, edges, nodeStatuses }: {
  nodes: FlowNode[]
  edges: FlowEdge[]
  nodeStatuses: Record<string, NodeStatus>
}) {
  // Compute layers
  let layers: FlowNode[][] = []
  try {
    layers = kahnSort(nodes, edges)
  } catch {
    layers = [nodes]
  }

  const LAYER_GAP = 110
  const NODE_GAP = 36
  const START_X = 30
  const NODE_W = 120
  const NODE_H = 28

  // Position map
  const posMap = new Map<string, { cx: number; cy: number }>()
  const totalHeight = Math.max(...layers.map(l => l.length)) * NODE_GAP + 20

  layers.forEach((layer, li) => {
    const x = START_X + li * LAYER_GAP
    const layerH = layer.length * NODE_GAP
    const offsetY = (totalHeight - layerH) / 2

    layer.forEach((node, ni) => {
      posMap.set(node.id, { cx: x + NODE_W / 2, cy: offsetY + ni * NODE_GAP + NODE_H / 2 })
    })
  })

  const svgW = START_X + layers.length * LAYER_GAP + 20
  const svgH = totalHeight + 10

  return (
    <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ minHeight: 120 }}>
      {/* Edges */}
      {edges.map(e => {
        const from = posMap.get(e.source)
        const to = posMap.get(e.target)
        if (!from || !to) return null
        return (
          <line
            key={e.id}
            x1={from.cx + NODE_W / 2 - 10}
            y1={from.cy}
            x2={to.cx - NODE_W / 2 + 10}
            y2={to.cy}
            stroke="#1a3050"
            strokeWidth={1.5}
          />
        )
      })}

      {/* Nodes */}
      {layers.flatMap(layer => layer.map(node => {
        const pos = posMap.get(node.id)
        if (!pos) return null
        const status = nodeStatuses[node.id] ?? 'idle'
        const color = STATUS_COLOR[status]
        const label = node.type === 'start' ? '시작'
          : node.type === 'end' ? '산출물'
          : node.type === 'tool' ? '🔍 웹검색'
          : (node.data as { role?: string }).role ?? node.id

        const isCircle = node.type === 'start' || node.type === 'end'

        if (isCircle) {
          return (
            <g key={node.id}>
              <circle cx={pos.cx} cy={pos.cy} r={14} fill="none" stroke={color} strokeWidth={1.5} />
              <text x={pos.cx} y={pos.cy + 3} textAnchor="middle" fontSize={7} fill={color}>{label}</text>
            </g>
          )
        }

        return (
          <g key={node.id}>
            <rect
              x={pos.cx - NODE_W / 2}
              y={pos.cy - NODE_H / 2}
              width={NODE_W}
              height={NODE_H}
              rx={6}
              fill="rgba(0,20,30,0.8)"
              stroke={color}
              strokeWidth={status === 'running' ? 2 : 1}
            />
            <text
              x={pos.cx}
              y={pos.cy + 3}
              textAnchor="middle"
              fontSize={8}
              fill={status === 'idle' ? '#8899aa' : color}
            >
              {label.length > 14 ? label.slice(0, 13) + '…' : label}
            </text>
            {status === 'running' && (
              <text x={pos.cx + NODE_W / 2 - 12} y={pos.cy + 3} fontSize={8} fill={color}>⟳</text>
            )}
            {status === 'done' && (
              <text x={pos.cx + NODE_W / 2 - 12} y={pos.cy + 3} fontSize={8} fill={color}>✓</text>
            )}
          </g>
        )
      }))}
    </svg>
  )
}

export default function FlowPreviewPanel({ data, onClose }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const nodeStatuses = useFlowRunStore(s => s.nodeStatuses)
  const isRunning = useFlowRunStore(s => s.isRunning)
  const completedRunId = useFlowRunStore(s => s.runId)

  async function handleExecute() {
    setSaving(true)
    try {
      // Save template
      const res = await fetch('/api/flow-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.summary || '자동 생성 플로우',
          nodes: JSON.stringify(data.nodes),
          edges: JSON.stringify(data.edges),
        }),
      })
      const template = await res.json()
      // Navigate to editor and trigger run
      router.push(`/flow/${template.id}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleOpenEditor() {
    setSaving(true)
    try {
      const res = await fetch('/api/flow-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.summary || '자동 생성 플로우',
          nodes: JSON.stringify(data.nodes),
          edges: JSON.stringify(data.edges),
        }),
      })
      const template = await res.json()
      router.push(`/flow/${template.id}`)
    } finally {
      setSaving(false)
    }
  }

  const agentCount = data.nodes.filter(n => n.type === 'agent').length
  const toolCount = data.nodes.filter(n => n.type === 'tool').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8, padding: '8px 0' }}>
      {/* Mini diagram */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MiniFlowDiagram nodes={data.nodes} edges={data.edges} nodeStatuses={nodeStatuses} />
      </div>

      {/* Summary */}
      <div style={{ fontSize: 10, color: '#6090a8', padding: '0 8px' }}>
        에이전트 {agentCount}개{toolCount > 0 ? ` · 웹검색 ${toolCount}개` : ''}
      </div>

      {data.reasoning && (
        <div style={{ fontSize: 9, color: '#4a6a7a', padding: '0 8px', lineHeight: 1.5 }}>
          {data.reasoning.length > 100 ? data.reasoning.slice(0, 100) + '…' : data.reasoning}
        </div>
      )}

      {/* Actions */}
      {!isRunning && !completedRunId && (
        <div style={{ display: 'flex', gap: 6, padding: '0 8px' }}>
          <button
            onClick={handleExecute}
            disabled={saving}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 6,
              background: '#00d4ff', color: '#000', border: 'none',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? '저장 중...' : '▶ 실행'}
          </button>
          <button
            onClick={handleOpenEditor}
            disabled={saving}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 6,
              background: 'transparent', color: '#6090a8', border: '1px solid #1a3050',
              fontSize: 11, cursor: 'pointer', opacity: saving ? 0.5 : 1,
            }}
          >
            ✏ 에디터
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '6px 10px', borderRadius: 6,
              background: 'transparent', color: '#4a6a7a', border: '1px solid #1a3050',
              fontSize: 11, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {completedRunId && !isRunning && (
        <div style={{ padding: '0 8px' }}>
          <a
            href={`/runs/${completedRunId}/report`}
            style={{ fontSize: 11, color: '#00d4ff', textDecoration: 'underline' }}
          >
            결과 보기 →
          </a>
        </div>
      )}
    </div>
  )
}
