import { readFileSync } from 'fs'
import { BetaAnalyticsDataClient } from '@google-analytics/data'

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

async function main() {
  const client = new BetaAnalyticsDataClient({
    credentials: {
      client_email: process.env.GA4_CLIENT_EMAIL!,
      private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    },
  })
  const propertyId = `properties/${process.env.GA4_PROPERTY_ID}`

  // 1. 최근 7일 purchase 일별 + value
  console.log('=== 1. 최근 7일 purchase 일별 ===')
  const [byDay] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'eventCount' },
      { name: 'eventValue' },
      { name: 'purchaseRevenue' },
      { name: 'totalPurchasers' },
      { name: 'transactions' },
    ],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: 'purchase', matchType: 'EXACT' } },
    },
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  })
  console.log('날짜       │ 이벤트 │ eventValue   │ purchaseRev  │ 구매자 │ 거래수')
  console.log('───────────┼────────┼──────────────┼──────────────┼────────┼────────')
  for (const row of byDay.rows || []) {
    const date = row.dimensionValues?.[0]?.value || ''
    const cnt = row.metricValues?.[0]?.value || '0'
    const evVal = Number(row.metricValues?.[1]?.value || 0).toLocaleString().padStart(10)
    const pRev = Number(row.metricValues?.[2]?.value || 0).toLocaleString().padStart(10)
    const purchasers = row.metricValues?.[3]?.value || '0'
    const txn = row.metricValues?.[4]?.value || '0'
    console.log(`${date}  │ ${cnt.padStart(4)}회 │ ₩${evVal} │ ₩${pRev} │ ${purchasers.padStart(4)} │ ${txn.padStart(4)}`)
  }

  // 2. transaction_id 차원 확인 (커스텀 디멘션 등록 전이라 안 될 수도)
  console.log('\n=== 2. 결제별 상세 (transactionId 차원) ===')
  try {
    const [byTxn] = await client.runReport({
      property: propertyId,
      dateRanges: [{ startDate: '3daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'transactionId' }],
      metrics: [{ name: 'eventCount' }, { name: 'eventValue' }, { name: 'purchaseRevenue' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', stringFilter: { value: 'purchase', matchType: 'EXACT' } },
      },
      limit: 10,
    })
    for (const row of byTxn.rows || []) {
      const tid = row.dimensionValues?.[0]?.value || '(없음)'
      const cnt = row.metricValues?.[0]?.value || '0'
      const ev = Number(row.metricValues?.[1]?.value || 0).toLocaleString()
      const pr = Number(row.metricValues?.[2]?.value || 0).toLocaleString()
      console.log(`  ${tid.padEnd(35)} | ${cnt}회 | eventValue: ₩${ev} | purchaseRev: ₩${pr}`)
    }
  } catch (e) {
    console.log('  transactionId 차원 조회 실패:', (e as Error).message)
  }

  // 3. itemName으로 영화별 매출 (이커머스 표준)
  console.log('\n=== 3. 영화별 매출 (itemName) — 최근 3일 ===')
  try {
    const [byMovie] = await client.runReport({
      property: propertyId,
      dateRanges: [{ startDate: '3daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'itemName' }],
      metrics: [{ name: 'itemsPurchased' }, { name: 'itemRevenue' }],
      orderBys: [{ metric: { metricName: 'itemRevenue' }, desc: true }],
      limit: 10,
    })
    if ((byMovie.rows?.length ?? 0) === 0) {
      console.log('  ⚠️ 영화별 매출 데이터 없음 → items 배열이 GA4에 안 들어옴')
    } else {
      for (const row of byMovie.rows || []) {
        const name = row.dimensionValues?.[0]?.value || '(없음)'
        const purchased = row.metricValues?.[0]?.value || '0'
        const rev = Number(row.metricValues?.[1]?.value || 0).toLocaleString()
        console.log(`  ${name.padEnd(30)} | ${purchased}매 | ₩${rev}`)
      }
    }
  } catch (e) {
    console.log('  itemName 조회 실패:', (e as Error).message)
  }

  // 4. 지점별 매출
  console.log('\n=== 4. 지점별 매출 (theater_code) — 최근 3일 ===')
  try {
    const [byTheater] = await client.runReport({
      property: propertyId,
      dateRanges: [{ startDate: '3daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'customEvent:theater_code' }],
      metrics: [{ name: 'eventCount' }, { name: 'eventValue' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', stringFilter: { value: 'purchase', matchType: 'EXACT' } },
      },
      orderBys: [{ metric: { metricName: 'eventValue' }, desc: true }],
      limit: 10,
    })
    if ((byTheater.rows?.length ?? 0) === 0) {
      console.log('  ⚠️ 지점별 데이터 없음 → theater_code 파라미터가 purchase에 안 들어옴')
    } else {
      for (const row of byTheater.rows || []) {
        const code = row.dimensionValues?.[0]?.value || '(없음)'
        const cnt = row.metricValues?.[0]?.value || '0'
        const rev = Number(row.metricValues?.[1]?.value || 0).toLocaleString()
        console.log(`  ${code.padEnd(20)} | ${cnt}회 | ₩${rev}`)
      }
    }
  } catch (e) {
    console.log('  theater_code 조회 실패:', (e as Error).message)
  }

  // 5. AOV 검증
  console.log('\n=== 5. AOV 검증 ===')
  const [aov] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
    metrics: [
      { name: 'purchaseRevenue' },
      { name: 'transactions' },
      { name: 'averagePurchaseRevenue' },
    ],
  })
  for (const row of aov.rows || []) {
    const rev = Number(row.metricValues?.[0]?.value || 0).toLocaleString()
    const txn = row.metricValues?.[1]?.value || '0'
    const avg = Number(row.metricValues?.[2]?.value || 0).toLocaleString()
    console.log(`  7일 총매출: ₩${rev} | 거래수: ${txn} | 평균 결제: ₩${avg}`)
  }
}

main().catch(e => console.error('Error:', e.message))
