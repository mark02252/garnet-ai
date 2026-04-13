# Cycle Reflection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** routine-cycle 완료 후 사이클 전체를 리뷰하여 교훈을 Knowledge Store에 축적하고, Reasoner 프롬프트에 자동 주입한다.

**Architecture:** 신규 `cycle-reflector.ts` 모듈이 사이클 결과를 LLM으로 리뷰하여 교훈을 추출. 교훈은 Knowledge Store에 Level 2(Pattern)로 저장되며, 3회 이상 반복되면 Level 3(Principle)으로 자동 승격. Reasoner 프롬프트에 최근 교훈과 확립된 원칙이 별도 섹션으로 주입된다.

**Tech Stack:** TypeScript, Prisma (KnowledgeEntry), runLLM

**Spec:** `docs/superpowers/specs/2026-04-13-cycle-reflection-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/agent-loop/cycle-reflector.ts` | Create | 사이클 리플렉션 핵심 로직 — LLM 호출, 교훈 추출, 저장 |
| `lib/agent-loop/knowledge-store.ts` | Modify | `promoteToLevel3` 함수 추가 — 반복 교훈 원칙 승격 |
| `lib/agent-loop/reasoner.ts` | Modify | `getReflectionContext` 호출, 프롬프트에 교훈/원칙 섹션 추가 |
| `lib/agent-loop/index.ts` | Modify | runCycle에 reflector 호출 추가 (routine-cycle, 액션 1+건) |

---

## Chunk 1: Core Reflection Module

### Task 1: Create cycle-reflector.ts

**Files:**
- Create: `lib/agent-loop/cycle-reflector.ts`

- [ ] **Step 1: Create the reflection module**

```typescript
// lib/agent-loop/cycle-reflector.ts
import { runLLM } from '@/lib/llm'
import { addKnowledge } from './knowledge-store'

export type CycleReflectionInput = {
  cycleId: string
  worldModelSummary: string
  reasonerSummary: string
  actions: Array<{
    title: string
    riskLevel: string
    status: string
    rationale: string
  }>
  goalChanges: Array<{
    goal: string
    before: number
    after: number
  }>
}

type Lesson = {
  pattern: string
  observation: string
  domain: string
}

export type CycleReflectionResult = {
  summary: string
  lessons: Lesson[]
  reasonerFeedback: string
}

const REFLECTION_SYSTEM = '사이클 리플렉션 전문가. 판단 과정을 객관적으로 분석하고 재사용 가능한 교훈을 추출한다. 한국어. JSON만 출력.'

export async function reflectOnCycle(input: CycleReflectionInput): Promise<CycleReflectionResult | null> {
  if (input.actions.length === 0) return null

  const actionsText = input.actions
    .map(a => `- [${a.riskLevel}/${a.status}] ${a.title}: ${a.rationale.slice(0, 100)}`)
    .join('\n')

  const goalText = input.goalChanges.length > 0
    ? input.goalChanges.map(g => `- ${g.goal}: ${g.before}% → ${g.after}%`).join('\n')
    : '목표 변화 없음'

  const prompt = `## 사이클 리플렉션

### 환경
${input.worldModelSummary.slice(0, 300)}

### 판단
${input.reasonerSummary.slice(0, 300)}

### 실행된 액션
${actionsText}

### 목표 변화
${goalText}

위 사이클을 리뷰하고 교훈을 추출하세요. JSON만 출력:
{"summary":"1-2문장 요약","lessons":[{"pattern":"반복 가능한 상황 패턴","observation":"이 패턴에서의 교훈","domain":"marketing|operations|content_strategy|consumer|b2b|pricing_strategy|finance|competitive|self_improvement"}],"reasonerFeedback":"다음 사이클에 반영할 한 줄 피드백"}

