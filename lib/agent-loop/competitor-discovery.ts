/**
 * Competitor Auto-Discovery
 * MarketingIntel에서 새 경쟁사 후보를 자동 발견하고 BusinessContext에 등록
 */

import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'
import { loadBusinessContext, saveBusinessContext } from '@/lib/business-context'
import type { Competitor } from '@/lib/business-context'

// ── Types ──

export type DiscoveryResult = {
  candidatesFound: number
  newCompetitors: Competitor[]
}

type CandidateData = {
  url: string
  mentions: number
  titles: string[]
}

// ── Helpers ──

/** 일반 플랫폼 도메인 (경쟁사 대상에서 제외) */
const PLATFORM_DOMAINS = new Set([
  'google.com',
  'youtube.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'facebook.com',
  'reddit.com',
  'naver.com',
  'daum.net',
  'tistory.com',
  'wikipedia.org',
  'blog.naver.com',
  'news.naver.com',
  'search.naver.com',
  'linkedin.com',
  'threads.net',
])

/** URL에서 도메인 추출 (www. 제거) */
function extractDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    return hostname
  } catch {
    return null
  }
}

/** 기존 경쟁사 도메인 + 이름 목록 */
function getExistingDomains(): Set<string> {
  const ctx = loadBusinessContext()
  if (!ctx?.competitors) return new Set()

  const domains = new Set<string>()
  for (const c of ctx.competitors) {
    if (c.url) {
      const d = extractDomain(c.url)
      if (d) domains.add(d)
    }
    // 이름으로도 매칭 (URL 없는 경쟁사 대비)
    domains.add(c.name.toLowerCase())
  }
  return domains
}

// ── Core Logic ──

/** 최근 7일 MarketingIntel에서 새 도메인 후보 추출 (2회 이상 등장) */
async function findCandidateDomains(): Promise<Map<string, CandidateData>> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const items = await prisma.marketingIntel.findMany({
    where: { createdAt: { gte: sevenDaysAgo } },
    select: { url: true, title: true },
  })

  const existing = getExistingDomains()
  const domainMap = new Map<string, CandidateData>()

  for (const item of items) {
    const domain = extractDomain(item.url)
    if (!domain) continue
    if (existing.has(domain)) continue
    if (PLATFORM_DOMAINS.has(domain)) continue

    const entry = domainMap.get(domain) || { url: item.url, mentions: 0, titles: [] }
    entry.mentions++
    if (entry.titles.length < 3) entry.titles.push(item.title)
    domainMap.set(domain, entry)
  }

  // 2회 이상 등장한 도메인만 반환
  const filtered = new Map<string, CandidateData>()
  for (const [domain, data] of domainMap) {
    if (data.mentions >= 2) filtered.set(domain, data)
  }

  return filtered
}

/** LLM으로 경쟁사 여부 판단 */
async function evaluateCandidate(
  domain: string,
  titles: string[],
): Promise<Competitor | null> {
  const prompt = `다음 웹사이트가 MONOPLEX(프라이빗 시네마 대관, 아파트 시네마 구축, Cinema-as-a-Service)의 경쟁사인지 판단하세요.

도메인: ${domain}
관련 기사 제목:
${titles.map((t) => `- ${t}`).join('\n')}

경쟁사가 아니면: {"isCompetitor": false}
경쟁사면: {"isCompetitor": true, "name": "회사명", "relationship": "price|location|quality|brand|general", "strengths": ["강점1"], "weaknesses": ["약점1"]}

JSON만 출력하세요.`

  try {
    const raw = await runLLM(
      '경쟁사 분석 전문가. JSON만 출력.',
      prompt,
      0.2,
      500,
    )
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')
    if (!parsed.isCompetitor) return null

    const validRelationships = [
      'price',
      'location',
      'quality',
      'brand',
      'general',
    ] as const
    type Rel = (typeof validRelationships)[number]

    return {
      name: parsed.name || domain,
      url: `https://${domain}`,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
      relationship: (validRelationships as readonly string[]).includes(
        parsed.relationship,
      )
        ? (parsed.relationship as Rel)
        : 'general',
    }
  } catch {
    return null
  }
}

// ── Public API ──

/** 경쟁사 자동 발견 → BusinessContext에 등록 */
export async function discoverNewCompetitors(): Promise<DiscoveryResult> {
  const candidates = await findCandidateDomains()

  if (candidates.size === 0) {
    return { candidatesFound: 0, newCompetitors: [] }
  }

  const newCompetitors: Competitor[] = []

  for (const [domain, data] of candidates) {
    const competitor = await evaluateCandidate(domain, data.titles)
    if (competitor) newCompetitors.push(competitor)
  }

  // BusinessContext에 등록
  if (newCompetitors.length > 0) {
    const ctx = loadBusinessContext()
    if (ctx) {
      ctx.competitors = [...(ctx.competitors || []), ...newCompetitors]
      ctx.lastUpdated = new Date().toISOString()
      saveBusinessContext(ctx)
    }
  }

  return { candidatesFound: candidates.size, newCompetitors }
}
