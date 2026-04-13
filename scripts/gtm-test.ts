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

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GA4_CLIENT_EMAIL!,
      private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    },
    scopes: [
      'https://www.googleapis.com/auth/tagmanager.edit.containers',
      'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
      'https://www.googleapis.com/auth/tagmanager.publish',
      'https://www.googleapis.com/auth/tagmanager.readonly',
    ],
  })

  const client = await auth.getClient()
  const gtm = google.tagmanager({ version: 'v2', auth: client as any })

  const accountId = process.env.GTM_ACCOUNT_ID!
  const containerId = process.env.GTM_CONTAINER_ID!
  const workspaceId = process.env.GTM_WORKSPACE_ID!

  console.log('=== GTM 연결 테스트 ===')
  console.log(`Account: ${accountId}`)
  console.log(`Container: ${containerId}`)
  console.log(`Workspace: ${workspaceId}`)
  console.log('')

  try {
    const acc = await gtm.accounts.get({ path: `accounts/${accountId}` })
    console.log(`✓ Account 접근 성공: ${acc.data.name}`)

    const container = await gtm.accounts.containers.get({
      path: `accounts/${accountId}/containers/${containerId}`,
    })
    console.log(`✓ Container 접근 성공: ${container.data.name} (${container.data.publicId})`)

    const workspace = await gtm.accounts.containers.workspaces.get({
      path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
    })
    console.log(`✓ Workspace 접근 성공: ${workspace.data.name}`)

    // 태그/트리거/변수 개수만 빠르게
    const [tags, triggers, variables] = await Promise.all([
      gtm.accounts.containers.workspaces.tags.list({
        parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
      }),
      gtm.accounts.containers.workspaces.triggers.list({
        parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
      }),
      gtm.accounts.containers.workspaces.variables.list({
        parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
      }),
    ])

    console.log('')
    console.log(`  태그: ${tags.data.tag?.length ?? 0}개`)
    console.log(`  트리거: ${triggers.data.trigger?.length ?? 0}개`)
    console.log(`  변수: ${variables.data.variable?.length ?? 0}개`)
    console.log('')
    console.log('🎉 GTM API 연결 성공! Audit 진행 가능')
  } catch (err: unknown) {
    const e = err as { message?: string; code?: number }
    console.log(`✗ 에러: ${e.message}`)
    console.log(`  Code: ${e.code}`)
    if (e.code === 403) {
      console.log('')
      console.log('→ 권한 부족. 확인 사항:')
      console.log('  1. Tag Manager API가 GCP에서 활성화되었는가')
      console.log('  2. GTM에 서비스 계정 이메일이 User로 추가되었는가')
      console.log(`     - 이메일: ${process.env.GA4_CLIENT_EMAIL}`)
      console.log('     - Container Permission: Publish (또는 Edit 이상)')
    }
  }
}

main().catch(e => console.error('Fatal:', e.message))
