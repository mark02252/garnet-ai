/**
 * Auto-Learner — 인사이트 자동 검증 및 학습
 *
 * 사이클에서 생성된 인사이트(예측)를 다음 사이클 데이터와 비교하여
 * 맞으면 confidence 상승, 틀리면 하락 — 사람 개입 없이 학습
 *
 * 안전 장치:
 * - "학습"만 자동화, "실행"은 여전히 사람 또는 Governor 승인
 * - 위험 도메인(pricing, finance, paid_advertising)은 자동 학습 제외
 * - confidence 변화 폭 제한 (한 번에 ±0.08)
 */

import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'
import { addKnowledge } from './knowledge-store'

// ── 설정 ──

/** 자동 학습 허용 도메인 (안전한 영역만) */
const AUTO_LEARN_DOMAINS = [
  'analytics',
  'competitive',
  'consumer',
  'content_strategy',
  'marketing',
  'operations',
  'retention',
  'community',
  'macro',
  'self_improvement',
]

/** 자동 학습 금지 도메인 (사람 판단 필수) */
const MANUAL_ONLY_DOMAINS = [
  'pricing_strategy',
  'finance',
  'paid_advertising',
  'lead_generation',
]

/** confidence 변화 제한 */
const MAX_CONFIDENCE_DELTA = 0.08
const MIN_CONFIDENCE = 0.1
const MAX_CONFIDENCE = 0.95

// ── 타입 ──

type PendingPrediction = {
  id: string
  insightId: string
  domain: string
  prediction: string
  metric: string
  expectedDirection: 'up' | 'down' | 'stable'
  expectedThreshold?: number
  createdAt: Date
  verifyAfterHours: number
}

type VerificationResult = {
  predictionId: string
  correct: boolean
  confidence: number
  reason: string
}

// ── 예측 등록 ──

/**
 * 사이클 인사이트에서 검증 가능한 예측을 추출하여 등록
 * Reasoner 출력에서 호출
 */
export async function extractAndRegisterPredictions(params: {
  cycleId: string
  insights: Array<{
    domain: string
    title: string
    description: string
    actionKind?: string
  }>
}): Promise<number> {
  let registered = 0

  for (const insight of params.insights) {
    // 자동 학습 금지 도메인 스킵
    if (MANUAL_ONLY_DOMAINS.includes(insight.domain)) continue
    if (!AUTO_LEARN_DOMAINS.includes(insight.domain)) continue

    try {
      const prediction = await extractPrediction(insight)
      if (!prediction) continue

      await prisma.pendingPrediction.create({
        data: {
          cycleId: params.cycleId,
          domain: insight.domain,
          prediction: prediction.prediction,
          metric: prediction.metric,
          expectedDirection: prediction.direction,
          expectedThreshold: prediction.threshold,
          verifyAfterHours: prediction.verifyAfterHours,
          status: 'pending',
          insightTitle: insight.title.slice(0, 200),
        },
      })
      registered++
    } catch { /* non-critical */ }
  }

  return registered
}

/**
 * LLM으로 인사이트에서 검증 가능한 예측 추출
 */
async function extractPrediction(insight: {
  domain: string
  title: string
  description: string
}): Promise<{
  prediction: string
  metric: string
  direction: 'up' | 'down' | 'stable'
  threshold?: number
  verifyAfterHours: number
} | null> {
  const prompt = `다음 인사이트에서 데이터로 검증 가능한 예측을 추출하세요.
검증 불가능하면 null을 반환하세요.

인사이트:
- 도메인: ${insight.domain}
- 제목: ${insight.title}
- 설명: ${insight.description.slice(0, 300)}

JSON으로 출력 (검증 불가능하면 {"extractable":false}):
{"extractable":true,"prediction":"구체적 예측","metric":"측정 가능한 지표명","direction":"up|down|stable","threshold":숫자(선택),"verifyAfterHours":검증까지_시간(24~168)}`

  try {
    const raw = await runLLM(
      '데이터 분석가. 인사이트에서 검증 가능한 예측을 추출한다. JSON만 출력.',
      prompt, 0.2, 400,
    )
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')
    if (!parsed.extractable || !parsed.prediction || !parsed.metric) return null

    return {
      prediction: parsed.prediction,
      metric: parsed.metric,
      direction: parsed.direction || 'stable',
      threshold: parsed.threshold,
      verifyAfterHours: Math.min(168, Math.max(24, parsed.verifyAfterHours || 72)),
    }
  } catch {
    return null
  }
}

