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
  const events = ['view_item_list', 'view_item', 'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase']

  // 날짜별 이벤트 (최근 5일)
  const [resp] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: '5daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'date' }, { name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'eventValue' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: events },
      },
    },
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  })

  // 날짜별로 그룹핑
  const byDate: Record<string, Record<string, { count: number; value: number }>> = {}
  for (const row of resp.rows || []) {
    const date = row.dimensionValues?.[0]?.value || ''
    const event = row.dimensionValues?.[1]?.value || ''
    const count = Number(row.metricValues?.[0]?.value || 0)
    const value = Number(row.metricValues?.[1]?.value || 0)
    if (!byDate[date]) byDate[date] = {}
    byDate[date][event] = { count, value }
  }

  console.log('=== 최근 5일 이커머스 이벤트 일별 추이 ===\n')
  console.log('날짜       │ view_item_list │ view_item │ begin_checkout │ add_shipping │ add_payment │ purchase  │ 매출')
  console.log('───────────┼────────────────┼───────────┼────────────────┼──────────────┼─────────────┼───────────┼──────────')

  const sortedDates = Object.keys(byDate).sort()
  for (const date of sortedDates) {
    const d = byDate[date]
    const vil = d['view_item_list']?.count ?? 0
    const vi = d['view_item']?.count ?? 0
    const bc = d['begin_checkout']?.count ?? 0
    const asi = d['add_shipping_info']?.count ?? 0
    const api = d['add_payment_info']?.count ?? 0
    const pu = d['purchase']?.count ?? 0
    const rev = d['purchase']?.value ?? 0
    console.log(
      `${date}  │ ${String(vil).padStart(14)} │ ${String(vi).padStart(9)} │ ${String(bc).padStart(14)} │ ${String(asi).padStart(12)} │ ${String(api).padStart(11)} │ ${String(pu).padStart(9)} │ ₩${rev.toLocaleString()}`
    )
  }

  // 요약
  console.log('\n=== 진단 ===')
  const today = sortedDates[sortedDates.length - 1]
  const yesterday = sortedDates.length >= 2 ? sortedDates[sortedDates.length - 2] : null

  if (yesterday) {
    const yData = byDate[yesterday]
    console.log(`\n어제 (${yesterday}):`)
    console.log(`  purchase: ${yData['purchase']?.count ?? 0}회, 매출: ₩${(yData['purchase']?.value ?? 0).toLocaleString()}`)
    console.log(`  add_shipping_info: ${yData['add_shipping_info']?.count ?? 0}회`)
    console.log(`  add_payment_info: ${yData['add_payment_info']?.count ?? 0}회`)
  }
}

main().catch(e => console.error(e.message))
