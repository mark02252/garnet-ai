# Garnet Phase 8: WorldModel Portability — Config-Driven Prompt & Briefing

**Date:** 2026-04-20
**Status:** Approved
**Scope:** Config 매핑 레이어, 하드코딩 제거, 브리핑 템플릿화, 분석 툴 전환 확장점

---

## 1. Problem Statement

11개 파일에서 `worldModel.snapshot.ga4.sessions`, `worldModel.snapshot.sns.engagement` 등을 직접 참조하여 프롬프트/브리핑 문자열을 만들고 있음. 동일 코드가 reasoner.ts, auto-meeting.ts 등에 복사되어 있고, "MONOPLEX", "프라이빗 시네마" 같은 도메인 문자열도 하드코딩됨. 회사 이동 시 11개 파일을 모두 수정해야 함.

## 2. Goals

1. WorldModel → 프롬프트/브리핑 변환을 **단일 포맷터 함수**로 통합
2. `config/domain.yaml`의 `metrics_display`에서 표시할 지표와 라벨을 정의
3. MONOPLEX 하드코딩 문자열을 config에서 로드
4. 분석 툴 전환 시 `MetricResolver`만 교체하면 되는 확장점 열어둠

## 3. Non-Goals

- WorldModelSnapshot 타입 변경 (ga4/sns 구조 유지)
- Scanner 플러그인화 (분석 툴 바뀔 때)
- 새 분석 툴 어댑터 구현

---

## 4. Architecture

### 4.1 Snapshot Formatter

**파일:** `lib/agent-loop/snapshot-formatter.ts` (신규)

```typescript
type MetricResolver = (worldModel: WorldModel) => Record<string, number | string>

// 현재: ga4/sns 직접 접근. 향후 분석 툴 변경 시 새 resolver 추가.
const defaultResolver: MetricResolver = (wm) => ({
  sessions: wm.snapshot.ga4.sessions,
  bounceRate: wm.snapshot.ga4.bounceRate,
  conversionRate: wm.snapshot.ga4.conversionRate,
  engagement: wm.snapshot.sns.engagement,
  followerGrowth: wm.snapshot.sns.followerGrowth,
  threatLevel: wm.snapshot.competitors.threatLevel,
  recentMoves: wm.snapshot.competitors.recentMoves.length,
  activeCampaigns: wm.snapshot.campaigns.active,
  pendingApproval: wm.snapshot.campaigns.pendingApproval,
})

export function formatSnapshotForPrompt(worldModel: WorldModel): string
export function formatSnapshotForBriefing(worldModel: WorldModel): string
export function getMetricValue(worldModel: WorldModel, key: string): number | string
```

### 4.2 Config: metrics_display

`config/domain.yaml`에 추가:

```yaml
company_name: "MONOPLEX"
company_description: "프라이빗 시네마 대관, 아파트 시네마 구축, Cinema-as-a-Service"

metrics_display:
  - key: sessions
    label: "세션"
  - key: bounceRate
    label: "이탈률"
    unit: "%"
  - key: conversionRate
    label: "전환율"
    unit: "%"
  - key: engagement
    label: "SNS 참여율"
    unit: "%"
  - key: followerGrowth
    label: "팔로워 변동"
  - key: threatLevel
    label: "경쟁사 위협"
  - key: recentMoves
    label: "경쟁사 변화"
    unit: "건"
  - key: activeCampaigns
    label: "활성 캠페인"
    unit: "건"
  - key: pendingApproval
    label: "승인대기"
    unit: "건"
```

### 4.3 formatSnapshotForPrompt 출력 예시

```
현재 지표:
- 세션: 26,705
- 이탈률: 8%
- 전환율: 6.7%
- SNS 참여율: 10%
- 팔로워 변동: 5.2
- 경쟁사 위협: medium
- 경쟁사 변화: 3건
- 활성 캠페인: 2건
- 승인대기: 1건
```

회사 이동 시 `metrics_display`만 변경하면 이 출력이 자동으로 바뀜.

---

## 5. 변경 대상 파일 (11개)

