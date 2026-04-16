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

  console.log('=== theater 필드 (한글명 - 원래 spec) ===\n')
  try {
    const [resp] = await client.runReport({
      property: propertyId,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'customEvent:theater' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', stringFilter: { value: 'purchase', matchType: 'EXACT' } },
      },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 30,
    })
    if ((resp.rows?.length ?? 0) === 0) {
      console.log('  데이터 없음 — theater 필드 사용 안 됨')
    } else {
      for (const row of resp.rows || []) {
        const v = row.dimensionValues?.[0]?.value || '(빈값)'
        const c = row.metricValues?.[0]?.value || '0'
        console.log(`  ${v.slice(0, 60).padEnd(60)} | ${c}회`)
      }
    }
  } catch (e: any) {
    console.log('  에러:', e.message)
  }

  console.log('\n=== theater_code 필드 (m-code - 현재 GA4) ===\n')
  const [resp2] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'customEvent:theater_code' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: 'purchase', matchType: 'EXACT' } },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  })
  for (const row of resp2.rows || []) {
    const v = row.dimensionValues?.[0]?.value || '(빈값)'
    const c = row.metricValues?.[0]?.value || '0'
    console.log(`  ${v.padEnd(20)} | ${c}회`)
  }
}
main().catch(e => console.error(e.message))
