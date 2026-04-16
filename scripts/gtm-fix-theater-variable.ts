/**
 * GTM theater_code 변수를 URL Query → Data Layer Variable로 전환
 *
 * 문제: 현재 theater_code가 URL 쿼리(?theaterCode=)에서 추출하지만
 *       대부분 페이지 URL에 해당 쿼리가 없어서 (not set) 발생
 *
 * 해결: dataLayer의 theater 또는 theater_code 필드에서 읽도록 변경
 *       → 폴백 변수 사용 (ecommerce.theater_code → theater_code → theater)
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

  // 1. 현재 theater_code 변수 조회
  const varsRes = await gtm.accounts.containers.workspaces.variables.list({ parent: PARENT })
  const vars = varsRes.data.variable ?? []
  const theaterCodeVar = vars.find(v => v.name === 'theater_code')

  if (!theaterCodeVar) {
    console.log('✗ theater_code 변수를 찾을 수 없음')
    return
  }

  console.log('현재 theater_code 변수:')
  console.log(`  type: ${theaterCodeVar.type}`)
  for (const p of theaterCodeVar.parameter || []) {
    console.log(`    ${p.key} = ${p.value}`)
  }

  // 2. dataLayer 변수 3개 생성 (없으면)
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📌 Step 1: DLV 변수 생성')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const newDLVs = [
    { name: 'DLV - ecommerce.theater_code', path: 'ecommerce.theater_code' },
    { name: 'DLV - theater_code', path: 'theater_code' },
    { name: 'DLV - theater', path: 'theater' },
  ]

  const varByName = new Map(vars.map(v => [v.name!, v]))

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

  // 3. 폴백 변수 생성: ecommerce.theater_code → theater_code → theater → URL query
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📌 Step 2: Fallback - theater_code 변수 생성/업데이트')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const fallbackName = 'Fallback - theater_code'
  const fallbackCode = `function(){
  var ecom = {{DLV - ecommerce.theater_code}};
  if (ecom) return ecom;
  var dl = {{DLV - theater_code}};
  if (dl) return dl;
  var theater = {{DLV - theater}};
  if (theater) return theater;
  // URL fallback (기존 호환성)
  var url = new URL(document.location.href);
  return url.searchParams.get('theaterCode') || '';
}`

  const existingFallback = varByName.get(fallbackName)
  if (existingFallback) {
    console.log(`  ⏭  ${fallbackName} (이미 존재 — 덮어쓸지 결정)`)
  } else {
    console.log(`  ➕ ${fallbackName}`)
    if (APPLY) {
      await gtm.accounts.containers.workspaces.variables.create({
        parent: PARENT,
        requestBody: {
          name: fallbackName,
          type: 'jsm',
          parameter: [
            { type: 'template', key: 'javascript', value: fallbackCode },
          ],
        },
      })
      console.log(`     → 생성 완료`)
    }
  }

  // 4. theater_code 변수 자체를 폴백으로 교체 (또는 GA4 태그에서 폴백 변수 사용)
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📌 Step 3: theater_code 변수 → Custom JS 폴백으로 교체')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  ✏️  theater_code [URL→jsm]`)
  console.log(`     기존: URL Query (theaterCode)`)
  console.log(`     변경: ecommerce.theater_code → theater_code → theater → URL query 폴백`)

  if (APPLY) {
    await gtm.accounts.containers.workspaces.variables.update({
      path: theaterCodeVar.path!,
      requestBody: {
        name: 'theater_code',
        type: 'jsm',
        parameter: [
          { type: 'template', key: 'javascript', value: fallbackCode },
        ],
      },
    })
    console.log(`     → 업데이트 완료`)
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (APPLY) {
    console.log('✅ 완료. Preview 모드로 테스트 후 Publish 필요.')
    console.log('   기존 URL 쿼리 방식도 폴백으로 유지되니 호환성 OK')
  } else {
    console.log('👀 Dry-run 완료. 적용: npx tsx scripts/gtm-fix-theater-variable.ts --apply')
  }
}

main().catch(e => {
  console.error('Error:', e.message)
  process.exit(1)
})
