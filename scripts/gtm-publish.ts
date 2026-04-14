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

const versionName = process.argv[2] || 'API auto-publish'

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GA4_CLIENT_EMAIL!, private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n') },
    scopes: [
      'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
      'https://www.googleapis.com/auth/tagmanager.publish',
    ],
  })
  const client = await auth.getClient()
  const gtm = google.tagmanager({ version: 'v2', auth: client as any })
  const workspacePath = `accounts/${process.env.GTM_ACCOUNT_ID}/containers/${process.env.GTM_CONTAINER_ID}/workspaces/${process.env.GTM_WORKSPACE_ID}`

  console.log(`Workspace: ${workspacePath}`)
  console.log(`Version name: ${versionName}`)
  console.log('Publishing...')

  const resp = await gtm.accounts.containers.workspaces.create_version({
    path: workspacePath,
    requestBody: { name: versionName },
  })

  const version = resp.data.containerVersion
  if (version?.containerVersionId) {
    // Publish
    const containerPath = `accounts/${process.env.GTM_ACCOUNT_ID}/containers/${process.env.GTM_CONTAINER_ID}`
    await gtm.accounts.containers.versions.publish({
      path: `${containerPath}/versions/${version.containerVersionId}`,
    })
    console.log(`✅ Published! Version ID: ${version.containerVersionId}`)
  } else {
    console.log('⚠️ Version 생성됨 (컴파일 경고 있을 수 있음)')
    console.log(JSON.stringify(resp.data, null, 2).slice(0, 500))
  }
}

main().catch(e => console.error('Error:', e.message))
