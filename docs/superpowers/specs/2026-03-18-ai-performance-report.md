# AI 성과 분석 리포트 Design

**Goal:** 분석 실행 시 AI가 게시물별 인사이트를 수집하고, 성과 패턴을 분석하고, 추천 콘텐츠와 광고 예산을 제안하는 종합 리포트를 생성한다. 추천 항목에서 바로 콘텐츠 초안을 만들 수 있다.

**Architecture:** `lib/sns/performance-analyzer.ts`에서 Instagram 미디어 인사이트를 수집 → LLM으로 분석 → 리포트 JSON 생성 → DB 저장. `/sns/analytics` 페이지에 리포트 뷰를 추가하고, 대시보드의 AI 추천 플레이스홀더를 실제 데이터로 교체한다.

**Tech Stack:** Instagram Graph API · LLM (runLLM 추상화) · Prisma · recharts

---

## 리포트 구조

AI가 생성하는 리포트는 아래 JSON 구조를 따른다:

```typescript
type PerformanceReport = {
  // 1. 성과 요약
  summary: {
    period: string           // "최근 30일"
    totalReach: number
    avgReach: number
    reachChange: number      // 전기간 대비 %
    totalEngagement: number
    avgEngagementRate: number
    trendDirection: 'UP' | 'DOWN' | 'FLAT'
  }

  // 2. Top 게시물 분석
  topPosts: Array<{
    mediaId: string
    caption: string
    reach: number
    engagement: number
    mediaType: string
    timestamp: string
    whyGood: string          // AI가 분석한 성공 이유
  }>

  // 3. 저성과 진단
  lowPosts: Array<{
    mediaId: string
    caption: string
    reach: number
    mediaType: string
    improvementTip: string   // AI가 제안하는 개선점
  }>

  // 4. 패턴 인사이트
  patterns: {
    bestPostingTimes: string[]     // ["화요일 19:00", "목요일 12:00"]
    bestContentType: string        // "캐러셀"
    topHashtags: string[]
    topKeywords: string[]
    audienceInsight: string        // AI 자유 텍스트
  }

  // 5. 추천 콘텐츠
  recommendations: Array<{
    topic: string            // 추천 주제
    contentType: 'TEXT' | 'CAROUSEL'
    reason: string           // 왜 이 주제를 추천하는지
    suggestedCaption: string // 예시 캡션
    suggestedHashtags: string[]
  }>

  // 6. 광고 예산 제안
  adSuggestions: Array<{
    targetPostDescription: string  // "최근 도달 상위 1위 게시물"
    suggestedBudget: string        // "3~5만원"
    expectedEffect: string         // "예상 도달 +2,000~5,000"
    objective: string              // "도달" | "트래픽" | "참여"
  }>
}
```

---

## 데이터 수집 파이프라인

```
1. fetchInstagramMediaInsights() — 최근 25개 게시물 인사이트
2. InstagramReachDaily — 최근 30일 일별 도달
3. SnsAnalyticsSnapshot — 팔로워/참여율 추이
4. SnsScheduledPost — 게시 이력 (시간대/요일 패턴)
```

수집된 데이터를 LLM 프롬프트에 주입하여 위 JSON 구조의 리포트를 생성한다.

---

## 변경 파일

| 파일 | 유형 | 내용 |
|------|------|------|
| `lib/sns/performance-analyzer.ts` | 신규 | 데이터 수집 + LLM 분석 파이프라인 |
| `app/api/sns/analytics/report/route.ts` | 신규 | 리포트 생성 POST + 최신 리포트 GET |
| `prisma/schema.prisma` | 수정 | SnsPerformanceReport 모델 추가 |
| `app/sns/analytics/page.tsx` | 수정 | 리포트 뷰 섹션 추가 |
| `app/dashboard/page.tsx` | 수정 | AI 추천 플레이스홀더 → 실제 리포트 요약 |

---

## Prisma 모델

```prisma
model SnsPerformanceReport {
  id         String   @id @default(cuid())
  personaId  String
  period     String   @default("30d")
  reportJson String   // 위 PerformanceReport JSON 전체
  createdAt  DateTime @default(now())

  persona SnsPersona @relation(fields: [personaId], references: [id])

  @@index([personaId, createdAt])
}
```

SnsPersona 모델에 relation 추가 필요: `performanceReports SnsPerformanceReport[]`

---

## LLM 프롬프트 설계

```
당신은 Instagram 마케팅 분석 전문가입니다.

아래 데이터를 분석하여 JSON 형식의 성과 리포트를 생성하세요.

## 계정 정보
- 페르소나: {persona.name}
- 브랜드 컨셉: {persona.brandConcept}
- 타겟 오디언스: {persona.targetAudience}

## 최근 게시물 인사이트 (도달 순)
{mediaInsights를 테이블로 정리}

## 최근 30일 일별 도달 추이
{reachDaily 데이터}

## 게시 시간대 분포
{scheduledPosts의 요일/시간 분포}

## 요청
위 데이터를 기반으로 아래 JSON 구조의 리포트를 생성하세요:
{PerformanceReport 타입 스키마}

주의:
- 한국어로 작성
- 추천 콘텐츠는 3~5개, 실행 가능한 구체적 주제
- 광고 예산은 소규모 사업자 기준 (1~10만원 범위)
- whyGood/improvementTip은 데이터 근거 포함
```

---

## UI 설계

### `/sns/analytics` 페이지 리포트 섹션

기존 페이지 하단에 추가:

```
┌─────────────────────────────────────────┐
│ AI 성과 리포트                           │
│ [리포트 생성] 버튼                       │
├─────────────────────────────────────────┤
│ 성과 요약 카드 (3칸 그리드)              │
│ 총 도달 | 평균 참여율 | 추세 방향        │
├─────────────────────────────────────────┤
│ Top 게시물 분석 (성공 이유 포함)          │
├─────────────────────────────────────────┤
│ 추천 콘텐츠 (3~5개)                     │
│ 각 항목에 [이 추천으로 콘텐츠 만들기] 버튼│
├─────────────────────────────────────────┤
│ 광고 예산 제안                           │
├─────────────────────────────────────────┤
│ 패턴 인사이트 (최적 시간대, 해시태그 등)  │
└─────────────────────────────────────────┘
```

### 대시보드 AI 추천 섹션

기존 플레이스홀더를 교체:
- 최신 리포트의 추천 콘텐츠 상위 3개 표시
- "전체 리포트 보기 →" 링크 (`/sns/analytics`)

### "이 추천으로 콘텐츠 만들기" 버튼

클릭 시:
1. `POST /api/sns/content` 호출
2. body: `{ personaId, type: recommendation.contentType, prompt: recommendation.topic + recommendation.suggestedCaption }`
3. 생성된 초안 ID로 `/sns/studio/{draftId}` 이동

---

## 에러 처리

- Instagram API 실패 → "Instagram 데이터를 가져오지 못했습니다. 연동 상태를 확인하세요."
- LLM 응답 파싱 실패 → 재시도 1회, 그래도 실패 시 "리포트 생성에 실패했습니다."
- 게시물 0개 → "분석할 게시물이 없습니다. 먼저 콘텐츠를 게시하세요."
