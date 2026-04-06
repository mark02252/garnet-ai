# Tech Radar Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마케팅 도구와 기술 스택을 GitHub Trending에서 자동 수집하고 SVG 레이더 차트로 시각화하는 시스템 구축.

**Architecture:** Prisma TechRadarItem 모델 → GitHub Trending 스크래퍼 + Gemini 분류 → CRUD API → SVG 레이더 차트 + 리스트 뷰 페이지. 크론잡이 매일 오전 9시 GitHub Trending 3개 언어를 스크래핑하고 Gemini로 marketing/tech/irrelevant 분류 후 저장.

**Tech Stack:** Next.js App Router, TypeScript, Prisma (PostgreSQL), Zod, Tailwind CSS, Gemini REST API, SVG

---

## Chunk 1: 데이터 레이어

### Task 1: Prisma TechRadarItem 모델

Files: Modify `prisma/schema.prisma`

Steps:

- [ ] 1. `prisma/schema.prisma` 파일 끝에 다음 모델을 추가한다:

```prisma
model TechRadarItem {
  id          String   @id @default(cuid())
  name        String   @unique
  category    String
  status      String   @default("assessing")
  description String?
  url         String?
  source      String?
  tags        String   @default("[]")
  addedAt     DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([category])
  @@index([status])
  @@index([status, category])
}
```

- [ ] 2. DB 동기화를 실행한다:
```bash
cd "/Users/rnr/Documents/New project" && npx prisma db push
```
Expected output: `🚀 Your database is now in sync`

- [ ] 3. TypeScript 검사 실행 (canvas-store, ga4-client, watch-keywords 기존 오류는 무시):
```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit 2>&1 | grep -v "canvas-store\|ga4-client\|watch-keywords"
```

- [ ] 4. 커밋: `feat(db): add TechRadarItem model`

---

### Task 2: Tech Radar API (GET + POST)

Files: Create `app/api/tech-radar/route.ts`

Steps:

- [ ] 1. `app/api/tech-radar/route.ts` 파일을 생성한다:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(['marketing', 'tech']),
  status: z.enum(['adopted', 'assessing', 'hold']).default('assessing'),
  description: z.string().max(1000).optional(),
  url: z.string().url().optional().or(z.literal('')),
  source: z.enum(['github', 'intel', 'manual']).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
})

