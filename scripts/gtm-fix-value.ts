/**
 * GTM 매출 value 매핑 수정
 *
 * 문제: sendEcommerceData=true로 변경 후,
 *       eventSettingsTable의 value={{dlv_value}} (최상위 value)가
 *       ecommerce.value를 덮어쓰면서 매출이 0으로 잡힘
 *
 * 해결: ecommerce.value를 우선으로 읽되, 기존 최상위 value도 폴백으로 지원
 *       → DLV 변수 2개 생성 + Custom JS 폴백 변수 2개 + 태그 업데이트
 *
 * 실행:
 *   Dry-run: npx tsx scripts/gtm-fix-value.ts
 *   Apply:   npx tsx scripts/gtm-fix-value.ts --apply
 */

import { readFileSync } from 'fs'
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

  // 현재 변수 조회
  const varsRes = await gtm.accounts.containers.workspaces.variables.list({ parent: PARENT })
  const vars = varsRes.data.variable ?? []
  const varByName = new Map(vars.map(v => [v.name!, v]))

  // 현재 태그 조회
  const tagsRes = await gtm.accounts.containers.workspaces.tags.list({ parent: PARENT })
  const tags = tagsRes.data.tag ?? []

  // ═══ Step 1: ecommerce.value DLV 변수 생성 ═══
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📌 Step 1: ecommerce DLV 변수 생성')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const newDLVs = [
    { name: 'DLV - ecommerce.value', path: 'ecommerce.value' },
    { name: 'DLV - ecommerce.transaction_id', path: 'ecommerce.transaction_id' },
  ]

  for (const dlv of newDLVs) {
    if (varByName.has(dlv.name)) {
      console.log(`  ⏭  ${dlv.name} (이미 존재)`)
      continue
    }
    console.log(`  ➕ ${dlv.name} → ${dlv.path}`)
    if (APPLY) {
      await gtm.accounts.containers.workspaces.variables.create({
        parent: PARENT,
        requestBody: {
          name: dlv.name,
          type: 'v',
          parameter: [
            { type: 'integer', key: 'dataLayerVersion', value: '2' },
            { type: 'boolean', key: 'setDefaultValue', value: 'false' },
            { type: 'template', key: 'name', value: dlv.path },
          ],
        },
      })
      console.log(`     → 생성 완료`)
    }
  }

  // ═══ Step 2: 폴백 변수 생성 (ecommerce.value || value) ═══
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📌 Step 2: 폴백 Custom JS 변수 생성')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const fallbackVars = [
    {
      name: 'Fallback - value',
      code: 'function(){var e={{DLV - ecommerce.value}};if(e)return e;return {{dlv_value}};}',
    },
    {
      name: 'Fallback - transaction_id',
      code: 'function(){var e={{DLV - ecommerce.transaction_id}};if(e)return e;return {{dlv_transaction_id}};}',
    },
  ]

  for (const fb of fallbackVars) {
    if (varByName.has(fb.name)) {
      console.log(`  ⏭  ${fb.name} (이미 존재)`)
      continue
    }
    console.log(`  ➕ ${fb.name}`)
    if (APPLY) {
      await gtm.accounts.containers.workspaces.variables.create({
        parent: PARENT,
        requestBody: {
          name: fb.name,
          type: 'jsm',
          parameter: [
            { type: 'template', key: 'javascript', value: fb.code },
          ],
        },
      })
      console.log(`     → 생성 완료`)
    }
  }

  // ═══ Step 3: purchase 태그 업데이트 (value, transaction_id를 폴백 변수로 교체) ═══
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📌 Step 3: GA4_purchase 태그 파라미터 수정')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const purchaseTag = tags.find(t => t.name === 'GA4_purchase')
  if (!purchaseTag) {
    console.log('  ✗ GA4_purchase 태그를 찾을 수 없음')
    return
  }

  // eventSettingsTable에서 value, transaction_id 매핑 교체
  const newParams = (purchaseTag.parameter || []).map(p => {
    if (p.key !== 'eventSettingsTable') return p

    const newList = (p.list || []).map(item => {
      const paramKey = item.map?.find(m => m.key === 'parameter')?.value
      const paramValueEntry = item.map?.find(m => m.key === 'parameterValue')

      if (paramKey === 'value' && paramValueEntry) {
        console.log(`  ✏️  value: ${paramValueEntry.value} → {{Fallback - value}}`)
        return {
          ...item,
          map: item.map?.map(m =>
            m.key === 'parameterValue' ? { ...m, value: '{{Fallback - value}}' } : m
          ),
        }
      }
      if (paramKey === 'transaction_id' && paramValueEntry) {
        console.log(`  ✏️  transaction_id: ${paramValueEntry.value} → {{Fallback - transaction_id}}`)
        return {
          ...item,
          map: item.map?.map(m =>
            m.key === 'parameterValue' ? { ...m, value: '{{Fallback - transaction_id}}' } : m
          ),
        }
      }
      return item
    })

    return { ...p, list: newList }
  })

  if (APPLY) {
    await gtm.accounts.containers.workspaces.tags.update({
      path: purchaseTag.path!,
      requestBody: { ...purchaseTag, parameter: newParams },
    })
    console.log('  → GA4_purchase 업데이트 완료')
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (APPLY) {
    console.log('✅ 완료. Preview 테스트 후 Publish 필요.')
  } else {
    console.log('👀 Dry-run 완료. 실제 적용: npx tsx scripts/gtm-fix-value.ts --apply')
  }
}

main().catch(e => {
  console.error('Error:', e.message)
  process.exit(1)
})
