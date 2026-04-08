import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'
import { addKnowledge } from './knowledge-store'
import { isTelegramConfigured, sendMessage } from '@/lib/telegram'

/**
 * 반복 실패 패턴 감지 시 패러다임 전환 트리거
 * weekly-review에서 호출
 */
export async function checkParadigmShift(): Promise<{
  shiftsTriggered: number
  domains: string[]
}> {
  // 5회 이상 부정적 결과가 관찰된 인과 링크
  const repeatedFailures = await prisma.causalLink.findMany({
    where: {
      effect: { contains: 'decrease' },
      observedCount: { gte: 5 },
      strength: { gte: 0.5 },
    },
  })

  // 5회 이상 거절된 anti-pattern
  const rejectedPatterns = await prisma.knowledgeEntry.findMany({
    where: {
      isAntiPattern: true,
      observedCount: { gte: 5 },
    },
  })

  const failureDomains = new Set([
    ...repeatedFailures.map(f => f.domain),
    ...rejectedPatterns.map(p => p.domain),
  ])

  if (failureDomains.size === 0) return { shiftsTriggered: 0, domains: [] }

  let shiftsTriggered = 0
  const shiftedDomains: string[] = []

  for (const domain of failureDomains) {
    const failures = repeatedFailures.filter(f => f.domain === domain)
    const rejections = rejectedPatterns.filter(p => p.domain === domain)

    const failureContext = [
      ...failures.map(f => `${f.cause} → ${f.effect} (${f.observedCount}회)`),
      ...rejections.map(r => `${r.pattern} → 거절 (${r.observedCount}회)`),
    ].join('\n')

    const prompt = `다음 도메인에서 반복적으로 실패하고 있습니다:

도메인: ${domain}
반복 실패:
${failureContext}

기존 접근이 근본적으로 잘못되었을 가능성이 있습니다.
완전히 새로운 프레임워크/접근법을 제안하세요.

JSON: {"newFramework":"새 접근법 이름","description":"설명","principles":["원칙1","원칙2"],"firstStep":"첫 번째로 할 일"}`

    try {
      const raw = await runLLM('패러다임 전환 전문가. 기존 관행을 근본적으로 재설계. JSON만 출력.', prompt, 0.5, 1000)
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')

      if (parsed.newFramework) {
        // 새 프레임워크를 Principle로 저장
        await addKnowledge({
          domain,
          level: 3,
          pattern: `[패러다임 전환] ${parsed.newFramework}`,
          observation: `${parsed.description}\n원칙: ${(parsed.principles || []).join(', ')}\n첫 단계: ${parsed.firstStep}`,
          source: 'paradigm_shift',
        })

        // 기존 실패 지식의 confidence 하향
        for (const f of failures) {
          await prisma.knowledgeEntry.updateMany({
            where: { domain, pattern: { contains: f.cause || f.domain } },
            data: { confidence: 0.2 },
          }).catch(() => {})
        }
        for (const r of rejections) {
          await prisma.knowledgeEntry.updateMany({
            where: { domain, pattern: { contains: r.pattern || r.domain } },
            data: { confidence: 0.2 },
          }).catch(() => {})
        }

        shiftsTriggered++
        shiftedDomains.push(domain)

        // 알림
        if (isTelegramConfigured()) {
          await sendMessage(
            `🔄 *패러다임 전환: ${domain}*\n\n기존 접근이 ${failures.length + rejections.length}회 실패.\n새 프레임워크: *${parsed.newFramework}*\n${parsed.description?.slice(0, 150)}`,
            { parseMode: 'Markdown' },
          ).catch(() => {})
        }
      }
    } catch { /* continue */ }
  }

  return { shiftsTriggered, domains: shiftedDomains }
}
