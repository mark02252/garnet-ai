// Simple Notion API integration for exporting reports/content

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

function getHeaders() {
  const token = process.env.NOTION_API_KEY
  if (!token) return null
  return {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

export async function exportToNotionPage(params: {
  parentPageId: string
  title: string
  content: string
}): Promise<{ ok: boolean; pageUrl?: string; error?: string }> {
  const headers = getHeaders()
  if (!headers) return { ok: false, error: 'NOTION_API_KEY가 설정되지 않았습니다.' }

  try {
    // Split content into blocks (Notion max 2000 chars per block)
    const blocks = params.content.match(/.{1,2000}/gs) || [params.content]

    const res = await fetch(`${NOTION_API}/pages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        parent: { page_id: params.parentPageId },
        properties: {
          title: { title: [{ text: { content: params.title } }] },
        },
        children: blocks.map(text => ({
          object: 'block' as const,
          type: 'paragraph' as const,
          paragraph: { rich_text: [{ type: 'text' as const, text: { content: text } }] },
        })),
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      return { ok: false, error: err.message || 'Notion 페이지 생성 실패' }
    }

    const data = await res.json()
    return { ok: true, pageUrl: data.url }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Notion 전송 실패' }
  }
}

export async function exportReportToNotion(params: {
  parentPageId: string
  personaName: string
  report: {
    summary?: { totalReach?: number; avgEngagementRate?: number; trend?: string }
    recommendations?: Array<{ topic: string; reason: string }>
  }
}): Promise<{ ok: boolean; pageUrl?: string; error?: string }> {
  const sections: string[] = []

  sections.push(`성과 분석 리포트 — ${params.personaName}`)
  sections.push(`생성일: ${new Date().toLocaleDateString('ko-KR')}`)

  if (params.report.summary) {
    sections.push(`\n## 성과 요약`)
    sections.push(`총 도달: ${params.report.summary.totalReach?.toLocaleString() || '-'}`)
    sections.push(`평균 참여율: ${params.report.summary.avgEngagementRate || '-'}%`)
    sections.push(`추세: ${params.report.summary.trend || '-'}`)
  }

  if (params.report.recommendations?.length) {
    sections.push(`\n## 추천 콘텐츠`)
    params.report.recommendations.forEach((r, i) => {
      sections.push(`${i + 1}. ${r.topic} — ${r.reason}`)
    })
  }

  return exportToNotionPage({
    parentPageId: params.parentPageId,
    title: `[Garnet] 성과 리포트 — ${params.personaName} — ${new Date().toLocaleDateString('ko-KR')}`,
    content: sections.join('\n'),
  })
}
