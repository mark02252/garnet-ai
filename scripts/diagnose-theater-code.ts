/**
 * theater_code 누락 원인 정밀 진단
 * - 어떤 페이지에서 결제가 발생하는지
 * - 어떤 channel/source에서 누락 비율이 높은지
 * - 시간대별 패턴
 * - GTM 변경 전후 비교
 */
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

  console.log('=== theater_code 누락 정밀 진단 ===\n')

  // 1. 결제 발생 페이지 확인 (pagePath)
  console.log('▸ 1. 결제가 발생한 페이지 (pagePath)')
  const [byPage] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }, { name: 'customEvent:theater_code' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: 'purchase', matchType: 'EXACT' } },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  })
  for (const row of byPage.rows || []) {
    const page = row.dimensionValues?.[0]?.value || ''
    const code = row.dimensionValues?.[1]?.value || ''
    const cnt = row.metricValues?.[0]?.value || '0'
    const mark = !code || code === '(not set)' ? ' ⚠️' : ' ✓'
    console.log(`  ${(page || '(없음)').slice(0, 50).padEnd(50)} | ${(code || '(빈값)').padEnd(15)} | ${cnt}회${mark}`)
  }

  // 2. GTM 변경 전(4/12 이전) vs 후(4/13 이후) 비교
  console.log('\n▸ 2. GTM 변경 전후 비교')
  const periods = [
    { label: 'GTM 변경 전 (4/06~4/12)', start: '10daysAgo', end: '4daysAgo' },
    { label: 'GTM 변경 후 (4/13~today)', start: '3daysAgo', end: 'today' },
  ]
  for (const period of periods) {
    const [resp] = await client.runReport({
      property: propertyId,
      dateRanges: [{ startDate: period.start, endDate: period.end }],
      dimensions: [{ name: 'customEvent:theater_code' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: { fieldName: 'eventName', stringFilter: { value: 'purchase', matchType: 'EXACT' } },
      },
    })
    let total = 0, mapped = 0, unmapped = 0
    for (const row of resp.rows || []) {
      const code = row.dimensionValues?.[0]?.value || ''
      const cnt = Number(row.metricValues?.[0]?.value || 0)
      total += cnt
      if (!code || code === '(not set)') unmapped += cnt
      else mapped += cnt
    }
    const ratio = total > 0 ? (unmapped / total * 100).toFixed(1) : '0'
    console.log(`  ${period.label}`)
    console.log(`    매핑됨: ${mapped} | 미분류: ${unmapped} | 미분류율: ${ratio}%`)
  }

  // 3. 매핑 지점 vs 미분류 지점의 시간대 비교
  console.log('\n▸ 3. 시간대별 매핑/미분류 비율 (최근 7일)')
  const [byHour] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'hour' }, { name: 'customEvent:theater_code' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: 'purchase', matchType: 'EXACT' } },
    },
  })
  const hourMap: Record<string, { mapped: number; unmapped: number }> = {}
  for (const row of byHour.rows || []) {
    const hour = row.dimensionValues?.[0]?.value || '0'
    const code = row.dimensionValues?.[1]?.value || ''
    const cnt = Number(row.metricValues?.[0]?.value || 0)
    if (!hourMap[hour]) hourMap[hour] = { mapped: 0, unmapped: 0 }
    if (!code || code === '(not set)') hourMap[hour].unmapped += cnt
    else hourMap[hour].mapped += cnt
  }
  const sortedHours = Object.keys(hourMap).sort((a, b) => Number(a) - Number(b))
  for (const h of sortedHours) {
    const { mapped, unmapped } = hourMap[h]
    const total = mapped + unmapped
    const ratio = total > 0 ? (unmapped / total * 100).toFixed(0) : '0'
    const bar = '█'.repeat(Math.min(20, Math.floor(unmapped / 2)))
    console.log(`  ${h.padStart(2)}시 | 매핑 ${String(mapped).padStart(3)} | 미분류 ${String(unmapped).padStart(3)} (${ratio.padStart(3)}%) ${bar}`)
  }

  // 4. 결제 직전 이벤트 (add_payment_info) theater_code 비교
  console.log('\n▸ 4. add_payment_info 단계의 theater_code 매핑 상태')
  const [byPayment] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'customEvent:theater_code' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: 'add_payment_info', matchType: 'EXACT' } },
    },
  })
  for (const row of byPayment.rows || []) {
    const code = row.dimensionValues?.[0]?.value || ''
    const cnt = row.metricValues?.[0]?.value || '0'
    const mark = !code || code === '(not set)' ? ' ⚠️' : ' ✓'
    console.log(`  ${(code || '(빈값)').padEnd(15)} | ${cnt}회${mark}`)
  }
}

main().catch(e => console.error('Error:', e.message))
