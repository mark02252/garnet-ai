/**
 * Competitor Monitor
 * 경쟁사 웹사이트를 매일 캡처하고 변화를 감지
 * Playwright Agent + AI 분석 결합
 */

import { prisma } from '@/lib/prisma'
import { captureUrl, extractPageData, diffSnapshots } from '@/lib/playwright-agent'
import { runLLM } from '@/lib/llm'
import { sendSlackMessage } from '@/lib/integrations/slack'

export type CompetitorAlert = {
  competitor: string
  url: string
  changeType: 'price' | 'promotion' | 'layout' | 'content'
  description: string
  suggestedAction: string
}

/**
 * 등록된 경쟁사 URL을 모두 스캔
 */
export async function runCompetitorScan(): Promise<{
  scanned: number
  alerts: CompetitorAlert[]
}> {
  // WatchKeyword에서 competitor 타입 키워드 가져오기
  const watchItems = await prisma.watchKeyword.findMany({
    where: { enabled: true },
  })

  // 경쟁사 URL 목록 (watchKeyword에 URL 형태가 있으면 사용)
  const urls = watchItems
    .map(w => w.keyword)
    .filter(k => k.startsWith('http'))

  if (urls.length === 0) return { scanned: 0, alerts: [] }

  const alerts: CompetitorAlert[] = []

  for (const url of urls) {
    try {
      // 1. 변화 감지
      const diff = await diffSnapshots(url)

      if (!diff.changed) continue

      // 2. 페이지 데이터 추출
      const pageData = await extractPageData(url)

      // 3. AI 분석: 어떤 변화인지 판단
      const analysisPrompt = `경쟁사 웹사이트 변화가 감지되었습니다.

URL: ${url}
제목: ${pageData.title}
변화율: ${diff.changePercent}%
가격 정보: ${pageData.prices.join(', ') || '없음'}
프로모션: ${pageData.promotions.join(', ') || '없음'}
주요 텍스트: ${pageData.textContent.slice(0, 300)}

이 변화가 어떤 종류인지 판단하고, 우리가 취해야 할 대응 전략을 JSON으로 제안하세요:
{"changeType": "price|promotion|layout|content", "description": "변화 설명", "suggestedAction": "대응 전략"}`

      const aiResult = await runLLM(
        '경쟁사 분석 전문가입니다. 한국어로 간결하게 응답하세요.',
        analysisPrompt, 0.3, 800,
      )

      try {
        const parsed = JSON.parse(aiResult.match(/\{[\s\S]*\}/)?.[0] || '{}')
        alerts.push({
          competitor: pageData.title || url,
          url,
          changeType: parsed.changeType || 'content',
          description: parsed.description || `${diff.changePercent}% 변화 감지`,
          suggestedAction: parsed.suggestedAction || '상세 확인 필요',
        })
      } catch {
        alerts.push({
          competitor: pageData.title || url,
          url,
          changeType: 'content',
          description: `${diff.changePercent}% 변화 감지`,
          suggestedAction: '상세 확인 필요',
        })
      }
    } catch {
      // 개별 URL 실패 시 스킵
    }
  }

  // Slack 알림
  if (alerts.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    const alertText = alerts.map(a =>
      `*${a.competitor}*\n${a.description}\n→ ${a.suggestedAction}`
    ).join('\n\n')
    await sendSlackMessage({ text: `*[경쟁사 변화 감지]*\n\n${alertText}` }).catch(() => {})
  }

  return { scanned: urls.length, alerts }
}