// ── 검증 및 자동 학습 ──

/**
 * 검증 시점이 된 예측을 처리하여 자동 학습
 * 사이클마다 호출
 */
export async function verifyAndLearn(): Promise<{
  verified: number
  correct: number
  incorrect: number
  learned: number
}> {
  const ready = await prisma.pendingPrediction.findMany({
    where: {
      status: 'pending',
      createdAt: {
        lte: new Date(Date.now() - 24 * 60 * 60 * 1000), // 최소 24시간 경과
      },
    },
    take: 10,
  })

  const result = { verified: 0, correct: 0, incorrect: 0, learned: 0 }

  for (const pred of ready) {
    // 검증 시간이 안 됐으면 스킵
    const hoursElapsed = (Date.now() - pred.createdAt.getTime()) / (60 * 60 * 1000)
    if (hoursElapsed < pred.verifyAfterHours) continue

    try {
      const verification = await verifyPrediction(pred)
      result.verified++

      if (verification.correct) {
        result.correct++
      } else {
        result.incorrect++
      }

      // Knowledge Store 업데이트
      const learnResult = await applyLearning(pred, verification)
      if (learnResult) result.learned++

      // 상태 업데이트
      await prisma.pendingPrediction.update({
        where: { id: pred.id },
        data: {
          status: verification.correct ? 'verified_correct' : 'verified_incorrect',
          verificationResult: JSON.stringify(verification),
          verifiedAt: new Date(),
        },
      })
    } catch {
      // 검증 실패 → expired
      await prisma.pendingPrediction.update({
        where: { id: pred.id },
        data: { status: 'expired' },
      }).catch(() => {})
    }
  }

  return result
}

/**
 * 예측을 현재 데이터와 비교하여 검증
 */
