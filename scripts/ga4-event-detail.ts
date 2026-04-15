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

  // Realtime API로 새 이벤트의 상세 정보
  const targets = ['add_shipping_info', 'add_payment_info', 'view_item', 'begin_checkout', 'purchase']

  for (const eventName of targets) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`🔍 ${eventName}`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

    // Realtime은 도시/국가 등 제한적 차원만 지원. 디바이스별로 분할
    try {
      const [result] = await client.runRealtimeReport({
        property: propertyId,
        dimensions: [{ name: 'deviceCategory' }, { name: 'country' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            stringFilter: { value: eventName, matchType: 'EXACT' },
          },
        },
      })

      if ((result.rows?.length ?? 0) === 0) {
        console.log('  (발화 없음)')
        continue
      }

      for (const row of result.rows || []) {
        const device = row.dimensionValues?.[0]?.value || '-'
        const country = row.dimensionValues?.[1]?.value || '-'
        const count = row.metricValues?.[0]?.value || '0'
        console.log(`  ${count.padStart(4)}회 | ${device.padEnd(10)} | ${country}`)
      }
    } catch (e: unknown) {
      console.log(`  조회 실패: ${(e as Error).message}`)
    }
  }

  // 오늘 데이터는 Data API (일일 집계 API) 사용
  console.log('\n\n=== 오늘 (4/13) 이커머스 상세 ===')
  const [today] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: 'today', endDate: 'today' }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'eventValue' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: {
          values: ['view_item_list', 'view_item', 'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase'],
        },
      },
    },
  })

  console.log('┌─────────────────────┬──────────┬──────────────┐')
  console.log('│ 이벤트               │ 횟수      │ value 합계    │')
  console.log('├─────────────────────┼──────────┼──────────────┤')
  for (const row of today.rows || []) {
    const n = (row.dimensionValues?.[0]?.value || '').padEnd(20)
    const c = (row.metricValues?.[0]?.value || '0').padStart(6)
    const v = Number(row.metricValues?.[1]?.value || 0).toLocaleString().padStart(12)
    console.log(`│ ${n}│ ${c}회  │ ${v}원 │`)
  }
  console.log('└─────────────────────┴──────────┴──────────────┘')

  // 퍼널 이탈률
  console.log('\n=== 오늘 퍼널 이탈률 ===')
  const counts: Record<string, number> = {}
  for (const row of today.rows || []) {
    counts[row.dimensionValues?.[0]?.value || ''] = Number(row.metricValues?.[0]?.value || 0)
  }
  const stages = [
    ['view_item_list', '영화 목록 조회'],
    ['view_item', '예매 페이지 진입'],
    ['begin_checkout', '상영시간 선택'],
    ['add_shipping_info', '좌석 확정'],
    ['add_payment_info', '결제수단 선택'],
    ['purchase', '결제 완료'],
  ]
  let prev = 0
  for (const [key, label] of stages) {
    const c = counts[key] || 0
    if (prev > 0 && c > 0) {
      const dropRate = ((prev - c) / prev * 100).toFixed(1)
      const remainRate = (c / prev * 100).toFixed(1)
      console.log(`  ${label.padEnd(18)} ${String(c).padStart(5)}회  (이전 단계 대비 ${remainRate}% 진행, ${dropRate}% 이탈)`)
    } else {
      console.log(`  ${label.padEnd(18)} ${String(c).padStart(5)}회`)
    }
    if (c > 0) prev = c
  }
}

main().catch(e => console.error('Error:', e.message))
