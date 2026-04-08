/**
 * World Model — Agent Loop의 "현재 세계 상태" 관리
 * GA4, SNS, 경쟁사, 캠페인 데이터를 하나의 스냅샷으로 통합
 * DB + 파일 캐시 이중 저장
 */

import * as fs from 'fs'
import * as path from 'path'
import { prisma } from '@/lib/prisma'
import type {
  WorldModel,
  WorldModelSnapshot,
  TrendVector,
  TrendDirection,
  OpenIssue,
  CycleType,
} from './types'

const CACHE_PATH = path.join(process.cwd(), '.garnet-config', 'world-model.json')

// ── Empty Model ──

function createEmptySnapshot(): WorldModelSnapshot {
  return {
    ga4: {
      sessions: 0,
      bounceRate: 0,
      conversionRate: 0,
      topChannels: [],
      trend: 'stable',
    },
    sns: {
      engagement: 0,
      followerGrowth: 0,
      topContent: [],
      trend: 'stable',
    },
    competitors: {
      recentMoves: [],
      threatLevel: 'low',
    },
    campaigns: {
      active: 0,
      pendingApproval: 0,
      recentPerformance: [],
    },
  }
}

export function createEmptyWorldModel(): WorldModel {
  return {
    snapshot: createEmptySnapshot(),
    trends: [],
    openIssues: [],
    lastUpdated: new Date().toISOString(),
    cycleCount: 0,
  }
}

// ── Trend Computation ──

function detectDirection(prev: number, curr: number, threshold = 0.05): TrendDirection {
  if (prev === 0) return curr > 0 ? 'up' : 'stable'
  const change = (curr - prev) / prev
  if (change > threshold) return 'up'
  if (change < -threshold) return 'down'
  return 'stable'
}

function computeMagnitude(prev: number, curr: number): number {
  if (prev === 0) return curr > 0 ? 1 : 0
  return Math.abs((curr - prev) / prev)
}

export function computeTrends(
  prev: WorldModelSnapshot,
  curr: WorldModelSnapshot,
  existingTrends: TrendVector[]
): TrendVector[] {
  const metrics: Array<{ metric: string; prevVal: number; currVal: number }> = [
    { metric: 'ga4.sessions', prevVal: prev.ga4.sessions, currVal: curr.ga4.sessions },
    { metric: 'ga4.bounceRate', prevVal: prev.ga4.bounceRate, currVal: curr.ga4.bounceRate },
    { metric: 'ga4.conversionRate', prevVal: prev.ga4.conversionRate, currVal: curr.ga4.conversionRate },
    { metric: 'sns.engagement', prevVal: prev.sns.engagement, currVal: curr.sns.engagement },
    { metric: 'sns.followerGrowth', prevVal: prev.sns.followerGrowth, currVal: curr.sns.followerGrowth },
  ]

  const newTrends: TrendVector[] = metrics.map(({ metric, prevVal, currVal }) => {
    const existing = existingTrends.find(t => t.metric === metric)
    const direction = detectDirection(prevVal, currVal)
    const magnitude = computeMagnitude(prevVal, currVal)

    // duration: 같은 방향이면 증가, 아니면 리셋
    const duration = existing && existing.direction === direction
      ? existing.duration + 1
      : 1

    // confidence: duration이 길수록 높아짐 (최대 0.95)
    const confidence = Math.min(0.95, 0.5 + duration * 0.1)

    return { metric, direction, magnitude, duration, confidence }
  })

  return newTrends
}

// ── Update World Model ──

