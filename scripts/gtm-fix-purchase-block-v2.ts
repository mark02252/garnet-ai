/**
 * purchase 예외 트리거 강화
 * v1: ecommerce.value === undefined 차단
 * v2: ecommerce.value가 undefined, 빈값, 0, null일 때 모두 차단
 *
 * 방법: Custom JS 변수로 "ecommerce.value가 유효한가" 판별
 *       → 유효하지 않으면 exception trigger 발동
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

  const varsRes = await gtm.accounts.containers.workspaces.variables.list({ parent: PARENT })
  const vars = varsRes.data.variable ?? []
  const varByName = new Map(vars.map(v => [v.name!, v]))

  // 1. "ecommerce.value가 유효한지" 판별 변수 생성
  console.log('\n━━━ Step 1: 유효성 판별 변수 ━━━')
  const validatorName = 'JS - has_valid_ecommerce_value'
  const validatorCode = `function(){
  var v = {{DLV - ecommerce.value}};
  if (v === undefined || v === null || v === '' || v === 0 || v === '0') return 'false';
  return 'true';
}`

  if (varByName.has(validatorName)) {
    console.log(`  ⏭  ${validatorName} (이미 존재)`)
  } else {
    console.log(`  ➕ ${validatorName}`)
    if (APPLY) {
      await gtm.accounts.containers.workspaces.variables.create({
        parent: PARENT,
        requestBody: {
          name: validatorName,
          type: 'jsm',
          parameter: [{ type: 'template', key: 'javascript', value: validatorCode }],
        },
      })
      console.log('     → 생성 완료')
    }
  }

  // 2. 기존 exception trigger 찾기
  console.log('\n━━━ Step 2: 예외 트리거 업데이트 ━━━')
  const triggersRes = await gtm.accounts.containers.workspaces.triggers.list({ parent: PARENT })
  const triggers = triggersRes.data.trigger ?? []
  const blockTrigger = triggers.find(t => t.name?.includes('Block - purchase'))

  if (blockTrigger) {
    console.log(`  ✏️  기존 트리거 업데이트: ${blockTrigger.name}`)
    console.log(`     조건: has_valid_ecommerce_value === 'false' 일 때 차단`)
    if (APPLY) {
      await gtm.accounts.containers.workspaces.triggers.update({
        path: blockTrigger.path!,
        requestBody: {
          ...blockTrigger,
          filter: [
            {
              type: 'equals',
              parameter: [
                { type: 'template', key: 'arg0', value: `{{${validatorName}}}` },
                { type: 'template', key: 'arg1', value: 'false' },
              ],
            },
          ],
        },
      })
      console.log('     → 업데이트 완료')
    }
  } else {
    console.log('  ✗ Block trigger 못 찾음')
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (APPLY) {
    console.log('✅ 완료. Publish 필요.')
  } else {
    console.log('👀 Dry-run 완료. 적용: npx tsx scripts/gtm-fix-purchase-block-v2.ts --apply')
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1) })
