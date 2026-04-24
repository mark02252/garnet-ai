/**
 * GA4 theater_code 매핑 상태 전수 조사
 * 모든 코드가 올바른 이름으로 매핑되는지, 같은 지점이 다른 코드로 분산되는지 확인
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

// theater-mapping.ts에서 직접 import 대신 복사 (tsx 호환)
const THEATERS = [
  { raw: 'm001', encrypted: '_CSB5mK8S56Y6rtPuUsCzg', name: '배식당' },
  { raw: 'm002', encrypted: '4PpUEbOIIpKP77uk-TJqVA', name: '밀크북 극장' },
  { raw: 'm005', encrypted: 'CDqH_56H0Pv-IMLVBUSzhQ', name: '오르페오 한남' },
  { raw: 'm007', encrypted: 'IOjwGYNKXo1fGvArICxewA', name: '안영채 X 모노플렉스' },
  { raw: 'm010', encrypted: 'Wz_XX2o2vOf5A_muU-Q6pQ', name: '글로스터 호텔 킨텍스 X 모노플렉스' },
  { raw: 'm011', encrypted: 'xjOhtCQQsZpjiYW-Cp_otw', name: '민속촌자동차극장' },
  { raw: 'm013', encrypted: 'BPiU-cl9iwteZCKh4DvVqA', name: '디에이치시네마' },
  { raw: 'm014', encrypted: 'd7RFzAy8TmO5X_PgdL3ItQ', name: '씨네라운지 바이 윤담재' },
  { raw: 'm015', encrypted: 'TVajDsDQM0V1-7lyeTqwiw', name: '현대자동차 남양연구소 시네마' },
  { raw: 'm016', encrypted: '58TUrVa4uwLlAHGJfsMwqQ', name: 'JSW씨네라운지' },
  { raw: 'm017', encrypted: 'oxxN6Ykd3WXh-OXVTBuUFA', name: '포포시네마' },
  { raw: 'm018', encrypted: '9A9QVsjgL9Uon0pYVXdn8g', name: '왕길역 로열파크시티 시네마 라운지' },
  { raw: 'm019', encrypted: 'cbsfj2-VDW3z6QdXDEXMqQ', name: '모노플렉스앳라이즈' },
  { raw: 'm020', encrypted: 'lpd2ikyjgg_u6GTJhV7R6w', name: '의성작은영화관' },
  { raw: 'm021', encrypted: '9qb7xjNj6LeVFpewhwCR2A', name: '안계행복영화관' },
  { raw: 'm022', encrypted: 'kczimCX9e3cWY5y3YlHs5w', name: '검암역 로열파크씨티 시네마 1' },
  { raw: 'm023', encrypted: 'C9n-pgIg-6MfD21IYvIYLg', name: '검암역 로열파크씨티 시네마 2' },
  { raw: 'm024', encrypted: 'FdN0zA2JD6B4fEvSNxjneg', name: '클럽 자이안 시네마' },
  { raw: 'm025', encrypted: 'aKcYpbrdi7xGFYM3qiZAKg', name: '파크아너스 시네마' },
  { raw: 'm026', encrypted: 'u8jLnWKaziDSUHFh94szbQ', name: '페를라 시네마' },
  { raw: 'm027', encrypted: 'RKcvRpFZO0MzanqAZkZmDA', name: '제천문화극장' },
  { raw: 'm028', encrypted: '4o5pZDD8Yky0fXm_ye6IPQ', name: '모노플렉스 바이 이비스 스타일 앰배서더 강남' },
  { raw: 'm029', encrypted: 'akEUOvc3IOOUUGjVAXMO0Q', name: '시네마 어나드범어' },
  { raw: 'o001', encrypted: 'ln1kWhzZIvqUF3F7igdRGg', name: '소피텔' },
]

const lookup = new Map<string, string>()
for (const t of THEATERS) {
  lookup.set(t.raw, t.name)
  lookup.set(t.encrypted, t.name)
  lookup.set(t.name, t.name)
}
lookup.set('모노플렉스 앳 라이즈', '모노플렉스앳라이즈')
lookup.set('씨네라운지 바이 운담채', '씨네라운지 바이 윤담재')
lookup.set('페틀라 시네마', '페를라 시네마')

function mapCode(code: string): string {
  return lookup.get(code) || code
}

async function main() {
  const client = new BetaAnalyticsDataClient({
    credentials: {
      client_email: process.env.GA4_CLIENT_EMAIL!,
      private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    },
  })
  const propertyId = `properties/${process.env.GA4_PROPERTY_ID}`

  // 1. 최근 30일 purchase 이벤트의 모든 theater_code
  console.log('=== GA4 theater_code 매핑 전수조사 (30일) ===\n')

  const [resp] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'customEvent:theater_code' }],
    metrics: [{ name: 'eventCount' }, { name: 'eventValue' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: 'purchase', matchType: 'EXACT' } },
    },
    orderBys: [{ metric: { metricName: 'eventValue' }, desc: true }],
    limit: 100,
  })

  console.log('▸ 모든 theater_code 값 + 매핑 결과:')
  console.log('─'.repeat(100))
  console.log(`${'GA4 코드'.padEnd(35)} │ ${'매핑 결과'.padEnd(35)} │ ${'건수'.padStart(5)} │ ${'매출'.padStart(12)} │ 상태`)
  console.log('─'.repeat(100))

  const unmapped: string[] = []
  const nameToRows = new Map<string, Array<{ code: string; count: number; revenue: number }>>()

  for (const row of resp.rows || []) {
    const code = row.dimensionValues?.[0]?.value || ''
    const count = Number(row.metricValues?.[0]?.value || 0)
    const revenue = Math.round(Number(row.metricValues?.[1]?.value || 0))
    const mapped = mapCode(code)
    const isMapped = mapped !== code
    const isNotSet = !code || code === '(not set)'

    let status = '✅ 매핑됨'
    if (isNotSet) status = '⚠️  (not set)'
    else if (!isMapped) {
      status = '❌ 미매핑'
      unmapped.push(code)
    }

    console.log(`${(code || '(빈값)').padEnd(35)} │ ${mapped.padEnd(35)} │ ${String(count).padStart(5)} │ ₩${revenue.toLocaleString().padStart(10)} │ ${status}`)

    // 같은 이름으로 매핑되는 코드 그룹핑
    const name = isMapped ? mapped : code
    if (!nameToRows.has(name)) nameToRows.set(name, [])
    nameToRows.get(name)!.push({ code, count, revenue })
  }

  // 2. 같은 지점인데 다른 코드로 분산된 경우 표시
  console.log('\n\n▸ 동일 지점 분산 집계 (같은 이름, 다른 코드):')
  console.log('─'.repeat(80))
  let hasDuplicate = false
  for (const [name, rows] of nameToRows) {
    if (rows.length > 1) {
      hasDuplicate = true
      const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
      const totalCount = rows.reduce((s, r) => s + r.count, 0)
      console.log(`\n  🔀 ${name} (합산: ${totalCount}건, ₩${totalRevenue.toLocaleString()})`)
      for (const r of rows) {
        console.log(`     └─ ${r.code.padEnd(30)} │ ${r.count}건 │ ₩${r.revenue.toLocaleString()}`)
      }
    }
  }
  if (!hasDuplicate) console.log('  ✅ 분산 없음')

  // 3. 미매핑 코드 목록
  if (unmapped.length > 0) {
    console.log('\n\n▸ 미매핑 코드 (theater-mapping.ts에 추가 필요):')
    console.log('─'.repeat(50))
    for (const code of unmapped) {
      console.log(`  ❌ "${code}"`)
    }
  } else {
    console.log('\n\n✅ 미매핑 코드 없음')
  }

  // 4. 모든 이벤트(purchase 외)에서도 theater_code 확인
  console.log('\n\n▸ purchase 외 이벤트의 theater_code (상위 20):')
  const [allEvents] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'eventName' }, { name: 'customEvent:theater_code' }],
    metrics: [{ name: 'eventCount' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  })
  const seen = new Set<string>()
  for (const row of allEvents.rows || []) {
    const event = row.dimensionValues?.[0]?.value || ''
    const code = row.dimensionValues?.[1]?.value || ''
    if (!code || code === '(not set)') continue
    const mapped = mapCode(code)
    const key = `${event}|${code}`
    if (seen.has(key)) continue
    seen.add(key)
    const isMapped = mapped !== code
    if (!isMapped) {
      console.log(`  ❌ [${event}] ${code} → 미매핑`)
    }
  }
  if ([...seen].length === 0) console.log('  (theater_code가 있는 이벤트 없음)')
}

main().catch(e => console.error('Error:', e.message))
