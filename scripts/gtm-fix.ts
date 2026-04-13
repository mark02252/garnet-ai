/**
 * GTM 일괄 수정 스크립트
 *
 * 작업:
 *   1. 누락된 Custom Event 트리거 생성 (5개)
 *   2. 기존 태그 3개의 트리거를 Page View → Custom Event로 교체
 *      + sendEcommerceData 활성화 + 잘못된 item_name=Page_Title 제거
 *   3. 신규 태그 2개 생성 (add_shipping_info, add_payment_info)
 *   4. 기존 GA4_purchase 태그 보강 (sendEcommerceData 활성화, item_name 수정)
 *
 * 실행:
 *   - Dry-run: npx tsx scripts/gtm-fix.ts
 *   - Apply:   npx tsx scripts/gtm-fix.ts --apply
 */

import { readFileSync } from 'fs'
import { google, tagmanager_v2 } from 'googleapis'

// .env 로드
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

const APPLY = process.argv.includes('--apply')

const ACCOUNT = process.env.GTM_ACCOUNT_ID!
const CONTAINER = process.env.GTM_CONTAINER_ID!
const WORKSPACE = process.env.GTM_WORKSPACE_ID!
const PARENT = `accounts/${ACCOUNT}/containers/${CONTAINER}/workspaces/${WORKSPACE}`

// 필요한 Custom Event 트리거 정의
const REQUIRED_TRIGGERS = [
  { name: 'CE - view_item', eventName: 'view_item' },
  { name: 'CE - view_item_list', eventName: 'view_item_list' },
  { name: 'CE - begin_checkout', eventName: 'begin_checkout' },
  { name: 'CE - add_shipping_info', eventName: 'add_shipping_info' },
  { name: 'CE - add_payment_info', eventName: 'add_payment_info' },
]

// 기존 태그 → 새 트리거 매핑 (Page View 제거)
const TAG_TRIGGER_REMAP = [
  { tagName: 'GA4_view_item', newTrigger: 'CE - view_item' },
  { tagName: 'GA4_view_item_list', newTrigger: 'CE - view_item_list' },
  { tagName: 'GA4_begin_checkout', newTrigger: 'CE - begin_checkout' },
]

// 신규 태그 정의 (GA4_purchase 구조 복제 + 이벤트명/트리거만 변경)
const NEW_TAGS = [
  { name: 'GA4_add_shipping_info', eventName: 'add_shipping_info', triggerName: 'CE - add_shipping_info' },
  { name: 'GA4_add_payment_info', eventName: 'add_payment_info', triggerName: 'CE - add_payment_info' },
]

