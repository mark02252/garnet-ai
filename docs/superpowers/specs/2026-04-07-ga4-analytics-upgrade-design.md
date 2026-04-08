# GA4 Analytics 고도화 Design Spec

## Goal
참여율 98% 고정 차트 등 정보 가치 없는 섹션을 제거하고, GA4에서 가져올 수 있는 데이터를 최대한 활용하여 실행 가능한 인사이트를 제공하는 인텔리전스 대시보드로 업그레이드.

## Architecture
기존 analytics page(~2200줄)를 차트 컴포넌트 단위로 분리하고, 새 GA4 API 함수 + API 라우트 추가. Recharts 기반 시각화 유지.

## Tier 1 — 기존 데이터 활용 (새 API 불필요)

### 1-1. 참여도/이탈률 차트 → 채널별 세션 추세로 교체
- `fetchDailyTraffic`에 `sessionDefaultChannelGroup` dimension 추가한 새 함수
- 5개 주요 채널(Organic Search, Direct, Referral, Organic Social, 기타)을 multi-line chart로
- 어느 채널이 성장/하락 중인지 즉시 파악

### 1-2. 실시간 활성 사용자 KPI에 추가
- 이미 `fetchRealtimeActiveUsers` 존재, API 라우트도 있음
- KPI 카드 첫 번째에 실시간 수치 + 초록 pulse dot 추가

### 1-3. 디바이스별 참여율/이탈률 비교 강화
- 기존 PieChart 옆에 디바이스별 참여율 수평 바 추가
- `fetchDeviceBreakdown`에서 이미 engagementRate 반환 중 (미사용 상태)

### 1-4. 페이지별 이탈률 시각 차트
- 랜딩 페이지 테이블 위에 이탈률 Top 10 수평 바 차트 추가
- 빨간 바 = 높은 이탈률 → 문제 페이지 즉시 발견

### 1-5. 세션 깊이 추세 (페이지뷰/세션 + 세션/사용자)
- `fetchEngagementMetrics`에서 이미 screenPageViewsPerSession, sessionsPerUser 반환 (미사용)
- dual-axis line chart로 시계열 표시

## Tier 2 — 새 API 함수 필요

### 2-1. 채널별 일별 세션 추세 API
- 새 함수: `fetchChannelTrend(startDate, endDate)`
- dimensions: date + sessionDefaultChannelGroup
- metrics: sessions
- 새 API 라우트: `/api/ga4/channel-trend`

### 2-2. DAU/WAU/MAU 스티키니스 추세
- 새 함수: `fetchActiveUserCounts(startDate, endDate)`
- metrics: active1DayUsers, active7DayUsers, active28DayUsers (일별)
- 3개 라인 + DAU/MAU ratio 계산
- 새 API 라우트: `/api/ga4/stickiness`

### 2-3. 콘텐츠 그룹별 성과
- 페이지 경로를 그룹으로 분류: /movie/*, /booking/*, /space/*, /login*, 기타
- 기존 fetchPagePerformance 데이터를 클라이언트에서 그룹핑
- 새 API 불필요 (클라이언트 로직만)

### 2-4. 이탈률 일별 변화 추세
- 기존 engagement 데이터에서 bounceRate만 추출하여 별도 차트
- 새 API 불필요 (기존 데이터 재활용)

## Tier 3 — 고도화

### 3-1. 채널별 전환 기여도
- 새 함수: `fetchChannelConversions(startDate, endDate)`
- dimensions: sessionDefaultChannelGroup
- metrics: sessions, conversions, engagementRate
- 기여도 = conversions/total_conversions (%)
- stacked bar chart

### 3-2. 코호트 리텐션 히트맵
- GA4 cohort API 활용
- 주차별 재방문율 그리드 (색상 강도 = 리텐션율)
- 새 함수: `fetchCohortRetention(startDate, endDate)`
- 새 API 라우트: `/api/ga4/cohort`

### 3-3. 이상 트래픽 알림 타임라인
- 기존 forecast + anomaly detection 결과를 타임라인으로
- 날짜별 이상치 마커 + 설명 텍스트
- 새 API 불필요 (기존 forecast 데이터 재활용)

## 파일 구조

```
lib/ga4-client.ts              — 새 함수 3개 추가
app/api/ga4/channel-trend/     — 새 라우트
app/api/ga4/stickiness/        — 새 라우트
app/api/ga4/cohort/            — 새 라우트
app/api/ga4/channel-conv/      — 새 라우트
app/(domains)/analytics/page.tsx — 섹션 교체/추가
```

## 디자인 원칙
- Garnet Red 디자인 시스템 (ops-zone, 다크 테마)
- 모든 차트 Tooltip 다크 테마
- tabular-nums, 10px uppercase labels
- 차트 색상 팔레트: #C93545(garnet), #E8707E(rose), #0066ff(blue), #ffaa00(amber), #00ff88(green), #6366f1(indigo)