### 5.1 프롬프트 하드코딩 → formatSnapshotForPrompt 교체

| 파일 | 현재 | 변경 |
|------|------|------|
| `reasoner.ts` (2곳) | `GA4: 세션 ${wm.snapshot.ga4.sessions}...` | `formatSnapshotForPrompt(wm)` |
| `auto-meeting.ts` | 동일 패턴 복사 | `formatSnapshotForPrompt(wm)` |
| `evaluator.ts` | `ga4Sessions: wm.snapshot.ga4.sessions` | `getMetricValue(wm, 'sessions')` |
| `proactive-inquiry.ts` | `wm.snapshot.ga4.sessions === 0` | `getMetricValue(wm, 'sessions') === 0` |

### 5.2 Sub-Reasoner 프롬프트 → formatSnapshotForPrompt

| 파일 | 현재 | 변경 |
|------|------|------|
| `sub-reasoners/analysis.ts` | `const ga4 = wm.snapshot.ga4` | `formatSnapshotForPrompt(wm)` |
| `sub-reasoners/content.ts` | `const sns = wm.snapshot.sns` | `formatSnapshotForPrompt(wm)` |
| `sub-reasoners/cro.ts` | `const ga4 = wm.snapshot.ga4` | `formatSnapshotForPrompt(wm)` |
| `sub-reasoners/psychology.ts` | `const ga4/sns = ...` | `formatSnapshotForPrompt(wm)` |
| `sub-reasoners/strategy.ts` | 동일 | `formatSnapshotForPrompt(wm)` |

### 5.3 MONOPLEX 하드코딩 문자열 → config 로드

| 파일 | 현재 | 변경 |
|------|------|------|
| `competitor-discovery.ts` | `"MONOPLEX(프라이빗 시네마...)"` | `config/domain.yaml`의 `company_name` + `company_description` |
| `tool-registry.ts` | `"MONOPLEX"` in tool descriptions | config에서 로드 |
| `context-evolver.ts` | 하드코딩된 trackableMetrics | `metrics_display`에서 생성 |
| `outcome-observer.ts` | `['engagement', 'followers', 'reach']` | `metrics_display` 키 목록에서 생성 |

---

## 6. 확장점: MetricResolver

```typescript
// 현재
const defaultResolver: MetricResolver = (wm) => ({
  sessions: wm.snapshot.ga4.sessions,
  // ...
})

// 향후 분석 툴 변경 시
const mixpanelResolver: MetricResolver = (wm) => ({
  MAU: wm.snapshot.mixpanel.mau,
  retention: wm.snapshot.mixpanel.retention,
  // ...
})

// config/domain.yaml에서 resolver 선택
// resolver: "default" | "mixpanel" | "amplitude"
```

지금은 `defaultResolver`만 구현. 인터페이스만 정의해두고 향후 교체 가능.

---

## 7. 파일 구조

```
신규:
  lib/agent-loop/snapshot-formatter.ts  — 포맷터 + MetricResolver

변경:
  config/domain.yaml                    — metrics_display, company_name 추가
  lib/agent-loop/reasoner.ts            — snapshotText → formatSnapshotForPrompt
  lib/agent-loop/auto-meeting.ts        — 동일
  lib/agent-loop/evaluator.ts           — 동일
  lib/agent-loop/proactive-inquiry.ts   — 동일
  lib/agent-loop/sub-reasoners/analysis.ts
  lib/agent-loop/sub-reasoners/content.ts
  lib/agent-loop/sub-reasoners/cro.ts
  lib/agent-loop/sub-reasoners/psychology.ts
  lib/agent-loop/sub-reasoners/strategy.ts
  lib/agent-loop/competitor-discovery.ts
  lib/agent-loop/tool-registry.ts
  lib/agent-loop/context-evolver.ts
  lib/agent-loop/outcome-observer.ts
```

---

## 8. 제약사항

- WorldModelSnapshot 타입 변경 없음
- Scanner 로직 변경 없음
- 기존 동작 100% 유지 (출력만 config 기반으로 전환)
- 분석 툴 전환은 향후 — MetricResolver 인터페이스만 열어둠
