/**
 * Agent Loop — Snapshot Formatter
 * WorldModel → 프롬프트 문자열 변환. config/domain.yaml의 metrics_display를 기반으로
 * 포맷을 동적으로 결정하여 WorldModel Portability(Phase 8)를 구현한다.
 */

import * as yaml from 'js-yaml'
import * as fs from 'fs'
import * as path from 'path'
import type { WorldModel } from './types'

// ---------------------------------------------------------------------------
// MetricResolver — key → WorldModel에서 실제 값을 뽑는 함수 맵
// ---------------------------------------------------------------------------

export type MetricResolver = (wm: WorldModel) => number | string

export const defaultResolver: Record<string, MetricResolver> = {
  sessions:         (wm) => wm.snapshot.ga4.sessions,
  bounceRate:       (wm) => wm.snapshot.ga4.bounceRate,
  conversionRate:   (wm) => wm.snapshot.ga4.conversionRate,
  engagement:       (wm) => wm.snapshot.sns.engagement,
  followerGrowth:   (wm) => wm.snapshot.sns.followerGrowth,
  threatLevel:      (wm) => wm.snapshot.competitors.threatLevel,
  recentMoves:      (wm) => wm.snapshot.competitors.recentMoves.length,
  activeCampaigns:  (wm) => wm.snapshot.campaigns.active,
  pendingApproval:  (wm) => wm.snapshot.campaigns.pendingApproval,
}

// ---------------------------------------------------------------------------
// Domain Config — js-yaml 로드 + 캐싱
// ---------------------------------------------------------------------------

type MetricDisplayEntry = {
  key: string
  label: string
  unit?: string
}

type DomainConfig = {
  company_name?: string
  company_description?: string
  metrics_display?: MetricDisplayEntry[]
  [key: string]: unknown
}

let _configCache: DomainConfig | null = null

export function loadDomainConfig(): DomainConfig {
  if (_configCache !== null) return _configCache
  try {
    const configPath = path.join(process.cwd(), 'config', 'domain.yaml')
    const raw = fs.readFileSync(configPath, 'utf-8')
    _configCache = yaml.load(raw) as DomainConfig
  } catch {
    _configCache = {}
  }
  return _configCache
}

/** 테스트 / 핫 리로드용 캐시 초기화 */
export function clearConfigCache(): void {
  _configCache = null
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * WorldModel → 프롬프트용 멀티라인 문자열
 * config의 metrics_display 순서와 label/unit을 사용.
 * config가 없으면 기존 하드코딩 포맷으로 폴백.
 */
export function formatSnapshotForPrompt(worldModel: WorldModel): string {
  const config = loadDomainConfig()

  if (config.metrics_display && config.metrics_display.length > 0) {
    const lines = config.metrics_display.map((entry) => {
      const resolver = defaultResolver[entry.key]
      const value = resolver ? resolver(worldModel) : 'N/A'
      const unit = entry.unit ?? ''
      return `- ${entry.label}: ${value}${unit}`
    })
    return lines.join('\n')
  }

  // 폴백: 기존 하드코딩 포맷 (현재 출력과 동일)
  return `GA4: 세션 ${worldModel.snapshot.ga4.sessions}, 이탈률 ${worldModel.snapshot.ga4.bounceRate}%, 전환율 ${worldModel.snapshot.ga4.conversionRate}%
SNS: 참여율 ${worldModel.snapshot.sns.engagement}%, 팔로워 변동 ${worldModel.snapshot.sns.followerGrowth}
경쟁사: 위협 수준 ${worldModel.snapshot.competitors.threatLevel}, 최근 ${worldModel.snapshot.competitors.recentMoves.length}건 변화
캠페인: 활성 ${worldModel.snapshot.campaigns.active}건, 승인대기 ${worldModel.snapshot.campaigns.pendingApproval}건`
}

/**
 * WorldModel → 브리핑용 compact 문자열 (상위 5개 지표, 쉼표 구분)
 */
export function formatSnapshotForBriefing(worldModel: WorldModel): string {
  const config = loadDomainConfig()
  const entries = config.metrics_display ?? []
  const top5 = entries.slice(0, 5)

  if (top5.length > 0) {
    return top5.map((entry) => {
      const resolver = defaultResolver[entry.key]
      const value = resolver ? resolver(worldModel) : 'N/A'
      const unit = entry.unit ?? ''
      return `${entry.label} ${value}${unit}`
    }).join(', ')
  }

  // 폴백
  return `세션 ${worldModel.snapshot.ga4.sessions}, 참여율 ${worldModel.snapshot.sns.engagement}%, 경쟁사 위협 ${worldModel.snapshot.competitors.threatLevel}`
}

/**
 * 단일 지표 값 반환. key가 없으면 undefined.
 */
export function getMetricValue(worldModel: WorldModel, key: string): number | string | undefined {
  const resolver = defaultResolver[key]
  return resolver ? resolver(worldModel) : undefined
}

/**
 * config의 모든 지표 key 목록 반환
 */
export function getTrackableMetricKeys(): string[] {
  const config = loadDomainConfig()
  if (config.metrics_display && config.metrics_display.length > 0) {
    return config.metrics_display.map((e) => e.key)
  }
  return Object.keys(defaultResolver)
}

/** config에서 회사명 반환 */
export function getCompanyName(): string {
  return loadDomainConfig().company_name ?? 'MONOPLEX'
}

/** config에서 회사 설명 반환 */
export function getCompanyDescription(): string {
  return loadDomainConfig().company_description ?? ''
}
