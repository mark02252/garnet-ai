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
import { AnalyticsAdminServiceClient } from '@google-analytics/admin'

const client = new BetaAnalyticsDataClient({
  credentials: {
    client_email: process.env.GA4_CLIENT_EMAIL!,
    private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  },
})

const adminClient = new AnalyticsAdminServiceClient({
  credentials: {
    client_email: process.env.GA4_CLIENT_EMAIL!,
    private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  },
})

const propertyId = process.env.GA4_PROPERTY_ID!
const range3d = { startDate: '3daysAgo', endDate: 'today' }
const range7d = { startDate: '7daysAgo', endDate: 'today' }

async function main() {
  // 1. items[]
  console.log('=== 1. items[] 데이터 (3일) ===\n')
  for (const dim of ['itemName', 'itemId', 'itemCategory', 'itemVariant', 'itemBrand']) {
    try {
      const [r] = await client.runReport({
        property: 'properties/' + propertyId,
        dateRanges: [range3d],
        dimensions: [{ name: dim }],
        metrics: [{ name: 'itemsViewed' }],
        limit: 5,
        orderBys: [{ metric: { metricName: 'itemsViewed' }, desc: true }],
      })
      const rows = (r.rows || []).filter(row => row.dimensionValues?.[0]?.value !== '(not set)')
      console.log(rows.length > 0 ? 'O' : 'X', dim, rows.length > 0 ? rows[0].dimensionValues?.[0]?.value : '')
    } catch { console.log('?', dim) }
  }

  // 2. movie_id
  console.log('\n=== 2. movie_id (3일) ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range3d],
      dimensions: [{ name: 'customEvent:movie_id' }],
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 10,
    })
    for (const row of (r.rows || [])) {
      const v = row.dimensionValues?.[0]?.value || ''
      const label = v === '(not set)' ? '(not set)' : v.trim() === '' ? '(empty)' : v
      console.log(' ', label, ':', row.metricValues?.[0]?.value, 'events')
    }
  } catch (e: any) { console.log('error:', e.message?.slice(0, 80)) }

  // 3. cta_text
  console.log('\n=== 3. cta_text (3일, click_cta) ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range3d],
      dimensions: [{ name: 'customEvent:cta_text' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', stringFilter: { value: 'click_cta' } },
      },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 10,
    })
    for (const row of (r.rows || [])) {
      const v = row.dimensionValues?.[0]?.value || ''
      const label = v === '(not set)' ? '(not set)' : v.trim() === '' ? '(empty)' : v
      console.log(' ', label, ':', row.metricValues?.[0]?.value)
    }
  } catch (e: any) { console.log('error:', e.message?.slice(0, 80)) }

  // 4. cta_url
  console.log('\n=== 4. cta_url (3일, click_cta) ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range3d],
      dimensions: [{ name: 'customEvent:cta_url' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', stringFilter: { value: 'click_cta' } },
      },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 10,
    })
    for (const row of (r.rows || [])) {
      const v = row.dimensionValues?.[0]?.value || ''
      const label = v === '(not set)' ? '(not set)' : v.trim() === '' ? '(empty)' : v.slice(0, 60)
      console.log(' ', label, ':', row.metricValues?.[0]?.value)
    }
  } catch (e: any) { console.log('error:', e.message?.slice(0, 80)) }

  // 5. theater (GTM fix)
  console.log('\n=== 5. theater - GTM fix (3일, purchase) ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range3d],
      dimensions: [{ name: 'customEvent:theater' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', stringFilter: { value: 'purchase' } },
      },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 10,
    })
    for (const row of (r.rows || [])) {
      const v = row.dimensionValues?.[0]?.value || ''
      const label = v === '(not set)' ? '(not set)' : v.trim() === '' ? '(empty)' : v
      console.log(' ', label, ':', row.metricValues?.[0]?.value)
    }
  } catch (e: any) { console.log('error:', e.message?.slice(0, 80)) }

  // 6. theater_code normalize
  console.log('\n=== 6. theater_code normalize check (3일, purchase) ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range3d],
      dimensions: [{ name: 'customEvent:theater_code' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', stringFilter: { value: 'purchase' } },
      },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 15,
    })
    for (const row of (r.rows || [])) {
      const v = row.dimensionValues?.[0]?.value || ''
      if (v !== '(not set)') console.log(' ', v, ':', row.metricValues?.[0]?.value)
    }
  } catch (e: any) { console.log('error:', e.message?.slice(0, 80)) }

  // 7. app stream
  console.log('\n=== 7. App data stream ===\n')
  const [streams] = await adminClient.listDataStreams({ parent: 'properties/' + propertyId })
  for (const s of streams) {
    const type = s.type === 'WEB_DATA_STREAM' ? 'WEB' : s.type === 'IOS_APP_DATA_STREAM' ? 'iOS' : s.type === 'ANDROID_APP_DATA_STREAM' ? 'Android' : String(s.type)
    console.log(' ', type, '|', s.displayName)
  }

  // 8. sofitel purchase
  console.log('\n=== 8. Sofitel purchase (7일) ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range7d],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }, { name: 'purchaseRevenue' }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: 'sessionSource', stringFilter: { value: 'sofitel-seoul.com' } } },
            { filter: { fieldName: 'eventName', stringFilter: { value: 'purchase' } } },
          ],
        },
      },
    })
    if (r.rows?.length) {
      const rev = parseInt(r.rows[0].metricValues?.[1]?.value || '0')
      console.log(' purchase:', r.rows[0].metricValues?.[0]?.value, '| revenue:', rev.toLocaleString())
    } else {
      console.log(' purchase: 0')
    }
  } catch (e: any) { console.log('error:', e.message?.slice(0, 80)) }

  // 9. Custom Metrics (price, quantity)
  console.log('\n=== 9. Custom Metrics (price, quantity) ===\n')
  for (const m of ['price', 'quantity']) {
    try {
      const [r] = await client.runReport({
        property: 'properties/' + propertyId,
        dateRanges: [range3d],
        metrics: [{ name: 'customEvent:' + m }],
      })
      const val = r.rows?.[0]?.metricValues?.[0]?.value || '0'
      console.log(' ', m, ':', val)
    } catch { console.log(' ', m, ': error') }
  }
}

main().catch(e => console.error('FATAL:', e.message))
