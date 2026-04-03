# 대시보드 재설계 Design

**Goal:** `/dashboard`를 플레이북 통계에서 마케팅 성과 대시보드로 전면 교체한다. KPI 달성률, Instagram 도달 추이 차트, Top 게시물, 팔로워 추이를 한눈에 보여준다.

**Architecture:** 기존 `app/dashboard/page.tsx`를 완전히 교체한다. 서버 컴포넌트에서 Prisma 쿼리로 데이터를 집계하고, 클라이언트 차트 컴포넌트(recharts)로 시각화한다.

**Tech Stack:** Next.js 15.2 App Router · Prisma · recharts · 기존 CSS 디자인 시스템(Toss Business 스타일)

---

## 레이아웃

```
┌─────────────────────────────────────────────┐
│  "마케팅 대시보드"  +  마지막 동기화 시간      │
├────────┬────────┬────────┬──────────────────┤
│ KPI 1  │ KPI 2  │ KPI 3  │ KPI 4            │
│ 달성률  │ 달성률  │ 달성률  │ 달성률           │
├────────┴────────┴────────┴──────────────────┤
│  Instagram 도달 추이 (30일 라인 차트)        │
│  일별 도달 수 + 7일 이동평균 라인             │
├─────────────────────┬───────────────────────┤
│  Top 게시물 5개     │ 팔로워 추이             │
│  (도달 기준 랭킹)    │ (30일 라인 차트)       │
├─────────────────────┴───────────────────────┤
│  AI 추천 요약 (Phase 2 플레이스홀더)          │
│  "성과 분석 리포트가 준비되면 여기에 표시"     │
└─────────────────────────────────────────────┘
```

---

## 섹션별 상세

### 1. KPI 달성률 카드 (상단 4칸 그리드)

**데이터:** `KpiGoal` 모델에서 상위 4개 가져옴 (정렬: `updatedAt` DESC).

**각 카드 내용:**
- 목표 이름 (예: "월간 도달 10만")
- 현재값 / 목표값 (예: "67,000 / 100,000")
- 달성률 퍼센트 (예: "67%")
- 프로그레스 바 (accent 색상)
- 전기간 대비 변화 방향 표시 (선택 — 데이터 있으면)

**KPI가 0개일 때:** "KPI 목표를 설정하세요" 안내 + `/goals` 링크

**KPI가 4개 미만일 때:** 있는 만큼만 표시, 나머지 칸은 렌더하지 않음 (grid auto)

**레이아웃:** `grid gap-4 md:grid-cols-2 lg:grid-cols-4`

---

### 2. Instagram 도달 추이 (30일 라인 차트)

**데이터:** 두 소스를 합쳐서 사용:
- `InstagramReachDaily` — `/api/instagram/reach/agent`로 수집된 일별 도달
- `SnsAnalyticsSnapshot` — `/api/sns/analytics/sync`로 수집된 일별 도달

**활성 계정 결정:** `lib/meta-connection-storage.ts`의 `loadStoredMetaConnectionDraft()`에서 `instagramBusinessAccountId`를 가져온다. 서버 컴포넌트에서는 `lib/secure-json-store.ts`로 직접 읽는다.

**Prisma 쿼리 필터:**
- `InstagramReachDaily.findMany({ where: { accountId: activeAccountId, date: { gte: 30일전 } }, orderBy: { date: 'asc' } })`
- `SnsAnalyticsSnapshot.findMany({ where: { personaId: activePersonaId, date: { gte: 30일전 } }, orderBy: { date: 'asc' } })`
- personaId는 해당 Instagram 계정과 연결된 페르소나 중 첫 번째를 사용. 없으면 SnsAnalyticsSnapshot 건너뜀.

우선순위: `InstagramReachDaily`가 있으면 사용, 없으면 `SnsAnalyticsSnapshot.reach`.

**차트:**
- X축: 날짜 (최근 30일)
- Y축: 도달 수
- 라인 1: 일별 도달 (accent 색상, `#3182f6`)
- 라인 2: 7일 이동평균 (회색 점선, `#6b7684`)
- 툴팁: 날짜 + 도달 수 + 7일 평균
- 반응형: 높이 300px, 너비 100%

