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

  console.log('=== KPI 측정을 위한 GA4 데이터 분석 ===\n')

  // ━━━ 1. 전환율 개선 ━━━
  console.log('━━━ 1. 전환율 개선 ━━━')

  // 최근 30일 전환율
  const [conversion] = await client.runReport({
    property: propertyId,
    dateRanges: [
      { startDate: '30daysAgo', endDate: 'today' },
      { startDate: '60daysAgo', endDate: '31daysAgo' },
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'totalPurchasers' },
      { name: 'purchaseRevenue' },
      { name: 'totalUsers' },
    ],
  })

  for (let i = 0; i < (conversion.rows?.length ?? 0); i++) {
    const row = conversion.rows![i]
    const period = i === 0 ? '최근 30일' : '이전 30일'
    const sessions = Number(row.metricValues?.[0]?.value || 0)
    const purchasers = Number(row.metricValues?.[1]?.value || 0)
    const revenue = Number(row.metricValues?.[2]?.value || 0)
    const users = Number(row.metricValues?.[3]?.value || 0)
    const convRate = users > 0 ? (purchasers / users * 100).toFixed(2) : '0'
    console.log(`  [${period}]`)
    console.log(`    세션: ${sessions.toLocaleString()} | 사용자: ${users.toLocaleString()}`)
    console.log(`    구매자: ${purchasers} | 매출: ₩${revenue.toLocaleString()}`)
    console.log(`    전환율 (구매자/사용자): ${convRate}%`)
    console.log(`    전환율 (구매자/세션): ${sessions > 0 ? (purchasers / sessions * 100).toFixed(2) : 0}%`)
  }

  // ━━━ 2. CRM 매출 기여 (신규 vs 재방문) ━━━
  console.log('\n━━━ 2. CRM 매출 기여 (신규 vs 재방문) ━━━')

  const [userType] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'newVsReturning' }],
    metrics: [
      { name: 'totalUsers' },
      { name: 'totalPurchasers' },
      { name: 'purchaseRevenue' },
      { name: 'sessions' },
    ],
  })
  let totalRev = 0, returningRev = 0
  for (const row of userType.rows || []) {
    const type = row.dimensionValues?.[0]?.value || ''
    const users = Number(row.metricValues?.[0]?.value || 0)
    const purchasers = Number(row.metricValues?.[1]?.value || 0)
    const rev = Number(row.metricValues?.[2]?.value || 0)
    const sessions = Number(row.metricValues?.[3]?.value || 0)
    totalRev += rev
    if (type === 'returning') returningRev += rev
    console.log(`  [${type || '(unknown)'}]`)
    console.log(`    사용자: ${users.toLocaleString()} | 세션: ${sessions.toLocaleString()}`)
    console.log(`    구매자: ${purchasers} | 매출: ₩${rev.toLocaleString()}`)
    console.log(`    전환율: ${users > 0 ? (purchasers / users * 100).toFixed(2) : 0}%`)
  }
  const returningRatio = totalRev > 0 ? (returningRev / totalRev * 100).toFixed(1) : '0'
  console.log(`  → 재방문 고객 매출 비중: ${returningRatio}%`)

  // ━━━ 3. 브랜드 인지도 (유입 트렌드 전년비는 불가, 채널별) ━━━
  console.log('\n━━━ 3. 브랜드 인지도 — 채널별 유입 ━━━')

  const [channels] = await client.runReport({
    property: propertyId,
    dateRanges: [
      { startDate: '30daysAgo', endDate: 'today' },
    ],
    dimensions: [{ name: 'sessionDefaultChannelGrouping' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'newUsers' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 10,
  })
  let totalSessions = 0, totalNewUsers = 0
  for (const row of channels.rows || []) {
    const ch = row.dimensionValues?.[0]?.value || ''
    const sess = Number(row.metricValues?.[0]?.value || 0)
    const users = Number(row.metricValues?.[1]?.value || 0)
    const newU = Number(row.metricValues?.[2]?.value || 0)
    totalSessions += sess
    totalNewUsers += newU
    console.log(`  ${ch.padEnd(25)} | 세션 ${sess.toLocaleString().padStart(8)} | 사용자 ${users.toLocaleString().padStart(6)} | 신규 ${newU.toLocaleString().padStart(5)}`)
  }
  console.log(`  → 총 세션: ${totalSessions.toLocaleString()} | 총 신규: ${totalNewUsers.toLocaleString()}`)

  // ━━━ 4. 전체 매출 요약 ━━━
  console.log('\n━━━ 4. 전체 매출 요약 ━━━')

  const [revenue] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    metrics: [
      { name: 'purchaseRevenue' },
      { name: 'totalPurchasers' },
      { name: 'transactions' },
      { name: 'averagePurchaseRevenue' },
    ],
  })
  for (const row of revenue.rows || []) {
    const rev = Number(row.metricValues?.[0]?.value || 0)
    const purchasers = Number(row.metricValues?.[1]?.value || 0)
    const txn = Number(row.metricValues?.[2]?.value || 0)
    const avgRev = Number(row.metricValues?.[3]?.value || 0)
    console.log(`  30일 총매출: ₩${rev.toLocaleString()}`)
    console.log(`  구매자: ${purchasers}명`)
    console.log(`  거래수: ${txn}건`)
    console.log(`  평균 결제액: ₩${avgRev.toLocaleString()}`)
    console.log(`  AOV (매출/구매자): ₩${purchasers > 0 ? Math.round(rev / purchasers).toLocaleString() : 0}`)
  }

  // ━━━ 5. 마케팅 에이전트 고도화 ━━━
  console.log('\n━━━ 5. 마케팅 에이전트 고도화 (Garnet 통계) ━━━')

  // Garnet DB 통계
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient()

  const [totalCycles, todayCycles, knowledge, episodes, goals] = await Promise.all([
    prisma.agentLoopCycle.count(),
    prisma.agentLoopCycle.count({ where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    prisma.knowledgeEntry.count(),
    prisma.episodicMemory.count(),
    prisma.goalState.findMany({
      distinct: ['goalName'],
      orderBy: { checkedAt: 'desc' },
      take: 10,
    }),
  ])

  console.log(`  총 사이클: ${totalCycles}`)
  console.log(`  오늘 사이클: ${todayCycles}`)
  console.log(`  축적 지식: ${knowledge}건`)
  console.log(`  에피소딕 메모리: ${episodes}건`)
  console.log(`  전략 목표:`)
  for (const g of goals) {
    console.log(`    ${g.goalName}: ${g.progressPercent}% (${g.onTrack ? '순조' : '뒤처짐'})`)
  }

  // 기능 수 (모듈 수)
  const fs = require('fs')
  const path = require('path')
  const agentModules = fs.readdirSync(path.join(process.cwd(), 'lib/agent-loop')).filter((f: string) => f.endsWith('.ts')).length
  const subReasonerModules = fs.existsSync(path.join(process.cwd(), 'lib/agent-loop/sub-reasoners'))
    ? fs.readdirSync(path.join(process.cwd(), 'lib/agent-loop/sub-reasoners')).filter((f: string) => f.endsWith('.ts')).length
    : 0
  const scripts = fs.readdirSync(path.join(process.cwd(), 'scripts')).filter((f: string) => f.endsWith('.ts')).length

  console.log(`  Agent Loop 모듈: ${agentModules}개`)
  console.log(`  Sub-Reasoner 모듈: ${subReasonerModules}개`)
  console.log(`  자동화 스크립트: ${scripts}개`)
  console.log(`  도메인: ${[...new Set(goals.map((g: any) => g.goalName))].length}개 전략 목표`)

  await prisma.$disconnect()
}

main().catch(e => console.error('Error:', e.message))
