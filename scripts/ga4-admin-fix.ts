import { readFileSync } from 'fs'
import { AnalyticsAdminServiceClient } from '@google-analytics/admin'

const envContent = readFileSync('/Users/rnr/Documents/New project/.env', 'utf-8')
for (const line of envContent.split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('='); if (eq === -1) continue
  const k = t.slice(0, eq); let v = t.slice(eq + 1)
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

const APPLY = process.argv.includes('--apply')

async function main() {
  console.log(APPLY ? '🔴 APPLY MODE' : '🟡 DRY RUN')
  console.log('')

  const client = new AnalyticsAdminServiceClient({
    credentials: {
      client_email: process.env.GA4_CLIENT_EMAIL!,
      private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    },
  })

  const parent = `properties/${process.env.GA4_PROPERTY_ID}`

  // 현재 Custom Dimensions 조회
  const [existingDims] = await client.listCustomDimensions({ parent })
  const existingParamNames = new Set(existingDims.map(d => d.parameterName))

  // 현재 Key Events 조회
  const [existingEvents] = await client.listKeyEvents({ parent })
  const existingKeyEvents = new Set(existingEvents.map(e => e.eventName))

  // ═══ Step 1: Custom Dimensions 추가 ═══
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📦 Step 1: Custom Dimensions 등록')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const requiredDims = [
    { parameterName: 'theater_code', displayName: '지점코드', description: 'GTM에서 전달하는 지점 식별 코드' },
    { parameterName: 'schedule_id', displayName: '상영스케줄ID', description: '상영 스케줄 고유 ID' },
    { parameterName: 'date', displayName: '상영일자', description: '상영 날짜' },
    { parameterName: 'payment_type', displayName: '결제수단', description: '카드/카카오페이/네이버페이 등' },
    { parameterName: 'refund_reason', displayName: '환불사유', description: '사용자 취소/시스템 취소/정책 환불 등' },
  ]

  for (const dim of requiredDims) {
    if (existingParamNames.has(dim.parameterName)) {
      console.log(`  ⏭  ${dim.parameterName} (${dim.displayName}) — 이미 등록됨`)
      continue
    }
    console.log(`  ➕ ${dim.parameterName} (${dim.displayName})`)
    if (APPLY) {
      await client.createCustomDimension({
        parent,
        customDimension: {
          parameterName: dim.parameterName,
          displayName: dim.displayName,
          description: dim.description,
          scope: 'EVENT',
        },
      })
      console.log(`     → 등록 완료`)
    }
  }

  // ═══ Step 2: Key Events 추가 ═══
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🎯 Step 2: Key Events (전환) 등록')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const requiredKeyEvents = [
    { eventName: 'generate_lead' },
    { eventName: 'add_payment_info' },
  ]

  for (const ke of requiredKeyEvents) {
    if (existingKeyEvents.has(ke.eventName)) {
      console.log(`  ⏭  ${ke.eventName} — 이미 등록됨`)
      continue
    }
    console.log(`  ➕ ${ke.eventName}`)
    if (APPLY) {
      await client.createKeyEvent({
        parent,
        keyEvent: {
          eventName: ke.eventName,
          countingMethod: 'ONCE_PER_EVENT',
        },
      })
      console.log(`     → 등록 완료`)
    }
  }

  // ═══ 최종 상태 ═══
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (APPLY) {
    console.log('✅ GA4 설정 업데이트 완료')
    console.log('   Custom Dimension은 등록 시점부터 앞으로의 데이터에만 적용됩니다.')
    console.log('   24~48시간 후 Data API로 조회 가능합니다.')
  } else {
    console.log('👀 Dry-run 완료. 실제 적용: npx tsx scripts/ga4-admin-fix.ts --apply')
  }
}

main().catch(e => console.error('Error:', e.message))
