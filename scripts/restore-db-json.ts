/**
 * JSON 백업에서 DB 복원
 * 사용법: npx tsx scripts/restore-db-json.ts <backup_dir>
 * 주의: 기존 데이터를 덮어쓰지 않음 (createMany skipDuplicates)
 */
import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

async function main() {
  const backupDir = process.argv[2]
  if (!backupDir || !fs.existsSync(backupDir)) {
    console.error('사용법: npx tsx scripts/restore-db-json.ts <backup_dir>')
    process.exit(1)
  }

  console.log('=== JSON 백업에서 DB 복원 ===\n')

  const tables: Record<string, { create: (data: unknown) => Promise<unknown> }> = {
    knowledgeEntry: { create: (data) => prisma.knowledgeEntry.createMany({ data: data as never[], skipDuplicates: true }) },
    watchKeyword: { create: (data) => prisma.watchKeyword.createMany({ data: data as never[], skipDuplicates: true }) },
    kpiGoal: { create: (data) => prisma.kpiGoal.createMany({ data: data as never[], skipDuplicates: true }) },
  }

  for (const [name, ops] of Object.entries(tables)) {
    const filePath = path.join(backupDir, `${name}.json`)
    if (!fs.existsSync(filePath)) {
      console.log(`  ⏭️ ${name}.json 없음`)
      continue
    }

    try {
      const rows = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      if (!Array.isArray(rows) || rows.length === 0) {
        console.log(`  ⏭️ ${name}: 0건`)
        continue
      }

      // DateTime 필드 변환
      const cleaned = rows.map((row: Record<string, unknown>) => {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(row)) {
          if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
            out[k] = new Date(v)
          } else {
            out[k] = v
          }
        }
        return out
      })

      const result = await ops.create(cleaned)
      console.log(`  ✅ ${name}: ${rows.length}건 복원`, result)
    } catch (err) {
      console.log(`  ⚠️ ${name}: 실패 (${err instanceof Error ? err.message : err})`)
    }
  }

  // episodicMemory, marketingIntel은 양이 많아서 개별 insert
  for (const tableName of ['episodicMemory', 'marketingIntel', 'snsAnalyticsSnapshot', 'marketingDigest']) {
    const filePath = path.join(backupDir, `${tableName}.json`)
    if (!fs.existsSync(filePath)) continue

    try {
      const rows = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      console.log(`  📦 ${tableName}: ${rows.length}건 (대량 — 개별 insert)`)
      let inserted = 0
      for (const row of rows) {
        try {
          // @ts-expect-error dynamic table access
          await prisma[tableName].create({ data: row })
          inserted++
        } catch {
          // duplicate or constraint error — skip
        }
      }
      console.log(`  ✅ ${tableName}: ${inserted}/${rows.length}건 복원`)
    } catch (err) {
      console.log(`  ⚠️ ${tableName}: 실패 (${err instanceof Error ? err.message : err})`)
    }
  }

  await prisma.$disconnect()
  console.log('\n복원 완료.')
}

main().catch(e => {
  console.error('복원 실패:', e.message)
  process.exit(1)
})
