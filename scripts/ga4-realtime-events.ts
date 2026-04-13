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

  // Realtime 데이터 (최근 30분)
  console.log('=== 실시간 (최근 30분) 이벤트 ===')
  try {
    const [realtime] = await client.runRealtimeReport({
      property: propertyId,
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
    })
    for (const row of realtime.rows || []) {
      const name = row.dimensionValues?.[0]?.value || ''
      const count = Number(row.metricValues?.[0]?.value || 0)
      console.log(`  ${name.padEnd(30)} ${count.toLocaleString()} 회`)
    }
    if ((realtime.rows?.length ?? 0) === 0) console.log('  (이벤트 없음)')
  } catch (e: unknown) {
    console.log('  Realtime 조회 실패:', (e as Error).message)
  }

  // 오늘 전체 이벤트
  console.log('\n=== 오늘 (4/13) 이벤트 집계 ===')
  const [today] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: 'today', endDate: 'today' }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  })
  for (const row of today.rows || []) {
    const name = row.dimensionValues?.[0]?.value || ''
    const count = Number(row.metricValues?.[0]?.value || 0)
    console.log(`  ${name.padEnd(30)} ${count.toLocaleString()} 회`)
  }

  // 새 퍼널 이벤트 체크
  console.log('\n=== 새 퍼널 이벤트 상태 ===')
  const newEvents = ['view_item_list', 'view_item', 'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase']
  for (const ev of newEvents) {
    const row = (today.rows || []).find(r => r.dimensionValues?.[0]?.value === ev)
    const count = row ? Number(row.metricValues?.[0]?.value || 0) : 0
    const icon = count > 0 ? '✓' : '✗'
    console.log(`  ${icon} ${ev.padEnd(20)} ${count.toLocaleString()} 회`)
  }
}
main().catch(e => console.error('에러:', e.message))