async function main() {
  console.log(APPLY ? '🔴 APPLY MODE — 실제 변경 수행' : '🟡 DRY RUN — 변경 미리보기만')
  console.log('')

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

  // 현재 상태 조회
  const [tagsRes, triggersRes] = await Promise.all([
    gtm.accounts.containers.workspaces.tags.list({ parent: PARENT }),
    gtm.accounts.containers.workspaces.triggers.list({ parent: PARENT }),
  ])
  const tags = tagsRes.data.tag ?? []
  const triggers = triggersRes.data.trigger ?? []

  const triggerByName = new Map<string, tagmanager_v2.Schema$Trigger>(
    triggers.map(t => [t.name!, t]),
  )
  const tagByName = new Map<string, tagmanager_v2.Schema$Tag>(
    tags.map(t => [t.name!, t]),
  )

  // === 1. 트리거 생성 ===
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📌 Step 1: Custom Event 트리거 생성')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const newTriggerIds = new Map<string, string>()

  for (const t of REQUIRED_TRIGGERS) {
    const existing = triggerByName.get(t.name)
    if (existing) {
      console.log(`  ⏭  ${t.name} (이미 존재, ID ${existing.triggerId})`)
      newTriggerIds.set(t.name, existing.triggerId!)
      continue
    }

    console.log(`  ➕ ${t.name} (event: "${t.eventName}")`)

    if (APPLY) {
      const resp = await gtm.accounts.containers.workspaces.triggers.create({
        parent: PARENT,
        requestBody: {
          name: t.name,
          type: 'customEvent',
          customEventFilter: [
            {
              type: 'equals',
              parameter: [
                { type: 'template', key: 'arg0', value: '{{_event}}' },
                { type: 'template', key: 'arg1', value: t.eventName },
              ],
            },
          ],
        },
      })
      newTriggerIds.set(t.name, resp.data.triggerId!)
      console.log(`     → 생성 완료 (ID ${resp.data.triggerId})`)
    }
  }

  // === 2. 기존 태그 수정 ===
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📌 Step 2: 기존 태그 트리거 교체 + 정리')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  for (const remap of TAG_TRIGGER_REMAP) {
    const tag = tagByName.get(remap.tagName)
    if (!tag) {
      console.log(`  ✗ ${remap.tagName}: 태그 없음`)
      continue
    }

    const newTrigId = newTriggerIds.get(remap.newTrigger)
    if (!newTrigId && APPLY) {
      console.log(`  ✗ ${remap.tagName}: 새 트리거 ID 없음`)
      continue
    }

    console.log(`  ✏️  ${remap.tagName}`)
    console.log(`     트리거: ${tag.firingTriggerId?.join(',')} → ${newTrigId || '(dry-run)'} (${remap.newTrigger})`)
    console.log(`     sendEcommerceData: false → true`)
    console.log(`     item_name=Page_Title 매핑 제거`)

    if (APPLY && newTrigId) {
      const updated = sanitizeGA4EventTag(tag, newTrigId)
      await gtm.accounts.containers.workspaces.tags.update({
        path: tag.path!,
        requestBody: updated,
      })
      console.log(`     → 수정 완료`)
    }
  }

  // === 3. 신규 태그 생성 ===
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📌 Step 3: 신규 이벤트 태그 생성')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const purchaseTag = tagByName.get('GA4_purchase')
  if (!purchaseTag) {
    console.log('  ✗ GA4_purchase 태그를 찾을 수 없어 신규 태그 생성 불가')
  } else {
    for (const nt of NEW_TAGS) {
      if (tagByName.has(nt.name)) {
        console.log(`  ⏭  ${nt.name} (이미 존재)`)
        continue
      }

      const trigId = newTriggerIds.get(nt.triggerName)
      console.log(`  ➕ ${nt.name} (event: "${nt.eventName}", trigger: ${nt.triggerName})`)

      if (APPLY && trigId) {
        const body = cloneAsNewTag(purchaseTag, nt.name, nt.eventName, trigId)
        const created = await gtm.accounts.containers.workspaces.tags.create({
          parent: PARENT,
          requestBody: body,
        })
        console.log(`     → 생성 완료 (ID ${created.data.tagId})`)
      }
    }
  }

  // === 4. GA4_purchase 보강 ===
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📌 Step 4: GA4_purchase 태그 보강')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (purchaseTag) {
    console.log(`  ✏️  GA4_purchase`)
    console.log(`     sendEcommerceData: false → true`)
    console.log(`     item_name=Page_Title 매핑 제거 (프론트의 ecommerce.items로 대체됨)`)

    if (APPLY) {
      const updated = sanitizeGA4EventTag(purchaseTag, purchaseTag.firingTriggerId?.[0])
      await gtm.accounts.containers.workspaces.tags.update({
        path: purchaseTag.path!,
        requestBody: updated,
      })
      console.log(`     → 수정 완료`)
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (APPLY) {
    console.log('✅ 모든 변경사항 적용 완료. Preview 모드로 테스트 후 Publish 필요.')
    console.log(`   Workspace: https://tagmanager.google.com/#/container/accounts/${ACCOUNT}/containers/${CONTAINER}/workspaces/${WORKSPACE}`)
  } else {
    console.log('👀 Dry-run 완료. 실제 적용하려면: npx tsx scripts/gtm-fix.ts --apply')
  }
}

/** GA4 Event 태그 정리: sendEcommerceData=true, Page_Title 매핑 제거 */
function sanitizeGA4EventTag(
  tag: tagmanager_v2.Schema$Tag,
  triggerIdOverride?: string,
): tagmanager_v2.Schema$Tag {
  const newParams = (tag.parameter || []).map(p => {
    if (p.key === 'sendEcommerceData') {
      return { ...p, type: 'boolean', value: 'true' }
    }
    if (p.key === 'eventSettingsTable') {
      const filtered = (p.list || []).filter(item => {
        const paramKey = item.map?.find(m => m.key === 'parameter')?.value
        const paramValue = item.map?.find(m => m.key === 'parameterValue')?.value
        // item_name = {{Page_Title}} 제거
        if (paramKey === 'item_name' && paramValue === '{{Page_Title}}') return false
        return true
      })
      return { ...p, list: filtered }
    }
    return p
  })

  // sendEcommerceData가 아예 없으면 추가
  if (!newParams.some(p => p.key === 'sendEcommerceData')) {
    newParams.unshift({ type: 'boolean', key: 'sendEcommerceData', value: 'true' })
  }

  return {
    ...tag,
    parameter: newParams,
    firingTriggerId: triggerIdOverride ? [triggerIdOverride] : tag.firingTriggerId,
  }
}

/** GA4_purchase를 템플릿으로 신규 태그 생성 */
function cloneAsNewTag(
  source: tagmanager_v2.Schema$Tag,
  newName: string,
  newEventName: string,
  newTriggerId: string,
): tagmanager_v2.Schema$Tag {
  const sanitized = sanitizeGA4EventTag(source)
  const newParams = (sanitized.parameter || []).map(p => {
    if (p.key === 'eventName') {
      return { ...p, value: newEventName }
    }
    return p
  })

  return {
    name: newName,
    type: sanitized.type,
    parameter: newParams,
    firingTriggerId: [newTriggerId],
    tagFiringOption: sanitized.tagFiringOption || 'oncePerEvent',
    consentSettings: sanitized.consentSettings,
  }
}

main().catch(e => {
  console.error('Error:', e.message)
  console.error(e)
  process.exit(1)
})
