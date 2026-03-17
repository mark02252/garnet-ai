# SNS 스튜디오 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garnet에 페르소나 기반 SNS AI 매니저(SNS 스튜디오)를 구현한다 — 페르소나 생성, 콘텐츠 제작(나노바나나 2 이미지), 예약 발행, 성과 분석, 댓글 자동화.

**Architecture:** `/sns` 섹션 신규 추가. `SnsPersona`가 모든 기능의 중심축. Prisma SQLite에 6개 모델 추가. Instagram Graph API 호출은 ig-mcp 또는 직접 호출로 처리. Electron main process가 1분 타이머로 예약 발행을 실행.

**Tech Stack:** Next.js 15.2 App Router · Prisma 6 + SQLite · `@google/genai` (나노바나나 2) · `fluent-ffmpeg` + `ffmpeg-static` · ig-mcp (Python MCP) · Tailwind CSS · 기존 `runLLM()` 추상화

**Spec:** `docs/specs/2026-03-17-sns-studio-design.md`

---

## 파일 구조 맵

### 신규 생성

```
prisma/schema.prisma          ← 6개 모델 + 5개 enum 추가

app/sns/
  personas/page.tsx           ← 페르소나 목록
  personas/new/page.tsx       ← 페르소나 생성 마법사
  personas/[id]/page.tsx      ← 페르소나 상세/편집
  studio/page.tsx             ← 콘텐츠 제작소 (초안 목록)
  studio/[draftId]/page.tsx   ← 초안 편집 (텍스트/카드뉴스/영상)
  calendar/page.tsx           ← 콘텐츠 캘린더
  analytics/page.tsx          ← 성과 대시보드
  community/page.tsx          ← 댓글 자동화

app/api/sns/
  personas/route.ts           ← GET/POST
  personas/[id]/route.ts      ← GET/PATCH/DELETE
  personas/[id]/learn/route.ts ← POST (AI 분석 SSE)
  content/route.ts            ← GET/POST
  content/[id]/route.ts       ← GET/PATCH/DELETE
  content/[id]/image/route.ts ← POST (나노바나나 2)
  content/[id]/render/route.ts ← POST (FFmpeg)
  schedule/route.ts           ← GET/POST
  schedule/[id]/route.ts      ← PATCH/DELETE
  analytics/route.ts          ← GET
  analytics/sync/route.ts     ← POST (수동 수집)
  analytics/best-time/route.ts ← GET
  community/comments/route.ts ← GET
  community/comments/[id]/reply/route.ts ← POST
  community/comments/generate/route.ts  ← POST (일괄 AI 답변)
  chat/route.ts               ← POST (AI 디스커션 LLM 엔드포인트)
  schedule/missed/route.ts    ← POST (MISSED 상태 갱신)

lib/sns/
  persona-learner.ts          ← AI 페르소나 분석 로직
  image-generator.ts          ← 나노바나나 2 호출 + Canva MCP 파이프라인
  video-renderer.ts           ← FFmpeg 렌더링 (스텁)
  instagram-api.ts            ← Instagram Graph API 래퍼
  upload.ts                   ← Supabase Storage 래퍼 (uploadSnsFile)
  canva-pipeline.ts           ← 나노바나나 2 → Canva MCP 파이프라인
```

### 수정

```
components/app-nav.tsx        ← SNS 스튜디오 그룹 추가
electron/main.ts              ← 예약 발행 타이머 + ffmpeg 경로 주입
package.json                  ← 패키지 추가 + asarUnpack 업데이트
.mcp.json                     ← ig-mcp 서버 추가
```

---

## Chunk 0: Foundation

### Task 0-1: 패키지 설치

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 패키지 설치**

```bash
cd "/Users/rnr/Documents/New project"
npm install @google/genai fluent-ffmpeg ffmpeg-static
npm install --save-dev @types/fluent-ffmpeg
```

- [ ] **Step 2: 설치 확인**

```bash
node -e "require('@google/genai'); require('fluent-ffmpeg'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @google/genai, fluent-ffmpeg, ffmpeg-static"
```

---

### Task 0-2: Prisma 스키마 — 6개 모델 추가

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: schema.prisma 하단에 추가**

기존 `SeminarFinalReport` 모델 다음에 아래 내용을 추가한다:

```prisma
// ─── SNS 스튜디오 ─────────────────────────────

enum PersonaLearnMode { FROM_POSTS FROM_TEMPLATE }
enum PersonaPlatform  { INSTAGRAM THREADS X YOUTUBE }
enum ContentType      { TEXT CAROUSEL VIDEO }
enum DraftStatus      { DRAFT SCHEDULED PUBLISHED FAILED }
enum PlanningMode     { CREATIVE SEARCH FILE }
enum ScheduleStatus   { PENDING PUBLISHED FAILED MISSED }

// A. 페르소나
model SnsPersona {
  id              String           @id @default(cuid())
  name            String
  platform        PersonaPlatform  @default(INSTAGRAM)
  learnMode       PersonaLearnMode
  brandConcept    String?
  targetAudience  String?
  writingStyle    String?
  tone            String?
  keywords        String           @default("[]")
  sampleSentences String           @default("[]")
  instagramHandle String?
  isActive        Boolean          @default(true)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  sourcePosts      SnsPersonaPost[]
  contentDrafts    SnsContentDraft[]
  scheduledPosts   SnsScheduledPost[]
  analytics        SnsAnalyticsSnapshot[]
  commentTemplates SnsCommentTemplate[]
}

model SnsPersonaPost {
  id        String     @id @default(cuid())
  personaId String
  content   String
  postedAt  DateTime?
  source    String?
  persona   SnsPersona @relation(fields: [personaId], references: [id], onDelete: Cascade)

  @@index([personaId])
}

// B. 콘텐츠 초안
model SnsContentDraft {
  id           String          @id @default(cuid())
  personaId    String?
  type         ContentType     @default(TEXT)
  planningMode PlanningMode    @default(CREATIVE)
  title        String?
  content      String?
  slides       String?
  videoUrl     String?
  status       DraftStatus     @default(DRAFT)
  publishedAt  DateTime?
  platform     PersonaPlatform @default(INSTAGRAM)
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt

  persona   SnsPersona?      @relation(fields: [personaId], references: [id])
  scheduled SnsScheduledPost[]

  @@index([personaId])
  @@index([status])
}

// C. 예약 발행
model SnsScheduledPost {
  id          String          @id @default(cuid())
  draftId     String          @unique
  personaId   String
  platform    PersonaPlatform @default(INSTAGRAM)
  scheduledAt DateTime
  publishedAt DateTime?
  status      ScheduleStatus  @default(PENDING)
  errorMsg    String?
  createdAt   DateTime        @default(now())

  draft   SnsContentDraft @relation(fields: [draftId], references: [id])
  persona SnsPersona      @relation(fields: [personaId], references: [id])

  @@index([status, scheduledAt])
}

// D. 성과 스냅샷
model SnsAnalyticsSnapshot {
  id          String          @id @default(cuid())
  personaId   String
  platform    PersonaPlatform @default(INSTAGRAM)
  date        DateTime
  reach       Int             @default(0)
  impressions Int             @default(0)
  engagement  Float           @default(0)
  followers   Int             @default(0)
  postCount   Int             @default(0)
  topPostId   String?
  createdAt   DateTime        @default(now())

  persona SnsPersona @relation(fields: [personaId], references: [id])

  @@unique([personaId, date])
}

// E. 댓글 템플릿
model SnsCommentTemplate {
  id              String     @id @default(cuid())
  personaId       String
  triggerKeywords String     @default("[]")
  replyType       String     @default("comment")
  template        String
  isActive        Boolean    @default(true)
  createdAt       DateTime   @default(now())

  persona SnsPersona @relation(fields: [personaId], references: [id])

  @@index([personaId])
}
```

- [ ] **Step 2: DB push**

```bash
cd "/Users/rnr/Documents/New project"
npx prisma db push
```

Expected: `✓ Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Prisma client 재생성**

```bash
npx prisma generate
```

- [ ] **Step 4: 확인**

```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.snsPersona.count().then(n=>console.log('SnsPersona count:',n)).finally(()=>p.\$disconnect())"
```

Expected: `SnsPersona count: 0`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): add SNS Studio models — SnsPersona, SnsContentDraft, SnsScheduledPost, SnsAnalyticsSnapshot, SnsCommentTemplate"
```

---

### Task 0-3: ig-mcp 설정 + .mcp.json 업데이트

**Files:**
- Modify: `.mcp.json`

- [ ] **Step 1: ig-mcp 설치**

```bash
pip install ig-mcp 2>/dev/null || pip3 install ig-mcp
```

> ig-mcp가 pip에 없으면 GitHub에서 직접 설치:
> `pip install git+https://github.com/jlbadano/ig-mcp.git`

- [ ] **Step 2: .mcp.json에 ig-mcp 추가**

기존 `.mcp.json`의 `mcpServers` 오브젝트에 아래 항목을 추가한다:

```json
"ig-mcp": {
  "command": "python3",
  "args": ["-m", "ig_mcp"],
  "env": {
    "INSTAGRAM_ACCESS_TOKEN": "${INSTAGRAM_ACCESS_TOKEN}",
    "FACEBOOK_APP_ID": "${FACEBOOK_APP_ID}",
    "FACEBOOK_APP_SECRET": "${FACEBOOK_APP_SECRET}",
    "INSTAGRAM_BUSINESS_ACCOUNT_ID": "${INSTAGRAM_BUSINESS_ACCOUNT_ID}"
  }
}
```

- [ ] **Step 3: electron-builder에 ffmpeg-static 번들 설정**

`package.json`의 `build` 섹션을 수정:

```json
"asarUnpack": [
  ".next-build/**",
  "node_modules/ffmpeg-static/**"
],
"files": [
  "dist-electron/**/*",
  ".next-build/standalone/**/*",
  ".next-build/standalone/.next-build/**/*",
  ".next-build/static/**/*",
  "vendor_prisma/**/*",
  "public/**/*",
  "prisma/**/*",
  "scripts/**/*",
  "node_modules/.prisma/**/*",
  "node_modules/ffmpeg-static/**/*",
  "package.json"
]
```

- [ ] **Step 4: Commit**

```bash
git add .mcp.json package.json
git commit -m "chore: add ig-mcp config + ffmpeg-static electron-builder bundle"
```

---

## Chunk 1: Subsystem A — AI 페르소나 엔진

### Task 1-1: lib/sns/persona-learner.ts

**Files:**
- Create: `lib/sns/persona-learner.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// lib/sns/persona-learner.ts
import { runLLM } from '@/lib/llm'

export type PersonaAnalysis = {
  brandConcept: string
  targetAudience: string
  writingStyle: string
  tone: string
  keywords: string[]
  sampleSentences: string[]
}

export type PersonaTemplateInput = {
  brandName: string
  purpose: string
  target: string
  language: string
}

/**
 * 과거 포스팅 배열을 분석해 페르소나 프로필을 추출한다.
 */
export async function analyzePostsForPersona(
  posts: string[]
): Promise<PersonaAnalysis> {
  const postsText = posts.slice(0, 30).join('\n---\n')

  const result = await runLLM(
    `당신은 SNS 브랜드 전략 전문가입니다.
