/**
 * Sub-Reasoners Orchestrator
 * 3개 도메인 Sub-Reasoner를 병렬 실행하고 결과를 종합
 */

import * as fs from 'fs'
import * as path from 'path'
import { analyzeCurrentData, type AnalysisResult } from './analysis'
import { suggestContent, type ContentResult } from './content'
import { suggestStrategy, type StrategyResult } from './strategy'
import { suggestCROImprovements, type CROResult } from './cro'
import { suggestPsychologyAngles, type PsychologyResult } from './psychology'
import type { WorldModel, GoalProgress } from '../types'

const LATEST_FILE = path.join(process.cwd(), '.garnet-config', 'sub-reasoner-latest.json')

export type SubReasonerResults = {
  analysis?: AnalysisResult
  content?: ContentResult
  strategy?: StrategyResult
  cro?: CROResult
  psychology?: PsychologyResult
}

/**
 * 3개 Sub-Reasoner 병렬 실행 (한 개 실패해도 나머지 진행)
 * 결과는 파일에 저장하여 대시보드에서 조회 가능
 */
export async function runSubReasoners(
  worldModel: WorldModel,
  goals: GoalProgress[],
): Promise<SubReasonerResults> {
  // 각 Sub-Reasoner에 30초 타임아웃 — 느린 1명이 전체를 블록하지 않도록
  const withTimeout = <T>(promise: Promise<T>, ms = 30000): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Sub-Reasoner timeout')), ms)),
    ])

  const [analysis, content, strategy, cro, psychology] = await Promise.allSettled([
    withTimeout(analyzeCurrentData(worldModel, goals)),
    withTimeout(suggestContent(worldModel)),
    withTimeout(suggestStrategy(worldModel, goals)),
    withTimeout(suggestCROImprovements(worldModel)),
    withTimeout(suggestPsychologyAngles(worldModel)),
  ])

  const results = {
    analysis: analysis.status === 'fulfilled' ? analysis.value : undefined,
    content: content.status === 'fulfilled' ? content.value : undefined,
    strategy: strategy.status === 'fulfilled' ? strategy.value : undefined,
    cro: cro.status === 'fulfilled' ? cro.value : undefined,
    psychology: psychology.status === 'fulfilled' ? psychology.value : undefined,
  }

  // 최근 결과 파일 저장 (대시보드용)
  try {
    fs.writeFileSync(
      LATEST_FILE,
      JSON.stringify({ ...results, generatedAt: new Date().toISOString() }, null, 2),
      'utf-8',
    )
  } catch { /* non-critical */ }

  return results
}

/**
 * 최근 Sub-Reasoner 결과 조회 (대시보드 API용)
 */
export function getLatestSubReasonerResults(): (SubReasonerResults & { generatedAt?: string }) | null {
  try {
    if (!fs.existsSync(LATEST_FILE)) return null
    return JSON.parse(fs.readFileSync(LATEST_FILE, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Sub-Reasoner 결과를 메인 Reasoner 프롬프트용 텍스트로 변환
 */
export function buildSubReasonerContext(results: SubReasonerResults): string {
  const parts: string[] = []

  if (results.analysis && results.analysis.insights.length > 0) {
    parts.push('### 📊 데이터 분석 (AnalysisSubReasoner)')
    for (const i of results.analysis.insights) {
      parts.push(`- [${i.significance}] ${i.finding}`)
      if (i.dataEvidence) parts.push(`  근거: ${i.dataEvidence}`)
    }
  }

  if (results.content && results.content.contentIdeas.length > 0) {
    parts.push('\n### 🎬 콘텐츠 전략 (ContentSubReasoner)')
    for (const c of results.content.contentIdeas) {
      parts.push(`- [${c.format}] ${c.concept}`)
      parts.push(`  이유: ${c.rationale}`)
    }
  }

  if (results.strategy && results.strategy.strategicDirections.length > 0) {
    parts.push('\n### 🧭 전략 방향 (StrategySubReasoner)')
    for (const s of results.strategy.strategicDirections) {
      parts.push(`- [${s.timeframe}] ${s.direction}`)
      parts.push(`  근거: ${s.reasoning}`)
    }
  }

  if (results.cro && results.cro.bottlenecks.length > 0) {
    parts.push('\n### 💰 전환 병목 (CROSubReasoner)')
    for (const b of results.cro.bottlenecks) {
      parts.push(`- [${b.severity}] ${b.stage} — ${b.rootCause}`)
      parts.push(`  Quick Win: ${b.quickWin}`)
    }
  }

  if (results.psychology && results.psychology.insights.length > 0) {
    parts.push('\n### 🧠 심리 적용 (PsychologySubReasoner)')
    for (const i of results.psychology.insights) {
      parts.push(`- [${i.bias}] ${i.application}`)
      parts.push(`  예상 효과: ${i.expectedImpact}`)
    }
  }

  if (parts.length === 0) return ''

  return `## 도메인 전문가 분석\n\n${parts.join('\n')}\n\n**위 전문가 분석을 종합하여 최종 액션을 결정하세요.**`
}
