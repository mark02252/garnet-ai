import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'

const LANGUAGES = ['typescript', 'javascript', 'python']
const MIN_STARS = 1000
const MIN_WEEKLY = 50

interface TrendingRepo {
  name: string
  description: string
  url: string
  stars: number
  weeklyStars: number
}

function parseNumber(s: string): number {
  return parseInt(s.replace(/,/g, '').trim()) || 0
}

async function fetchTrending(lang: string): Promise<TrendingRepo[]> {
  const res = await fetch(`https://github.com/trending/${lang}?since=weekly`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Garnet/1.0)' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) return []

  const html = await res.text()
  const repos: TrendingRepo[] = []

  // Parse each repo article
  const articlePattern = /<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>([\s\S]*?)<\/article>/gi
  let match: RegExpExecArray | null

  while ((match = articlePattern.exec(html)) !== null) {
    const block = match[1]

    // Repo name: owner/repo
    const nameMatch = block.match(/href="\/([^"]+\/[^"]+)"[^>]*>\s*[\s\S]*?<\/a>/)
    const fullName = nameMatch?.[1]?.trim()
    if (!fullName || fullName.startsWith('sponsors/') || fullName.includes('/pulls') || fullName.includes('/issues')) continue

    // Description
    const descMatch = block.match(/<p[^>]*class="[^"]*col-9[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/p>/)
    const description = descMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || ''

    // Stars total
    const starsMatch = block.match(/aria-label="[^"]*star[^"]*"[^>]*>[\s\S]*?([\d,]+)\s*<\/a>/i)
    const stars = parseNumber(starsMatch?.[1] || '0')

    // Weekly stars gained
    const weeklyMatch = block.match(/([\d,]+)\s*stars this week/i)
    const weeklyStars = parseNumber(weeklyMatch?.[1] || '0')

    if (stars < MIN_STARS && weeklyStars < MIN_WEEKLY) continue

    repos.push({
      name: fullName,
      description,
      url: `https://github.com/${fullName}`,
      stars,
      weeklyStars,
    })
  }

  return repos
}

interface ClassifyResult {
  category: 'marketing' | 'tech' | 'irrelevant'
  reason: string
}

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

async function classifyRepo(repo: TrendingRepo): Promise<ClassifyResult> {
  try {
    const result = await runLLM(
      `너는 GitHub 레포지토리 분류기다. 반드시 JSON으로만 답해라: {"category":"marketing"|"tech"|"irrelevant","reason":"한국어로 20자 이내 분류 근거"}`,
      `레포: ${repo.name}\n설명: ${repo.description || '없음'}\n\n마케팅 자동화/SNS/콘텐츠/분석 도구면 "marketing", 프레임워크/라이브러리/AI/인프라면 "tech", 그 외면 "irrelevant"`,
      0.1,
      60
    )
    const json = JSON.parse(result.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''))
    const category = json.category
    if (category === 'marketing' || category === 'tech' || category === 'irrelevant') {
      return { category, reason: `[${MODEL}] ${json.reason || ''}` }
    }
    return { category: 'irrelevant', reason: '' }
  } catch {
    return { category: 'irrelevant', reason: '' }
  }
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim()
}

export async function collectGithubTrending(): Promise<{ added: number; skipped: number }> {
  let added = 0
  let skipped = 0
  const seen = new Set<string>()

  for (const lang of LANGUAGES) {
    const repos = await fetchTrending(lang)

    for (const repo of repos) {
      const normalizedName = normalizeName(repo.name)
      if (seen.has(normalizedName)) continue
      seen.add(normalizedName)

      // Skip if already in radar
      const existing = await prisma.techRadarItem.findUnique({ where: { name: normalizedName } })
      if (existing) {
        await prisma.techRadarItem.update({ where: { name: normalizedName }, data: { updatedAt: new Date() } })
        skipped++
        continue
      }

      const { category, reason } = await classifyRepo(repo)
      if (category === 'irrelevant') {
        skipped++
        continue
      }

      await prisma.techRadarItem.create({
        data: {
          name: normalizedName,
          category,
          status: 'assessing',
          description: repo.description || null,
          url: repo.url,
          source: 'github',
          notes: reason || null,
          tags: JSON.stringify([lang]),
        },
      })
      added++
    }

    // Rate limiting: 500ms between languages
    await new Promise((r) => setTimeout(r, 500))
  }

  return { added, skipped }
}