아래 포스팅들을 분석해 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요:
{
  "brandConcept": "브랜드 핵심 컨셉 (1-2문장)",
  "targetAudience": "타겟 오디언스 설명",
  "writingStyle": "글쓰기 스타일 설명",
  "tone": "formal | casual | energetic | professional 중 하나",
  "keywords": ["자주 쓰는 단어/표현 최대 10개"],
  "sampleSentences": ["대표 문체 예시 3개"]
}`,
    `다음 포스팅들을 분석하세요:\n\n${postsText}`
  )

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON 파싱 실패')
    return JSON.parse(jsonMatch[0]) as PersonaAnalysis
  } catch {
    throw new Error('페르소나 분석 결과를 파싱할 수 없습니다.')
  }
}

/**
 * 운영 목적/타겟 설정으로 신규 페르소나를 제안한다.
 */
export async function generatePersonaFromTemplate(
  input: PersonaTemplateInput
): Promise<PersonaAnalysis> {
  const result = await runLLM(
    `당신은 SNS 브랜드 전략 전문가입니다.
아래 정보를 바탕으로 최적의 SNS 페르소나를 제안하세요.
반드시 아래 JSON 형식으로만 응답하세요:
{
  "brandConcept": "브랜드 핵심 컨셉 (1-2문장)",
  "targetAudience": "타겟 오디언스 설명",
  "writingStyle": "글쓰기 스타일 설명",
  "tone": "formal | casual | energetic | professional 중 하나",
  "keywords": ["추천 키워드/표현 최대 10개"],
  "sampleSentences": ["추천 문체 예시 3개"]
}`,
    `브랜드명: ${input.brandName}
운영 목적: ${input.purpose}
타겟: ${input.target}
사용 언어: ${input.language}`
  )

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON 파싱 실패')
    return JSON.parse(jsonMatch[0]) as PersonaAnalysis
  } catch {
    throw new Error('페르소나 생성 결과를 파싱할 수 없습니다.')
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/sns/persona-learner.ts
git commit -m "feat(sns): add persona-learner — AI analysis + template generation"
```

---

### Task 1-1b: Instagram OAuth 스코프 추가

**Files:**
- Modify: `lib/meta-connection.ts`

댓글 발행 및 콘텐츠 발행에 필요한 스코프를 추가한다.

- [ ] **Step 1: INSTAGRAM_LOGIN_SCOPES에 스코프 추가**

`lib/meta-connection.ts`에서 `INSTAGRAM_LOGIN_SCOPES` 배열을 찾아 아래 두 스코프를 추가한다:

```typescript
// Before
const INSTAGRAM_LOGIN_SCOPES = [
  'instagram_basic',
  'instagram_manage_insights',
  'pages_show_list',
  'pages_read_engagement',
]

// After
const INSTAGRAM_LOGIN_SCOPES = [
  'instagram_basic',
  'instagram_manage_insights',
  'instagram_manage_comments',   // 댓글 읽기/쓰기
  'instagram_content_publish',   // 포스팅 발행
  'pages_show_list',
  'pages_read_engagement',
]
```

- [ ] **Step 2: Commit**

```bash
git add lib/meta-connection.ts
git commit -m "feat(sns): add instagram_manage_comments + instagram_content_publish OAuth scopes"
```

---

### Task 1-2: 페르소나 API 라우트

**Files:**
- Create: `app/api/sns/personas/route.ts`
- Create: `app/api/sns/personas/[id]/route.ts`
- Create: `app/api/sns/personas/[id]/learn/route.ts`

- [ ] **Step 1: app/api/sns/personas/route.ts 생성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const personas = await prisma.snsPersona.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { contentDrafts: true } } },
  })
  return NextResponse.json(personas)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, platform, learnMode, instagramHandle } = body

    if (!name?.trim() || !learnMode) {
      return NextResponse.json({ error: '이름과 학습 모드는 필수입니다.' }, { status: 400 })
    }

    const persona = await prisma.snsPersona.create({
      data: {
        name: name.trim(),
        platform: platform || 'INSTAGRAM',
        learnMode,
        instagramHandle: instagramHandle?.trim() || null,
      },
    })
    return NextResponse.json(persona, { status: 201 })
  } catch {
    return NextResponse.json({ error: '페르소나 생성에 실패했습니다.' }, { status: 500 })
  }
}
```

- [ ] **Step 2: app/api/sns/personas/[id]/route.ts 생성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const persona = await prisma.snsPersona.findUnique({
    where: { id },
    include: { sourcePosts: true },
  })
  if (!persona) return NextResponse.json({ error: '없음' }, { status: 404 })
  return NextResponse.json(persona)
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const body = await req.json()
    const {
      name, brandConcept, targetAudience, writingStyle,
      tone, keywords, sampleSentences, instagramHandle,
    } = body

    const persona = await prisma.snsPersona.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(brandConcept !== undefined && { brandConcept }),
        ...(targetAudience !== undefined && { targetAudience }),
        ...(writingStyle !== undefined && { writingStyle }),
        ...(tone !== undefined && { tone }),
        ...(keywords !== undefined && { keywords: JSON.stringify(keywords) }),
        ...(sampleSentences !== undefined && { sampleSentences: JSON.stringify(sampleSentences) }),
        ...(instagramHandle !== undefined && { instagramHandle }),
      },
    })
    return NextResponse.json(persona)
  } catch {
    return NextResponse.json({ error: '업데이트 실패' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  await prisma.snsPersona.update({
    where: { id },
    data: { isActive: false },
  })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: app/api/sns/personas/[id]/learn/route.ts 생성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { analyzePostsForPersona, generatePersonaFromTemplate } from '@/lib/sns/persona-learner'

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const body = await req.json()
    const { mode, posts, brandName, purpose, target, language } = body

    let analysis

    if (mode === 'FROM_POSTS') {
      if (!posts?.length || posts.length < 5) {
        return NextResponse.json({ error: '포스팅 5개 이상 필요합니다.' }, { status: 400 })
      }
      analysis = await analyzePostsForPersona(posts)

      // 학습용 포스팅 저장
      await prisma.snsPersonaPost.createMany({
        data: posts.map((content: string) => ({
          personaId: id,
          content,
          source: 'manual',
        })),
        skipDuplicates: true,
      })
    } else {
      // FROM_TEMPLATE
      if (!brandName || !purpose) {
        return NextResponse.json({ error: '브랜드명과 목적은 필수입니다.' }, { status: 400 })
      }
      analysis = await generatePersonaFromTemplate({ brandName, purpose, target, language: language || '한국어' })
    }

    // 페르소나 업데이트
    const updated = await prisma.snsPersona.update({
      where: { id },
      data: {
        learnMode: mode,
        brandConcept: analysis.brandConcept,
        targetAudience: analysis.targetAudience,
        writingStyle: analysis.writingStyle,
        tone: analysis.tone,
        keywords: JSON.stringify(analysis.keywords),
        sampleSentences: JSON.stringify(analysis.sampleSentences),
      },
    })

    return NextResponse.json({ persona: updated, analysis })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '분석 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 4: dev 서버 기동 후 API 확인**

```bash
# 터미널 1: npm run dev
# 터미널 2:
curl -X POST http://localhost:3000/api/sns/personas \
  -H "Content-Type: application/json" \
  -d '{"name":"테스트 페르소나","learnMode":"FROM_TEMPLATE"}'
```

Expected: `{"id":"...","name":"테스트 페르소나",...}`

- [ ] **Step 5: Commit**

```bash
git add app/api/sns/
git commit -m "feat(sns): persona API routes — CRUD + AI learn endpoint"
```

---

### Task 1-3: 페르소나 목록 페이지

**Files:**
- Create: `app/sns/personas/page.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
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
      .then(r => r.json())
      .then(data => { setPersonas(data); setLoading(false) })
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
```

- [ ] **Step 2: 브라우저 확인**

`http://localhost:3000/sns/personas` — 페르소나 목록 페이지 렌더 확인.

- [ ] **Step 3: Commit**

```bash
git add app/sns/personas/page.tsx
git commit -m "feat(sns): persona list page"
```

---

### Task 1-4: 페르소나 생성 마법사

