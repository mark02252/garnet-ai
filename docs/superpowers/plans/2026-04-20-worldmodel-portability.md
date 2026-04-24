# WorldModel Portability Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 11개 파일의 WorldModel 하드코딩을 config 기반 포맷터로 통합하여 회사 이동 시 config/domain.yaml만 수정하면 되도록 만든다

**Architecture:** snapshot-formatter.ts가 config/domain.yaml의 metrics_display를 읽어 WorldModel → 프롬프트/브리핑 텍스트 변환. MetricResolver 인터페이스로 향후 분석 툴 전환 확장점 제공.

**Tech Stack:** TypeScript, js-yaml, config/domain.yaml

**Spec:** `docs/superpowers/specs/2026-04-20-worldmodel-portability-design.md`

---

## File Structure

```
신규:
  lib/agent-loop/snapshot-formatter.ts  — 포맷터 코어 + MetricResolver

변경:
  config/domain.yaml                     — metrics_display, company_name 추가
  lib/agent-loop/reasoner.ts             — snapshotText 2곳 → formatSnapshotForPrompt
  lib/agent-loop/auto-meeting.ts         — context 문자열 → formatSnapshotForPrompt
  lib/agent-loop/evaluator.ts            — snapshot 객체 → getMetricValue
  lib/agent-loop/proactive-inquiry.ts    — 하드코딩 지표 체크 → getMetricValue
  lib/agent-loop/sub-reasoners/analysis.ts  — ga4/sns 직접 참조 → formatSnapshotForPrompt
  lib/agent-loop/sub-reasoners/content.ts
  lib/agent-loop/sub-reasoners/cro.ts
  lib/agent-loop/sub-reasoners/psychology.ts
  lib/agent-loop/sub-reasoners/strategy.ts
  lib/agent-loop/competitor-discovery.ts — "MONOPLEX" 하드코딩 → config
  lib/agent-loop/tool-registry.ts        — "MONOPLEX" tool descriptions → config
  lib/agent-loop/context-evolver.ts      — trackableMetrics → metrics_display
  lib/agent-loop/outcome-observer.ts     — 하드코딩 metrics 배열 → config
```

---

## Chunk 1: 포맷터 코어 + Config

### Task 1: config/domain.yaml에 metrics_display 추가

**Files:**
- Modify: `config/domain.yaml`

- [ ] **Step 1: metrics_display와 company 필드 추가**

기존 내용 유지하고 아래 추가:

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

- [ ] **Step 2: Commit**

```bash
git add config/domain.yaml
git commit -m "feat(phase8): add metrics_display and company fields to domain.yaml"
```

---

### Task 2: snapshot-formatter.ts 생성

**Files:**
- Create: `lib/agent-loop/snapshot-formatter.ts`

- [ ] **Step 1: 포맷터 구현**

```typescript
// lib/agent-loop/snapshot-formatter.ts

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import type { WorldModel } from './types'

// ── MetricResolver: 향후 분석 툴 전환 시 새 resolver 추가 ──
type MetricResolver = (worldModel: WorldModel) => Record<string, number | string>

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

// 현재는 default만 사용. 향후: config에서 resolver 이름 읽어서 선택
const resolver: MetricResolver = defaultResolver

// ── Config 로드 ──
type MetricDisplayItem = { key: string; label: string; unit?: string }
type DomainConfig = {
  company_name?: string
  company_description?: string
  metrics_display?: MetricDisplayItem[]
}

let _configCache: DomainConfig | null = null

function loadDomainConfig(): DomainConfig {
  if (_configCache) return _configCache
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'config', 'domain.yaml'), 'utf-8')
    _configCache = yaml.load(raw) as DomainConfig
    return _configCache!
  } catch {
    return {}
  }
}

/** config 캐시 초기화 (테스트/핫리로드용) */
export function clearConfigCache(): void {
  _configCache = null
}

// ── Public API ──

/** WorldModel → 프롬프트용 텍스트 (모든 Reasoner/Sub-Reasoner에서 사용) */
export function formatSnapshotForPrompt(worldModel: WorldModel): string {
  const config = loadDomainConfig()
  const metrics = resolver(worldModel)
  const display = config.metrics_display

  if (!display || display.length === 0) {
    // config 없으면 폴백: 기존 하드코딩 형태
    return `GA4: 세션 ${metrics.sessions}, 이탈률 ${metrics.bounceRate}%, 전환율 ${metrics.conversionRate}%