export function updateWorldModel(
  current: WorldModel,
  newSnapshot: WorldModelSnapshot
): WorldModel {
  const trends = computeTrends(current.snapshot, newSnapshot, current.trends)

  // GA4/SNS 트렌드를 스냅샷에 반영
  const ga4Trend = trends.find(t => t.metric === 'ga4.sessions')
  const snsTrend = trends.find(t => t.metric === 'sns.engagement')

  const updatedSnapshot: WorldModelSnapshot = {
    ...newSnapshot,
    ga4: { ...newSnapshot.ga4, trend: ga4Trend?.direction ?? 'stable' },
    sns: { ...newSnapshot.sns, trend: snsTrend?.direction ?? 'stable' },
  }

  // Open issues 자동 감지
  const openIssues: OpenIssue[] = [...current.openIssues]

  // 급격한 하락 감지
  for (const trend of trends) {
    if (trend.direction === 'down' && trend.magnitude > 0.2) {
      const existingIssue = openIssues.find(
        i => i.type === 'anomaly' && i.summary.includes(trend.metric)
      )
      if (!existingIssue) {
        openIssues.push({
          id: `anomaly-${trend.metric}-${Date.now()}`,
          type: 'anomaly',
          severity: trend.magnitude > 0.5 ? 'critical' : 'high',
          summary: `${trend.metric} 급격한 하락 감지 (${(trend.magnitude * 100).toFixed(1)}% 감소)`,
          detectedAt: new Date().toISOString(),
        })
      }
    }
  }

  // 경쟁사 위협 감지
  if (updatedSnapshot.competitors.threatLevel === 'high') {
    const existingThreat = openIssues.find(i => i.type === 'competitor_move')
    if (!existingThreat) {
      openIssues.push({
        id: `competitor-threat-${Date.now()}`,
        type: 'competitor_move',
        severity: 'high',
        summary: '경쟁사 위협 수준 HIGH 감지',
        detectedAt: new Date().toISOString(),
      })
    }
  }

  // 승인 대기 캠페인
  if (updatedSnapshot.campaigns.pendingApproval > 0) {
    const existingApproval = openIssues.find(i => i.type === 'approval_pending')
    if (!existingApproval) {
      openIssues.push({
        id: `approval-${Date.now()}`,
        type: 'approval_pending',
        severity: 'normal',
        summary: `${updatedSnapshot.campaigns.pendingApproval}개 캠페인 승인 대기 중`,
        detectedAt: new Date().toISOString(),
      })
    }
  }

  return {
    snapshot: updatedSnapshot,
    trends,
    openIssues,
    lastUpdated: new Date().toISOString(),
    cycleCount: current.cycleCount + 1,
  }
}

// ── Persistence ──

export async function loadWorldModel(): Promise<WorldModel> {
  // 1. DB에서 최신 스냅샷 시도
  try {
    const latest = await prisma.worldModelSnapshot.findFirst({
      orderBy: { createdAt: 'desc' },
    })
    if (latest) {
      return JSON.parse(latest.data) as WorldModel
    }
  } catch (err) {
    console.warn('[world-model] DB 로드 실패, 파일 캐시 시도:', err)
  }

  // 2. 파일 캐시 시도
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const data = fs.readFileSync(CACHE_PATH, 'utf-8')
      return JSON.parse(data) as WorldModel
    }
  } catch (err) {
    console.warn('[world-model] 파일 캐시 로드 실패:', err)
  }

  // 3. 빈 모델 반환
  return createEmptyWorldModel()
}

export async function saveWorldModel(wm: WorldModel, cycleType: CycleType): Promise<void> {
  const data = JSON.stringify(wm)

  // DB 저장
  try {
    await prisma.worldModelSnapshot.create({
      data: {
        data,
        cycleType,
      },
    })
  } catch (err) {
    console.error('[world-model] DB 저장 실패:', err)
  }

  // 파일 캐시 저장
  try {
    const dir = path.dirname(CACHE_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CACHE_PATH, JSON.stringify(wm, null, 2))
  } catch (err) {
    console.error('[world-model] 파일 캐시 저장 실패:', err)
  }
}

// ── Cleanup ──

export async function pruneOldSnapshots(retentionDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  try {
    const result = await prisma.worldModelSnapshot.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    console.log(`[world-model] ${result.count}개 오래된 스냅샷 삭제 (${retentionDays}일 이전)`)
    return result.count
  } catch (err) {
    console.error('[world-model] 스냅샷 정리 실패:', err)
    return 0
  }
}