function parseTags(raw: string): string[] {
  try { return JSON.parse(raw) } catch { return [] }
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim()
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || ''
  const category = searchParams.get('category')?.trim() || ''
  const status = searchParams.get('status')?.trim() || ''
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'))

  const where: Record<string, unknown> = {}
  if (category === 'marketing' || category === 'tech') where.category = category
  if (status === 'adopted' || status === 'assessing' || status === 'hold') where.status = status
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ]
  }

  const items = await prisma.techRadarItem.findMany({
    where,
    orderBy: { addedAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({
    items: items.map((item) => ({ ...item, tags: parseTags(item.tags) })),
    count: items.length,
  })
}

export async function POST(req: Request) {
  try {
    const body = createSchema.parse(await req.json())
    const normalizedName = normalizeName(body.name)

    const existing = await prisma.techRadarItem.findUnique({ where: { name: normalizedName } })
    if (existing) {
      await prisma.techRadarItem.update({
        where: { name: normalizedName },
        data: { updatedAt: new Date() },
      })
      return NextResponse.json({ ...existing, tags: parseTags(existing.tags), duplicate: true })
    }

    const item = await prisma.techRadarItem.create({
      data: {
        name: normalizedName,
        category: body.category,
        status: body.status,
        description: body.description || null,
        url: body.url || null,
        source: body.source || null,
        tags: JSON.stringify(body.tags),
      },
    })
    return NextResponse.json({ ...item, tags: parseTags(item.tags) }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '저장에 실패했습니다.' },
      { status: 400 }
    )
  }
}
```

- [ ] 2. TypeScript 검사 실행 (기존 오류 무시):
```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit 2>&1 | grep -v "canvas-store\|ga4-client\|watch-keywords"
```

- [ ] 3. 커밋: `feat(api): add tech-radar list and create endpoints`

---

### Task 3: Tech Radar API (PATCH + DELETE)

Files: Create `app/api/tech-radar/[id]/route.ts`

Steps:

- [ ] 1. `app/api/tech-radar/[id]/route.ts` 파일을 생성한다:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  status: z.enum(['adopted', 'assessing', 'hold']).optional(),
  category: z.enum(['marketing', 'tech']).optional(),
  description: z.string().max(1000).optional().nullable(),
  url: z.string().url().optional().nullable().or(z.literal('')),
  tags: z.array(z.string().max(50)).max(20).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: '수정할 필드가 없습니다.' })

function parseTags(raw: string): string[] {
  try { return JSON.parse(raw) } catch { return [] }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = patchSchema.parse(await req.json())
    const data: Record<string, unknown> = { ...body }
    if (body.tags !== undefined) data.tags = JSON.stringify(body.tags)

    const item = await prisma.techRadarItem.update({ where: { id }, data })
    return NextResponse.json({ ...item, tags: parseTags(item.tags) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '수정에 실패했습니다.' },
      { status: 400 }
    )
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.techRadarItem.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '삭제에 실패했습니다.' },
      { status: 400 }
    )
  }
}
```

- [ ] 2. TypeScript 검사 실행 (기존 오류 무시):
```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit 2>&1 | grep -v "canvas-store\|ga4-client\|watch-keywords"
```

- [ ] 3. 커밋: `feat(api): add tech-radar update and delete endpoints`

---

## Chunk 2: GitHub 수집 + 크론

### Task 4: GitHub Trending 수집기

Files: Create `lib/tech-radar/github-collector.ts`

Steps:

- [ ] 1. `lib/tech-radar/` 디렉토리를 생성한다:
```bash
mkdir -p "/Users/rnr/Documents/New project/lib/tech-radar"
```

- [ ] 2. `lib/tech-radar/github-collector.ts` 파일을 생성한다:

```typescript
import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'

const LANGUAGES = ['typescript', 'javascript', 'python']
const MIN_STARS = 1000
const MIN_WEEKLY = 50

interface TrendingRepo {
  name: string
  description: string
  url: string
  stars: number
  weeklyStars: number
}

function parseNumber(s: string): number {
  return parseInt(s.replace(/,/g, '').trim()) || 0
}

async function fetchTrending(lang: string): Promise<TrendingRepo[]> {
  const res = await fetch(`https://github.com/trending/${lang}?since=weekly`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Garnet/1.0)' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) return []

  const html = await res.text()
  const repos: TrendingRepo[] = []

  // Parse each repo article
  const articlePattern = /<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>([\s\S]*?)<\/article>/gi
  let match: RegExpExecArray | null

  while ((match = articlePattern.exec(html)) !== null) {
    const block = match[1]

    // Repo name: owner/repo
    const nameMatch = block.match(/href="\/([^"]+\/[^"]+)"[^>]*>\s*[\s\S]*?<\/a>/)
    const fullName = nameMatch?.[1]?.trim()
    if (!fullName || fullName.includes('/pulls') || fullName.includes('/issues')) continue

    // Description
    const descMatch = block.match(/<p[^>]*class="[^"]*col-9[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/p>/)
    const description = descMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || ''

    // Stars total
    const starsMatch = block.match(/aria-label="[^"]*star[^"]*"[^>]*>[\s\S]*?([\d,]+)\s*<\/a>/i)
    const stars = parseNumber(starsMatch?.[1] || '0')

    // Weekly stars gained
    const weeklyMatch = block.match(/([\d,]+)\s*stars this week/i)
    const weeklyStars = parseNumber(weeklyMatch?.[1] || '0')

    if (stars < MIN_STARS && weeklyStars < MIN_WEEKLY) continue

    repos.push({
      name: fullName,
      description,
      url: `https://github.com/${fullName}`,
      stars,
      weeklyStars,
    })
  }

  return repos
}

async function classifyRepo(repo: TrendingRepo): Promise<'marketing' | 'tech' | 'irrelevant'> {
  try {
    const result = await runLLM(
      '너는 GitHub 레포지토리 분류기다. 반드시 marketing, tech, irrelevant 중 하나만 답해라. 설명 없이 단어만.',
      `레포: ${repo.name}\n설명: ${repo.description || '없음'}\n\n마케팅 자동화/SNS/콘텐츠/분석 도구면 "marketing", 프레임워크/라이브러리/AI/인프라면 "tech", 그 외면 "irrelevant"`,
      0.1,
      10
    )
    const label = result.trim().toLowerCase()
    if (label === 'marketing' || label === 'tech') return label
    return 'irrelevant'
  } catch {
    return 'irrelevant'
  }
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim()
}