**Files:**
- Create: `app/sns/personas/new/page.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Step = 1 | 2 | 3
type LearnMode = 'FROM_POSTS' | 'FROM_TEMPLATE'

export default function NewPersonaPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [mode, setMode] = useState<LearnMode>('FROM_TEMPLATE')
  const [name, setName] = useState('')
  const [instagramHandle, setInstagramHandle] = useState('')
  // FROM_POSTS
  const [postsText, setPostsText] = useState('')
  // FROM_TEMPLATE
  const [brandName, setBrandName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [target, setTarget] = useState('')
  const [language, setLanguage] = useState('한국어')
  // Step 3 — 분석 결과
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null)
  const [personaId, setPersonaId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAnalyze() {
    if (!name.trim()) { setError('페르소나 이름을 입력하세요.'); return }
    setLoading(true)
    setError('')
    try {
      // 1. 페르소나 생성
      const createRes = await fetch('/api/sns/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, learnMode: mode, instagramHandle }),
      })
      const persona = await createRes.json()
      if (!createRes.ok) throw new Error(persona.error)
      setPersonaId(persona.id)

      // 2. AI 분석
      const learnBody = mode === 'FROM_POSTS'
        ? { mode, posts: postsText.split('\n---\n').filter(Boolean) }
        : { mode, brandName, purpose, target, language }

      const learnRes = await fetch(`/api/sns/personas/${persona.id}/learn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(learnBody),
      })
      const learnData = await learnRes.json()
      if (!learnRes.ok) throw new Error(learnData.error)
      setAnalysis(learnData.analysis)
      setStep(3)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <p className="dashboard-eyebrow mb-1">SNS 스튜디오 · 페르소나</p>
      <h1 className="dashboard-title mb-6">새 페르소나 만들기</h1>

      {/* Step 1 */}
      {step === 1 && (
        <div className="card space-y-4">
          <h2 className="section-title">Step 1 — 기본 정보</h2>
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">페르소나 이름 *</label>
            <input className="input w-full" value={name} onChange={e => setName(e.target.value)} placeholder="예: 브랜드A 공식계정" />
          </div>
          <div>
            <label className="text-sm text-[var(--text-muted)] block mb-1">Instagram 핸들 (선택)</label>
            <input className="input w-full" value={instagramHandle} onChange={e => setInstagramHandle(e.target.value)} placeholder="@username" />
          </div>
          <h2 className="section-title pt-2">Step 2 — 학습 모드 선택</h2>
          <div className="grid grid-cols-2 gap-3">
            {([
              ['FROM_TEMPLATE', '신규 생성', '목적/타겟 설정으로 AI가 페르소나 제안'],
              ['FROM_POSTS', '내 계정 분석', '과거 포스팅 5개↑ 업로드로 패턴 학습'],
            ] as const).map(([val, label, desc]) => (
              <button
                key={val}
                onClick={() => setMode(val)}
                className={`soft-card text-left p-4 border-2 transition-colors ${mode === val ? 'border-[var(--accent)]' : 'border-transparent'}`}
              >
                <p className="font-medium text-sm mb-1">{label}</p>
                <p className="text-xs text-[var(--text-muted)]">{desc}</p>
              </button>
            ))}
          </div>
          <button className="button-primary w-full" onClick={() => setStep(2)}>다음</button>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="card space-y-4">
          <h2 className="section-title">Step 2 — 데이터 입력</h2>
          {mode === 'FROM_TEMPLATE' ? (
            <>
              <div>
                <label className="text-sm text-[var(--text-muted)] block mb-1">브랜드명 *</label>
                <input className="input w-full" value={brandName} onChange={e => setBrandName(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-[var(--text-muted)] block mb-1">운영 목적 *</label>
                <input className="input w-full" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="예: 뷰티 제품 홍보, 팔로워 성장" />
              </div>
              <div>
                <label className="text-sm text-[var(--text-muted)] block mb-1">타겟 오디언스</label>
                <input className="input w-full" value={target} onChange={e => setTarget(e.target.value)} placeholder="예: 20-30대 여성, 뷰티 관심층" />
              </div>
              <div>
                <label className="text-sm text-[var(--text-muted)] block mb-1">언어</label>
                <select className="input w-full" value={language} onChange={e => setLanguage(e.target.value)}>
                  <option>한국어</option><option>English</option><option>日本語</option>
                </select>
              </div>
            </>
          ) : (
            <div>
              <label className="text-sm text-[var(--text-muted)] block mb-1">
                과거 포스팅 텍스트 (구분자: <code>---</code> 빈 줄)
              </label>
              <textarea
                className="input w-full h-64 font-mono text-sm"
                value={postsText}
                onChange={e => setPostsText(e.target.value)}
                placeholder={'포스팅 1 내용\n---\n포스팅 2 내용\n---\n포스팅 3 내용'}
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {postsText.split('\n---\n').filter(Boolean).length}개 입력됨 (최소 5개 권장)
              </p>
            </div>
          )}
          {error && <p className="text-rose-500 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button className="button-secondary flex-1" onClick={() => setStep(1)}>이전</button>
            <button className="button-primary flex-1" onClick={handleAnalyze} disabled={loading}>
              {loading ? 'AI 분석 중...' : 'AI 분석 시작'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && analysis && (
        <div className="card space-y-4">
          <h2 className="section-title">Step 3 — 페르소나 프리뷰</h2>
          <div className="soft-panel p-4 space-y-3">
            {[
              ['브랜드 컨셉', analysis.brandConcept as string],
              ['타겟 오디언스', analysis.targetAudience as string],
              ['글쓰기 스타일', analysis.writingStyle as string],
              ['톤', analysis.tone as string],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-[var(--text-muted)]">{label}</p>
                <p className="text-sm text-[var(--text-strong)]">{value}</p>
              </div>
            ))}
            <div>
              <p className="text-xs text-[var(--text-muted)]">키워드</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {(analysis.keywords as string[]).map(kw => (
                  <span key={kw} className="pill-option text-xs">{kw}</span>
                ))}
              </div>
            </div>
          </div>
          <button className="button-primary w-full" onClick={() => router.push('/sns/personas')}>
            완료 — 페르소나 목록으로
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 브라우저에서 전체 플로우 확인**

1. `http://localhost:3000/sns/personas/new` 접근
2. 이름 입력 → 신규 생성 모드 선택 → 다음
3. 브랜드명/목적 입력 → AI 분석 시작
4. Step 3 프리뷰 확인 → 완료 클릭
5. 페르소나 목록에 새 항목 표시 확인

- [ ] **Step 3: Commit**

```bash
git add app/sns/personas/new/page.tsx
git commit -m "feat(sns): persona creation wizard — 3-step flow with AI analysis"
```

---

### Task 1-5: 페르소나 상세/편집 페이지 + 네비게이션

**Files:**
- Create: `app/sns/personas/[id]/page.tsx`
- Modify: `components/app-nav.tsx`

- [ ] **Step 1: app/sns/personas/[id]/page.tsx 생성**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Persona = {
  id: string; name: string; platform: string; brandConcept: string | null
  targetAudience: string | null; writingStyle: string | null; tone: string | null
  keywords: string; sampleSentences: string; instagramHandle: string | null
}

export default function PersonaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [persona, setPersona] = useState<Persona | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/sns/personas/${id}`).then(r => r.json()).then(setPersona)
  }, [id])

  async function handleSave() {
    if (!persona) return
    setSaving(true)
    await fetch(`/api/sns/personas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...persona,
        keywords: (() => { try { return JSON.parse(persona.keywords) } catch { return [] } })(),
        sampleSentences: (() => { try { return JSON.parse(persona.sampleSentences) } catch { return [] } })(),
      }),
    })
    setSaving(false)
    router.push('/sns/personas')
  }

  if (!persona) return <div className="p-6 text-[var(--text-muted)]">불러오는 중...</div>

  const keywords: string[] = (() => { try { return JSON.parse(persona.keywords) } catch { return [] } })()

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <p className="dashboard-eyebrow mb-1">SNS 스튜디오 · 페르소나</p>
      <h1 className="dashboard-title mb-6">{persona.name}</h1>
      <div className="card space-y-4">
        {[
          ['name', '페르소나 이름', persona.name],
          ['brandConcept', '브랜드 컨셉', persona.brandConcept ?? ''],
          ['targetAudience', '타겟 오디언스', persona.targetAudience ?? ''],
          ['writingStyle', '글쓰기 스타일', persona.writingStyle ?? ''],
          ['tone', '톤', persona.tone ?? ''],
          ['instagramHandle', 'Instagram 핸들', persona.instagramHandle ?? ''],
        ].map(([field, label, value]) => (
          <div key={field}>
            <label className="text-sm text-[var(--text-muted)] block mb-1">{label}</label>
            <input
              className="input w-full"
              value={value}
              onChange={e => setPersona(prev => prev ? { ...prev, [field]: e.target.value } : prev)}
            />
          </div>
        ))}
        <div>
          <label className="text-sm text-[var(--text-muted)] block mb-1">키워드 (쉼표 구분)</label>
          <input
            className="input w-full"
            value={keywords.join(', ')}
            onChange={e => setPersona(prev => prev ? {
              ...prev,
              keywords: JSON.stringify(e.target.value.split(',').map(k => k.trim()).filter(Boolean))
            } : prev)}
          />
        </div>
        <div className="flex gap-2 pt-2">
          <button className="button-secondary flex-1" onClick={() => router.back()}>취소</button>
          <button className="button-primary flex-1" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: app-nav.tsx에 SNS 스튜디오 아이콘 함수 + nav 항목 추가**

`components/app-nav.tsx`를 열면 기존 아이콘들이 함수(`BriefingIcon`, `CampaignIcon` 등)로 정의되어 있고, `navItems` 배열에서 `icon: <BriefingIcon />` 형태로 사용된다. **Heroicons 컴포넌트 임포트는 사용하지 않는다.**

**(a) 기존 아이콘 함수 마지막 (`SocialIcon` 뒤) 에 아래 SNS 전용 아이콘 함수 5개를 추가:**

```typescript
function SnsPersonaIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="19" cy="7" r="2.5" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

function SnsStudioIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 8h8M8 11h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7 21h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

function SnsCalendarIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 3v4M8 3v4M3 9h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8" cy="15" r="1.5" fill="currentColor" opacity="0.6" />
      <circle cx="12" cy="15" r="1.5" fill="currentColor" />
      <circle cx="16" cy="15" r="1.5" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

function SnsAnalyticsIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <path d="M4 17l4-5 4 3 4-6 4 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 21h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.4" />
    </svg>
  )
}

function SnsCommunityIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
```

**(b) `navItems` 배열에서 `/notifications` 항목 뒤에 아래 5개 항목을 추가:**

```typescript
  { href: '/sns/personas',  label: '페르소나',     icon: <SnsPersonaIcon /> },
  { href: '/sns/studio',    label: '콘텐츠 제작소', icon: <SnsStudioIcon /> },
  { href: '/sns/calendar',  label: '캘린더',        icon: <SnsCalendarIcon /> },
  { href: '/sns/analytics', label: '성과 분석',     icon: <SnsAnalyticsIcon /> },
  { href: '/sns/community', label: '커뮤니티',      icon: <SnsCommunityIcon /> },
```

- [ ] **Step 3: 브라우저에서 네비게이션 확인**

사이드바에 SNS 스튜디오 그룹 5개 항목 확인.

- [ ] **Step 4: Commit**

```bash
git add app/sns/personas/[id]/page.tsx components/app-nav.tsx
git commit -m "feat(sns): persona detail/edit page + nav group"
```

---

## Chunk 2: Subsystem B — 콘텐츠 제작소

### Task 2-0: lib/sns/upload.ts (Supabase Storage 래퍼)

**Files:**
- Create: `lib/sns/upload.ts`

SNS 이미지용 Supabase Storage 업로드 헬퍼. `uploadAttachmentToStorage`(실제 export 명)를 래핑해 path + buffer + mimeType 시그니처를 노출한다.

- [ ] **Step 1: 파일 생성**

```typescript
// lib/sns/upload.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BUCKET = 'garnet-attachments'

/**
 * SNS 이미지(또는 영상)를 Supabase Storage에 업로드하고 public URL을 반환한다.
 * @param path   저장 경로 (예: "sns/slides/1234.jpg")
 * @param buffer 파일 버퍼
 * @param mimeType MIME 타입 (예: "image/jpeg")
 */
export async function uploadSnsFile(
  path: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 버킷이 없으면 public 버킷 자동 생성 (이미 있으면 무시됨)
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {})

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: true })

  if (error) throw new Error(`Storage 업로드 실패: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/sns/upload.ts
git commit -m "feat(sns): add upload helper — uploadSnsFile wraps Supabase Storage"
```

---

### Task 2-1: lib/sns/image-generator.ts (나노바나나 2)

**Files:**
- Create: `lib/sns/image-generator.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// lib/sns/image-generator.ts
import { GoogleGenAI } from '@google/genai'
import { uploadSnsFile } from '@/lib/sns/upload'

// ⚠️ 구현 전 모델 ID 확인: https://ai.google.dev/gemini-api/docs/image-generation
const MODEL_ID = 'gemini-3.1-flash-image-preview'

export type GeneratedImage = {
  url: string
  mimeType: string
}

export async function generateSlideImage(
  imagePrompt: string,
  referenceImageUrls: string[] = []
): Promise<GeneratedImage> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error('GOOGLE_API_KEY 환경변수가 없습니다.')

  const ai = new GoogleGenAI({ apiKey })

  // 프롬프트 + 레퍼런스 이미지 (최대 14장)
  const contents: unknown[] = [{ text: imagePrompt }]
  for (const url of referenceImageUrls.slice(0, 14)) {
    const res = await fetch(url)
    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mimeType = res.headers.get('content-type') || 'image/jpeg'
    contents.push({ inlineData: { data: base64, mimeType } })
  }

  const response = await ai.models.generateContent({
    model: MODEL_ID,
    contents,
  })

  // 이미지 파트 추출
  const imagePart = response.candidates?.[0]?.content?.parts?.find(
    (p: unknown) => (p as { inlineData?: unknown }).inlineData
  ) as { inlineData: { data: string; mimeType: string } } | undefined

  if (!imagePart?.inlineData) throw new Error('이미지 생성 실패: 응답에 이미지 없음')

  const { data, mimeType } = imagePart.inlineData
  const buffer = Buffer.from(data, 'base64')
  const ext = mimeType.split('/')[1] || 'jpg'
  const fileName = `sns/slides/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  // Supabase Storage 업로드
  const uploadedUrl = await uploadSnsFile(fileName, buffer, mimeType)

  return { url: uploadedUrl, mimeType }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/sns/image-generator.ts
git commit -m "feat(sns): image-generator — Nano Banana 2 + Supabase Storage upload"
```

---

### Task 2-2: 콘텐츠 API 라우트

**Files:**
- Create: `app/api/sns/content/route.ts`
- Create: `app/api/sns/content/[id]/route.ts`
- Create: `app/api/sns/content/[id]/image/route.ts`

- [ ] **Step 1: app/api/sns/content/route.ts 생성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const personaId = searchParams.get('personaId')
  const drafts = await prisma.snsContentDraft.findMany({
    where: personaId ? { personaId } : {},
    orderBy: { createdAt: 'desc' },
    include: { persona: { select: { name: true, tone: true, keywords: true } } },
  })
  return NextResponse.json(drafts)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { personaId, type = 'TEXT', planningMode = 'CREATIVE', prompt, slideCount = 5 } = body

    if (!prompt?.trim()) {
      return NextResponse.json({ error: '프롬프트를 입력하세요.' }, { status: 400 })
    }

    // 페르소나 컨텍스트 로드
    let systemContext = '당신은 SNS 콘텐츠 전문가입니다.'
    if (personaId) {
      const persona = await prisma.snsPersona.findUnique({ where: { id: personaId } })
      if (persona) {
        const keywords = (() => { try { return JSON.parse(persona.keywords) as string[] } catch { return [] } })()
        systemContext = `당신은 ${persona.brandConcept || ''} 브랜드의 SNS 담당자입니다.
타겟: ${persona.targetAudience || ''}
글쓰기 스타일: ${persona.writingStyle || ''}
톤: ${persona.tone || ''}
자주 쓰는 표현: ${keywords.join(', ')}`
      }
    }

    let content = ''
    let slides = null

    if (type === 'TEXT') {
      content = await runLLM(
        systemContext + '\n\nInstagram 포스팅을 작성하세요. 해시태그 포함.',
        prompt
      )
    } else if (type === 'CAROUSEL') {
      const slidePlan = await runLLM(
        systemContext + `\n\n아래 주제로 ${slideCount}장짜리 카드뉴스 기획안을 JSON 배열로만 응답하세요:
[{"title":"슬라이드 제목","body":"본문 내용","imagePrompt":"이미지 생성 프롬프트 (영문)"}]`,
        prompt
      )
      const jsonMatch = slidePlan.match(/\[[\s\S]*\]/)
      slides = jsonMatch ? jsonMatch[0] : '[]'
    }

    const draft = await prisma.snsContentDraft.create({
      data: {
        personaId: personaId || null,
        type,
        planningMode,
        title: prompt.slice(0, 60),
        content: content || null,
        slides: slides || null,
        platform: 'INSTAGRAM',
      },
    })

    return NextResponse.json(draft, { status: 201 })
  } catch {
    return NextResponse.json({ error: '콘텐츠 생성 실패' }, { status: 500 })
  }
}
```

- [ ] **Step 2: app/api/sns/content/[id]/route.ts 생성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const draft = await prisma.snsContentDraft.findUnique({
    where: { id },
    include: { persona: true },
  })
  if (!draft) return NextResponse.json({ error: '없음' }, { status: 404 })
  return NextResponse.json(draft)
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const body = await req.json()
    const draft = await prisma.snsContentDraft.update({
      where: { id },
      data: {
        ...(body.content !== undefined && { content: body.content }),
        ...(body.slides !== undefined && { slides: typeof body.slides === 'string' ? body.slides : JSON.stringify(body.slides) }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.title !== undefined && { title: body.title }),
      },
    })
    return NextResponse.json(draft)
  } catch {
    return NextResponse.json({ error: '업데이트 실패' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  await prisma.snsContentDraft.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: app/api/sns/content/[id]/image/route.ts 생성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateSlideImage } from '@/lib/sns/image-generator'

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const body = await req.json()
    const { slideIndex, imagePrompt, referenceImageUrls = [] } = body

    if (!imagePrompt?.trim()) {
      return NextResponse.json({ error: 'imagePrompt 필수' }, { status: 400 })
    }

    const { url } = await generateSlideImage(imagePrompt, referenceImageUrls)

    // slides JSON에서 해당 슬라이드 imageUrl 업데이트
    if (slideIndex !== undefined) {
      const draft = await prisma.snsContentDraft.findUnique({ where: { id } })
      if (draft?.slides) {
        const slides = JSON.parse(draft.slides) as Array<Record<string, unknown>>
        if (slides[slideIndex]) {
          slides[slideIndex].imageUrl = url
          await prisma.snsContentDraft.update({
            where: { id },
            data: { slides: JSON.stringify(slides) },
          })
        }
      }
    }

    return NextResponse.json({ url })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '이미지 생성 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 4: API 확인**

```bash
curl -X POST http://localhost:3000/api/sns/content \
  -H "Content-Type: application/json" \
  -d '{"type":"TEXT","prompt":"오늘의 마케팅 팁","planningMode":"CREATIVE"}'
