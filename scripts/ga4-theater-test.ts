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

  // Try 1: customEvent:theater_code (이벤트 범위 커스텀 디멘션)
  console.log('=== Test 1: customEvent:theater_code ===')
  try {
    const [resp] = await client.runReport({
      property: propertyId,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'customEvent:theater_code' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', stringFilter: { value: 'purchase', matchType: 'EXACT' } },
      },
      limit: 30,
    })
    for (const row of resp.rows || []) {
      console.log(`  ${row.dimensionValues?.[0]?.value} : ${row.metricValues?.[0]?.value}회`)
    }
    if ((resp.rows?.length ?? 0) === 0) console.log('  (데이터 없음)')
  } catch (e: unknown) {
    console.log(`  에러: ${(e as Error).message}`)
  }

  // Try 2: itemName (ecommerce 표준)
  console.log('\n=== Test 2: itemName (영화 제목, 이커머스 표준) ===')
  try {
    const [resp] = await client.runReport({
      property: propertyId,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'itemName' }],
      metrics: [{ name: 'itemsPurchased' }, { name: 'itemRevenue' }],
      limit: 10,
    })
    for (const row of resp.rows || []) {
      console.log(`  ${row.dimensionValues?.[0]?.value} : ${row.metricValues?.[0]?.value}개, ${row.metricValues?.[1]?.value}원`)
    }
    if ((resp.rows?.length ?? 0) === 0) console.log('  (데이터 없음)')
  } catch (e: unknown) {
    console.log(`  에러: ${(e as Error).message}`)
  }

  // Try 3: 등록된 커스텀 디멘션 목록 조회
  console.log('\n=== Test 3: customEvent:movie_id ===')
  try {
    const [resp] = await client.runReport({
      property: propertyId,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'customEvent:movie_id' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', stringFilter: { value: 'purchase', matchType: 'EXACT' } },
      },
      limit: 10,
    })
    for (const row of resp.rows || []) {
      console.log(`  ${row.dimensionValues?.[0]?.value} : ${row.metricValues?.[0]?.value}회`)
    }
    if ((resp.rows?.length ?? 0) === 0) console.log('  (데이터 없음)')
  } catch (e: unknown) {
    console.log(`  에러: ${(e as Error).message}`)
  }
}

main().catch(e => console.error(e.message))
