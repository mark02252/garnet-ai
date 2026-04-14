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

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GA4_CLIENT_EMAIL!, private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/tagmanager.edit.containers'],
  })
  const client = await auth.getClient()
  const gtm = google.tagmanager({ version: 'v2', auth: client as any })
  const containerPath = `accounts/${process.env.GTM_ACCOUNT_ID}/containers/${process.env.GTM_CONTAINER_ID}`

  // 기존 Workspace 목록
  const ws = await gtm.accounts.containers.workspaces.list({ parent: containerPath })
  console.log('=== 기존 Workspaces ===')
  for (const w of ws.data.workspace ?? []) {
    console.log(`  ID: ${w.workspaceId} | ${w.name} | ${w.description || '(설명 없음)'}`)
  }

  // 새 Workspace 생성
  console.log('\n새 Workspace 생성 중...')
  const newWs = await gtm.accounts.containers.workspaces.create({
    parent: containerPath,
    requestBody: {
      name: 'Fix purchase value mapping',
      description: 'ecommerce.value 폴백 변수 추가 + purchase 태그 수정',
    },
  })
  console.log(`✅ 새 Workspace 생성: ID ${newWs.data.workspaceId} (${newWs.data.name})`)
  console.log(`\n.env 업데이트 필요: GTM_WORKSPACE_ID=${newWs.data.workspaceId}`)
}

main().catch(e => console.error('Error:', e.message))