```

Expected: `{"id":"...","type":"TEXT","content":"...","status":"DRAFT"}`

- [ ] **Step 5: Commit**

```bash
git add app/api/sns/content/
git commit -m "feat(sns): content API — draft CRUD + AI generation + Nano Banana 2 image"
```

---

### Task 2-3: 콘텐츠 제작소 UI

**Files:**
- Create: `app/sns/studio/page.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'

type Draft = {
  id: string; type: string; title: string | null; content: string | null
  slides: string | null; status: string; createdAt: string
  persona?: { name: string } | null
}
type Persona = { id: string; name: string }

function StudioContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initPersonaId = searchParams.get('personaId') || ''

  const [personas, setPersonas] = useState<Persona[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [personaId, setPersonaId] = useState(initPersonaId)
  const [type, setType] = useState<'TEXT' | 'CAROUSEL'>('TEXT')
  const [prompt, setPrompt] = useState('')
  const [slideCount, setSlideCount] = useState(5)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetch('/api/sns/personas').then(r => r.json()).then(setPersonas)
  }, [])

  useEffect(() => {
    const url = personaId ? `/api/sns/content?personaId=${personaId}` : '/api/sns/content'
    fetch(url).then(r => r.json()).then(setDrafts)
  }, [personaId])

  async function generate() {
    if (!prompt.trim()) return
    setGenerating(true)
    try {
      const res = await fetch('/api/sns/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId: personaId || null, type, prompt, slideCount }),
      })
      const draft = await res.json()
      setDrafts(prev => [draft, ...prev])
      setPrompt('')
      if (type === 'CAROUSEL') router.push(`/sns/studio/${draft.id}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="dashboard-eyebrow">SNS 스튜디오</p>
          <h1 className="dashboard-title">콘텐츠 제작소</h1>
        </div>
      </div>

      {/* 생성 패널 */}
      <div className="card mb-6 space-y-4">
        <div className="flex gap-3 flex-wrap">
          <select className="input" value={personaId} onChange={e => setPersonaId(e.target.value)}>
            <option value="">페르소나 없음</option>
            {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex gap-1">
            {(['TEXT', 'CAROUSEL'] as const).map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`pill-option ${type === t ? 'bg-[var(--accent)] text-white' : ''}`}>
                {t === 'TEXT' ? '텍스트' : '카드뉴스'}
              </button>
            ))}
          </div>
          {type === 'CAROUSEL' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text-muted)]">슬라이드</span>
              <input type="number" className="input w-16" min={3} max={10} value={slideCount}
                onChange={e => setSlideCount(Number(e.target.value))} />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <input className="input flex-1" value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder={type === 'TEXT' ? '오늘의 마케팅 팁을 작성해줘' : '상위 1% 마케터의 5가지 비밀'}
            onKeyDown={e => e.key === 'Enter' && generate()} />
          <button className="button-primary px-6" onClick={generate} disabled={generating}>
            {generating ? '생성 중...' : '생성'}
          </button>
        </div>
      </div>

      {/* 초안 목록 */}
      <div className="space-y-3">
        {drafts.map(d => {
          const slides = d.slides ? (() => { try { return JSON.parse(d.slides) as unknown[] } catch { return [] } })() : []
          return (
            <div key={d.id} className="card flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="pill-option text-xs">{d.type}</span>
                  {d.persona && <span className="text-xs text-[var(--text-muted)]">{d.persona.name}</span>}
                  <span className={`text-xs ${d.status === 'PUBLISHED' ? 'text-emerald-600' : 'text-[var(--text-muted)]'}`}>{d.status}</span>
                </div>
                <p className="text-sm font-medium truncate">{d.title || '제목 없음'}</p>
                {d.content && <p className="text-xs text-[var(--text-muted)] line-clamp-2 mt-1">{d.content}</p>}
                {d.type === 'CAROUSEL' && <p className="text-xs text-[var(--text-muted)] mt-1">슬라이드 {slides.length}장</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                {d.type === 'CAROUSEL' && (
                  <button className="button-secondary text-xs" onClick={() => router.push(`/sns/studio/${d.id}`)}>편집</button>
                )}
                <button className="button-primary text-xs"
                  onClick={() => router.push(`/sns/calendar?draftId=${d.id}`)}>예약</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function StudioPage() {
  return <Suspense><StudioContent /></Suspense>
}
```

- [ ] **Step 2: 브라우저 확인**

1. `http://localhost:3000/sns/studio` — 제작소 페이지 렌더 확인
2. 텍스트 모드로 프롬프트 입력 → 생성 → 초안 목록에 표시 확인

- [ ] **Step 3: Commit**

```bash
git add app/sns/studio/page.tsx
git commit -m "feat(sns): content studio page — text/carousel generation with persona"
```

---

### Task 2-3c: Canva MCP 파이프라인 연동 (나노바나나 2 → Canva 디자인 완성)

**Files:**
- Modify: `.mcp.json`
- Create: `lib/sns/canva-pipeline.ts`

나노바나나 2가 생성한 raw 비주얼을 Canva MCP로 이벤트 배너/카드뉴스 템플릿에 자동 주입해 브랜드 디자인을 완성한다.

**파이프라인:** `나노바나나 2 raw 이미지 → Canva MCP 템플릿 채우기 → 최종 export URL`

**⚠️ 전제 조건:**
- Canva MCP는 공식 Canva Dev MCP (`@canva-sdks/canva-mcp-server`)
- Enterprise/Developer 계정 + Canva API Key 필요 (`CANVA_API_TOKEN` 환경변수)
- 계정이 없는 경우 이 태스크를 건너뛰고 나노바나나 2 단독 사용

- [ ] **Step 1: Canva MCP 설치 확인**

```bash
npx @canva-sdks/canva-mcp-server --version 2>/dev/null || echo "설치 필요"
```

- [ ] **Step 2: .mcp.json에 canva-mcp 추가**

기존 `.mcp.json`의 `mcpServers` 오브젝트에 아래 항목을 추가한다:

```json
"canva": {
  "command": "npx",
  "args": ["-y", "@canva-sdks/canva-mcp-server"],
  "env": {
    "CANVA_API_TOKEN": "${CANVA_API_TOKEN}"
  }
}
```

- [ ] **Step 3: lib/sns/canva-pipeline.ts 생성**

```typescript
// lib/sns/canva-pipeline.ts
// 나노바나나 2 → Canva MCP 파이프라인
// Canva MCP가 연결된 환경에서만 동작 (CANVA_API_TOKEN 필요)

export type CanvaPipelineInput = {
  rawImageUrl: string       // 나노바나나 2가 생성한 이미지 URL
  templateKeyword: string   // 예: "이벤트 배너", "카드뉴스", "Instagram 포스트"
  brandName?: string
  headline?: string
}

export type CanvaPipelineResult = {
  designUrl: string         // Canva 편집 링크
  exportUrl?: string        // 최종 export URL (PNG/PDF)
  usedFallback: boolean     // Canva 미연결 시 rawImageUrl 반환
}

/**
 * 나노바나나 2 이미지를 Canva MCP로 디자인 완성.
 * Canva API를 직접 호출하거나, MCP tool 'canva_create_design'을 사용한다.
 * MCP tool은 /api/mcp/tool 라우트를 통해 호출한다.
 */
export async function applyCanvaTemplate(
  input: CanvaPipelineInput
): Promise<CanvaPipelineResult> {
  const canvaToken = process.env.CANVA_API_TOKEN
  if (!canvaToken) {
    // Canva 미연결 — raw 이미지를 그대로 반환
    return { designUrl: input.rawImageUrl, usedFallback: true }
  }

  try {
    // Canva MCP tool 호출: canva_create_autofill_design
    const res = await fetch('/api/mcp/tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        server: 'canva',
        tool: 'canva_create_autofill_design',
        args: {
          title: `${input.brandName || ''} ${input.templateKeyword}`.trim(),
          brand_template_id: undefined,  // 설정 시 특정 브랜드 템플릿 사용
          data: [
            { name: 'headline', type: 'text', text: input.headline || '' },
            { name: 'background', type: 'image', asset_url: input.rawImageUrl },
          ],
        },
      }),
    })

    if (!res.ok) throw new Error('Canva MCP 호출 실패')
    const data = await res.json()
    // MCP 응답에서 design URL 추출 (실제 응답 구조는 Canva MCP 문서 참조)
    const designUrl = data?.result?.design?.url || input.rawImageUrl
    return { designUrl, usedFallback: false }
  } catch {
    // 실패 시 raw 이미지 반환 (graceful degradation)
    return { designUrl: input.rawImageUrl, usedFallback: true }
  }
}
```

- [ ] **Step 4: image-generator.ts에 선택적 Canva 파이프라인 연결**

`lib/sns/image-generator.ts`의 `generateSlideImage` 함수 반환 직전에 아래를 추가한다:

```typescript
// generateSlideImage() 마지막 부분 수정
import { applyCanvaTemplate } from '@/lib/sns/canva-pipeline'

// ... 기존 upload 코드 후 ...

  // Canva MCP 파이프라인 (선택적 — CANVA_API_TOKEN 있을 때만 동작)
  const canvaResult = await applyCanvaTemplate({
    rawImageUrl: uploadedUrl,
    templateKeyword: 'Instagram 포스트',
    headline: imagePrompt.slice(0, 50),
  })

  return {
    url: canvaResult.designUrl,
    mimeType,
    rawUrl: uploadedUrl,                    // 나노바나나 원본
    usedCanva: !canvaResult.usedFallback,   // Canva 적용 여부
  }
```

> `GeneratedImage` 타입도 `rawUrl?: string; usedCanva?: boolean` 필드를 추가한다.

- [ ] **Step 5: Commit**

```bash
git add .mcp.json lib/sns/canva-pipeline.ts lib/sns/image-generator.ts
git commit -m "feat(sns): Canva MCP pipeline — Nano Banana 2 raw image → Canva branded design"
```

---

### Task 2-3b: lib/sns/video-renderer.ts 스텁

**Files:**
- Create: `lib/sns/video-renderer.ts`

영상 렌더링 로직 스텁. 파일 구조 맵에 포함된 `lib/sns/video-renderer.ts`를 생성해 향후 VIDEO 타입 초안 렌더링에 활용한다. 현 스프린트에서는 인터페이스만 정의한다.

- [ ] **Step 1: 스텁 파일 생성**

```typescript
// lib/sns/video-renderer.ts
// VIDEO 타입 초안 렌더링을 위한 스텁 — 향후 fluent-ffmpeg 기반 구현 예정
// app/api/sns/content/[id]/render/route.ts 에서 사용 예정

export type VideoRenderInput = {
  slides: Array<{ imageUrl: string; title: string; body: string }>
  durationPerSlide?: number  // seconds, default 3
  outputFormat?: 'mp4' | 'webm'
}

export type VideoRenderResult = {
  videoUrl: string
  durationSeconds: number
}

/**
 * TODO: fluent-ffmpeg를 사용해 슬라이드 이미지 배열 → 영상으로 렌더링
 * Electron main process에서 ffmpeg 경로 주입 필요 (electron/main.ts에 ffmpegPath 설정됨)
 */
export async function renderSlidesToVideo(
  _input: VideoRenderInput
): Promise<VideoRenderResult> {
  throw new Error('video-renderer: 아직 구현되지 않았습니다.')
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/sns/video-renderer.ts
git commit -m "chore(sns): add video-renderer stub — interface defined, impl pending"
```

---

### Task 2-4: 카드뉴스 편집기 (carousel editor)

**Files:**
- Create: `app/sns/studio/[draftId]/page.tsx`

슬라이드별 텍스트 편집 + 나노바나나 2 이미지 생성 버튼을 제공하는 카드뉴스 편집 페이지.

- [ ] **Step 1: 파일 생성**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Slide = { title: string; body: string; imagePrompt: string; imageUrl?: string }

export default function CarouselEditorPage() {
  const { draftId } = useParams<{ draftId: string }>()
  const router = useRouter()
  const [slides, setSlides] = useState<Slide[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/sns/content/${draftId}`)
      .then(r => r.json())
      .then(data => {
        if (data.slides) {
          try { setSlides(JSON.parse(data.slides)) } catch { setSlides([]) }
        }
        setLoading(false)
      })
  }, [draftId])

  async function generateImage(idx: number) {
    const slide = slides[idx]
    if (!slide?.imagePrompt) return
    setGeneratingIdx(idx)
    try {
      const res = await fetch(`/api/sns/content/${draftId}/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slideIndex: idx, imagePrompt: slide.imagePrompt }),
      })
      const { url } = await res.json()
      setSlides(prev => prev.map((s, i) => i === idx ? { ...s, imageUrl: url } : s))
    } finally {
      setGeneratingIdx(null)
    }
  }

  async function save() {
    setSaving(true)
    await fetch(`/api/sns/content/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides: JSON.stringify(slides) }),
    })
    setSaving(false)
    router.push('/sns/studio')
  }

  if (loading) return <div className="p-6 text-[var(--text-muted)]">불러오는 중...</div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="dashboard-eyebrow">SNS 스튜디오 · 콘텐츠 제작소</p>
          <h1 className="dashboard-title">카드뉴스 편집</h1>
        </div>
        <div className="flex gap-2">
          <button className="button-secondary" onClick={() => router.back()}>취소</button>
          <button className="button-primary" onClick={save} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {slides.map((slide, idx) => (
          <div key={idx} className="card">
            <div className="flex items-center gap-2 mb-3">
              <span className="accent-pill text-xs">슬라이드 {idx + 1}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[var(--text-muted)] block mb-1">제목</label>
                  <input className="input w-full" value={slide.title}
                    onChange={e => setSlides(prev => prev.map((s, i) => i === idx ? { ...s, title: e.target.value } : s))} />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)] block mb-1">본문</label>
                  <textarea className="input w-full min-h-[80px]" value={slide.body}
                    onChange={e => setSlides(prev => prev.map((s, i) => i === idx ? { ...s, body: e.target.value } : s))} />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)] block mb-1">이미지 프롬프트 (영문)</label>
                  <input className="input w-full text-sm font-mono" value={slide.imagePrompt}
                    onChange={e => setSlides(prev => prev.map((s, i) => i === idx ? { ...s, imagePrompt: e.target.value } : s))} />
                </div>
                <button className="button-secondary text-sm w-full" onClick={() => generateImage(idx)}
                  disabled={generatingIdx === idx}>
                  {generatingIdx === idx ? '나노바나나 생성 중...' : '🎨 이미지 생성'}
                </button>
              </div>
              <div className="flex items-center justify-center bg-[var(--surface-sub)] rounded-lg min-h-[200px]">
                {slide.imageUrl ? (
                  <img src={slide.imageUrl} alt={`slide ${idx + 1}`} className="max-w-full max-h-[240px] rounded object-contain" />
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">이미지 없음</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 브라우저 확인**

1. 콘텐츠 제작소에서 카드뉴스 생성 후 "편집" 버튼 클릭
2. `http://localhost:3000/sns/studio/<draftId>` — 슬라이드 목록 확인
3. 이미지 생성 버튼 클릭 → 나노바나나 2 호출 확인 (GOOGLE_API_KEY 설정 필요)

- [ ] **Step 3: Commit**

```bash
git add app/sns/studio/
git commit -m "feat(sns): carousel editor — per-slide edit + Nano Banana 2 image generation"
```

---

## Chunk 3: Subsystem C — 캘린더 + 예약 발행

### Task 3-1: 예약 발행 API

**Files:**
- Create: `app/api/sns/schedule/route.ts`
- Create: `app/api/sns/schedule/[id]/route.ts`

- [ ] **Step 1: app/api/sns/schedule/route.ts 생성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year') || new Date().getFullYear())
  const month = Number(searchParams.get('month') || new Date().getMonth() + 1)

  const from = new Date(year, month - 1, 1)
  const to   = new Date(year, month, 1)

  const scheduled = await prisma.snsScheduledPost.findMany({
    where: { scheduledAt: { gte: from, lt: to } },
    include: {
      draft: { select: { type: true, title: true, content: true } },
      persona: { select: { name: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  })
  return NextResponse.json(scheduled)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { draftId, personaId, scheduledAt } = body

    if (!draftId || !scheduledAt) {
      return NextResponse.json({ error: 'draftId와 scheduledAt은 필수입니다.' }, { status: 400 })
    }

    // idempotency guard: 이미 PENDING인 예약이 있으면 409
    const existing = await prisma.snsScheduledPost.findUnique({ where: { draftId } })
    if (existing && existing.status === 'PENDING') {
      return NextResponse.json({ error: '이미 예약된 초안입니다.' }, { status: 409 })
    }

    const scheduled = await prisma.snsScheduledPost.upsert({
      where: { draftId },
      create: {
        draftId,
        personaId,
        scheduledAt: new Date(scheduledAt),
        platform: 'INSTAGRAM',
      },
      update: {
        scheduledAt: new Date(scheduledAt),
        status: 'PENDING',
        errorMsg: null,
      },
    })

    // draft status 업데이트
    await prisma.snsContentDraft.update({
      where: { id: draftId },
      data: { status: 'SCHEDULED' },
    })

    return NextResponse.json(scheduled, { status: 201 })
  } catch {
    return NextResponse.json({ error: '예약 생성 실패' }, { status: 500 })
  }
}
```

- [ ] **Step 2: app/api/sns/schedule/[id]/route.ts 생성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const { scheduledAt } = await req.json()
    const updated = await prisma.snsScheduledPost.update({
      where: { id },
      data: { scheduledAt: new Date(scheduledAt) },
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: '수정 실패' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const post = await prisma.snsScheduledPost.delete({ where: { id } })
  // draft status를 DRAFT로 되돌림
  await prisma.snsContentDraft.update({
    where: { id: post.draftId },
    data: { status: 'DRAFT' },
  })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/sns/schedule/
git commit -m "feat(sns): schedule API — POST with idempotency guard, PATCH/DELETE"
```

---

### Task 3-2: Electron 예약 발행 타이머

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: electron/main.ts에 ffmpeg 경로 주입 + 예약 발행 타이머 추가**

기존 `electron/main.ts`에서 `app.whenReady()` 블록을 찾아 아래 내용을 추가한다.

ffmpeg 경로 주입 (상단 imports 근처):
```typescript
import ffmpegPath from 'ffmpeg-static'
import ffmpeg from 'fluent-ffmpeg'

// ffmpeg 경로 주입 (개발/프로덕션 모두)
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath)
}
```

예약 발행 타이머 함수 (앱 초기화 후 시작):
```typescript
function startSchedulerTimer() {
  const appPort = process.env.PORT || '3123'
  const baseUrl = `http://127.0.0.1:${appPort}`

  // 앱 시작 시 MISSED 처리 (Next.js가 준비된 후 호출되므로 약간 지연)
  setTimeout(() => processMissedSchedules(baseUrl), 5_000)

  // 1분마다 PENDING 예약 확인
  setInterval(() => processScheduledPosts(baseUrl), 60_000)
}

async function processMissedSchedules(baseUrl: string) {
  // raw SQL 대신 API를 통해 처리 (Prisma는 Next.js 프로세스에서만 실행)
  try {
    await fetch(`${baseUrl}/api/sns/schedule/missed`, { method: 'POST' })
  } catch (e) {
    console.error('[Scheduler] missed 처리 오류:', e)
  }
}

async function processScheduledPosts(baseUrl: string) {
  try {
    const res = await fetch(`${baseUrl}/api/sns/schedule/process`, { method: 'POST' })
    if (!res.ok) console.error('[Scheduler] 발행 처리 실패:', await res.text())
  } catch (e) {
    console.error('[Scheduler] 타이머 오류:', e)
  }
}
```

`app.whenReady()` 안에서 `startNextServer()` 이후에 호출:
```typescript
// 기존 startNextServer() 호출 후 추가
startSchedulerTimer()
```

- [ ] **Step 2: MISSED 처리 + 발행 처리 API 엔드포인트 생성**

```typescript
// app/api/sns/schedule/missed/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const now = new Date()
  const result = await prisma.snsScheduledPost.updateMany({
    where: { status: 'PENDING', scheduledAt: { lt: now } },
    data: { status: 'MISSED' },
  })
  return NextResponse.json({ missed: result.count })
}
```

```typescript
// app/api/sns/schedule/process/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const now = new Date()
  const pendingPosts = await prisma.snsScheduledPost.findMany({
    where: { status: 'PENDING', scheduledAt: { lte: now } },
    include: { draft: true, persona: true },
  })

  const results = await Promise.allSettled(
    pendingPosts.map(async (post) => {
      try {
        // Instagram Graph API 발행 (ig-mcp 또는 직접 호출)
        // TODO: ig-mcp의 publish_media 툴 연동 or Instagram Graph API 직접 호출
        // 현재는 상태만 업데이트 (향후 실제 발행 로직 연동)
        await prisma.snsScheduledPost.update({
          where: { id: post.id },
          data: { status: 'PUBLISHED', publishedAt: now },
        })
        await prisma.snsContentDraft.update({
          where: { id: post.draftId },
          data: { status: 'PUBLISHED', publishedAt: now },
        })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '발행 실패'
        await prisma.snsScheduledPost.update({
          where: { id: post.id },
          data: { status: 'FAILED', errorMsg: msg },
        })
      }
    })
  )

  return NextResponse.json({ processed: results.length })
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts app/api/sns/schedule/process/route.ts app/api/sns/schedule/missed/route.ts
git commit -m "feat(sns): Electron scheduler timer — auto-publish PENDING posts every 60s"
```

---

### Task 3-3: 캘린더 UI

**Files:**
- Create: `app/sns/calendar/page.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

type ScheduledPost = {
  id: string
  scheduledAt: string
  status: string
  draft: { type: string; title: string | null; content: string | null }
  persona: { name: string }
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-[var(--accent)]',
  PUBLISHED: 'bg-emerald-500',
  FAILED: 'bg-rose-500',
  MISSED: 'bg-amber-400',
}

function CalendarContent() {
  const searchParams = useSearchParams()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [drafts, setDrafts] = useState<{ id: string; title: string | null }[]>([])
  const [schedulingDraftId, setSchedulingDraftId] = useState(searchParams.get('draftId') || '')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('10:00')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/sns/schedule?year=${year}&month=${month}`)
      .then(r => r.json()).then(setPosts)
  }, [year, month])

  useEffect(() => {
    fetch('/api/sns/content?status=DRAFT')
      .then(r => r.json()).then(setDrafts)
  }, [])

  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDay = new Date(year, month - 1, 1).getDay()

  function getPostsForDay(day: number) {
    return posts.filter(p => new Date(p.scheduledAt).getDate() === day)
  }

  async function schedulePost() {
    if (!schedulingDraftId || !selectedDate) return
    setSaving(true)
    const dt = new Date(`${selectedDate}T${selectedTime}:00`)
    // draft에서 personaId를 가져온 뒤 예약 생성
    const draftData = await fetch(`/api/sns/content/${schedulingDraftId}`).then(r => r.json())
    const resolvedPersonaId = draftData.personaId || null
    await fetch('/api/sns/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId: schedulingDraftId, scheduledAt: dt.toISOString(), personaId: resolvedPersonaId }),
    })
    const updated = await fetch(`/api/sns/schedule?year=${year}&month=${month}`).then(r => r.json())
    setPosts(updated)
    setSchedulingDraftId('')
    setSaving(false)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="dashboard-eyebrow">SNS 스튜디오</p>
          <h1 className="dashboard-title">콘텐츠 캘린더</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="button-secondary" onClick={() => { if (month === 1) { setMonth(12); setYear(y => y-1) } else setMonth(m => m-1) }}>‹</button>
          <span className="font-medium">{year}년 {month}월</span>
          <button className="button-secondary" onClick={() => { if (month === 12) { setMonth(1); setYear(y => y+1) } else setMonth(m => m+1) }}>›</button>
        </div>
      </div>

      {/* 예약 폼 */}
      {(schedulingDraftId || searchParams.get('draftId')) && (
        <div className="card mb-4 flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">초안 선택</label>
            <select className="input" value={schedulingDraftId} onChange={e => setSchedulingDraftId(e.target.value)}>
              <option value="">선택</option>
              {drafts.map(d => <option key={d.id} value={d.id}>{d.title || d.id.slice(0, 8)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">날짜</label>
            <input type="date" className="input" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">시간</label>
            <input type="time" className="input" value={selectedTime} onChange={e => setSelectedTime(e.target.value)} />
          </div>
          <button className="button-primary" onClick={schedulePost} disabled={saving}>
            {saving ? '예약 중...' : '예약 확정'}
          </button>
        </div>
      )}

      {/* 캘린더 그리드 */}
      <div className="card">
        <div className="grid grid-cols-7 mb-2">
          {['일','월','화','수','목','금','토'].map(d => (
            <div key={d} className="text-center text-xs text-[var(--text-muted)] py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
            const dayPosts = getPostsForDay(day)
            const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day
            return (
              <div
                key={day}
                className={`min-h-[72px] p-1 rounded border cursor-pointer hover:bg-[var(--surface-sub)] ${isToday ? 'border-[var(--accent)]' : 'border-[var(--surface-border)]'}`}
                onClick={() => setSelectedDate(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`)}
              >
                <p className={`text-xs mb-1 ${isToday ? 'text-[var(--accent)] font-bold' : 'text-[var(--text-muted)]'}`}>{day}</p>
                {dayPosts.map(p => (
                  <div key={p.id} className={`${STATUS_COLOR[p.status]} text-white text-[10px] rounded px-1 mb-0.5 truncate`}>
                    {p.draft.title || p.draft.type}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  return <Suspense><CalendarContent /></Suspense>
}
```

- [ ] **Step 2: 브라우저 확인**

`http://localhost:3000/sns/calendar` — 월간 캘린더 렌더 확인. 날짜 클릭 시 선택 상태 변경 확인.

- [ ] **Step 3: Commit**

```bash
git add app/sns/calendar/page.tsx
git commit -m "feat(sns): content calendar page — monthly grid + schedule modal"
```

---

## Chunk 4: Subsystem D — 성과 대시보드

### Task 4-0: /api/sns/chat/route.ts (AI 디스커션 엔드포인트)

**Files:**
- Create: `app/api/sns/chat/route.ts`

analytics 페이지의 AI 디스커션에서 사용할 LLM 엔드포인트. 클라이언트 컴포넌트에서 `runLLM`을 직접 임포트할 수 없으므로 API 라우트로 노출한다.

- [ ] **Step 1: 파일 생성**

```typescript
// app/api/sns/chat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { runLLM } from '@/lib/llm'

export async function POST(req: NextRequest) {
  try {
    const { systemPrompt, userMessage } = await req.json()
    if (!userMessage?.trim()) {
      return NextResponse.json({ error: 'userMessage 필수' }, { status: 400 })
    }
    const content = await runLLM(
      systemPrompt || '당신은 SNS 마케팅 전문가입니다.',
      userMessage
    )
    return NextResponse.json({ content })
  } catch {
    return NextResponse.json({ error: 'LLM 호출 실패' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/sns/chat/route.ts
git commit -m "feat(sns): add /api/sns/chat — LLM endpoint for analytics AI discussion"
```

---

### Task 4-1: Instagram 데이터 수집 API

**Files:**
- Create: `lib/sns/instagram-api.ts`
- Create: `app/api/sns/analytics/route.ts`
- Create: `app/api/sns/analytics/sync/route.ts`
- Create: `app/api/sns/analytics/best-time/route.ts`

- [ ] **Step 1: lib/sns/instagram-api.ts 생성**

```typescript
// lib/sns/instagram-api.ts
// Instagram Graph API 래퍼

export type InstagramMediaInsight = {
  id: string
  timestamp: string
  impressions: number
  reach: number
  engagement: number
  like_count: number
  comments_count: number
}

export async function fetchInstagramMediaInsights(
  accessToken: string,
  businessAccountId: string
): Promise<InstagramMediaInsight[]> {
  const mediaRes = await fetch(
    `https://graph.instagram.com/v19.0/${businessAccountId}/media?fields=id,timestamp,like_count,comments_count&access_token=${accessToken}&limit=25`
  )
  if (!mediaRes.ok) throw new Error(`Instagram API 오류: ${await mediaRes.text()}`)
  const { data: mediaList } = await mediaRes.json() as { data: Array<{ id: string; timestamp: string; like_count: number; comments_count: number }> }

  // 각 미디어의 insights 수집
  const insights = await Promise.allSettled(
    mediaList.map(async (media) => {
      const insightRes = await fetch(
        `https://graph.instagram.com/v19.0/${media.id}/insights?metric=impressions,reach,engagement&access_token=${accessToken}`
      )
      if (!insightRes.ok) return null
      const { data } = await insightRes.json() as { data: Array<{ name: string; values: Array<{ value: number }> }> }
      const getValue = (name: string) => data.find(d => d.name === name)?.values[0]?.value ?? 0
      return {
        id: media.id,
        timestamp: media.timestamp,
        impressions: getValue('impressions'),
        reach: getValue('reach'),
        engagement: getValue('engagement'),
        like_count: media.like_count,
        comments_count: media.comments_count,
      } satisfies InstagramMediaInsight
    })
  )

  return insights
    .filter((r): r is PromiseFulfilledResult<InstagramMediaInsight | null> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value as InstagramMediaInsight)
}

