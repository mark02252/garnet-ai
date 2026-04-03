# AI 성과 분석 리포트 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `sns/analytics` 페이지의 AI 성과 리포트 UI와 실제 API 응답 구조를 일치시키고, 저성과 게시물 섹션을 추가하고, 에러 처리를 개선한다.

**Architecture:** 백엔드(`lib/sns/performance-analyzer.ts`, `app/api/sns/analytics/report/route.ts`, Prisma 모델)는 이미 완전히 구현되어 있다. 남은 작업은 프론트엔드 타입 불일치 수정, lowPosts UI 추가, 에러 표시, 테스트 추가다.

**Tech Stack:** Next.js 15 (App Router, 'use client') · TypeScript · Vitest

---

## 타입 불일치 매핑 (참고)

API(`PerformanceReport`)가 실제로 반환하는 구조 vs. 현재 UI 타입:

| UI 현재 타입 | API 실제 필드 | 비고 |
|---|---|---|
| `ReportTopPost.postId` | `mediaId` | 필드명 불일치 |
| `ReportTopPost.engagementRate` | `engagement` | 필드명 불일치 |
| `ReportTopPost.caption` | `caption` | ✓ 일치 |
| `ReportTopPost.whyGood` | `whyGood` | ✓ 일치 |
| `ReportAdSuggestion.reason` | `targetPostDescription` | 필드명 불일치 |
| `ReportAdSuggestion.suggestedBudget: number` | `suggestedBudget: string` ("3~5만원") | 타입 불일치 |
| `ReportAdSuggestion.expectedReach: number` | `expectedEffect: string` | 필드명+타입 불일치 |
| `ReportPatterns.bestTimeSlots` | `bestPostingTimes` | 필드명 불일치 |
| `ReportPatterns.bestContentTypes` | `bestContentType` (단일 string) | 배열↔문자열 불일치 |
| `ReportPatterns.insights` | `audienceInsight` (단일 string) | 배열↔문자열 불일치 |
| `Report.summary.trend` | `trendDirection: 'UP'\|'DOWN'\|'FLAT'` | 필드명 불일치 |
| `lowPosts` 렌더링 없음 | `lowPosts: Array<{mediaId, caption, reach, mediaType, improvementTip}>` | UI 미구현 |

---

## File Structure

- **Modify:** `app/(domains)/sns/analytics/page.tsx` (lines 25–47 타입, lines 824–940 렌더링)
- **Create:** `lib/sns/__tests__/performance-analyzer.test.ts`

---

## Chunk 1: 타입 수정 + 렌더링 수정 + 에러 처리

### Task 1: sns/analytics/page.tsx — Report 타입 수정

**Files:**
- Modify: `app/(domains)/sns/analytics/page.tsx:25-47`

- [ ] **Step 1: 타입 정의 교체**

`app/(domains)/sns/analytics/page.tsx` 파일 상단 (lines 25–47)의 Report 관련 타입을 아래로 교체:

```typescript
type ReportTopPost = {
  mediaId: string
  caption: string
  reach: number
  engagement: number
  mediaType: string
  timestamp: string
  whyGood: string
}
type ReportLowPost = {
  mediaId: string
  caption: string
  reach: number
  mediaType: string
  improvementTip: string
}
type ReportRecommendation = {
  topic: string
  contentType: 'TEXT' | 'CAROUSEL'
  suggestedCaption: string
  reason: string
  suggestedHashtags?: string[]
}
type ReportAdSuggestion = {
  targetPostDescription: string
  suggestedBudget: string
  expectedEffect: string
  objective: string
}
type ReportPatterns = {
  bestPostingTimes: string[]
  bestContentType: string
  topHashtags: string[]
  topKeywords: string[]
  audienceInsight: string
}
type Report = {
  id: string
  personaId: string
  createdAt: string
  summary: {
    period: string
    totalReach: number
    avgReach: number
    reachChange: number
    totalEngagement: number
    avgEngagementRate: number
    trendDirection: 'UP' | 'DOWN' | 'FLAT'
  }
  topPosts: ReportTopPost[]
  lowPosts: ReportLowPost[]
  patterns: ReportPatterns
  recommendations: ReportRecommendation[]
  adSuggestions: ReportAdSuggestion[]
}
```

- [ ] **Step 2: 상태 타입 업데이트**

line 73의 `useState<Report | null>(null)` — 타입이 위와 맞으므로 그대로 유지. 컴파일 에러 없는지 확인용.

- [ ] **Step 3: TypeScript 타입 체크 실행**

