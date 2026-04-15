import { readFileSync } from 'fs'
const envContent = readFileSync('/Users/rnr/Documents/New project/.env', 'utf-8')
for (const line of envContent.split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('='); if (eq === -1) continue
  const k = t.slice(0, eq); let v = t.slice(eq + 1)
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

import { getRecentFailures, buildAvoidanceRules } from '/Users/rnr/Documents/New project/lib/agent-loop/failure-registry.js'

async function main() {
  console.log('=== 최근 실패 사례 (시간 감쇠 적용) ===\n')
  const failures = await getRecentFailures(10)
  for (const f of failures) {
    const daysAgo = Math.floor((Date.now() - f.updatedAt.getTime()) / (1000 * 60 * 60 * 24))
    console.log(`  [${f.domain}] ${f.pattern.slice(0, 60)}`)
    console.log(`    ${daysAgo}일 전 | weight: ${f.weight.toFixed(2)} | source: ${f.source}`)
    console.log(`    → ${f.observation.split('\n')[0].slice(0, 100)}`)
    console.log()
  }

  console.log('\n=== Reasoner 주입용 회피 규칙 ===\n')
  const rules = await buildAvoidanceRules()
  console.log(rules || '(회피 규칙 없음)')
}
main().catch(e => console.error(e.message))
