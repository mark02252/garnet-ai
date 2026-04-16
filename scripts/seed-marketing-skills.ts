/**
 * Marketing Skills Seeder
 * coreyhaines31/marketingskills 저장소의 36개 마케팅 스킬을
 * Garnet Knowledge Store에 Level 3 (Principle)로 시드
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import * as path from 'path'

const envContent = readFileSync('/Users/rnr/Documents/New project/.env', 'utf-8')
for (const line of envContent.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('=')
  if (eq === -1) continue
  const k = t.slice(0, eq)
  let v = t.slice(eq + 1)
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

import { PrismaClient } from '@prisma/client'

const SKILLS_DIR = '/tmp/marketingskills/skills'

// 스킬을 Garnet 도메인에 매핑
const DOMAIN_MAP: Record<string, string> = {
  'page-cro': 'conversion_optimization',
  'form-cro': 'conversion_optimization',
  'signup-flow-cro': 'conversion_optimization',
  'onboarding-cro': 'conversion_optimization',
  'popup-cro': 'conversion_optimization',
  'paywall-upgrade-cro': 'conversion_optimization',
  'ab-test-setup': 'conversion_optimization',

  'copywriting': 'content_strategy',
  'copy-editing': 'content_strategy',
  'content-strategy': 'content_strategy',
  'social-content': 'content_strategy',
  'ad-creative': 'content_strategy',

  'cold-email': 'email_marketing',
  'email-sequence': 'email_marketing',

  'seo-audit': 'seo',
  'ai-seo': 'seo',
  'programmatic-seo': 'seo',
  'site-architecture': 'seo',
  'schema-markup': 'seo',
  'aso-audit': 'seo',

  'paid-ads': 'paid_advertising',
  'analytics-tracking': 'analytics',

  'churn-prevention': 'retention',
  'referral-program': 'retention',
  'lead-magnets': 'lead_generation',
  'free-tool-strategy': 'lead_generation',

  'pricing-strategy': 'pricing_strategy',
  'launch-strategy': 'product_launch',
  'sales-enablement': 'b2b',
  'revops': 'operations',
  'marketing-psychology': 'consumer',
  'customer-research': 'consumer',
  'community-marketing': 'community',
  'competitor-alternatives': 'competitive',
  'product-marketing-context': 'marketing',
  'marketing-ideas': 'marketing',
}

type SkillExtract = {
  name: string
  description: string
  corePoints: string[]
}

/**
 * SKILL.md에서 핵심 추출
 */
function parseSkill(skillName: string): SkillExtract | null {
  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md')
  let content: string
  try {
    content = readFileSync(skillPath, 'utf-8')
  } catch {
    return null
  }

  // frontmatter description 추출
  const descMatch = content.match(/description:\s*([^\n]+(?:\n  [^\n]+)*)/)
  const description = descMatch ? descMatch[1].trim().slice(0, 300) : ''

  // ## 헤더 추출 (핵심 섹션 제목들)
  const sections = content.match(/^##\s+(.+)$/gm) || []
  const corePoints = sections
    .map(s => s.replace(/^##\s+/, '').trim())
    .filter(s => !s.match(/^(References|Examples|Resources|See Also|상세 내용|상세)/i))
    .slice(0, 5)

  return {
    name: skillName,
    description,
    corePoints,
  }
}

/**
 * 스킬을 Garnet Knowledge Entry로 변환
 */
function toKnowledgeEntries(skill: SkillExtract) {
  const domain = DOMAIN_MAP[skill.name] || 'marketing'
  const entries: Array<{
    domain: string
    level: number
    pattern: string
    observation: string
    source: string
  }> = []

  // 1. 메인 원칙 (Level 3 — Principle)
  entries.push({
    domain,
    level: 3,
    pattern: `[${skill.name}] 마케팅 스킬 적용 원칙`,
    observation: skill.description,
    source: 'marketing_skills_library',
  })

  // 2. 각 섹션을 별도 패턴 (Level 2)
  for (const point of skill.corePoints) {
    entries.push({
      domain,
      level: 2,
      pattern: `[${skill.name}] ${point}`,
      observation: `${skill.name} 스킬의 ${point} 영역. ${skill.description.slice(0, 150)}`,
      source: 'marketing_skills_library',
    })
  }

  return entries
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(apply ? '🔴 APPLY MODE' : '🟡 DRY RUN')
  console.log('')

  const skills = readdirSync(SKILLS_DIR).filter(name => {
    try {
      return statSync(path.join(SKILLS_DIR, name)).isDirectory()
    } catch { return false }
  })

  console.log(`📚 발견된 스킬: ${skills.length}개\n`)

  const allEntries: Array<{ domain: string; level: number; pattern: string; observation: string; source: string }> = []

  for (const skillName of skills) {
    const parsed = parseSkill(skillName)
    if (!parsed) continue
    const entries = toKnowledgeEntries(parsed)
    allEntries.push(...entries)
    const domain = DOMAIN_MAP[skillName] || 'marketing'
    console.log(`  ✓ ${skillName.padEnd(28)} → ${domain.padEnd(25)} (${entries.length} entries)`)
  }

  console.log(`\n📊 총 Knowledge Entry: ${allEntries.length}개`)
  const byDomain: Record<string, number> = {}
  for (const e of allEntries) {
    byDomain[e.domain] = (byDomain[e.domain] || 0) + 1
  }
  console.log('\n도메인별:')
  for (const [d, c] of Object.entries(byDomain).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${d.padEnd(28)} ${c}건`)
  }

  if (!apply) {
    console.log('\n👀 Dry-run 완료. 적용: npx tsx scripts/seed-marketing-skills.ts --apply')
    return
  }

  // 실제 시드
  const prisma = new PrismaClient()
  let inserted = 0
  let merged = 0
  let failed = 0

  // addKnowledge를 직접 import하지 않고 prisma에 직접 저장 (중복 검사 포함)
  for (const e of allEntries) {
    try {
      // 같은 pattern + domain이 있으면 스킵
      const existing = await prisma.knowledgeEntry.findFirst({
        where: { domain: e.domain, pattern: e.pattern, source: { contains: 'marketing_skills_library' } },
      })
      if (existing) {
        merged++
        continue
      }

      await prisma.knowledgeEntry.create({
        data: {
          domain: e.domain,
          level: e.level,
          pattern: e.pattern,
          observation: e.observation,
          source: e.source,
          confidence: 0.7,
          observedCount: 1,
          isAntiPattern: false,
        },
      })
      inserted++
    } catch (err) {
      failed++
    }
  }

  // 임베딩 생성 (의미 검색 가능하게)
  console.log(`\n📝 신규: ${inserted}건, 중복 스킵: ${merged}건, 실패: ${failed}건`)
  console.log('🧠 임베딩 생성 중...')

  const newEntries = await prisma.knowledgeEntry.findMany({
    where: { source: { contains: 'marketing_skills_library' }, embedding: null },
  })

  const { getEmbedding } = await import('/Users/rnr/Documents/New project/lib/agent-loop/embeddings.js')
  let embedded = 0
  for (const entry of newEntries) {
    const text = `${entry.pattern} ${entry.observation}`
    const emb = await getEmbedding(text)
    if (emb) {
      await prisma.knowledgeEntry.update({
        where: { id: entry.id },
        data: { embedding: JSON.stringify(emb) },
      })
      embedded++
      if (embedded % 20 === 0) console.log(`  진행: ${embedded}/${newEntries.length}`)
    }
    await new Promise(r => setTimeout(r, 30))
  }

  console.log(`\n✅ 완료: ${embedded}개 임베딩 생성`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
