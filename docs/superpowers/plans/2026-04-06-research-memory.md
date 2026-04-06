# Research Memory Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외부 아티클/트렌드와 내부 캠페인 인사이트를 저장하고 태그/키워드로 검색하는 지식 저장소 구축.

**Architecture:** Prisma에 ResearchMemory 모델 추가 → CRUD API 라우트 → `/research` 페이지 (클라이언트 컴포넌트) → 사이드바 추가. URL 저장 시 서버사이드에서 og:title/description 파싱. 태그는 JSON 문자열로 저장 (기존 패턴 유지).

**Tech Stack:** Next.js App Router, TypeScript, Prisma (PostgreSQL), Zod, Tailwind CSS

---

## Chunk 1: 데이터 레이어

### Task 1: Prisma 모델 추가

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: schema.prisma에 ResearchMemory 모델 추가**

`prisma/schema.prisma` 파일 맨 끝에 다음을 추가:

```prisma
model ResearchMemory {
  id        String   @id @default(cuid())
  title     String
  content   String?
  url       String?
  type      String   // "external" | "internal"
  tags      String   @default("[]") // JSON array string
  source    String?
  savedAt   DateTime @default(now())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([type])
  @@index([createdAt])
}
```

- [ ] **Step 2: 마이그레이션 생성 및 적용**

```bash
cd "/Users/rnr/Documents/New project"
npx prisma migrate dev --name add_research_memory
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add ResearchMemory model"
```

---

### Task 2: URL 메타데이터 추출 API

**Files:**
- Create: `app/api/research/fetch-meta/route.ts`

- [ ] **Step 1: fetch-meta 라우트 생성**

`app/api/research/fetch-meta/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({ url: z.string().url() })

function extractMeta(html: string): { title: string; description: string } {
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1]
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1]
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]

  const title = (ogTitle || titleTag || '').trim().slice(0, 200)
  const description = (ogDesc || '').trim().slice(0, 500)

  return { title, description }
}

export async function POST(req: Request) {
  try {
    const { url } = schema.parse(await req.json())

    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Garnet/1.0)' },
    })

    if (!res.ok) {
      return NextResponse.json({ title: '', description: '' })
    }

    const html = await res.text()
    const meta = extractMeta(html)

    return NextResponse.json(meta)
  } catch {
    return NextResponse.json({ title: '', description: '' })
  }
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/api/research/fetch-meta/route.ts
git commit -m "feat(api): add research fetch-meta endpoint"
```

---

## Chunk 2: CRUD API

### Task 3: Research API (목록 조회 + 생성)

**Files:**
- Create: `app/api/research/route.ts`

- [ ] **Step 1: GET + POST 라우트 생성**

`app/api/research/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  title: z.string().min(1).max(300),
  content: z.string().max(5000).optional(),
  url: z.string().url().optional().or(z.literal('')),
  type: z.enum(['external', 'internal']),
  tags: z.array(z.string().max(50)).max(20).default([]),
  source: z.string().max(200).optional(),
  savedAt: z.string().datetime().optional(),
})

function parseTags(raw: string): string[] {
  try { return JSON.parse(raw) } catch { return [] }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || ''
  const type = searchParams.get('type')?.trim() || ''
  const tags = searchParams.get('tags')?.trim() || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.min(50, parseInt(searchParams.get('limit') || '20'))

  const where: Record<string, unknown> = {}
  if (type === 'external' || type === 'internal') where.type = type
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { content: { contains: q, mode: 'insensitive' } },
      { source: { contains: q, mode: 'insensitive' } },
      { tags: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.researchMemory.findMany({
      where,
      orderBy: { savedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.researchMemory.count({ where }),
  ])

  // tag client-side filter (JSON string search is already handled via q)
  const parsed = items.map((item) => ({
    ...item,
    tags: parseTags(item.tags),
    savedAt: item.savedAt.toISOString(),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }))

  // Filter by tags if provided (client filter after parsing)
  const tagFilter = tags ? tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) : []
  const filtered = tagFilter.length > 0
    ? parsed.filter((item) => tagFilter.every((t) => item.tags.some((tag) => tag.toLowerCase().includes(t))))
    : parsed

  return NextResponse.json({ items: filtered, total, page, limit })
}

export async function POST(req: Request) {
  try {
    const body = createSchema.parse(await req.json())
    const item = await prisma.researchMemory.create({
      data: {
        title: body.title,
        content: body.content || null,
        url: body.url || null,
        type: body.type,
        tags: JSON.stringify(body.tags),
        source: body.source || null,
        savedAt: body.savedAt ? new Date(body.savedAt) : new Date(),
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

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/api/research/route.ts
git commit -m "feat(api): add research list and create endpoints"
```