export async function collectGithubTrending(): Promise<{ added: number; skipped: number }> {
  let added = 0
  let skipped = 0
  const seen = new Set<string>()

  for (const lang of LANGUAGES) {
    const repos = await fetchTrending(lang)

    for (const repo of repos) {
      const normalizedName = normalizeName(repo.name)
      if (seen.has(normalizedName)) continue
      seen.add(normalizedName)

      // Skip if already in radar
      const existing = await prisma.techRadarItem.findUnique({ where: { name: normalizedName } })
      if (existing) {
        await prisma.techRadarItem.update({ where: { name: normalizedName }, data: { updatedAt: new Date() } })
        skipped++
        continue
      }

      const category = await classifyRepo(repo)
      if (category === 'irrelevant') {
        skipped++
        continue
      }

      await prisma.techRadarItem.create({
        data: {
          name: normalizedName,
          category,
          status: 'assessing',
          description: repo.description || null,
          url: repo.url,
          source: 'github',
          tags: JSON.stringify([lang]),
        },
      })
      added++
    }

    // Rate limiting: 500ms between languages
    await new Promise((r) => setTimeout(r, 500))
  }

  return { added, skipped }
}
```

- [ ] 3. TypeScript 검사 실행 (기존 오류 무시):
```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit 2>&1 | grep -v "canvas-store\|ga4-client\|watch-keywords"
```

- [ ] 4. 커밋: `feat(collector): add GitHub Trending collector for Tech Radar`

---

### Task 5: 크론 라우트 + 스케줄러 등록

Files:
- Create `app/api/cron/tech-radar-collect/route.ts`
- Modify `lib/scheduler/register-jobs.ts`

Steps:

- [ ] 1. `app/api/cron/tech-radar-collect/route.ts` 파일을 생성한다:

```typescript
import { collectGithubTrending } from '@/lib/tech-radar/github-collector'

export async function GET(req: Request): Promise<Response> {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const result = await collectGithubTrending()
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[cron] tech-radar-collect 실패', err)
    return new Response('Internal Server Error', { status: 500 })
  }
}
```

- [ ] 2. `lib/scheduler/register-jobs.ts`를 수정한다. `COLLECTION_JOBS` 배열의 마지막 항목(quota-reset 엔트리) 바로 앞에 다음 항목을 추가한다:

```typescript
  {
    id: 'tech-radar-collect',
    name: 'Tech Radar 수집',
    description: 'GitHub Trending에서 기술/마케팅 도구 후보를 수집하고 Gemini로 분류합니다.',
    cron: '0 9 * * *',
    category: 'collect',
    enabled: true,
    handler: async () => {
      const { collectGithubTrending } = await import('@/lib/tech-radar/github-collector')
      const result = await collectGithubTrending()
      return { ok: true, message: `tech-radar 수집 완료: ${result.added}개 추가, ${result.skipped}개 건너뜀` }
    },
  },
```

- [ ] 3. TypeScript 검사 실행 (기존 오류 무시):
```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit 2>&1 | grep -v "canvas-store\|ga4-client\|watch-keywords"
```

- [ ] 4. 커밋: `feat(cron): add tech-radar-collect cron job`

---

## Chunk 3: UI

### Task 6: Tech Radar 페이지

Files: Create `app/(domains)/tech-radar/page.tsx`

Steps:

- [ ] 1. `app/(domains)/tech-radar/page.tsx` 파일을 생성한다:

```typescript
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
```

- [ ] 2. TypeScript 검사 실행 (기존 오류 무시):
```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit 2>&1 | grep -v "canvas-store\|ga4-client\|watch-keywords"
```

- [ ] 3. 커밋: `feat(ui): add Tech Radar page with SVG radar chart`

---

### Task 7: 사이드바 + Intel 연동

Files:
- Modify `components/app-nav.tsx`
- Modify `app/(domains)/intel/page.tsx`

Steps:

- [ ] 1. `components/app-nav.tsx`를 수정한다.

  a. `BookOpenIcon` 함수 아래에 `RadarIcon` 함수를 추가한다:

```typescript
function RadarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  )
}
```

  b. `아카이브` navGroup의 items 배열에 다음 항목을 추가한다 (`{ href: '/research', ... }` 다음):

```typescript
{ href: '/tech-radar', label: '테크 레이더', icon: <RadarIcon /> },
```

- [ ] 2. `app/(domains)/intel/page.tsx`를 수정한다.

  a. `IntelPage` 컴포넌트 내 상태에 다음 두 state를 추가한다 (`savedIds` state 바로 아래):

```typescript
  const [radarSavedIds, setRadarSavedIds] = useState<Set<string>>(new Set())
  const [radarModal, setRadarModal]       = useState<{
    open: boolean
    itemId: string
    name: string
    url: string
    description: string
    category: 'marketing' | 'tech'
    status: 'adopted' | 'assessing' | 'hold'
  } | null>(null)
