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

  console.log('=== (not set) 원인 분석 — 최근 3일 ===\n')

  // 1. 디바이스별
  console.log('▸ 디바이스별 분포')
  const [byDevice] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: '3daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'customEvent:theater_code' }, { name: 'deviceCategory' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: 'purchase', matchType: 'EXACT' } },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  })
  for (const row of byDevice.rows || []) {
    const code = row.dimensionValues?.[0]?.value || ''
    const device = row.dimensionValues?.[1]?.value || ''
    const cnt = row.metricValues?.[0]?.value || '0'
    const mark = code === '(not set)' || !code ? ' ⚠️' : ''
    console.log(`  ${(code || '(빈값)').padEnd(15)} | ${device.padEnd(8)} | ${cnt}회${mark}`)
  }

  // 2. 페이지별 (not set만)
  console.log('\n▸ (not set) 결제가 발생한 페이지 (랜딩/소스 페이지)')
  const [byPage] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: '3daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'customEvent:theater_code' }, { name: 'sessionDefaultChannelGrouping' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          { filter: { fieldName: 'eventName', stringFilter: { value: 'purchase', matchType: 'EXACT' } } },
        ],
      },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  })
  for (const row of byPage.rows || []) {
    const code = row.dimensionValues?.[0]?.value || ''
    const channel = row.dimensionValues?.[1]?.value || ''
    const cnt = row.metricValues?.[0]?.value || '0'
    const mark = code === '(not set)' || !code ? ' ⚠️' : ''
    console.log(`  ${(code || '(빈값)').padEnd(15)} | ${channel.padEnd(20)} | ${cnt}회${mark}`)
  }

  // 3. 시간대별
  console.log('\n▸ (not set) 발생 시간대 분포')
  const [byHour] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: '3daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'hour' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          { filter: { fieldName: 'eventName', stringFilter: { value: 'purchase', matchType: 'EXACT' } } },
          { filter: { fieldName: 'customEvent:theater_code', stringFilter: { value: '(not set)' } } },
        ],
      },
    },
    orderBys: [{ dimension: { dimensionName: 'hour' } }],
  })
  if ((byHour.rows?.length ?? 0) === 0) {
    console.log('  (not set) 시간대 데이터 없음')
  } else {
    for (const row of byHour.rows || []) {
      console.log(`  ${row.dimensionValues?.[0]?.value}시 | ${row.metricValues?.[0]?.value}회`)
    }
  }
}

main().catch(e => console.error('Error:', e.message))