교훈이 없으면 lessons를 빈 배열로. 억지로 만들지 마세요.`

  try {
    const raw = await runLLM(REFLECTION_SYSTEM, prompt, 0.3, 800)
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}') as CycleReflectionResult
    if (!parsed.summary) parsed.summary = ''
    if (!Array.isArray(parsed.lessons)) parsed.lessons = []
    if (!parsed.reasonerFeedback) parsed.reasonerFeedback = ''
    return parsed
  } catch {
    return null
  }
}

/**
 * 교훈을 Knowledge Store에 저장하고 반복 패턴은 원칙으로 승격
 */
export async function storeLessons(lessons: Lesson[]): Promise<number> {
  let stored = 0
  for (const lesson of lessons) {
    if (!lesson.pattern || !lesson.observation) continue
    await addKnowledge({
      domain: lesson.domain || 'operations',
      level: 2,
      pattern: lesson.pattern,
      observation: lesson.observation,
      source: 'cycle_reflector',
    })
    stored++
  }
  return stored
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd "/Users/rnr/Documents/New project" && npx tsc --noEmit --pretty false 2>&1 | head -20`
Expected: No errors related to cycle-reflector.ts

- [ ] **Step 3: Commit**

```bash
git add lib/agent-loop/cycle-reflector.ts
git commit -m "feat(agent-loop): add cycle-reflector module for post-cycle reflection"
```

---

## Chunk 2: Knowledge Store — Principle Promotion

### Task 2: Add promoteRepeatedLessons to knowledge-store.ts

**Files:**
- Modify: `lib/agent-loop/knowledge-store.ts`

- [ ] **Step 1: Add the promotion function**

Add at end of `knowledge-store.ts`:

```typescript
/**
 * cycle_reflector가 3회 이상 관찰한 패턴을 Level 3(Principle)으로 승격
 */
export async function promoteRepeatedLessons(): Promise<number> {
  const candidates = await prisma.knowledgeEntry.findMany({
    where: {
      source: { contains: 'cycle_reflector' },
      level: 2,
      observedCount: { gte: 3 },
    },
  })

  let promoted = 0
  for (const entry of candidates) {
    await prisma.knowledgeEntry.update({
      where: { id: entry.id },
      data: { level: 3 },
    })
    promoted++
  }
  return promoted
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd "/Users/rnr/Documents/New project" && npx tsc --noEmit --pretty false 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/agent-loop/knowledge-store.ts
git commit -m "feat(knowledge-store): add promoteRepeatedLessons for principle auto-promotion"
```

---

## Chunk 3: Reasoner Prompt Injection

### Task 3: Add reflection context to Reasoner prompt

**Files:**
- Modify: `lib/agent-loop/reasoner.ts:41-129` (buildReasonerPrompt)
- Modify: `lib/agent-loop/reasoner.ts:148-232` (reason function)

- [ ] **Step 1: Add getReflectionContext function**

Add before the `reason` function (around line 147) in `reasoner.ts`:

```typescript
async function getReflectionContext(): Promise<string> {
  try {
    const recentLessons = await prisma.knowledgeEntry.findMany({
      where: { source: { contains: 'cycle_reflector' }, level: 2 },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    })
    const principles = await prisma.knowledgeEntry.findMany({
      where: { source: { contains: 'cycle_reflector' }, level: 3 },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    })

    const parts: string[] = []
    if (recentLessons.length > 0) {
      parts.push('## 최근 사이클 교훈')
      parts.push(recentLessons.map(l => `- [${l.domain}] ${l.pattern}: ${l.observation.split('\n')[0]}`).join('\n'))
    }
    if (principles.length > 0) {
      parts.push('## 확립된 원칙 (3회 이상 검증)')
      parts.push(principles.map(p => `- [${p.domain}] ${p.pattern}: ${p.observation.split('\n')[0]}`).join('\n'))
    }
    return parts.join('\n\n')
  } catch {
    return ''
  }
}
```

- [ ] **Step 2: Add reflectionContext parameter to buildReasonerPrompt**

Modify the `buildReasonerPrompt` function signature at line 41 to add `reflectionContext?: string` as the last parameter:

```typescript
export function buildReasonerPrompt(
  worldModel: WorldModel,
  goals: GoalProgress[],
  businessContext: string,
  pastEpisodes: Array<{ input: string; output: string; score: number | null }>,
  knowledge?: { ... },
  macroSummary?: string,
  causalSummary?: string,
  predictionSummary?: string,
  rolesSummary?: string,
  semanticContext?: string,
  reflectionContext?: string,    // ← 추가
): string {
```

- [ ] **Step 3: Add reflection section to prompt template**