SNS: 참여율 ${metrics.engagement}%, 팔로워 변동 ${metrics.followerGrowth}
경쟁사: 위협 수준 ${metrics.threatLevel}, 최근 ${metrics.recentMoves}건 변화
캠페인: 활성 ${metrics.activeCampaigns}건, 승인대기 ${metrics.pendingApproval}건`
  }

  return display
    .map(item => {
      const value = metrics[item.key]
      if (value === undefined || value === null) return null
      const formatted = typeof value === 'number' ? value.toLocaleString() : String(value)
      return `- ${item.label}: ${formatted}${item.unit ? item.unit : ''}`
    })
    .filter(Boolean)
    .join('\n')
}

/** WorldModel → 브리핑/로그용 간결 텍스트 */
export function formatSnapshotForBriefing(worldModel: WorldModel): string {
  const config = loadDomainConfig()
  const metrics = resolver(worldModel)
  const display = config.metrics_display

  if (!display || display.length === 0) {
    return `세션 ${metrics.sessions}, 참여율 ${metrics.engagement}%, 경쟁사 위협 ${metrics.threatLevel}`
  }

  return display
    .slice(0, 5)  // 브리핑은 상위 5개만
    .map(item => {
      const value = metrics[item.key]
      if (value === undefined) return null
      return `${item.label} ${value}${item.unit || ''}`
    })
    .filter(Boolean)
    .join(', ')
}

/** 특정 지표 값 조회 (evaluator, proactive-inquiry 등에서 사용) */
export function getMetricValue(worldModel: WorldModel, key: string): number | string {
  const metrics = resolver(worldModel)
  return metrics[key] ?? 0
}

/** 추적 가능한 지표 목록 (context-evolver, outcome-observer에서 사용) */
export function getTrackableMetricKeys(): string[] {
  const config = loadDomainConfig()
  return (config.metrics_display || []).map(m => m.key)
}

/** 회사 이름 (competitor-discovery, tool descriptions에서 사용) */
export function getCompanyName(): string {
  return loadDomainConfig().company_name || 'Unknown'
}

/** 회사 설명 (competitor-discovery 프롬프트에서 사용) */
export function getCompanyDescription(): string {
  return loadDomainConfig().company_description || ''
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-loop/snapshot-formatter.ts
git commit -m "feat(phase8): create snapshot-formatter with MetricResolver extensibility"
```

---

## Chunk 2: Reasoner + 핵심 모듈 교체

### Task 3: reasoner.ts — snapshotText 2곳 교체

**Files:**
- Modify: `lib/agent-loop/reasoner.ts`

- [ ] **Step 1: import 추가 + snapshotText 교체**

파일 상단에 import 추가:
```typescript
import { formatSnapshotForPrompt, formatSnapshotForBriefing } from './snapshot-formatter'
```

65-68번 줄의 snapshotText 하드코딩을:
```typescript
const snapshotText = formatSnapshotForPrompt(worldModel)
```

222-225번 줄에도 동일한 snapshotText가 있으면 동일하게 교체.

227-228번 줄의 situationQuery도:
```typescript
const situationQuery = formatSnapshotForBriefing(worldModel)
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-loop/reasoner.ts
git commit -m "feat(phase8): reasoner uses snapshot-formatter instead of hardcoded fields"
```

---

### Task 4: auto-meeting.ts — context 문자열 교체

**Files:**
- Modify: `lib/agent-loop/auto-meeting.ts`

- [ ] **Step 1: 141-145번 줄 교체**

```typescript
import { formatSnapshotForPrompt } from './snapshot-formatter'

// 기존 141-145줄을:
const context = `현재 상황:\n${formatSnapshotForPrompt(worldModel)}`
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-loop/auto-meeting.ts
git commit -m "feat(phase8): auto-meeting uses snapshot-formatter"
```

---

### Task 5: evaluator.ts — snapshot 객체 교체

**Files:**
- Modify: `lib/agent-loop/evaluator.ts`

