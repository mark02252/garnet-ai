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

  const [response] = await client.runReport({
    property: `properties/${process.env.GA4_PROPERTY_ID}`,
    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  })

  console.log('=== 최근 7일 GA4 이벤트 현황 ===')
  for (const row of response.rows || []) {
    const name = row.dimensionValues?.[0]?.value || ''
    const count = Number(row.metricValues?.[0]?.value || 0)
    console.log(`  ${name.padEnd(30)} ${count.toLocaleString()} 회`)
  }

  console.log('\n=== 구매 여정 핵심 이벤트 ===')
  const funnelEvents = ['view_item', 'add_to_cart', 'begin_checkout', 'add_payment_info', 'purchase']
  for (const ev of funnelEvents) {
    const found = (response.rows || []).find(r => r.dimensionValues?.[0]?.value === ev)
    const count = found ? Number(found.metricValues?.[0]?.value || 0) : 0
    const icon = count > 0 ? '✓' : '✗'
    console.log(`  ${icon} ${ev.padEnd(20)} ${count.toLocaleString()} 회`)
  }
}
main().catch(e => console.error('에러:', e.message))