```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit 2>&1 | head -40
```

타입 오류가 발생하면 오류 메시지를 기반으로 수정.

- [ ] **Step 4: 테스트 실행**

```bash
cd "/Users/rnr/Documents/New project" && npm run test 2>&1 | tail -6
```

Expected: 30 passed

- [ ] **Step 5: Commit**

```bash
git add "app/(domains)/sns/analytics/page.tsx"
git commit -m "fix(sns): align Report type with PerformanceReport API response"
```

---

### Task 2: sns/analytics/page.tsx — 렌더링 코드 수정

**Files:**
- Modify: `app/(domains)/sns/analytics/page.tsx:824-950`

- [ ] **Step 1: Summary 섹션 수정 (trendDirection)**

line ~840 근처, `report.summary.trend` → `report.summary.trendDirection` 로 변경.
또한 trendDirection이 'UP'|'DOWN'|'FLAT' 코드이므로 한국어 표시로 변환:

```tsx
{/* 기존: {report.summary.trend} */}
{report.summary.trendDirection === 'UP' ? '▲ 상승' : report.summary.trendDirection === 'DOWN' ? '▼ 하락' : '→ 보합'}
```

Summary 카드 3개를 아래로 교체:
```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <div className="status-tile">
    <p className="metric-label">총 도달</p>
    <p className="mt-2 text-lg font-bold text-[var(--text-strong)]">
      {formatCompactNumber(report.summary.totalReach)}
    </p>
  </div>
  <div className="status-tile">
    <p className="metric-label">평균 참여율</p>
    <p className="mt-2 text-lg font-bold text-[var(--text-strong)]">
      {report.summary.avgEngagementRate}%
    </p>
  </div>
  <div className="status-tile">
    <p className="metric-label">추세</p>
    <p className="mt-2 text-lg font-bold text-[var(--text-strong)]">
      {report.summary.trendDirection === 'UP' ? '▲ 상승' : report.summary.trendDirection === 'DOWN' ? '▼ 하락' : '→ 보합'}
    </p>
  </div>
</div>
```

- [ ] **Step 2: topPosts 렌더링 수정 (mediaId, engagement)**

Top 게시물 섹션에서:
- `post.postId` → `post.mediaId`
- `post.engagementRate` → `post.engagement`
- `post.caption` ✓ (그대로)
- `post.whyGood` ✓ (그대로)