```

  b. `saveToResearch` 함수 아래에 다음 함수들을 추가한다:

```typescript
  function openRadarModal(item: IntelItem) {
    setRadarModal({
      open: true,
      itemId: item.id,
      name: item.title,
      url: item.url || '',
      description: item.snippet || '',
      category: 'tech',
      status: 'assessing',
    })
  }

  async function saveToRadar() {
    if (!radarModal) return
    await fetch('/api/tech-radar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: radarModal.name,
        category: radarModal.category,
        status: radarModal.status,
        description: radarModal.description || undefined,
        url: radarModal.url || undefined,
        source: 'intel',
        tags: [],
      }),
    })
    setRadarSavedIds((prev) => new Set([...prev, radarModal.itemId]))
    setRadarModal(null)
  }
```

  c. `IntelCard` 컴포넌트의 props 타입에 `radarSaved` 및 `onRadarSave` 를 추가한다. `IntelCard` 함수 시그니처를 다음으로 교체한다:

```typescript
function IntelCard({
  item,
  saved,
  onSave,
  radarSaved,
  onRadarSave,
}: {
  item: IntelItem;
  saved: boolean;
  onSave: (item: IntelItem) => void;
  radarSaved: boolean;
  onRadarSave: (item: IntelItem) => void;
}) {
```

  d. `IntelCard` 내부 footer 버튼 영역(`+ 리서치 메모리` 버튼 다음)에 Tech Radar 버튼을 추가한다:

```typescript
        <button
          onClick={() => onRadarSave(item)}
          disabled={radarSaved}
          className="text-xs px-2 py-1 text-zinc-500 hover:text-blue-400 disabled:text-blue-500 transition-colors"
          style={{ background: 'none', border: 'none', cursor: radarSaved ? 'default' : 'pointer', padding: '2px 6px' }}
        >
          {radarSaved ? '✓ 레이더 추가됨' : '+ 테크 레이더'}
        </button>
```

  e. `IntelPage`의 카드 렌더링 부분에서 `IntelCard` 호출에 새 props를 추가한다:

```typescript
              <IntelCard
                key={item.id}
                item={item}
                saved={savedIds.has(item.id)}
                onSave={saveToResearch}
                radarSaved={radarSavedIds.has(item.id)}
                onRadarSave={openRadarModal}
              />
```

  f. `IntelPage` 반환 JSX의 끝(마지막 `</div>` 앞)에 레이더 모달을 추가한다:

```typescript
      {/* Tech Radar 추가 모달 */}
      {radarModal && (
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
          onClick={() => setRadarModal(null)}
        >
          <div
            style={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--surface-border)',
              borderRadius: 14,
              padding: 24,
              width: '100%',
              maxWidth: 420,
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
                onClick={() => setRadarModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18 }}
              >
                ×
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text-strong)' }}>{radarModal.name}</strong>
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>카테고리</label>
                <select
                  value={radarModal.category}
                  onChange={(e) =>
                    setRadarModal((m) => m ? { ...m, category: e.target.value as 'marketing' | 'tech' } : null)
                  }
                  style={{
                    padding: '8px 10px',
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
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>상태</label>
                <select
                  value={radarModal.status}
                  onChange={(e) =>
                    setRadarModal((m) => m ? { ...m, status: e.target.value as 'adopted' | 'assessing' | 'hold' } : null)
                  }
                  style={{
                    padding: '8px 10px',
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
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setRadarModal(null)}
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
                onClick={saveToRadar}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--accent)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] 3. TypeScript 검사 실행 (기존 오류 무시):
```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit 2>&1 | grep -v "canvas-store\|ga4-client\|watch-keywords"
```

- [ ] 4. 커밋: `feat(nav+intel): add Tech Radar to sidebar and intel integration`

---

## 완료 검증 체크리스트

- [ ] `prisma/schema.prisma` — `TechRadarItem` 모델 추가 확인
- [ ] `npx prisma db push` 성공 확인
- [ ] `app/api/tech-radar/route.ts` — GET/POST 동작 확인
- [ ] `app/api/tech-radar/[id]/route.ts` — PATCH/DELETE 동작 확인
- [ ] `lib/tech-radar/github-collector.ts` — 수집기 파일 존재 확인
- [ ] `app/api/cron/tech-radar-collect/route.ts` — 크론 라우트 존재 확인
- [ ] `lib/scheduler/register-jobs.ts` — `tech-radar-collect` 잡 등록 확인
- [ ] `app/(domains)/tech-radar/page.tsx` — 페이지 존재 및 SVG 렌더 확인
- [ ] `components/app-nav.tsx` — 아카이브 섹션에 테크 레이더 링크 확인
- [ ] `app/(domains)/intel/page.tsx` — 인텔 카드에 테크 레이더 버튼 확인
- [ ] `npx tsc --noEmit` — 신규 오류 없음 확인
