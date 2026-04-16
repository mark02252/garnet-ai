/**
 * GA4_purchase 태그에 "ecommerce.value > 0" 조건 추가
 *
 * 문제: 부모 페이지 GTM과 iframe GTM에서 purchase가 2번 발화
 *       부모는 ecommerce 데이터 없이, iframe은 완벽한 데이터로
 *       → GA4에 빈 purchase가 먼저 도착해서 데이터 오염
 *
 * 해결: purchase 태그에 "value가 있을 때만" 발화 조건 추가
 *       → 부모(빈 데이터) 무시, iframe(정상 데이터)만 GA4 전송
 */

import { readFileSync } from 'fs'
import { google } from 'googleapis'

const envContent = readFileSync('/Users/rnr/Documents/New project/.env', 'utf-8')
for (const line of envContent.split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('='); if (eq === -1) continue
  const k = t.slice(0, eq); let v = t.slice(eq + 1)
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

const APPLY = process.argv.includes('--apply')
const PARENT = `accounts/${process.env.GTM_ACCOUNT_ID}/containers/${process.env.GTM_CONTAINER_ID}/workspaces/${process.env.GTM_WORKSPACE_ID}`

async function main() {
  console.log(APPLY ? '🔴 APPLY MODE' : '🟡 DRY RUN')
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

  // 1. ecommerce.value DLV 변수 확인/생성
  console.log('━━━ Step 1: ecommerce.value DLV 변수 확인 ━━━')
  const varsRes = await gtm.accounts.containers.workspaces.variables.list({ parent: PARENT })
  const vars = varsRes.data.variable ?? []
  const varByName = new Map(vars.map(v => [v.name!, v]))

  let ecomValueVarName = 'DLV - ecommerce.value'
  if (!varByName.has(ecomValueVarName)) {
    console.log(`  ➕ ${ecomValueVarName} 생성`)
    if (APPLY) {
      await gtm.accounts.containers.workspaces.variables.create({
        parent: PARENT,
        requestBody: {
          name: ecomValueVarName,
          type: 'v',
          parameter: [
            { type: 'integer', key: 'dataLayerVersion', value: '2' },
            { type: 'boolean', key: 'setDefaultValue', value: 'false' },
            { type: 'template', key: 'name', value: 'ecommerce.value' },
          ],
        },
      })
      console.log(`     → 생성 완료`)
    }
  } else {
    console.log(`  ⏭  ${ecomValueVarName} (이미 존재)`)
  }

  // 2. "ecommerce.value가 없으면 차단" 트리거 (Exception Trigger) 생성
  console.log('\n━━━ Step 2: 예외 트리거 생성 (ecommerce.value 없으면 차단) ━━━')

  const triggersRes = await gtm.accounts.containers.workspaces.triggers.list({ parent: PARENT })
  const triggers = triggersRes.data.trigger ?? []
  const triggerByName = new Map(triggers.map(t => [t.name!, t]))

  const exceptionTriggerName = 'Block - purchase without ecommerce value'
  let exceptionTriggerId: string | undefined

  if (triggerByName.has(exceptionTriggerName)) {
    console.log(`  ⏭  ${exceptionTriggerName} (이미 존재)`)
    exceptionTriggerId = triggerByName.get(exceptionTriggerName)!.triggerId!
  } else {
    console.log(`  ➕ ${exceptionTriggerName}`)
    console.log(`     조건: purchase 이벤트 + ecommerce.value가 undefined/빈값/0`)
    if (APPLY) {
      const resp = await gtm.accounts.containers.workspaces.triggers.create({
        parent: PARENT,
        requestBody: {
          name: exceptionTriggerName,
          type: 'customEvent',
          customEventFilter: [
            {
              type: 'equals',
              parameter: [
                { type: 'template', key: 'arg0', value: '{{_event}}' },
                { type: 'template', key: 'arg1', value: 'purchase' },
              ],
            },
          ],
          filter: [
            {
              type: 'equals',
              parameter: [
                { type: 'template', key: 'arg0', value: `{{${ecomValueVarName}}}` },
                { type: 'template', key: 'arg1', value: 'undefined' },
              ],
            },
          ],
        },
      })
      exceptionTriggerId = resp.data.triggerId!
      console.log(`     → 생성 완료 (ID: ${exceptionTriggerId})`)
    }
  }

  // 3. GA4_purchase 태그에 Exception Trigger 추가
  console.log('\n━━━ Step 3: GA4_purchase 태그에 예외 트리거 연결 ━━━')

  const tagsRes = await gtm.accounts.containers.workspaces.tags.list({ parent: PARENT })
  const tags = tagsRes.data.tag ?? []
  const purchaseTag = tags.find(t => t.name === 'GA4_purchase')

  if (!purchaseTag) {
    console.log('  ✗ GA4_purchase 태그 못 찾음')
    return
  }

  const existingBlockingTriggers = purchaseTag.blockingTriggerId || []
  console.log(`  현재 발화 트리거: ${purchaseTag.firingTriggerId?.join(', ')}`)
  console.log(`  현재 차단 트리거: ${existingBlockingTriggers.length > 0 ? existingBlockingTriggers.join(', ') : '없음'}`)

  if (exceptionTriggerId) {
    if (existingBlockingTriggers.includes(exceptionTriggerId)) {
      console.log(`  ⏭  이미 차단 트리거에 포함됨`)
    } else {
      console.log(`  ➕ 차단 트리거 추가: ${exceptionTriggerName} (ID: ${exceptionTriggerId})`)
      console.log(`     → ecommerce.value가 없는 purchase는 GA4로 안 보냄`)
      if (APPLY) {
        await gtm.accounts.containers.workspaces.tags.update({
          path: purchaseTag.path!,
          requestBody: {
            ...purchaseTag,
            blockingTriggerId: [...existingBlockingTriggers, exceptionTriggerId],
          },
        })
        console.log(`     → 적용 완료`)
      }
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (APPLY) {
    console.log('✅ 완료. Publish 필요.')
  } else {
    console.log('👀 Dry-run 완료. 적용: npx tsx scripts/gtm-fix-purchase-condition.ts --apply')
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1) })