**라이브러리:** recharts `LineChart`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`

**데이터 없을 때:** "Instagram 연동 후 도달 데이터가 여기에 표시됩니다" 안내 + `/settings` 링크

**컴포넌트:** `components/dashboard/reach-chart.tsx` (클라이언트 컴포넌트, `'use client'`)

---

### 3. Top 게시물 5개 (왼쪽 하단)

**데이터:** `fetchInstagramMediaInsights()`로 가져온 게시물 중 도달 상위 5개.

**사전 작업:** `lib/sns/instagram-api.ts`의 `fetchInstagramMediaInsights()`가 현재 `caption`, `media_type`, `permalink` 필드를 가져오지 않는다. 구현 시 아래 변경 필요:
- Graph API 요청 fields에 `caption,media_type,permalink` 추가
- `InstagramMediaInsight` 타입에 `caption?: string`, `media_type?: string`, `permalink?: string` 추가

**캐싱:** 서버 컴포넌트에서 호출하되, 페이지 레벨 `export const revalidate = 3600`으로 1시간 캐시. 또는 Instagram API 호출 실패 시 빈 배열 반환하여 다른 섹션에 영향 없도록.

Instagram 연동이 안 되어 있으면 빈 상태 표시.

**각 항목:**
- 순위 번호 (1~5)
- 게시물 타입 아이콘 (IMAGE/VIDEO/CAROUSEL_ALBUM) — `media_type` 기반
- 캡션 첫 줄 (truncate 50자) — `caption` 기반, 없으면 "(캡션 없음)"
- 도달 수
- 게시일

**레이아웃:** 세로 리스트, `list-card` 스타일

**컴포넌트:** `components/dashboard/top-posts.tsx`

---

### 4. 팔로워 추이 (오른쪽 하단)

**데이터:** `SnsAnalyticsSnapshot` 테이블에서 최근 30일 `followers` 값. personaId 필터는 섹션 2와 동일한 activePersonaId 사용.

**차트:**
- X축: 날짜
- Y축: 팔로워 수
- 라인: 단일 라인 (accent 색상)
- 차트 상단에 현재 팔로워 수 + 30일 전 대비 증감

**데이터 없을 때:** "분석 동기화를 실행하면 팔로워 추이가 표시됩니다" 안내

**컴포넌트:** `components/dashboard/follower-chart.tsx` (클라이언트 컴포넌트)

---

### 5. AI 추천 요약 (Phase 2 플레이스홀더)

**현재 (Phase 1):**
```tsx
<div className="soft-panel">
  <p className="text-sm font-semibold text-[var(--text-strong)]">AI 성과 추천</p>
  <p className="mt-2 text-sm text-[var(--text-muted)]">
    Phase 2에서 AI 성과 분석 리포트가 연동되면, 추천 콘텐츠와 개선 방향이 여기에 표시됩니다.
  </p>
</div>
```

**Phase 2 이후:** 성과 분석 리포트 최신 결과의 추천 항목 3개 + "전체 리포트 보기" 링크. (Phase 2에서 `SnsPerformanceReport` 모델 신규 생성 예정 — 현재 스키마에 없음)

---

## 데이터 흐름

```
app/dashboard/page.tsx (서버 컴포넌트)
  ├── Prisma: KpiGoal.findMany({ take: 4, orderBy: updatedAt desc })
  ├── Prisma: InstagramReachDaily.findMany({ where: date >= 30일 전 })
  ├── Prisma: SnsAnalyticsSnapshot.findMany({ where: date >= 30일 전 })
  ├── fetch: /api/sns/analytics/sync 결과 또는 캐시된 미디어 인사이트
  └── 데이터를 클라이언트 차트 컴포넌트에 props로 전달

components/dashboard/
  ├── reach-chart.tsx ('use client', recharts LineChart)
  ├── follower-chart.tsx ('use client', recharts LineChart)
  └── top-posts.tsx (서버 또는 클라이언트)
```

---

## 마지막 동기화 시간

헤더에 표시하는 "마지막 동기화" 값:
- `InstagramReachDaily` 테이블의 `MAX(fetchedAt)` 또는
- `SnsAnalyticsSnapshot` 테이블의 `MAX(createdAt)`
- 둘 중 더 최근 값 사용
- 데이터 없으면 "동기화 기록 없음" 표시

---

## 변경 파일

| 파일 | 변경 유형 | 내용 |
|------|---------|------|
| `app/dashboard/page.tsx` | 전면 교체 | 서버 컴포넌트, Prisma 쿼리, 레이아웃 |
| `components/dashboard/reach-chart.tsx` | 신규 | 도달 추이 라인 차트 (recharts) |
| `components/dashboard/follower-chart.tsx` | 신규 | 팔로워 추이 라인 차트 (recharts) |
| `components/dashboard/top-posts.tsx` | 신규 | Top 5 게시물 리스트 |
| `lib/sns/instagram-api.ts` | Modify | `InstagramMediaInsight` 타입에 caption/media_type/permalink 추가, API fields 확장 |
| `package.json` | Modify | recharts 의존성 추가 (없을 경우) |

---

## 디자인 규칙

- Toss Business 스타일 유지: `--surface`, `--text-strong`, `--accent` CSS 변수 사용
- 차트 색상: 메인 라인 `#3182f6` (accent), 보조 라인 `#6b7684` (muted)
- 카드: `.panel` 또는 `.status-tile` 클래스
- 반응형: 모바일에서 KPI 2열, 차트 100% 너비, Top 게시물/팔로워 세로 스택
- glassmorphism 금지

---

## 오류 처리

- Instagram 미연동: 도달 차트/Top 게시물 영역에 설정 안내 표시
- KPI 미설정: KPI 영역에 설정 안내 표시
- 데이터 0건: 각 섹션별 빈 상태 메시지
- API 오류: 차트 영역에 "데이터를 불러오지 못했습니다" 표시, 콘솔 에러 로그

---

## recharts 설치 확인

```bash
npm ls recharts 2>/dev/null || npm install recharts
```

recharts가 이미 설치되어 있으면 추가 설치 불필요. 없으면 `npm install recharts` 실행.