---

### Task 4: Research API (수정 + 삭제)

**Files:**
- Create: `app/api/research/[id]/route.ts`

- [ ] **Step 1: PATCH + DELETE 라우트 생성**

`app/api/research/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  content: z.string().max(5000).optional().nullable(),
  url: z.string().url().optional().nullable().or(z.literal('')),
  type: z.enum(['external', 'internal']).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  source: z.string().max(200).optional().nullable(),
  savedAt: z.string().datetime().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: '수정할 필드가 없습니다.' })

function parseTags(raw: string): string[] {
  try { return JSON.parse(raw) } catch { return [] }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = patchSchema.parse(await req.json())
    const data: Record<string, unknown> = { ...body }
    if (body.tags !== undefined) data.tags = JSON.stringify(body.tags)
    if (body.savedAt !== undefined) data.savedAt = new Date(body.savedAt)

    const item = await prisma.researchMemory.update({
      where: { id: params.id },
      data,
    })
    return NextResponse.json({ ...item, tags: parseTags(item.tags) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '수정에 실패했습니다.' },
      { status: 400 }
    )
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.researchMemory.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '삭제에 실패했습니다.' },
      { status: 400 }
    )
  }
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/api/research/[id]/route.ts
git commit -m "feat(api): add research update and delete endpoints"
```

---

## Chunk 3: UI

### Task 5: Research 페이지

**Files:**
- Create: `app/(domains)/research/page.tsx`

- [ ] **Step 1: 페이지 컴포넌트 생성**

`app/(domains)/research/page.tsx`:

```typescript
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
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/(domains)/research/page.tsx
git commit -m "feat(ui): add Research Memory page"
```

---

### Task 6: 사이드바 네비게이션 추가

**Files:**
- Modify: `components/app-nav.tsx`

- [ ] **Step 1: app-nav.tsx 열기**

`components/app-nav.tsx`에서 `navGroups` 배열을 찾는다.

- [ ] **Step 2: 아카이브 그룹에 리서치 메모리 항목 추가**

기존 아카이브 그룹(`아카이브` 또는 `성과` navGroup)에 다음 항목 추가:

```typescript
{ href: '/research', label: '리서치 메모리', icon: <BookOpenIcon /> }
```

BookOpenIcon SVG 함수 추가 (다른 아이콘 함수 패턴 참고):

```typescript
function BookOpenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add components/app-nav.tsx
git commit -m "feat(nav): add Research Memory to sidebar"
```

---

### Task 7: /intel 연동 — "Research Memory에 저장" 버튼

**Files:**
- Modify: `app/(domains)/intel/page.tsx`

- [ ] **Step 1: intel/page.tsx에서 인텔 카드 컴포넌트 찾기**

인텔 아이템 카드 렌더링 부분을 찾는다.

- [ ] **Step 2: "Research Memory에 저장" 버튼 추가**

인텔 카드 액션 영역에 버튼 추가 및 저장 함수 구현:

```typescript
async function saveToResearch(item: IntelItem) {
  await fetch('/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: item.title,
      url: item.url || undefined,
      type: 'external',
      tags: item.tags || [],
      source: item.platform || undefined,
    }),
  })
  // 간단한 피드백 (toast 없으면 alert 대신 상태로)
  setSavedIds((prev) => new Set([...prev, item.id]))
}
```

버튼 추가 (카드 하단):
```typescript
<button
  onClick={() => saveToResearch(item)}
  disabled={savedIds.has(item.id)}
  className="text-xs px-2 py-1 text-zinc-500 hover:text-cyan-400 disabled:text-green-500 transition-colors"
>
  {savedIds.has(item.id) ? '✓ 저장됨' : '+ 리서치 메모리'}
</button>
```

`savedIds` 상태 추가:
```typescript
const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add app/(domains)/intel/page.tsx
git commit -m "feat(intel): add save to Research Memory button"
```

---

## 완료 후 검증

- [ ] `/research` 페이지 접속 확인
- [ ] 새 항목 추가 (URL + 제목 자동 추출 테스트)
- [ ] 직접 메모 추가 (내부 타입)
- [ ] 검색/필터 동작 확인
- [ ] 수정/삭제 확인
- [ ] `/intel`에서 "리서치 메모리" 버튼으로 저장 → `/research`에서 확인
- [ ] 사이드바 항목 확인
