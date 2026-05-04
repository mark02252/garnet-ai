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
const range = { startDate: '7daysAgo', endDate: 'today' }

async function main() {
  // 1. error message page
  console.log('=== error message page ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range],
      dimensions: [{ name: 'pagePath' }, { name: 'customEvent:cta_text' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: 'eventName', stringFilter: { value: 'click_cta' } } },
            { filter: { fieldName: 'customEvent:cta_text', stringFilter: { matchType: 'CONTAINS', value: 'not available' } } },
          ],
        },
      },
    })
    for (const row of (r.rows || [])) {
      console.log('  page:', row.dimensionValues?.[0]?.value)
      console.log('  text:', (row.dimensionValues?.[1]?.value || '').slice(0, 80))
      console.log('  count:', row.metricValues?.[0]?.value)
    }
    if (!r.rows?.length) console.log('  no data for english search, trying korean...')
  } catch (e: any) { console.log('error:', e.message?.slice(0, 100)) }

  // 2. payment page all CTAs
  console.log('\n=== /booking/payment all CTAs ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range],
      dimensions: [{ name: 'customEvent:cta_text' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: 'eventName', stringFilter: { value: 'click_cta' } } },
            { filter: { fieldName: 'pagePath', stringFilter: { value: '/booking/payment' } } },
          ],
        },
      },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 20,
    })
    for (const row of (r.rows || [])) {
      const text = (row.dimensionValues?.[0]?.value || '').slice(0, 80)
      console.log('  ', text, '|', row.metricValues?.[0]?.value, '|', row.metricValues?.[1]?.value, 'users')
    }
  } catch (e: any) { console.log('error:', e.message?.slice(0, 100)) }

  // 3. all pages - error related cta_text
  console.log('\n=== all error/alert CTA texts ===\n')
  try {
    const [r] = await client.runReport({
      property: 'properties/' + propertyId,
      dateRanges: [range],
      dimensions: [{ name: 'pagePath' }, { name: 'customEvent:cta_text' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: 'eventName', stringFilter: { value: 'click_cta' } } },
            { filter: { fieldName: 'customEvent:cta_text', stringFilter: { matchType: 'CONTAINS', value: 'alert' } } },
          ],
        },
      },
      limit: 10,
    })
    for (const row of (r.rows || [])) {
      console.log('  [' + row.dimensionValues?.[0]?.value + ']', (row.dimensionValues?.[1]?.value || '').slice(0, 60), ':', row.metricValues?.[0]?.value)
    }
    if (!r.rows?.length) console.log('  no alert data')
  } catch (e: any) { console.log('error:', e.message?.slice(0, 100)) }

  // 4. search for the exact error text with partial match
  console.log('\n=== search: cta_text contains "info" or "error" ===\n')
  for (const keyword of ['info', 'error', 'fail', 'home']) {
    try {
      const [r] = await client.runReport({
        property: 'properties/' + propertyId,
        dateRanges: [range],
        dimensions: [{ name: 'pagePath' }, { name: 'customEvent:cta_text' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          andGroup: {
            expressions: [
              { filter: { fieldName: 'eventName', stringFilter: { value: 'click_cta' } } },
              { filter: { fieldName: 'customEvent:cta_text', stringFilter: { matchType: 'CONTAINS', value: keyword } } },
            ],
          },
        },
        limit: 5,
      })
      if (r.rows?.length) {
        console.log('  keyword: "' + keyword + '"')
        for (const row of (r.rows || [])) {
          console.log('    [' + row.dimensionValues?.[0]?.value + ']', (row.dimensionValues?.[1]?.value || '').slice(0, 70), ':', row.metricValues?.[0]?.value)
        }
      }
    } catch {}
  }

  // 5. booking pages - all cta with page
  console.log('\n=== /booking/ pages - all status messages ===\n')
  for (const page of ['/booking/seat', '/booking/payment', '/booking/']) {
    try {
      const [r] = await client.runReport({
        property: 'properties/' + propertyId,
        dateRanges: [range],
        dimensions: [{ name: 'customEvent:cta_text' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          andGroup: {
            expressions: [
              { filter: { fieldName: 'eventName', stringFilter: { value: 'click_cta' } } },
              { filter: { fieldName: 'pagePath', stringFilter: { value: page } } },
            ],
          },
        },
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        limit: 15,
      })
      console.log(page + ':')
      for (const row of (r.rows || [])) {
        const text = (row.dimensionValues?.[0]?.value || '').slice(0, 70)
        console.log('  ', text, ':', row.metricValues?.[0]?.value)
      }
      console.log('')
    } catch {}
  }
}

main().catch(e => console.error('FATAL:', e.message))