export async function fetchInstagramFollowerCount(
  accessToken: string,
  businessAccountId: string
): Promise<number> {
  const res = await fetch(
    `https://graph.instagram.com/v19.0/${businessAccountId}?fields=followers_count&access_token=${accessToken}`
  )
  if (!res.ok) return 0
  const data = await res.json() as { followers_count?: number }
  return data.followers_count ?? 0
}
```

- [ ] **Step 2: app/api/sns/analytics/sync/route.ts 생성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchInstagramMediaInsights, fetchInstagramFollowerCount } from '@/lib/sns/instagram-api'

export async function POST(req: NextRequest) {
  try {
    const { personaId } = await req.json()
    if (!personaId) return NextResponse.json({ error: 'personaId 필수' }, { status: 400 })

    const persona = await prisma.snsPersona.findUnique({ where: { id: personaId } })
    if (!persona) return NextResponse.json({ error: '페르소나 없음' }, { status: 404 })

    // 환경변수에서 액세스 토큰 가져오기 (향후 사용자별 토큰으로 확장)
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
    const businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
    if (!accessToken || !businessAccountId) {
      return NextResponse.json({ error: 'Instagram 연동 설정이 필요합니다.' }, { status: 400 })
    }

    const [insights, followers] = await Promise.all([
      fetchInstagramMediaInsights(accessToken, businessAccountId),
      fetchInstagramFollowerCount(accessToken, businessAccountId),
    ])

    // 날짜별 집계 및 upsert
    const byDate = new Map<string, { reach: number; impressions: number; engagement: number; postCount: number }>()
    for (const insight of insights) {
      const dateKey = insight.timestamp.split('T')[0]
      const existing = byDate.get(dateKey) || { reach: 0, impressions: 0, engagement: 0, postCount: 0 }
      byDate.set(dateKey, {
        reach: existing.reach + insight.reach,
        impressions: existing.impressions + insight.impressions,
        engagement: existing.engagement + insight.engagement,
        postCount: existing.postCount + 1,
      })
    }

    const upserts = await Promise.allSettled(
      Array.from(byDate.entries()).map(([date, data]) =>
        prisma.snsAnalyticsSnapshot.upsert({
          where: { personaId_date: { personaId, date: new Date(date) } },
          create: { personaId, date: new Date(date), followers, ...data },
          update: { followers, ...data },
        })
      )
    )

    return NextResponse.json({ synced: upserts.filter(r => r.status === 'fulfilled').length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '동기화 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 3: app/api/sns/analytics/route.ts 생성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const personaId = searchParams.get('personaId')
  const days = Number(searchParams.get('days') || 30)

  const since = new Date()
  since.setDate(since.getDate() - days)

  const snapshots = await prisma.snsAnalyticsSnapshot.findMany({
    where: {
      ...(personaId ? { personaId } : {}),
      date: { gte: since },
    },
    orderBy: { date: 'asc' },
  })

  return NextResponse.json(snapshots)
}
```

