import { readFileSync } from 'fs'
import { BetaAnalyticsDataClient } from '@google-analytics/data'

const envContent = readFileSync('/Users/rnr/Documents/New project/.env', 'utf-8')
for (const line of envContent.split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('='); if (eq === -1) continue
  const k = t.slice(0, eq); let v = t.slice(eq + 1)
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

async function main() {
  const client = new BetaAnalyticsDataClient({
    credentials: {
      client_email: process.env.GA4_CLIENT_EMAIL!,
      private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    },
  })
  const propertyId = `properties/${process.env.GA4_PROPERTY_ID}`

  const [resp] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'newVsReturning' }],
    metrics: [
      { name: 'totalUsers' },
      { name: 'sessions' },
      { name: 'totalPurchasers' },
      { name: 'purchaseRevenue' },
      { name: 'engagementRate' },
      { name: 'averageSessionDuration' },
    ],
  })

  console.log('=== 신규 vs 재방문 (최근 30일) ===\n')
  let totalUsers = 0, totalSessions = 0, totalRev = 0
  const rows: Array<{ type: string; users: number; sessions: number; purchasers: number; rev: number; engRate: number; avgDuration: number }> = []

  for (const row of resp.rows || []) {
    const r = {
      type: row.dimensionValues?.[0]?.value || '',
      users: Number(row.metricValues?.[0]?.value || 0),
      sessions: Number(row.metricValues?.[1]?.value || 0),
      purchasers: Number(row.metricValues?.[2]?.value || 0),
      rev: Number(row.metricValues?.[3]?.value || 0),
      engRate: Number(row.metricValues?.[4]?.value || 0),
      avgDuration: Number(row.metricValues?.[5]?.value || 0),
    }
    totalUsers += r.users; totalSessions += r.sessions; totalRev += r.rev
    rows.push(r)
  }

  for (const r of rows) {
    const label = r.type === 'new' ? '🆕 신규' : r.type === 'returning' ? '🔄 재방문' : `❓ ${r.type}`
    const userPct = (r.users / totalUsers * 100).toFixed(1)
    const revPct = totalRev > 0 ? (r.rev / totalRev * 100).toFixed(1) : '0'
    const convRate = r.users > 0 ? (r.purchasers / r.users * 100).toFixed(2) : '0'
    const sessPerUser = r.users > 0 ? (r.sessions / r.users).toFixed(1) : '0'
    const aov = r.purchasers > 0 ? Math.round(r.rev / r.purchasers).toLocaleString() : '-'
    console.log(label)
    console.log(`  사용자: ${r.users.toLocaleString()} (${userPct}%)`)
    console.log(`  세션: ${r.sessions.toLocaleString()} (1인당 ${sessPerUser}회)`)
    console.log(`  구매자: ${r.purchasers}명 (전환율 ${convRate}%)`)
    console.log(`  매출: ₩${Math.round(r.rev).toLocaleString()} (${revPct}%)`)
    console.log(`  참여율: ${(r.engRate * 100).toFixed(1)}%`)
    console.log(`  평균 체류: ${Math.round(r.avgDuration)}초`)
    console.log(`  AOV: ₩${aov}`)
    console.log()
  }

  console.log('━━━ 요약 ━━━\n')
  console.log(`총 사용자: ${totalUsers.toLocaleString()}`)
  console.log(`총 매출: ₩${Math.round(totalRev).toLocaleString()}`)

  const newR = rows.find(r => r.type === 'new')
  const retR = rows.find(r => r.type === 'returning')
  if (newR && retR) {
    console.log()
    console.log(`신규 비율: ${(newR.users / totalUsers * 100).toFixed(1)}% (사용자) / ${totalRev > 0 ? (newR.rev / totalRev * 100).toFixed(1) : 0}% (매출)`)
    console.log(`재방문 비율: ${(retR.users / totalUsers * 100).toFixed(1)}% (사용자) / ${totalRev > 0 ? (retR.rev / totalRev * 100).toFixed(1) : 0}% (매출)`)
    const retConv = retR.users > 0 ? retR.purchasers / retR.users : 0
    const newConv = newR.users > 0 ? newR.purchasers / newR.users : 0
    const retAOV = retR.purchasers > 0 ? retR.rev / retR.purchasers : 0
    const newAOV = newR.purchasers > 0 ? newR.rev / newR.purchasers : 0
    console.log()
    console.log(`재방문 전환율: ${(retConv * 100).toFixed(2)}% (신규 ${(newConv * 100).toFixed(2)}%의 ${newConv > 0 ? (retConv / newConv).toFixed(1) : '-'}배)`)
    console.log(`재방문 AOV: ₩${Math.round(retAOV).toLocaleString()} (신규 ₩${Math.round(newAOV).toLocaleString()}의 ${newAOV > 0 ? (retAOV / newAOV).toFixed(1) : '-'}배)`)
    console.log(`재방문 1명 가치: 신규의 ${newConv > 0 && newAOV > 0 ? (retConv / newConv * retAOV / newAOV).toFixed(1) : '-'}배`)
  }
}

main().catch(e => console.error('Error:', e.message))
