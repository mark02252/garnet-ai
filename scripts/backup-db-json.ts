/**
 * DB를 JSON으로 백업 (pg_dump 없을 때 대체)
 * 사용법: npx tsx scripts/backup-db-json.ts [backup_dir]
 */
import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

async function main() {
  const backupDir = process.argv[2] || 'backups/json-backup'
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })

  const tables: Record<string, () => Promise<unknown[]>> = {
    knowledgeEntry: () => prisma.knowledgeEntry.findMany(),
    episodicMemory: () => prisma.episodicMemory.findMany(),
    watchKeyword: () => prisma.watchKeyword.findMany(),
    marketingIntel: () => prisma.marketingIntel.findMany(),
    marketingDigest: () => prisma.marketingDigest.findMany(),
    kpiGoal: () => prisma.kpiGoal.findMany(),
    snsAnalyticsSnapshot: () => prisma.snsAnalyticsSnapshot.findMany(),
  }

  let totalRows = 0
  for (const [name, fetcher] of Object.entries(tables)) {
    try {
      const rows = await fetcher()
      const filePath = path.join(backupDir, `${name}.json`)
      fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf-8')
      totalRows += rows.length
      console.log(`  ✅ ${name}: ${rows.length}건 → ${filePath}`)
    } catch (err) {
      console.log(`  ⚠️ ${name}: 실패 (${err instanceof Error ? err.message : err})`)
    }
  }

  console.log(`\n  총 ${totalRows}건 백업 완료`)
  await prisma.$disconnect()
}

main().catch(e => {
  console.error('백업 실패:', e.message)
  process.exit(1)
})