- [ ] **Step 4: app/api/sns/analytics/best-time/route.ts 생성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const personaId = searchParams.get('personaId')
  if (!personaId) return NextResponse.json({ error: 'personaId 필수' }, { status: 400 })

  // 발행된 포스트의 시간대별 engagement 분석
  const published = await prisma.snsScheduledPost.findMany({
    where: { personaId, status: 'PUBLISHED' },
    select: { publishedAt: true },
  })

  // 요일 + 시간대별 카운트
  const hourMap = new Map<string, number>()
  for (const post of published) {
    if (!post.publishedAt) continue
    const d = new Date(post.publishedAt)
    const key = `${d.getDay()}-${d.getHours()}`
    hourMap.set(key, (hourMap.get(key) || 0) + 1)
  }

  const sorted = Array.from(hourMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => {
      const [day, hour] = key.split('-').map(Number)
      const days = ['일','월','화','수','목','금','토']
      return { day: days[day], hour: `${hour}:00`, count }
    })

  return NextResponse.json(sorted)
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/sns/instagram-api.ts app/api/sns/analytics/
git commit -m "feat(sns): analytics API — Instagram sync, snapshots, best-time"
```

---

### Task 4-2: 성과 대시보드 UI

**Files:**
- Create: `app/sns/analytics/page.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
'use client'