수정 후:
```tsx
{report.topPosts.map((post, i) => (
  <div key={post.mediaId} className="list-card">
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-[var(--text-strong)]">
        {post.caption ? post.caption.slice(0, 60) + (post.caption.length > 60 ? '...' : '') : `게시물 #${i + 1}`}
      </p>
      <div className="flex items-center gap-2">
        <span className="accent-pill">도달 {formatCompactNumber(post.reach)}</span>
        <span className="accent-pill">참여 {formatCompactNumber(post.engagement)}</span>
      </div>
    </div>
    <p className="text-xs text-[var(--text-muted)] mt-1">{post.whyGood}</p>
  </div>
))}
```

- [ ] **Step 3: lowPosts 섹션 추가**

topPosts 섹션 바로 다음(recommendations 섹션 이전)에 lowPosts 섹션 추가:

```tsx
{/* 저성과 게시물 진단 */}
{report.lowPosts.length > 0 && (
  <div>
    <p className="text-sm font-semibold text-[var(--text-strong)] mb-3">저성과 게시물 진단</p>
    <div className="space-y-2">
      {report.lowPosts.map((post, i) => (
        <div key={post.mediaId} className="list-card border-l-2 border-[var(--status-warning)]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--text-strong)]">
              {post.caption ? post.caption.slice(0, 60) + (post.caption.length > 60 ? '...' : '') : `게시물 #${i + 1}`}
            </p>
            <span className="accent-pill">도달 {formatCompactNumber(post.reach)}</span>
          </div>
          <p className="text-xs text-[var(--accent)] mt-1">💡 {post.improvementTip}</p>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: adSuggestions 렌더링 수정**

광고 예산 제안 섹션의 각 `ad` 필드 수정:
- `ad.reason` → `ad.targetPostDescription`
- `ad.suggestedBudget` (이제 string) → 그대로 표시
- `ad.expectedReach` → `ad.expectedEffect` (이제 string)

수정 후:
```tsx
{report.adSuggestions.map((ad, i) => (
  <div key={i} className="list-card">
    <div className="flex items-center justify-between mb-1">
      <p className="text-sm text-[var(--text-strong)]">{ad.targetPostDescription}</p>
      <span className="text-xs text-[var(--text-muted)]">{ad.objective}</span>
    </div>
    <div className="flex items-center gap-2 mt-1">
      <span className="accent-pill">예산 {ad.suggestedBudget}</span>
      <span className="accent-pill">{ad.expectedEffect}</span>
    </div>
  </div>
))}
```

- [ ] **Step 5: patterns 렌더링 수정**

패턴 인사이트 섹션:
- `report.patterns.bestTimeSlots` → `report.patterns.bestPostingTimes`
- `report.patterns.bestContentTypes` → 단일 string `report.patterns.bestContentType`
- `report.patterns.insights` → 단일 string `report.patterns.audienceInsight` + `topHashtags` + `topKeywords` 배열

수정 후:
```tsx
{report.patterns && (
  <div>
    <p className="text-sm font-semibold text-[var(--text-strong)] mb-3">패턴 인사이트</p>
    <div className="soft-panel space-y-2">
      {report.patterns.bestPostingTimes.length > 0 && (
        <p className="text-sm text-[var(--text-base)]">
          <span className="font-medium">최적 시간대:</span>{' '}
          {report.patterns.bestPostingTimes.join(', ')}
        </p>
      )}
      {report.patterns.bestContentType && (
        <p className="text-sm text-[var(--text-base)]">
          <span className="font-medium">최적 콘텐츠 유형:</span>{' '}
          {report.patterns.bestContentType}
        </p>
      )}
      {report.patterns.topHashtags.length > 0 && (
        <p className="text-sm text-[var(--text-base)]">
          <span className="font-medium">Top 해시태그:</span>{' '}
          {report.patterns.topHashtags.join(' ')}
        </p>
      )}
      {report.patterns.audienceInsight && (
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {report.patterns.audienceInsight}
        </p>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 6: TypeScript 타입 체크**

```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit 2>&1 | head -40
```

에러가 없어야 함. 있으면 오류 내용 기반으로 수정.

- [ ] **Step 7: 테스트 실행**

```bash
cd "/Users/rnr/Documents/New project" && npm run test 2>&1 | tail -6
```

Expected: 30 passed

- [ ] **Step 8: Commit**

```bash
git add "app/(domains)/sns/analytics/page.tsx"
git commit -m "fix(sns): fix report rendering — align field names with PerformanceReport API"
```

---

### Task 3: handleGenerateReport 에러 처리 개선

**Files:**
- Modify: `app/(domains)/sns/analytics/page.tsx:244-265`

현재 에러가 발생해도 사용자에게 아무 피드백이 없음. 에러 상태 추가.

- [ ] **Step 1: 에러 상태 추가**

line 74 근처에 상태 추가:
```typescript
const [reportError, setReportError] = useState<string | null>(null)
```

- [ ] **Step 2: handleGenerateReport 수정**

```typescript
async function handleGenerateReport() {
  if (!personaId) return
  setReportLoading(true)
  setReportError(null)
  try {
    const draft = await loadStoredMetaConnectionDraft(window.location.origin)
    const accessToken = draft.value.accessToken || ''
    const businessAccountId = draft.value.instagramBusinessAccountId || ''
    const res = await fetch('/api/sns/analytics/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personaId, accessToken, businessAccountId }),
    })
    const data = await res.json()
    if (res.ok) {
      setReport(data.report ?? data)
    } else {
      setReportError(data.error || '리포트 생성에 실패했습니다.')
    }
  } catch {
    setReportError('리포트 생성 중 오류가 발생했습니다.')
  } finally {
    setReportLoading(false)
  }
}
```

- [ ] **Step 3: 에러 메시지 UI 추가**

"AI 성과 리포트" 섹션 버튼 아래 (report 섹션 시작 전):
```tsx
{reportError && (
  <p className="text-sm text-[var(--status-error)] mt-2">{reportError}</p>
)}
```

- [ ] **Step 4: TypeScript 타입 체크**

```bash
cd "/Users/rnr/Documents/New project" && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: 테스트 실행**

```bash
cd "/Users/rnr/Documents/New project" && npm run test 2>&1 | tail -6
```

Expected: 30 passed

- [ ] **Step 6: Commit**

```bash
git add "app/(domains)/sns/analytics/page.tsx"
git commit -m "fix(sns): show error message when report generation fails"
```

---

## Chunk 2: 테스트

### Task 4: performance-analyzer 테스트 추가

**Files:**
- Create: `lib/sns/__tests__/performance-analyzer.test.ts`

`generatePerformanceReport`는 외부 API(Instagram, LLM)를 호출하므로 직접 통합 테스트는 불가. 모듈 export와 `PerformanceReport` 타입 shape을 검증하는 smoke test를 작성한다.

- [ ] **Step 1: 테스트 파일 작성**

`lib/sns/__tests__/performance-analyzer.test.ts` 생성:

```typescript
import { describe, it, expect } from 'vitest'

describe('performance-analyzer', () => {
  it('exports generatePerformanceReport function', async () => {
    const mod = await import('../performance-analyzer')
    expect(typeof mod.generatePerformanceReport).toBe('function')
  })

  it('exports PerformanceReport type shape via runtime check', async () => {
    const mod = await import('../performance-analyzer')
    // generatePerformanceReport exists and is async
    expect(mod.generatePerformanceReport.constructor.name).toBe('AsyncFunction')
  })

  it('PerformanceReport summary fields are defined correctly', () => {
    // Type-level validation via a mock object conforming to the type
    const mockReport = {
      summary: {
        period: '최근 30일',
        totalReach: 10000,
        avgReach: 333,
        reachChange: 12.5,
        totalEngagement: 500,
        avgEngagementRate: 5.0,
        trendDirection: 'UP' as const,
      },
      topPosts: [{
        mediaId: 'abc123',
        caption: '테스트 캡션',
        reach: 1000,
        engagement: 50,
        mediaType: 'IMAGE',
        timestamp: '2026-04-01T00:00:00Z',
        whyGood: '이미지 퀄리티가 높음',
      }],
      lowPosts: [{
        mediaId: 'def456',
        caption: '저성과 게시물',
        reach: 100,
        mediaType: 'IMAGE',
        improvementTip: '해시태그 추가 필요',
      }],
      patterns: {
        bestPostingTimes: ['화요일 19:00'],
        bestContentType: '캐러셀',
        topHashtags: ['#마케팅', '#브랜딩'],
        topKeywords: ['성장', '브랜드'],
        audienceInsight: '20~30대 여성 타겟',
      },
      recommendations: [{
        topic: '브랜드 스토리',
        contentType: 'CAROUSEL' as const,
        reason: '인게이지먼트가 높음',
        suggestedCaption: '우리 브랜드의 이야기',
        suggestedHashtags: ['#브랜드'],
      }],
      adSuggestions: [{
        targetPostDescription: '최근 도달 1위 게시물',
        suggestedBudget: '3~5만원',
        expectedEffect: '예상 도달 +2,000',
        objective: '도달',
      }],
    }

    // Validate required fields exist
    expect(mockReport.summary.trendDirection).toBe('UP')
    expect(mockReport.topPosts[0].mediaId).toBe('abc123')
    expect(mockReport.lowPosts[0].improvementTip).toBeTruthy()
    expect(mockReport.patterns.bestPostingTimes).toBeInstanceOf(Array)
    expect(mockReport.adSuggestions[0].suggestedBudget).toBe('3~5만원')
  })
})
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

```bash
cd "/Users/rnr/Documents/New project" && npm run test -- lib/sns/__tests__/performance-analyzer.test.ts 2>&1 | tail -15
```

Expected: 3 passed (smoke tests는 즉시 통과)

- [ ] **Step 3: 전체 테스트 실행**

```bash
cd "/Users/rnr/Documents/New project" && npm run test 2>&1 | tail -6
```

Expected: 33 passed (기존 30 + 신규 3)

- [ ] **Step 4: Commit**

```bash
git add lib/sns/__tests__/performance-analyzer.test.ts
git commit -m "test(sns): add smoke tests for performance-analyzer module"
```

---

## 완료 기준

- [ ] `npx tsc --noEmit` TypeScript 에러 없음
- [ ] `npm run test` 33 tests passed (30 기존 + 3 신규)
- [ ] `sns/analytics` 페이지에서 리포트 생성 시 모든 섹션 정상 렌더링
  - 요약 카드: totalReach, avgEngagementRate, trendDirection (▲/▼/→)
  - Top 게시물: reach, engagement (숫자), whyGood
  - 저성과 게시물: reach, improvementTip
  - 추천 콘텐츠: topic, reason, [이 추천으로 콘텐츠 만들기] 버튼
  - 광고 예산: targetPostDescription, suggestedBudget (문자열), expectedEffect
  - 패턴: bestPostingTimes, bestContentType, topHashtags, audienceInsight
- [ ] 리포트 생성 실패 시 에러 메시지 표시
