'use client'

import { useEffect, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type TechRadarItem = {
  id: string
  name: string
  category: 'marketing' | 'tech'
  status: 'adopted' | 'assessing' | 'hold'
  description: string | null
  url: string | null
  source: string | null
  notes: string | null
  tags: string[]
  addedAt: string
}

type ViewMode = 'chart' | 'list'

type Filters = {
  category: string
  status: string
  q: string
}

type RadarModal = {
  open: boolean
  name: string
  category: 'marketing' | 'tech'
  status: 'adopted' | 'assessing' | 'hold'
  description: string
  url: string
  tags: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  adopted:   '#22d3ee',   // cyan
  assessing: '#facc15',   // yellow
  hold:      '#71717a',   // zinc
}

const STATUS_LABELS: Record<string, string> = {
  adopted:   '도입',
  assessing: '검토 중',
  hold:      '보류',
}

const CATEGORY_LABELS: Record<string, string> = {
  marketing: '마케팅 도구',
  tech:      '기술 스택',
}

const SOURCE_LABELS: Record<string, string> = {
  github: 'GitHub',
  intel:  'Intel',
  manual: 'Manual',
}

// ── SVG Radar Chart ───────────────────────────────────────────────────────────

const CX = 350
const CY = 350
const RINGS: { status: string; r: number }[] = [
  { status: 'adopted',   r: 120 },
  { status: 'assessing', r: 220 },
  { status: 'hold',      r: 300 },
]

// marketing = top half: angles -180° to 0° (i.e. 180° to 360° in standard)
// tech      = bottom half: angles 0° to 180°
const SECTORS = [
  { key: 'marketing', label: '마케팅 도구', startDeg: 180, endDeg: 360 },
  { key: 'tech',      label: '기술 스택',   startDeg: 0,   endDeg: 180 },
]

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = toRad(startDeg)
  const e = toRad(endDeg)
  const x1 = cx + r * Math.cos(s)
  const y1 = cy + r * Math.sin(s)
  const x2 = cx + r * Math.cos(e)
  const y2 = cy + r * Math.sin(e)
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`
}

function computeDotPositions(
  items: TechRadarItem[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()

  for (const sector of SECTORS) {
    for (const ring of RINGS) {
      const group = items.filter(
        (item) => item.category === sector.key && item.status === ring.status,
      )
      const count = group.length
      const span = sector.endDeg - sector.startDeg

      group.forEach((item, i) => {
        const theta = sector.startDeg + ((i + 1) * span) / (count + 1)
        const rad = toRad(theta)
        const x = CX + ring.r * Math.cos(rad)
        const y = CY + ring.r * Math.sin(rad)
        positions.set(item.id, { x, y })
      })
    }
  }

  return positions
}

function RadarChart({
  items,
  onHover,
  hoveredId,
}: {
  items: TechRadarItem[]
  onHover: (id: string | null) => void
  hoveredId: string | null
}) {
  const positions = computeDotPositions(items)

  return (
    <svg
      viewBox="0 0 700 700"
      width="100%"
      style={{ maxWidth: 700, display: 'block', margin: '0 auto' }}
    >
      {/* Sector backgrounds */}
      {SECTORS.map((sector) => (
        <path
          key={sector.key}
          d={arcPath(CX, CY, RINGS[2].r + 20, sector.startDeg, sector.endDeg)}
          fill={sector.key === 'marketing' ? 'rgba(59,130,246,0.04)' : 'rgba(139,92,246,0.04)'}
          stroke="none"
        />
      ))}

      {/* Dividing line (horizontal through center) */}
      <line
        x1={CX - RINGS[2].r - 20}
        y1={CY}
        x2={CX + RINGS[2].r + 20}
        y2={CY}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
        strokeDasharray="4 4"
      />

      {/* Rings */}
      {RINGS.map((ring) => (
        <circle
          key={ring.status}
          cx={CX}
          cy={CY}
          r={ring.r}
          fill="none"
          stroke={STATUS_COLORS[ring.status]}
          strokeWidth="1"
          strokeOpacity="0.25"
          strokeDasharray={ring.status === 'hold' ? '6 4' : ring.status === 'assessing' ? '4 3' : 'none'}
        />
      ))}

      {/* Ring labels */}
      {RINGS.map((ring) => (
        <text
          key={`label-${ring.status}`}
          x={CX + 4}
          y={CY - ring.r + 14}
          fontSize="10"
          fill={STATUS_COLORS[ring.status]}
          opacity="0.7"
          fontFamily="monospace"
          letterSpacing="1"
        >
          {STATUS_LABELS[ring.status].toUpperCase()}
        </text>
      ))}

      {/* Sector labels */}
      <text
        x={CX}
        y={CY - RINGS[2].r - 8}
        fontSize="11"
        fill="rgba(59,130,246,0.7)"
        textAnchor="middle"
        fontFamily="monospace"
        letterSpacing="1"
      >
        MARKETING
      </text>
      <text
        x={CX}
        y={CY + RINGS[2].r + 20}
        fontSize="11"
        fill="rgba(139,92,246,0.7)"
        textAnchor="middle"
        fontFamily="monospace"
        letterSpacing="1"
      >
        TECH
      </text>

      {/* Center cross */}
      <circle cx={CX} cy={CY} r="3" fill="rgba(255,255,255,0.15)" />

      {/* Dots */}
      {items.map((item) => {
        const pos = positions.get(item.id)
        if (!pos) return null
        const isHovered = hoveredId === item.id
        const color = STATUS_COLORS[item.status]

        return (
          <g key={item.id}>
            {isHovered && (
              <circle
                cx={pos.x}
                cy={pos.y}
                r="12"
                fill={color}
                fillOpacity="0.15"
              />
            )}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={isHovered ? 7 : 5}
              fill={color}
              fillOpacity={isHovered ? 1 : 0.85}
              stroke={isHovered ? '#fff' : color}
              strokeWidth={isHovered ? 1.5 : 0.5}
              strokeOpacity="0.5"
              style={{ cursor: 'pointer', transition: 'r 0.15s' }}
              onMouseEnter={() => onHover(item.id)}
              onMouseLeave={() => onHover(null)}
            />
          </g>
        )
      })}

      {/* Tooltip */}
      {hoveredId && (() => {
        const item = items.find((i) => i.id === hoveredId)
        const pos = positions.get(hoveredId)
        if (!item || !pos) return null

        const tipW = 180
        const tipH = item.description ? 60 : 40
        let tx = pos.x + 12
        let ty = pos.y - tipH / 2
        if (tx + tipW > 700) tx = pos.x - tipW - 12
        if (ty < 4) ty = 4
        if (ty + tipH > 696) ty = 696 - tipH

        return (
          <g>
            <rect
              x={tx}
              y={ty}
              width={tipW}
              height={tipH}
              rx="6"
              fill="#1a1a2e"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />
            <text
              x={tx + 10}
              y={ty + 16}
              fontSize="11"
              fill="#e2e8f0"
              fontWeight="600"
              fontFamily="sans-serif"
            >
              {item.name.length > 22 ? `${item.name.slice(0, 22)}…` : item.name}
            </text>
            {item.description && (
              <text
                x={tx + 10}
                y={ty + 32}
                fontSize="9"
                fill="rgba(226,232,240,0.6)"
                fontFamily="sans-serif"
              >
                {item.description.length > 28 ? `${item.description.slice(0, 28)}…` : item.description}
              </text>
            )}
            <text
              x={tx + 10}
              y={ty + tipH - 8}
              fontSize="9"
              fill={STATUS_COLORS[item.status]}
              fontFamily="monospace"
            >
              {STATUS_LABELS[item.status]} · {CATEGORY_LABELS[item.category]}
            </text>
          </g>
        )
      })()}
    </svg>
  )
}

// ── List View ─────────────────────────────────────────────────────────────────

function ListItem({
  item,
  saving,
  onStatusChange,
  onDelete,
}: {
  item: TechRadarItem
  saving: boolean
  onStatusChange: (id: string, status: string) => void
  onDelete: (id: string) => void
}) {
  const color = STATUS_COLORS[item.status]

  return (
    <div
      style={{
        padding: '14px 18px',
        borderRadius: 10,
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: color,
              flexShrink: 0,
              boxShadow: `0 0 6px ${color}80`,
            }}
          />
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-strong)',
                textDecoration: 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.name}
            </a>
          ) : (
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-strong)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.name}
            </span>
          )}
          <span
            style={{
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 99,
              background: item.category === 'marketing' ? 'rgba(59,130,246,0.12)' : 'rgba(139,92,246,0.12)',
              color: item.category === 'marketing' ? '#60a5fa' : '#a78bfa',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {CATEGORY_LABELS[item.category]}
          </span>
          {item.source && (
            <span
              style={{
                fontSize: 10,
                padding: '2px 7px',
                borderRadius: 99,
                background: 'var(--surface-sub)',
                color: 'var(--text-muted)',
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              {SOURCE_LABELS[item.source] ?? item.source}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <select
            value={item.status}
            disabled={saving}
            onChange={(e) => onStatusChange(item.id, e.target.value)}
            style={{
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 6,
              border: `1px solid ${color}50`,
              background: 'var(--surface-raised)',
              color,
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="adopted">도입</option>
            <option value="assessing">검토 중</option>
            <option value="hold">보류</option>
          </select>
          <button
            onClick={() => onDelete(item.id)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 14,
              padding: '2px 4px',
              borderRadius: 4,
              lineHeight: 1,
            }}
            title="삭제"
          >
            ×
          </button>
        </div>
      </div>
      {item.description && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
          {item.description.length > 160 ? `${item.description.slice(0, 160)}…` : item.description}
        </p>
      )}
      {item.notes && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, fontStyle: 'italic', opacity: 0.7 }}>
          💡 {item.notes}
        </p>
      )}
      {item.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {item.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 99,
                background: 'var(--surface-sub)',
                color: 'var(--text-muted)',
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Add Modal ─────────────────────────────────────────────────────────────────

function AddModal({
  modal,
  onClose,
  onSave,
}: {
  modal: RadarModal
  onClose: () => void
  onSave: (data: Omit<RadarModal, 'open'>) => Promise<void>
}) {
  const [form, setForm] = useState<Omit<RadarModal, 'open'>>({
    name: modal.name,
    category: modal.category,
    status: modal.status,
    description: modal.description,
    url: modal.url,
    tags: modal.tags,
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface-raised)',
          border: '1px solid var(--surface-border)',
          borderRadius: 14,
          padding: 24,
          width: '100%',
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>
            Tech Radar에 추가
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18 }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>이름 *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              placeholder="e.g. react, tailwindcss"
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--surface-border)',
                background: 'var(--surface-sub)',
                color: 'var(--text-strong)',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          {/* Category + Status row */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>카테고리 *</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as 'marketing' | 'tech' }))}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--surface-border)',
                  background: 'var(--surface-sub)',
                  color: 'var(--text-strong)',
                  fontSize: 13,
                  outline: 'none',
                }}
              >
                <option value="marketing">마케팅 도구</option>
                <option value="tech">기술 스택</option>
              </select>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>상태 *</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'adopted' | 'assessing' | 'hold' }))}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--surface-border)',
                  background: 'var(--surface-sub)',
                  color: 'var(--text-strong)',
                  fontSize: 13,
                  outline: 'none',
                }}
              >
                <option value="adopted">도입</option>
                <option value="assessing">검토 중</option>
                <option value="hold">보류</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>설명</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="도구 또는 기술에 대한 설명"
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--surface-border)',
                background: 'var(--surface-sub)',
                color: 'var(--text-strong)',
                fontSize: 13,
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>

          {/* URL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>URL</label>
            <input
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              type="url"
              placeholder="https://..."
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--surface-border)',
                background: 'var(--surface-sub)',
                color: 'var(--text-strong)',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          {/* Tags */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>태그 (쉼표 구분)</label>
            <input
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="typescript, react, ai"
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--surface-border)',
                background: 'var(--surface-sub)',
                color: 'var(--text-strong)',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid var(--surface-border)',
                background: 'none',
                color: 'var(--text-muted)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? '저장 중…' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TechRadarPage() {
  const [items, setItems]           = useState<TechRadarItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [view, setView]             = useState<ViewMode>('chart')
  const [filters, setFilters]       = useState<Filters>({ category: '', status: '', q: '' })
  const [savingIds, setSavingIds]   = useState<Set<string>>(new Set())
  const [hoveredId, setHoveredId]   = useState<string | null>(null)
  const [modal, setModal]           = useState<RadarModal | null>(null)

  async function fetchItems() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (filters.category) params.set('category', filters.category)
      if (filters.status) params.set('status', filters.status)
      if (filters.q) params.set('q', filters.q)
      const res = await fetch(`/api/tech-radar?${params}`)
      const data = await res.json()
      setItems(data.items ?? [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.category, filters.status])

  async function handleStatusChange(id: string, status: string) {
    setSavingIds((prev) => new Set([...prev, id]))
    try {
      await fetch(`/api/tech-radar/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setItems((prev) =>
        prev.map((item) => item.id === id ? { ...item, status: status as TechRadarItem['status'] } : item)
      )
    } finally {
      setSavingIds((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return
    await fetch(`/api/tech-radar/${id}`, { method: 'DELETE' })
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  async function handleAddSave(form: Omit<RadarModal, 'open'>) {
    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const res = await fetch('/api/tech-radar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        category: form.category,
        status: form.status,
        description: form.description || undefined,
        url: form.url || undefined,
        source: 'manual',
        tags,
      }),
    })
    if (res.ok) {
      setModal(null)
      await fetchItems()
    }
  }

  function openAddModal() {
    setModal({
      open: true,
      name: '',
      category: 'tech',
      status: 'assessing',
      description: '',
      url: '',
      tags: '',
    })
  }

  // For list view: filter client-side by q as well
  const displayItems = filters.q
    ? items.filter(
        (item) =>
          item.name.toLowerCase().includes(filters.q.toLowerCase()) ||
          (item.description ?? '').toLowerCase().includes(filters.q.toLowerCase()),
      )
    : items

  // Group by status for list view
  const grouped: Record<string, TechRadarItem[]> = {
    adopted:   displayItems.filter((i) => i.status === 'adopted'),
    assessing: displayItems.filter((i) => i.status === 'assessing'),
    hold:      displayItems.filter((i) => i.status === 'hold'),
  }

  const stats = {
    total:     items.length,
    adopted:   items.filter((i) => i.status === 'adopted').length,
    assessing: items.filter((i) => i.status === 'assessing').length,
    hold:      items.filter((i) => i.status === 'hold').length,
    marketing: items.filter((i) => i.category === 'marketing').length,
    tech:      items.filter((i) => i.category === 'tech').length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p className="dashboard-eyebrow">Technology Radar</p>
          <h1 className="dashboard-title">테크 레이더</h1>
          <p className="dashboard-copy">마케팅 도구와 기술 스택의 도입 현황 및 평가</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {/* View toggle */}
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--surface-border)' }}>
            <button
              onClick={() => setView('chart')}
              style={{
                padding: '8px 12px',
                background: view === 'chart' ? 'var(--accent-soft)' : 'var(--surface-raised)',
                color: view === 'chart' ? 'var(--accent)' : 'var(--text-muted)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <ChartIcon /> 차트
            </button>
            <button
              onClick={() => setView('list')}
              style={{
                padding: '8px 12px',
                background: view === 'list' ? 'var(--accent-soft)' : 'var(--surface-raised)',
                color: view === 'list' ? 'var(--accent)' : 'var(--text-muted)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <ListIcon /> 목록
            </button>
          </div>
          {/* Add button */}
          <button
            onClick={openAddModal}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + 추가
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          { label: '전체', value: stats.total, color: 'var(--text-strong)' },
          { label: '도입', value: stats.adopted, color: STATUS_COLORS.adopted },
          { label: '검토 중', value: stats.assessing, color: STATUS_COLORS.assessing },
          { label: '보류', value: stats.hold, color: STATUS_COLORS.hold },
          { label: '마케팅', value: stats.marketing, color: '#60a5fa' },
          { label: '기술', value: stats.tech, color: '#a78bfa' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="metric-card"
            style={{ flex: '1 1 80px', minWidth: 70, padding: '10px 14px' }}
          >
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
            <span style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="panel" style={{ padding: '14px 18px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Category filter */}
        <div style={{ display: 'flex', gap: 5 }}>
          {[
            { label: '전체', value: '' },
            { label: '마케팅', value: 'marketing' },
            { label: '기술', value: 'tech' },
          ].map((o) => (
            <button
              key={o.value}
              className={filters.category === o.value ? 'accent-pill' : 'pill-option'}
              onClick={() => setFilters((f) => ({ ...f, category: o.value }))}
              style={{ cursor: 'pointer', border: 'none' }}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 5 }}>
          {[
            { label: '전체', value: '' },
            { label: '도입', value: 'adopted' },
            { label: '검토 중', value: 'assessing' },
            { label: '보류', value: 'hold' },
          ].map((o) => (
            <button
              key={o.value}
              className={filters.status === o.value ? 'accent-pill' : 'pill-option'}
              onClick={() => setFilters((f) => ({ ...f, status: o.value }))}
              style={{ cursor: 'pointer', border: 'none' }}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          placeholder="검색..."
          style={{
            marginLeft: 'auto',
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid var(--surface-border)',
            background: 'var(--surface-sub)',
            color: 'var(--text-strong)',
            fontSize: 12,
            outline: 'none',
            width: 160,
          }}
        />
      </div>

      {/* Main content */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          불러오는 중...
        </div>
      ) : items.length === 0 ? (
        <div
          className="soft-card"
          style={{ padding: '48px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
        >
          <div style={{ fontSize: 32 }}>◎</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
            레이더가 비어 있습니다
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            크론잡이 GitHub Trending에서 항목을 자동 수집하거나, 직접 추가해보세요.
          </p>
          <button
            onClick={openAddModal}
            style={{
              marginTop: 8,
              padding: '10px 24px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            + 첫 항목 추가
          </button>
        </div>
      ) : view === 'chart' ? (
        <div
          className="soft-card"
          style={{ padding: 24, position: 'relative' }}
        >
          <RadarChart
            items={displayItems}
            onHover={setHoveredId}
            hoveredId={hoveredId}
          />
          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[key], display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {(['adopted', 'assessing', 'hold'] as const).map((status) => {
            const group = grouped[status]
            if (group.length === 0) return null
            return (
              <div key={status}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[status], display: 'inline-block', boxShadow: `0 0 6px ${STATUS_COLORS[status]}80` }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLORS[status], textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {STATUS_LABELS[status]}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({group.length})</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.map((item) => (
                    <ListItem
                      key={item.id}
                      item={item}
                      saving={savingIds.has(item.id)}
                      onStatusChange={handleStatusChange}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add modal */}
      {modal && (
        <AddModal
          modal={modal}
          onClose={() => setModal(null)}
          onSave={handleAddSave}
        />
      )}
    </div>
  )
}
