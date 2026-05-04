import { readFileSync } from 'fs'

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

import { BetaAnalyticsDataClient } from '@google-analytics/data'

const client = new BetaAnalyticsDataClient({
  credentials: {
    client_email: process.env.GA4_CLIENT_EMAIL!,
    private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  },
})

const propertyId = process.env.GA4_PROPERTY_ID!
const range7d = { startDate: '7daysAgo', endDate: 'today' }
const range30d = { startDate: '30daysAgo', endDate: 'today' }

async function main() {
  // ============================
  // 10. 무료 예매 분석
  // ============================
  console.log('========================================')
  console.log('  10. 무료 예매 분석')
  console.log('========================================\n')

  // purchase 중 value=0 건수
  console.log('=== purchase value 분포 (7일) ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range7d],
      dimensions: [{ name: 'transactionId' }],
      metrics: [{ name: 'purchaseRevenue' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', stringFilter: { value: 'purchase' } },
      },
      limit: 500,
    })
    let freeCount = 0
    let paidCount = 0
    let freeIds: string[] = []
    for (const row of (r.rows || [])) {
      const rev = parseFloat(row.metricValues?.[0]?.value || '0')
      if (rev === 0) {
        freeCount++
        freeIds.push(row.dimensionValues?.[0]?.value || '')
      } else {
        paidCount++
      }
    }
    console.log('  유료 purchase:', paidCount, '건')
    console.log('  무료 purchase:', freeCount, '건')
    console.log('  무료 비율:', ((freeCount / (freeCount + paidCount)) * 100).toFixed(1) + '%')
  } catch (e: any) { console.log('error:', e.message?.slice(0, 100)) }

  // 무료 예매 지점별
  console.log('\n=== 무료 예매 CTA "무료 예매" 지점별 (7일) ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range7d],
      dimensions: [{ name: 'customEvent:theater_code' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: 'eventName', stringFilter: { value: 'purchase' } } },
            { filter: { fieldName: 'purchaseRevenue', numericFilter: { operation: 'EQUAL', value: { doubleValue: 0 } } } },
          ],
        },
      },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 15,
    })
    for (const row of (r.rows || [])) {
      const v = row.dimensionValues?.[0]?.value || '(not set)'
      console.log('  ', v, ':', row.metricValues?.[0]?.value, '건 |', row.metricValues?.[1]?.value, 'users')
    }
    if (!r.rows?.length) console.log('  no data with revenue filter, trying alternate...')
  } catch (e: any) {
    console.log('  revenue filter not supported, checking via page...')
  }

  // 무료 예매 버튼 클릭 지점별
  console.log('\n=== "무료 예매" 버튼 클릭 유저의 지점 (7일) ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range7d],
      dimensions: [{ name: 'customEvent:theater_code' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: 'eventName', stringFilter: { value: 'click_cta' } } },
            { filter: { fieldName: 'customEvent:cta_text', stringFilter: { matchType: 'CONTAINS', value: '무료' } } },
          ],
        },
      },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 10,
    })
    for (const row of (r.rows || [])) {
      const v = row.dimensionValues?.[0]?.value || '(not set)'
      console.log('  ', v, ':', row.metricValues?.[0]?.value, '건 |', row.metricValues?.[1]?.value, 'users')
    }
  } catch (e: any) { console.log('error:', e.message?.slice(0, 100)) }

  // 30일 무료 예매 버튼
  console.log('\n=== "무료 예매" 버튼 클릭 (30일) ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range30d],
      dimensions: [{ name: 'customEvent:cta_text' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: 'eventName', stringFilter: { value: 'click_cta' } } },
            { filter: { fieldName: 'customEvent:cta_text', stringFilter: { matchType: 'CONTAINS', value: '무료' } } },
          ],
        },
      },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    })
    for (const row of (r.rows || [])) {
      const text = (row.dimensionValues?.[0]?.value || '').slice(0, 40)
      console.log('  ', text, ':', row.metricValues?.[0]?.value, '건 |', row.metricValues?.[1]?.value, 'users')
    }
  } catch (e: any) { console.log('error:', e.message?.slice(0, 100)) }

  // ============================
  // 11. 비회원 예매 전체 퍼널
  // ============================
  console.log('\n\n========================================')
  console.log('  11. 비회원 예매 퍼널')
  console.log('========================================\n')

  // 비회원 관련 페이지 트래픽
  console.log('=== 비회원 관련 페이지 (7일) ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range7d],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
      dimensionFilter: {
        filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: 'non-user' } },
      },
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    })
    for (const row of (r.rows || [])) {
      console.log('  ', row.dimensionValues?.[0]?.value, '| PV:', row.metricValues?.[0]?.value, '| users:', row.metricValues?.[1]?.value)
    }
  } catch (e: any) { console.log('error:', e.message?.slice(0, 100)) }

  // 비회원 예매 버튼 클릭 퍼널
  console.log('\n=== 비회원 예매 클릭 퍼널 (7일) ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range7d],
      dimensions: [{ name: 'customEvent:cta_text' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: 'eventName', stringFilter: { value: 'click_cta' } } },
            { filter: { fieldName: 'customEvent:cta_text', stringFilter: { matchType: 'CONTAINS', value: '비회원' } } },
          ],
        },
      },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    })
    for (const row of (r.rows || [])) {
      const text = (row.dimensionValues?.[0]?.value || '').slice(0, 60)
      console.log('  ', text, ':', row.metricValues?.[0]?.value, '건 |', row.metricValues?.[1]?.value, 'users')
    }
  } catch (e: any) { console.log('error:', e.message?.slice(0, 100)) }

  // 비회원 예매 유입 소스
  console.log('\n=== 비회원 주문 페이지 유입 소스 (7일) ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range7d],
      dimensions: [{ name: 'sessionSourceMedium' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
      dimensionFilter: {
        filter: { fieldName: 'pagePath', stringFilter: { value: '/booking/non-user-orders' } },
      },
      orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
      limit: 10,
    })
    for (const row of (r.rows || [])) {
      console.log('  ', row.dimensionValues?.[0]?.value, '| PV:', row.metricValues?.[0]?.value, '| users:', row.metricValues?.[1]?.value)
    }
  } catch (e: any) { console.log('error:', e.message?.slice(0, 100)) }

  // 비회원 디바이스
  console.log('\n=== 비회원 주문 페이지 디바이스 (7일) ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range7d],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
      dimensionFilter: {
        filter: { fieldName: 'pagePath', stringFilter: { value: '/booking/non-user-orders' } },
      },
    })
    for (const row of (r.rows || [])) {
      console.log('  ', row.dimensionValues?.[0]?.value, '| PV:', row.metricValues?.[0]?.value, '| users:', row.metricValues?.[1]?.value)
    }
  } catch (e: any) { console.log('error:', e.message?.slice(0, 100)) }

  // 비회원 vs 회원 비교 (좌석 페이지 전체 vs 비회원 클릭)
  console.log('\n=== 좌석 페이지: 회원 결제 vs 비회원 예매 클릭 비교 (7일) ===\n')
  try {
    // 좌석 페이지 전체 유저
    const [seat] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range7d],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'totalUsers' }],
      dimensionFilter: {
        filter: { fieldName: 'pagePath', stringFilter: { value: '/booking/seat' } },
      },
    })
    const seatUsers = parseInt(seat.rows?.[0]?.metricValues?.[0]?.value || '0')

    // "결제하기" 클릭 (회원)
    const [payClick] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range7d],
      metrics: [{ name: 'totalUsers' }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: 'eventName', stringFilter: { value: 'click_cta' } } },
            { filter: { fieldName: 'pagePath', stringFilter: { value: '/booking/seat' } } },
            { filter: { fieldName: 'customEvent:cta_text', stringFilter: { matchType: 'BEGINS_WITH', value: '결제하기' } } },
          ],
        },
      },
    })
    const payUsers = parseInt(payClick.rows?.[0]?.metricValues?.[0]?.value || '0')

    // "비회원 예매" 클릭
    const [nonClick] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range7d],
      metrics: [{ name: 'totalUsers' }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: 'eventName', stringFilter: { value: 'click_cta' } } },
            { filter: { fieldName: 'pagePath', stringFilter: { value: '/booking/seat' } } },
            { filter: { fieldName: 'customEvent:cta_text', stringFilter: { value: '비회원 예매' } } },
          ],
        },
      },
    })
    const nonUsers = parseInt(nonClick.rows?.[0]?.metricValues?.[0]?.value || '0')

    console.log('  좌석 페이지 전체:', seatUsers, '명')
    console.log('  "결제하기" 클릭 (회원):', payUsers, '명 (' + (seatUsers > 0 ? (payUsers / seatUsers * 100).toFixed(0) : '-') + '%)')
    console.log('  "비회원 예매" 클릭:', nonUsers, '명 (' + (seatUsers > 0 ? (nonUsers / seatUsers * 100).toFixed(0) : '-') + '%)')
  } catch (e: any) { console.log('error:', e.message?.slice(0, 100)) }

  // 30일 비회원 트렌드
  console.log('\n=== 비회원 주문 페이지 추이 (30일, 주간) ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range30d],
      dimensions: [{ name: 'week' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
      dimensionFilter: {
        filter: { fieldName: 'pagePath', stringFilter: { value: '/booking/non-user-orders' } },
      },
      orderBys: [{ dimension: { dimensionName: 'week' } }],
    })
    for (const row of (r.rows || [])) {
      console.log('  week', row.dimensionValues?.[0]?.value, '| PV:', row.metricValues?.[0]?.value, '| users:', row.metricValues?.[1]?.value)
    }
  } catch (e: any) { console.log('error:', e.message?.slice(0, 100)) }
}

main().catch(e => console.error('FATAL:', e.message))