In the return string of `buildReasonerPrompt` (around line 128), add before the final instruction line:

```typescript
${reflectionContext ? `\n${reflectionContext}` : ''}

위 상황을 분석하고, 지금 해야 할 액션을 우선순위 순으로 JSON으로 제안하세요.`
```

Replace the existing final line (line 129):
```typescript
위 상황을 분석하고, 지금 해야 할 액션을 우선순위 순으로 JSON으로 제안하세요.`
```

- [ ] **Step 4: Call getReflectionContext in reason function**

In the `reason` function (around line 210), before `buildReasonerPrompt` call, add:

```typescript
  const reflectionContext = await getReflectionContext()
```

And pass it as the last argument to `buildReasonerPrompt`:

```typescript
  const userPrompt = buildReasonerPrompt(
    worldModel, goals, businessContext,
    pastEpisodes.map(e => ({ input: e.input, output: e.output, score: e.score })),
    knowledge,
    macroSummary,
    causalSummary,
    predictionSummary,
    rolesSummary,
    semanticContext,
    reflectionContext,    // ← 추가
  )
```

- [ ] **Step 5: Add prisma import if not present**

Check if `prisma` is already imported in reasoner.ts. If not, add at top:

```typescript
import { prisma } from '@/lib/prisma'
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd "/Users/rnr/Documents/New project" && npx tsc --noEmit --pretty false 2>&1 | head -20`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add lib/agent-loop/reasoner.ts
git commit -m "feat(reasoner): inject cycle reflection lessons and principles into prompt"
```

---

## Chunk 4: Integration into Agent Loop

### Task 4: Wire cycle-reflector into runCycle

**Files:**
- Modify: `lib/agent-loop/index.ts:162-185` (routine-cycle section)

- [ ] **Step 1: Add reflector call after evaluator**

In `index.ts`, after the existing routine-cycle block (around line 176, after goal escalation), add:

```typescript
      // 7.2 사이클 리플렉션 — 교훈 추출 + Knowledge Store 저장
      if (decision.actions.length > 0) {
        try {
          const { reflectOnCycle, storeLessons } = await import('./cycle-reflector')
          const { promoteRepeatedLessons } = await import('./knowledge-store')
          const reflection = await reflectOnCycle({
            cycleId,
            worldModelSummary: decision.situationSummary || '',
            reasonerSummary: decision.actions.map(a => `${a.title}: ${a.rationale}`).join('; ').slice(0, 300),
            actions: decision.actions.map(a => ({
              title: a.title,
              riskLevel: a.riskLevel,
              status: a.riskLevel === 'LOW' ? 'EXECUTED' : 'PENDING_APPROVAL',
              rationale: a.rationale || '',
            })),
            goalChanges: goals.map(g => ({
              goal: g.goal.goal,
              before: g.progressPercent,
              after: g.progressPercent,
            })),
          })
          if (reflection && reflection.lessons.length > 0) {
            await storeLessons(reflection.lessons)
            await promoteRepeatedLessons()
          }
        } catch { /* non-critical */ }
      }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd "/Users/rnr/Documents/New project" && npx tsc --noEmit --pretty false 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Test manually by triggering a routine-cycle**

Run:
```bash
curl -s -X POST -H "Content-Type: application/json" -d '{"action":"trigger","cycleType":"routine-cycle"}' http://localhost:3000/api/agent-loop/control
```

Expected: 200 OK, cycle completes with reflection

- [ ] **Step 4: Verify lessons were stored in Knowledge Store**

```bash
source <(grep '^DATABASE_URL=' .env | head -1) && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.knowledgeEntry.findMany({ where: { source: { contains: 'cycle_reflector' } }, orderBy: { updatedAt: 'desc' }, take: 5 })
  .then(r => { for (const e of r) console.log(e.level, e.domain, e.pattern.slice(0,60)); p.\$disconnect(); });
"
```

Expected: At least 1 entry with source containing 'cycle_reflector'

- [ ] **Step 5: Commit**

```bash
git add lib/agent-loop/index.ts
git commit -m "feat(agent-loop): integrate cycle reflection into routine-cycle"
```

- [ ] **Step 6: Push all changes**

```bash
git push origin main
```