async function verifyPrediction(pred: {
  prediction: string
  metric: string
  expectedDirection: string
  expectedThreshold: number | null
  domain: string
  insightTitle: string | null
}): Promise<VerificationResult> {
  // 최근 에피소딕 메모리에서 관련 데이터 수집
  const recentEpisodes = await prisma.episodicMemory.findMany({
    where: {
      category: 'agent_loop_decision',
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  const recentData = recentEpisodes
    .map(e => {
      try { return JSON.parse(e.output) } catch { return null }
    })
    .filter(Boolean)

  const prompt = `다음 예측이 맞았는지 검증하세요.

예측: ${pred.prediction}
측정 지표: ${pred.metric}
예상 방향: ${pred.expectedDirection}
${pred.expectedThreshold ? '임계값: ' + pred.expectedThreshold : ''}

최근 시스템 데이터:
${JSON.stringify(recentData).slice(0, 500)}

JSON으로 출력:
{"correct":true/false,"confidence":0.0~1.0,"reason":"판단 근거 1-2문장"}`

  try {
    const raw = await runLLM(
      '데이터 검증 전문가. 예측과 실제 데이터를 비교하여 정확도를 판단한다. JSON만 출력.',
      prompt, 0.2, 300,
    )
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')

    return {
      predictionId: '',
      correct: parsed.correct === true,
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
      reason: parsed.reason || '',
    }
  } catch {
    return { predictionId: '', correct: false, confidence: 0.3, reason: '검증 실패' }
  }
}

/**
 * 검증 결과를 Knowledge Store에 반영
 */
async function applyLearning(
  pred: { domain: string; prediction: string; insightTitle: string | null },
  verification: VerificationResult,
): Promise<boolean> {
  try {
    if (verification.correct) {
      // 맞은 예측 → 관련 지식 confidence 상승
      const related = await prisma.knowledgeEntry.findMany({
        where: {
          domain: pred.domain,
          isAntiPattern: false,
          OR: [
            { pattern: { contains: pred.domain } },
            { observation: { contains: pred.prediction.slice(0, 30) } },
          ],
        },
        take: 3,
      })

      for (const entry of related) {
        const delta = MAX_CONFIDENCE_DELTA * verification.confidence
        const newConf = Math.min(MAX_CONFIDENCE, entry.confidence + delta)
        await prisma.knowledgeEntry.update({
          where: { id: entry.id },
          data: { confidence: newConf },
        }).catch(() => {})
      }

      // 검증된 패턴을 새 지식으로 저장
      await addKnowledge({
        domain: pred.domain,
        level: 2,
        pattern: `검증됨: ${pred.insightTitle?.slice(0, 60) || pred.prediction.slice(0, 60)}`,
        observation: `예측 "${pred.prediction.slice(0, 100)}" — 데이터로 확인됨 (신뢰도 ${(verification.confidence * 100).toFixed(0)}%). ${verification.reason}`,
        source: 'auto_learner_verified',
      })
    } else {
      // 틀린 예측 → 관련 지식 confidence 하락
      const related = await prisma.knowledgeEntry.findMany({
        where: {
          domain: pred.domain,
          isAntiPattern: false,
          OR: [
            { pattern: { contains: pred.domain } },
            { observation: { contains: pred.prediction.slice(0, 30) } },
          ],
        },
        take: 3,
      })

      for (const entry of related) {
        const delta = MAX_CONFIDENCE_DELTA * (1 - verification.confidence)
        const newConf = Math.max(MIN_CONFIDENCE, entry.confidence - delta)
        await prisma.knowledgeEntry.update({
          where: { id: entry.id },
          data: { confidence: newConf },
        }).catch(() => {})
      }

      // 틀린 패턴 기록 (anti-pattern은 아님 — 상황이 달랐을 수 있음)
      await addKnowledge({
        domain: pred.domain,
        level: 1,
        pattern: `미검증: ${pred.insightTitle?.slice(0, 60) || pred.prediction.slice(0, 60)}`,
        observation: `예측 "${pred.prediction.slice(0, 100)}" — 데이터와 불일치. ${verification.reason}. 조건이 달랐을 수 있음.`,
        source: 'auto_learner_unverified',
      })
    }

    return true
  } catch {
    return false
  }
}

// ── 도메인별 학습 상태 ──

/**
 * 도메인별 자동 학습 통계
 */
export async function getAutoLearnerStats(): Promise<Array<{
  domain: string
  totalPredictions: number
  verified: number
  correct: number
  accuracy: number
  autoLearnable: boolean
}>> {
  const predictions = await prisma.pendingPrediction.findMany({
    select: { domain: true, status: true },
  })

  const stats = new Map<string, { total: number; verified: number; correct: number }>()

  for (const p of predictions) {
    const s = stats.get(p.domain) || { total: 0, verified: 0, correct: 0 }
    s.total++
    if (p.status === 'verified_correct') { s.verified++; s.correct++ }
    if (p.status === 'verified_incorrect') { s.verified++ }
    stats.set(p.domain, s)
  }

  // 모든 도메인 포함
  const allDomains = [...AUTO_LEARN_DOMAINS, ...MANUAL_ONLY_DOMAINS]
  for (const d of allDomains) {
    if (!stats.has(d)) stats.set(d, { total: 0, verified: 0, correct: 0 })
  }

  return Array.from(stats.entries())
    .map(([domain, s]) => ({
      domain,
      totalPredictions: s.total,
      verified: s.verified,
      correct: s.correct,
      accuracy: s.verified > 0 ? s.correct / s.verified : 0,
      autoLearnable: AUTO_LEARN_DOMAINS.includes(domain),
    }))
    .sort((a, b) => b.totalPredictions - a.totalPredictions)
}

/**
 * 오래된 예측 정리 (30일 이상)
 */
export async function cleanupOldPredictions(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const result = await prisma.pendingPrediction.deleteMany({
    where: {
      status: { in: ['verified_correct', 'verified_incorrect', 'expired'] },
      createdAt: { lt: cutoff },
    },
  })
  return result.count
}