- [ ] **Step 1: 27-31번 줄 교체**

```typescript
import { getMetricValue } from './snapshot-formatter'

// 기존:
snapshot: {
  ga4Sessions: worldModel.snapshot.ga4.sessions,
  snsEngagement: worldModel.snapshot.sns.engagement,
  competitorThreat: worldModel.snapshot.competitors.threatLevel,
},

// 변경:
snapshot: {
  ga4Sessions: getMetricValue(worldModel, 'sessions'),
  snsEngagement: getMetricValue(worldModel, 'engagement'),
  competitorThreat: getMetricValue(worldModel, 'threatLevel'),
},
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-loop/evaluator.ts
git commit -m "feat(phase8): evaluator uses getMetricValue"
```

---

### Task 6: proactive-inquiry.ts — 지표 체크 교체

**Files:**
- Modify: `lib/agent-loop/proactive-inquiry.ts`

- [ ] **Step 1: 23-27번 줄 교체**

```typescript
import { getMetricValue } from './snapshot-formatter'

// 기존 하드코딩:
if (worldModel.snapshot.ga4.sessions === 0) zeroMetrics.push('GA4 세션')
if (worldModel.snapshot.ga4.bounceRate === 0) zeroMetrics.push('이탈률')
if (worldModel.snapshot.ga4.conversionRate === 0) zeroMetrics.push('전환율')
if (worldModel.snapshot.sns.engagement === 0) zeroMetrics.push('SNS 참여율')

// 변경:
if (getMetricValue(worldModel, 'sessions') === 0) zeroMetrics.push('세션')
if (getMetricValue(worldModel, 'bounceRate') === 0) zeroMetrics.push('이탈률')
if (getMetricValue(worldModel, 'conversionRate') === 0) zeroMetrics.push('전환율')
if (getMetricValue(worldModel, 'engagement') === 0) zeroMetrics.push('SNS 참여율')
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-loop/proactive-inquiry.ts
git commit -m "feat(phase8): proactive-inquiry uses getMetricValue"
```

---

## Chunk 3: Sub-Reasoner 프롬프트 교체

### Task 7: 5개 Sub-Reasoner 프롬프트 교체

**Files:**
- Modify: `lib/agent-loop/sub-reasoners/analysis.ts`
- Modify: `lib/agent-loop/sub-reasoners/content.ts`
- Modify: `lib/agent-loop/sub-reasoners/cro.ts`
- Modify: `lib/agent-loop/sub-reasoners/strategy.ts`
- Modify: `lib/agent-loop/sub-reasoners/psychology.ts`

- [ ] **Step 1: 각 파일에서 `worldModel.snapshot.ga4` / `worldModel.snapshot.sns` 직접 참조를 교체**

각 파일에:
```typescript
import { formatSnapshotForPrompt } from '../snapshot-formatter'
```

그리고 프롬프트 빌드 부분에서:
```typescript
// 기존: const ga4 = worldModel.snapshot.ga4 → 개별 필드 나열
// 변경:
const metricsText = formatSnapshotForPrompt(worldModel)
// 프롬프트에 metricsText 삽입
```

각 Sub-Reasoner의 기존 프롬프트 구조와 JSON 출력 포맷은 유지. `## 현재 지표` 섹션의 내용만 `metricsText`로 교체.

- [ ] **Step 2: Commit**

```bash
git add lib/agent-loop/sub-reasoners/
git commit -m "feat(phase8): all Sub-Reasoners use snapshot-formatter for metrics"
```

---

## Chunk 4: MONOPLEX 하드코딩 제거

### Task 8: competitor-discovery.ts — "MONOPLEX" → config

**Files:**
- Modify: `lib/agent-loop/competitor-discovery.ts`

- [ ] **Step 1: 113번 줄 교체**

```typescript
import { getCompanyName, getCompanyDescription } from './snapshot-formatter'

// 기존:
const prompt = `다음 웹사이트가 MONOPLEX(프라이빗 시네마 대관, 아파트 시네마 구축, Cinema-as-a-Service)의 경쟁사인지 판단하세요.`

// 변경:
const prompt = `다음 웹사이트가 ${getCompanyName()}(${getCompanyDescription()})의 경쟁사인지 판단하세요.`
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent-loop/competitor-discovery.ts
git commit -m "feat(phase8): competitor-discovery loads company name from config"
```

