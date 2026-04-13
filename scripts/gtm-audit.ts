import { readFileSync, writeFileSync } from 'fs'
import { google } from 'googleapis'

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
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GA4_CLIENT_EMAIL!,
      private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    },
    scopes: [
      'https://www.googleapis.com/auth/tagmanager.edit.containers',
      'https://www.googleapis.com/auth/tagmanager.readonly',
    ],
  })
  const client = await auth.getClient()
  const gtm = google.tagmanager({ version: 'v2', auth: client as any })

  const parent = `accounts/${process.env.GTM_ACCOUNT_ID}/containers/${process.env.GTM_CONTAINER_ID}/workspaces/${process.env.GTM_WORKSPACE_ID}`

  const [tagsRes, triggersRes, variablesRes] = await Promise.all([
    gtm.accounts.containers.workspaces.tags.list({ parent }),
    gtm.accounts.containers.workspaces.triggers.list({ parent }),
    gtm.accounts.containers.workspaces.variables.list({ parent }),
  ])

  const tags = tagsRes.data.tag ?? []
  const triggers = triggersRes.data.trigger ?? []
  const variables = variablesRes.data.variable ?? []

  // 트리거 ID → 이름 맵
  const triggerMap = new Map(triggers.map(t => [t.triggerId!, t]))

  // 스냅샷 저장
  writeFileSync(
    '/Users/rnr/Documents/New project/.garnet-config/gtm-snapshot.json',
    JSON.stringify({ tags, triggers, variables }, null, 2),
  )

  console.log('=== GTM AUDIT REPORT ===\n')

  console.log('📋 태그 (' + tags.length + '개)')
  for (const tag of tags) {
    const tType = tag.type // gaawe = GA4 Event
    const tName = tag.name
    const firingTriggerNames = (tag.firingTriggerId ?? []).map(id => {
      const t = triggerMap.get(id)
      return t ? `${t.name} [${t.type}]` : `unknown(${id})`
    }).join(', ')

    // 이벤트 이름 파라미터
    const eventName = tag.parameter?.find(p => p.key === 'eventName')?.value || ''
    const mark = eventName ? ` → "${eventName}"` : ''

    console.log(`  ${tName} (${tType})${mark}`)
    console.log(`    트리거: ${firingTriggerNames || '(없음)'}`)
  }

  console.log('\n🎯 트리거 (' + triggers.length + '개)')
  for (const trig of triggers) {
    const extra = trig.customEventFilter?.[0]?.parameter?.find(p => p.key === 'arg1')?.value
    const extraText = extra ? ` (event: "${extra}")` : ''
    console.log(`  ${trig.name} [${trig.type}]${extraText}`)
  }

  console.log('\n📦 변수 (' + variables.length + '개)')
  for (const v of variables) {
    const dlvName = v.parameter?.find(p => p.key === 'name')?.value
    console.log(`  ${v.name} [${v.type}]${dlvName ? ` → ${dlvName}` : ''}`)
  }

  // 진단
  console.log('\n\n=== 🔍 진단 ===\n')

  const required = ['view_item', 'view_item_list', 'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase']
  const issues: string[] = []

  // GA4 이벤트 태그 체크
  for (const ev of required) {
    const matchingTags = tags.filter(tag => {
      const evName = tag.parameter?.find(p => p.key === 'eventName')?.value
      return evName === ev || tag.name?.toLowerCase().includes(ev)
    })

    if (matchingTags.length === 0) {
      issues.push(`❌ ${ev}: 태그 없음 (생성 필요)`)
      continue
    }

    for (const tag of matchingTags) {
      const triggerNames = (tag.firingTriggerId ?? []).map(id => triggerMap.get(id))
      const hasPageViewTrigger = triggerNames.some(t => t?.type === 'pageview' || t?.type === 'pageView')
      const hasCustomEventTrigger = triggerNames.some(t => t?.type === 'customEvent')

      if (hasPageViewTrigger) {
        issues.push(`⚠️  ${ev} (${tag.name}): Page View 트리거 사용 중 → Custom Event로 변경 필요`)
      } else if (!hasCustomEventTrigger && (tag.firingTriggerId?.length ?? 0) > 0) {
        issues.push(`⚠️  ${ev} (${tag.name}): Custom Event 트리거 아님 → 확인 필요`)
      }
    }
  }

  // 필수 변수 체크
  const requiredVars = [
    'ecommerce.currency', 'ecommerce.value', 'ecommerce.items',
    'ecommerce.payment_type', 'ecommerce.transaction_id',
  ]
  const varNames = variables.map(v => v.parameter?.find(p => p.key === 'name')?.value || '')
  for (const rv of requiredVars) {
    if (!varNames.includes(rv)) {
      issues.push(`📦 DLV "${rv}" 변수 없음 (생성 필요)`)
    }
  }

  if (issues.length === 0) {
    console.log('✅ 모든 세팅이 정상입니다!')
  } else {
    console.log(`문제 ${issues.length}건 발견:\n`)
    for (const i of issues) console.log(`  ${i}`)
  }

  console.log('\n💾 스냅샷 저장: .garnet-config/gtm-snapshot.json')
}

main().catch(e => console.error('Error:', e.message))
