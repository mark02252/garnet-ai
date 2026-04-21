/**
 * Sub-Reasoner 품질 자동 평가
 * 매 사이클 후 5개 Sub-Reasoner 결과를 채점하여 추적
 */

import * as fs from 'fs'
import * as path from 'path'
import { runLLM } from '@/lib/llm'
import type { SubReasonerResults } from './sub-reasoners/index'

const QUALITY_FILE = path.join(process.cwd(), '.garnet-config', 'sub-reasoner-quality.json')
const MAX_HISTORY = 50  // 최근 50 사이클 보관

export type QualityScore = {
  specificity: number    // 구체성 (0-10): 일반론 vs 수치/이름 기반 구체 제안
  evidence: number       // 근거 (0-10): 데이터/사례 인용 여부
  actionability: number  // 실행 가능성 (0-10): 바로 실행 가능한 액션인가
  overall: number        // 종합 (0-10)
}

export type CycleQuality = {
  cycleId: string
  timestamp: string
  scores: Record<string, QualityScore>  // analysis, content, strategy, cro, psychology
  avgOverall: number
}

type QualityHistory = {
  history: CycleQuality[]
  lastUpdated: string
}

/** Sub-Reasoner 결과를 LLM으로 자동 채점 */
export async function evaluateSubReasonerQuality(
  cycleId: string,
  results: SubReasonerResults,
): Promise<CycleQuality | null> {
  // 결과가 없으면 스킵 (generatedAt 등 메타 필드 제외)
  const validKeys = ['analysis', 'content', 'strategy', 'cro', 'psychology']
  const entries = Object.entries(results).filter(([k, v]) => validKeys.includes(k) && v !== undefined)
  if (entries.length === 0) return null

  const summary = entries.map(([name, result]) => {
    if (!result) return ''
    const items = 'insights' in result ? result.insights
      : 'contentIdeas' in result ? result.contentIdeas
      : 'strategicDirections' in result ? result.strategicDirections
      : 'bottlenecks' in result ? result.bottlenecks
      : []
    if (!Array.isArray(items) || items.length === 0) return `[${name}] (결과 없음)`
    return `[${name}]\n${JSON.stringify(items).slice(0, 400)}`
  }).filter(Boolean).join('\n\n')

  if (!summary.trim()) return null

  try {
    const prompt = `아래 5개 Sub-Reasoner의 분석 결과를 평가하세요.

${summary}

각 Sub-Reasoner에 대해 다음 기준으로 0-10점 채점:
- specificity: 구체성 (일반론=2, 수치/이름 기반=8+)
- evidence: 근거 (근거 없음=2, 데이터/사례 인용=8+)
- actionability: 실행 가능성 (모호한 제안=2, 즉시 실행 가능=8+)
- overall: 종합

JSON만 출력:
{"analysis":{"specificity":7,"evidence":6,"actionability":5,"overall":6},"content":{"specificity":8,"evidence":7,"actionability":8,"overall":8},...}`

    const raw = await runLLM(
      'Sub-Reasoner 품질 평가관. 엄격하게 채점. JSON만 출력.',
      prompt, 0.2, 800,
      { llmProvider: 'gemini' } as import('@/lib/types').RuntimeConfig
    )

    const cleaned = raw.replace(/```(?:json)?/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)?.[0]
    if (!match) return null

    const scores = JSON.parse(match) as Record<string, QualityScore>

    // 유효성 검증
    const validNames = ['analysis', 'content', 'strategy', 'cro', 'psychology']
    const validScores: Record<string, QualityScore> = {}
    let totalOverall = 0
    let count = 0

    for (const name of validNames) {
      const s = scores[name]
      if (s && typeof s.overall === 'number') {
        validScores[name] = {
          specificity: Math.min(10, Math.max(0, s.specificity || 0)),
          evidence: Math.min(10, Math.max(0, s.evidence || 0)),
          actionability: Math.min(10, Math.max(0, s.actionability || 0)),
          overall: Math.min(10, Math.max(0, s.overall)),
        }
        totalOverall += validScores[name].overall
        count++
      }
    }

    if (count === 0) return null

    const cycleQuality: CycleQuality = {
      cycleId,
      timestamp: new Date().toISOString(),
      scores: validScores,
      avgOverall: totalOverall / count,
    }

    // 파일에 누적 저장
    saveQuality(cycleQuality)

    return cycleQuality
  } catch (err) {
    console.error('[SubReasonerEvaluator] 평가 실패:', err instanceof Error ? err.message : err)
    return null
  }
}

function saveQuality(entry: CycleQuality): void {
  try {
    const dir = path.dirname(QUALITY_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    let history: QualityHistory = { history: [], lastUpdated: '' }
    if (fs.existsSync(QUALITY_FILE)) {
      history = JSON.parse(fs.readFileSync(QUALITY_FILE, 'utf-8'))
    }

    history.history.push(entry)
    if (history.history.length > MAX_HISTORY) {
      history.history = history.history.slice(-MAX_HISTORY)
    }
    history.lastUpdated = new Date().toISOString()

    fs.writeFileSync(QUALITY_FILE, JSON.stringify(history, null, 2), 'utf-8')
  } catch { /* non-critical */ }
}

/** 최근 N사이클의 Sub-Reasoner별 평균 점수 */
export function getQualityTrend(n = 10): Record<string, { avg: number; trend: 'up' | 'down' | 'flat' }> | null {
  try {
    if (!fs.existsSync(QUALITY_FILE)) return null
    const data: QualityHistory = JSON.parse(fs.readFileSync(QUALITY_FILE, 'utf-8'))
    if (data.history.length < 2) return null

    const recent = data.history.slice(-n)
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2))
    const secondHalf = recent.slice(Math.floor(recent.length / 2))

    const result: Record<string, { avg: number; trend: 'up' | 'down' | 'flat' }> = {}
    const names = ['analysis', 'content', 'strategy', 'cro', 'psychology']

    for (const name of names) {
      const recentScores = recent.map(c => c.scores[name]?.overall).filter((v): v is number => v !== undefined)
      const firstScores = firstHalf.map(c => c.scores[name]?.overall).filter((v): v is number => v !== undefined)
      const secondScores = secondHalf.map(c => c.scores[name]?.overall).filter((v): v is number => v !== undefined)

      if (recentScores.length === 0) continue

      const avg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length
      const firstAvg = firstScores.length > 0 ? firstScores.reduce((a, b) => a + b, 0) / firstScores.length : avg
      const secondAvg = secondScores.length > 0 ? secondScores.reduce((a, b) => a + b, 0) / secondScores.length : avg

      const diff = secondAvg - firstAvg
      const trend = diff > 0.5 ? 'up' : diff < -0.5 ? 'down' : 'flat'

      result[name] = { avg: Math.round(avg * 10) / 10, trend }
    }

    return result
  } catch {
    return null
  }
}

/** prompt-evolver용: 점수가 낮은 Sub-Reasoner 목록 */
export function getWeakSubReasoners(threshold = 5): Array<{ name: string; avgScore: number; weakArea: string }> {
  const trend = getQualityTrend(10)
  if (!trend) return []

  try {
    if (!fs.existsSync(QUALITY_FILE)) return []
    const data: QualityHistory = JSON.parse(fs.readFileSync(QUALITY_FILE, 'utf-8'))
    const recent = data.history.slice(-10)

    const weak: Array<{ name: string; avgScore: number; weakArea: string }> = []

    for (const [name, info] of Object.entries(trend)) {
      if (info.avg < threshold) {
        // 어떤 영역이 가장 약한지 확인
        const dims = { specificity: 0, evidence: 0, actionability: 0 }
        let count = 0
        for (const cycle of recent) {
          const s = cycle.scores[name]
          if (s) {
            dims.specificity += s.specificity
            dims.evidence += s.evidence
            dims.actionability += s.actionability
            count++
          }
        }
        if (count > 0) {
          const avgDims = {
            specificity: dims.specificity / count,
            evidence: dims.evidence / count,
            actionability: dims.actionability / count,
          }
          const weakArea = Object.entries(avgDims).sort((a, b) => a[1] - b[1])[0][0]
          weak.push({ name, avgScore: info.avg, weakArea })
        }
      }
    }

    return weak
  } catch {
    return []
  }
}
