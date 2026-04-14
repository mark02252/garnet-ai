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

async function main() {
  let client: InstanceType<typeof AnalyticsAdminServiceClient>
  try {
    client = new AnalyticsAdminServiceClient({
      credentials: {
        client_email: process.env.GA4_CLIENT_EMAIL!,
        private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      },
    })
  } catch {
    console.log('❌ @google-analytics/admin 패키지 없음. npm install @google-analytics/admin 필요')
    return
  }

  const propertyId = process.env.GA4_PROPERTY_ID!
  const parent = `properties/${propertyId}`

  console.log('=== GA4 Admin API 점검 ===\n')

  // 1. Custom Dimensions
  console.log('📦 등록된 Custom Dimensions:')
  try {
    const [dims] = await client.listCustomDimensions({ parent })
    if (dims.length === 0) {
      console.log('  (없음) ← ⚠️ theater_code, movie_id 등 미등록')
    } else {
      for (const d of dims) {
        console.log(`  ✓ ${d.parameterName} (${d.displayName}) [${d.scope}]`)
      }
    }
  } catch (e: unknown) {
    console.log(`  에러: ${(e as Error).message}`)
  }

  // 2. Custom Metrics
  console.log('\n📊 등록된 Custom Metrics:')
  try {
    const [metrics] = await client.listCustomMetrics({ parent })
    if (metrics.length === 0) {
      console.log('  (없음)')
    } else {
      for (const m of metrics) {
        console.log(`  ✓ ${m.parameterName} (${m.displayName})`)
      }
    }
  } catch (e: unknown) {
    console.log(`  에러: ${(e as Error).message}`)
  }

  // 3. Key Events (Conversions)
  console.log('\n🎯 등록된 Key Events (전환):')
  try {
    const [events] = await client.listKeyEvents({ parent })
    if (events.length === 0) {
      console.log('  (없음) ← ⚠️ purchase를 Key Event로 등록 필요')
    } else {
      for (const e of events) {
        console.log(`  ✓ ${e.eventName} (${e.countingMethod})`)
      }
    }
  } catch (e: unknown) {
    console.log(`  에러: ${(e as Error).message}`)
  }

  // 4. Data Streams
  console.log('\n🌐 Data Streams:')
  try {
    const [streams] = await client.listDataStreams({ parent })
    for (const s of streams) {
      console.log(`  ${s.type}: ${s.displayName} (${s.webStreamData?.measurementId || s.name})`)
    }
  } catch (e: unknown) {
    console.log(`  에러: ${(e as Error).message}`)
  }
}

main().catch(e => console.error(e.message))
