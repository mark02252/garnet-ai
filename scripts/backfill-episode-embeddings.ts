import { readFileSync } from 'fs'
const envContent = readFileSync('/Users/rnr/Documents/New project/.env', 'utf-8')
for (const line of envContent.split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('='); if (eq === -1) continue
  const k = t.slice(0, eq); let v = t.slice(eq + 1)
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()
  const { getEmbedding } = await import('/Users/rnr/Documents/New project/lib/agent-loop/embeddings.js')

  const toBackfill = await prisma.episodicMemory.findMany({
    where: { embedding: null },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`백필 대상: ${toBackfill.length}개 에피소드`)
  let done = 0
  let failed = 0

  for (const ep of toBackfill) {
    const text = `${ep.input} ${ep.output}`.slice(0, 2000)
    const embedding = await getEmbedding(text)
    if (embedding) {
      await prisma.episodicMemory.update({
        where: { id: ep.id },
        data: { embedding: JSON.stringify(embedding) },
      })
      done++
      if (done % 20 === 0) console.log(`  진행: ${done}/${toBackfill.length}`)
    } else {
      failed++
    }
    // Rate limit
    await new Promise(r => setTimeout(r, 50))
  }

  console.log(`\n완료: ${done}개 성공, ${failed}개 실패`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