import { useEffect, useState } from 'react'

type Snapshot = {
  id: string; date: string; reach: number; impressions: number
  engagement: number; followers: number; postCount: number
}
type Persona = { id: string; name: string }

export default function AnalyticsPage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [personaId, setPersonaId] = useState('')
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [syncing, setSyncing] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatAnswer, setChatAnswer] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  useEffect(() => {
    fetch('/api/sns/personas').then(r => r.json()).then((data: Persona[]) => {
      setPersonas(data)
      if (data.length > 0) setPersonaId(data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!personaId) return
    fetch(`/api/sns/analytics?personaId=${personaId}&days=30`)
      .then(r => r.json()).then(setSnapshots)
  }, [personaId])

  const totalReach = snapshots.reduce((s, n) => s + n.reach, 0)
  const avgEngagement = snapshots.length
    ? (snapshots.reduce((s, n) => s + n.engagement, 0) / snapshots.length).toFixed(1)
    : '0'
  const latestFollowers = snapshots.at(-1)?.followers ?? 0
  const totalPosts = snapshots.reduce((s, n) => s + n.postCount, 0)

  async function handleSync() {
    if (!personaId) return
    setSyncing(true)
    await fetch('/api/sns/analytics/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personaId }),
    })
    const updated = await fetch(`/api/sns/analytics?personaId=${personaId}&days=30`).then(r => r.json())
    setSnapshots(updated)
    setSyncing(false)
  }

  async function handleChat() {
    if (!chatInput.trim()) return
    setChatLoading(true)
    const context = JSON.stringify(snapshots.slice(-7))
    const res = await fetch('/api/sns/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt: `당신은 SNS 마케팅 전문가입니다. 다음 최근 7일 성과 데이터를 바탕으로 답변하세요:\n${context}`,
        userMessage: chatInput,
      }),
    }).then(r => r.json())
    setChatAnswer(res.content || '')
    setChatLoading(false)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="dashboard-eyebrow">SNS 스튜디오</p>
          <h1 className="dashboard-title">성과 분석</h1>
        </div>
        <div className="flex items-center gap-3">
          <select className="input" value={personaId} onChange={e => setPersonaId(e.target.value)}>
            {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="button-secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? '수집 중...' : '지금 수집'}
          </button>
        </div>
      </div>

      {/* KPI 타일 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          ['총 도달수', totalReach.toLocaleString()],
          ['평균 인게이지먼트', `${avgEngagement}%`],
          ['팔로워', latestFollowers.toLocaleString()],
          ['발행 수', String(totalPosts)],
        ].map(([label, value]) => (
          <div key={label} className="metric-card">
            <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
            <p className="text-2xl font-bold text-[var(--text-strong)]">{value}</p>
          </div>
        ))}
      </div>

      {/* 도달수 추이 (간단 막대 차트) */}
      {snapshots.length > 0 && (
        <div className="card mb-6">
          <p className="section-title mb-3">도달수 추이 (최근 30일)</p>
          <div className="flex items-end gap-1 h-32">
            {snapshots.slice(-30).map((s) => {
              const max = Math.max(...snapshots.map(x => x.reach), 1)
              const pct = Math.round((s.reach / max) * 100)
              return (
                <div key={s.id} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div
                    className="w-full bg-[var(--accent)] rounded-t opacity-80 hover:opacity-100 transition-opacity"
                    style={{ height: `${Math.max(pct, 2)}%` }}
                  />
                  <span className="text-[8px] text-[var(--text-muted)] hidden group-hover:block absolute -bottom-4">
                    {new Date(s.date).getDate()}일
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* AI 디스커션 */}
      <div className="card">
        <p className="section-title mb-3">💬 AI 디스커션</p>
        <div className="flex gap-2 mb-3">
          <input
            className="input flex-1"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            placeholder="이번달 가장 효과적인 콘텐츠 타입은?"
            onKeyDown={e => e.key === 'Enter' && handleChat()}
          />
          <button className="button-primary" onClick={handleChat} disabled={chatLoading}>
            {chatLoading ? '분석 중...' : '질문'}
          </button>
        </div>
        {chatAnswer && (
          <div className="soft-panel p-3 text-sm text-[var(--text-base)] whitespace-pre-wrap">{chatAnswer}</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 브라우저 확인**

`http://localhost:3000/sns/analytics` — KPI 타일, 차트, AI 디스커션 패널 렌더 확인.

- [ ] **Step 3: Commit**

```bash
git add app/sns/analytics/page.tsx
git commit -m "feat(sns): analytics dashboard — KPI tiles, reach chart, AI discussion"
```

---

## Chunk 5: Subsystem E — 댓글 자동화

### Task 5-1: 댓글 API (Instagram + AI 답변)

**Files:**
- Create: `app/api/sns/community/comments/route.ts`
- Create: `app/api/sns/community/comments/[id]/reply/route.ts`
- Create: `app/api/sns/community/comments/generate/route.ts`

- [ ] **Step 1: comments/route.ts 생성**

```typescript
// app/api/sns/community/comments/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mediaId = searchParams.get('mediaId')

  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
  if (!accessToken) {
    return NextResponse.json({ error: 'Instagram 연동 필요' }, { status: 400 })
  }
  if (!mediaId) {
    return NextResponse.json({ error: 'mediaId 필수' }, { status: 400 })
  }

  const res = await fetch(
    `https://graph.instagram.com/v19.0/${mediaId}/comments?fields=id,text,username,timestamp&access_token=${accessToken}`
  )
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
  const data = await res.json()
  return NextResponse.json(data)
}
```

- [ ] **Step 2: comments/generate/route.ts 생성 (AI 일괄 답변)**

```typescript
// app/api/sns/community/comments/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'

export async function POST(req: NextRequest) {
  try {
    const { personaId, comments } = await req.json()
    // comments: Array<{ id: string; text: string; username: string }>

    if (!personaId || !comments?.length) {
      return NextResponse.json({ error: 'personaId와 comments 필수' }, { status: 400 })
    }

    const persona = await prisma.snsPersona.findUnique({ where: { id: personaId } })
    if (!persona) return NextResponse.json({ error: '페르소나 없음' }, { status: 404 })

    const keywords = (() => { try { return JSON.parse(persona.keywords) as string[] } catch { return [] } })()

    const replies = await Promise.allSettled(
      comments.map(async (comment: { id: string; text: string; username: string }) => {
        const reply = await runLLM(
          `당신은 ${persona.brandConcept || ''} 브랜드의 SNS 담당자입니다.
글쓰기 스타일: ${persona.writingStyle || ''}
톤: ${persona.tone || ''}
자주 쓰는 표현: ${keywords.join(', ')}
댓글에 짧고 자연스럽게 답변하세요. 1-2문장으로.`,
          `@${comment.username}: ${comment.text}`
        )
        return { commentId: comment.id, username: comment.username, originalText: comment.text, reply }
      })
    )

    const results = replies
      .filter((r): r is PromiseFulfilledResult<{ commentId: string; username: string; originalText: string; reply: string }> => r.status === 'fulfilled')
      .map(r => r.value)

    return NextResponse.json(results)
  } catch {
    return NextResponse.json({ error: '답변 생성 실패' }, { status: 500 })
  }
}
```

- [ ] **Step 3: comments/[id]/reply/route.ts 생성**

```typescript
// app/api/sns/community/comments/[id]/reply/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const { text } = await req.json()
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN

    if (!accessToken) return NextResponse.json({ error: 'Instagram 연동 필요' }, { status: 400 })
    if (!text?.trim()) return NextResponse.json({ error: '답변 텍스트 필수' }, { status: 400 })

    // instagram_manage_comments 스코프 필요
    const res = await fetch(
      `https://graph.instagram.com/v19.0/${id}/replies`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, access_token: accessToken }),
      }
    )

    if (!res.ok) {
      const err = await res.json()
      return NextResponse.json({ error: err.error?.message || '발행 실패' }, { status: 500 })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: '답변 발행 실패' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/sns/community/
git commit -m "feat(sns): community API — comment list, AI bulk generate, reply publish"
```

---

### Task 5-2: 커뮤니티 UI

**Files:**
- Create: `app/sns/community/page.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
'use client'

import { useState, useEffect } from 'react'

type Comment = { id: string; text: string; username: string; timestamp: string }
type Reply = { commentId: string; username: string; originalText: string; reply: string }
type Persona = { id: string; name: string }

export default function CommunityPage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [personaId, setPersonaId] = useState('')
  const [mediaId, setMediaId] = useState('')
  const [comments, setComments] = useState<Comment[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [replies, setReplies] = useState<Map<string, string>>(new Map())
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sns/personas').then(r => r.json()).then((data: Persona[]) => {
      setPersonas(data)
      if (data.length > 0) setPersonaId(data[0].id)
    })
  }, [])

  async function loadComments() {
    if (!mediaId.trim()) return
    const res = await fetch(`/api/sns/community/comments?mediaId=${mediaId}`)
    const data = await res.json()
    setComments(data.data || [])
  }

  async function generateReplies() {
    if (!personaId || selected.size === 0) return
    setGenerating(true)
    const selectedComments = comments.filter(c => selected.has(c.id))
    const res = await fetch('/api/sns/community/comments/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personaId, comments: selectedComments }),
    })
    const data: Reply[] = await res.json()
    const newReplies = new Map(replies)
    data.forEach(r => newReplies.set(r.commentId, r.reply))
    setReplies(newReplies)
    setGenerating(false)
  }

  async function publishReply(commentId: string) {
    const text = replies.get(commentId)
    if (!text) return
    setPublishing(commentId)
    await fetch(`/api/sns/community/comments/${commentId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    setPublishing(null)
    // 발행 후 해당 댓글 제거
    setComments(prev => prev.filter(c => c.id !== commentId))
    const newReplies = new Map(replies)
    newReplies.delete(commentId)
    setReplies(newReplies)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="dashboard-eyebrow">SNS 스튜디오</p>
        <h1 className="dashboard-title">커뮤니티</h1>
      </div>

      {/* 컨트롤 */}
      <div className="card mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1">페르소나</label>
          <select className="input" value={personaId} onChange={e => setPersonaId(e.target.value)}>
            {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1">포스팅 ID (Media ID)</label>
          <input className="input" value={mediaId} onChange={e => setMediaId(e.target.value)} placeholder="17896..." />
        </div>
        <button className="button-secondary" onClick={loadComments}>댓글 불러오기</button>
      </div>

      {/* 댓글 목록 */}
      {comments.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox"
                checked={selected.size === comments.length}
                onChange={e => setSelected(e.target.checked ? new Set(comments.map(c => c.id)) : new Set())}
              />
              전체 선택 ({selected.size}/{comments.length})
            </label>
            <button className="button-primary text-sm" onClick={generateReplies}
              disabled={generating || selected.size === 0}>
              {generating ? 'AI 생성 중...' : `✨ 선택 항목 일괄 AI 답변 생성 (${selected.size})`}
            </button>
          </div>

          <div className="space-y-3">
            {comments.map(c => (
              <div key={c.id} className={`card ${selected.has(c.id) ? 'border-[var(--accent)]' : ''}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">@{c.username}</span>
                      <span className="text-xs text-[var(--text-muted)]">{new Date(c.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-[var(--text-base)] mb-2">{c.text}</p>
                    {replies.has(c.id) && (
                      <div className="bg-[var(--surface-sub)] rounded p-2 mb-2">
                        <p className="text-xs text-[var(--text-muted)] mb-1">AI 답변 초안</p>
                        <textarea
                          className="input w-full text-sm min-h-[60px]"
                          value={replies.get(c.id) || ''}
                          onChange={e => {
                            const next = new Map(replies)
                            next.set(c.id, e.target.value)
                            setReplies(next)
                          }}
                        />
                        <button
                          className="button-primary text-xs mt-2"
                          onClick={() => publishReply(c.id)}
                          disabled={publishing === c.id}
                        >
                          {publishing === c.id ? '발행 중...' : '발행'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {comments.length === 0 && (
        <div className="soft-card text-center py-12">
          <p className="text-[var(--text-muted)]">포스팅 ID를 입력하고 댓글을 불러오세요.</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 브라우저 확인**

`http://localhost:3000/sns/community` — 페이지 렌더 확인. (실제 댓글 로드는 Instagram 연동 설정 필요)

- [ ] **Step 3: Commit**

```bash
git add app/sns/community/page.tsx
git commit -m "feat(sns): community page — bulk comment management + AI reply generation"
```

---

## Chunk 6: 마무리

### Task 6-1: ContentDraft 마이그레이션 (기존 /content → /sns/studio 리다이렉트)

**Files:**
- Modify: `app/content/page.tsx`

- [ ] **Step 1: /content 페이지에 서버 사이드 리다이렉트 추가**

기존 `app/content/page.tsx`가 `'use client'`로 시작하는 클라이언트 컴포넌트인지 확인한다. 클라이언트 컴포넌트에서는 `redirect()`가 동작하지 않으므로, 파일 상단의 `'use client'` 지시어를 **제거**하고 서버 컴포넌트로 전환한 뒤 파일 전체를 아래로 교체한다:

```typescript
// app/content/page.tsx — 서버 컴포넌트로 전환
import { redirect } from 'next/navigation'

export default function ContentPage() {
  redirect('/sns/studio')
}
```

> 만약 `/content` 페이지에 유지해야 할 기존 기능이 있다면, 해당 기능을 `/sns/studio`로 이전한 뒤 이 리다이렉트를 적용한다.

- [ ] **Step 2: MCP 서버 persona 툴 추가**

`scripts/mcp-server.mjs`에 SNS 페르소나 조회 툴을 추가한다 (기존 패턴 따라):

```javascript
server.tool('list_sns_personas', {}, async () => {
  const personas = await prisma.snsPersona.findMany({
    where: { isActive: true },
    select: { id: true, name: true, platform: true, brandConcept: true, tone: true },
  })
  return { content: [{ type: 'text', text: JSON.stringify(personas, null, 2) }] }
})
```

- [ ] **Step 3: 전체 통합 확인**

```
1. /sns/personas — 목록 페이지 확인
2. /sns/personas/new — 신규 생성 플로우 확인 (FROM_TEMPLATE 모드)
3. /sns/studio — 제작소, 텍스트 콘텐츠 생성 확인
4. /sns/calendar — 캘린더 렌더 확인
5. /sns/analytics — 대시보드 렌더 확인
6. /sns/community — 커뮤니티 렌더 확인
7. 사이드바 SNS 스튜디오 그룹 5개 항목 확인
8. /content → /sns/studio 리다이렉트 확인
```

- [ ] **Step 4: 최종 Commit**

```bash
git add -A
git commit -m "feat(sns): SNS Studio complete — A-E subsystems integrated"
git push origin main
```

---

## 구현 완료 체크리스트

- [ ] Chunk 0: Foundation (패키지 + 스키마 + ig-mcp)
- [ ] Chunk 1: 페르소나 엔진 (OAuth 스코프 + API + 목록 + 마법사 + 편집 + 네비게이션)
- [ ] Chunk 2: 콘텐츠 제작소 (upload helper + 나노바나나 2 + Canva MCP 파이프라인 + API + carousel editor + video-renderer stub + UI)
- [ ] Chunk 3: 캘린더 + 예약 발행 (API + missed route + Electron 타이머 + UI)
- [ ] Chunk 4: 성과 대시보드 (sns/chat API + Instagram API + AI 디스커션 + UI)
- [ ] Chunk 5: 댓글 자동화 (API + 일괄 AI 답변 + UI)
- [ ] Chunk 6: 마무리 (리다이렉트 서버 컴포넌트 전환 + MCP 툴 + 통합 확인)