---

### Task 9: tool-registry.ts — "MONOPLEX" tool descriptions → config

**Files:**
- Modify: `lib/agent-loop/tool-registry.ts`

- [ ] **Step 1: tool description에서 "MONOPLEX" 제거**

도구 설명에서 "MONOPLEX"를 제거하고 도메인 무관하게 변경:
- `"Query MONOPLEX GA4 analytics data"` → `"GA4 지표 조회. 세션, 전환율, 이탈률, 매출 등을 조회합니다."`
- `"Fetch the MONOPLEX e-commerce purchase funnel"` → `"구매 퍼널 이탈 분석."`
- `"Fetch revenue and performance data for a specific MONOPLEX theater branch"` → `"특정 지점의 매출/구매 상세 데이터를 조회합니다."`

이미 한국어 description이 있는 도구는 그대로 유지.

- [ ] **Step 2: Commit**

```bash
git add lib/agent-loop/tool-registry.ts
git commit -m "feat(phase8): remove MONOPLEX from tool descriptions"
```

---

### Task 10: context-evolver.ts + outcome-observer.ts — config 기반 지표 목록

**Files:**
- Modify: `lib/agent-loop/context-evolver.ts`
- Modify: `lib/agent-loop/outcome-observer.ts`

- [ ] **Step 1: context-evolver.ts의 trackableMetrics를 config 기반으로**

```typescript
import { getTrackableMetricKeys } from './snapshot-formatter'

// 기존 35-45줄의 하드코딩 trackableMetrics 대신:
// metrics_display 키를 기반으로 동적 생성
const configKeys = getTrackableMetricKeys()
// 기존 trackableMetrics에서 configKeys에 해당하는 것만 유지
```

- [ ] **Step 2: outcome-observer.ts의 metrics 배열을 config 기반으로**

```typescript
import { getTrackableMetricKeys } from './snapshot-formatter'

// 기존 116줄:
const metrics = ['engagement', 'followers', 'reach']

// 변경:
const metrics = getTrackableMetricKeys().slice(0, 5)  // 상위 5개
```

- [ ] **Step 3: Commit**

```bash
git add lib/agent-loop/context-evolver.ts lib/agent-loop/outcome-observer.ts
git commit -m "feat(phase8): context-evolver and outcome-observer use config-based metrics"
```

---

### Task 11: 통합 테스트

- [ ] **Step 1: routine-cycle 트리거**

```bash
curl -s -X POST http://localhost:3000/api/agent-loop/control \
  -H 'Content-Type: application/json' \
  -d '{"action":"trigger","cycleType":"routine-cycle"}'
```

- [ ] **Step 2: Sub-Reasoner 결과 확인**

```bash
cat .garnet-config/sub-reasoner-latest.json | head -30
```

기대: 프롬프트가 config 기반으로 생성되어도 분석 결과 품질 동일.

- [ ] **Step 3: daily-briefing으로 Slack 확인**

```bash
curl -s -X POST http://localhost:3000/api/agent-loop/control \
  -H 'Content-Type: application/json' \
  -d '{"action":"trigger","cycleType":"daily-briefing"}'
```

- [ ] **Step 4: 최종 Commit**

```bash
git add -A
git commit -m "feat(phase8): Garnet Phase 8 — WorldModel Portability complete"
```

---

## Summary

| Task | 내용 | 파일 수 |
|------|------|---------|
| 1 | domain.yaml에 metrics_display 추가 | 1 |
| 2 | snapshot-formatter.ts 생성 | 1 (신규) |
| 3 | reasoner.ts 교체 | 1 |
| 4 | auto-meeting.ts 교체 | 1 |
| 5 | evaluator.ts 교체 | 1 |
| 6 | proactive-inquiry.ts 교체 | 1 |
| 7 | Sub-Reasoner 5개 교체 | 5 |
| 8 | competitor-discovery.ts 교체 | 1 |
| 9 | tool-registry.ts 교체 | 1 |
| 10 | context-evolver + outcome-observer | 2 |
| 11 | 통합 테스트 | - |
