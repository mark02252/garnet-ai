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
    scopes: ['https://www.googleapis.com/auth/tagmanager.readonly'],
  })
  const client = await auth.getClient()
  const gtm = google.tagmanager({ version: 'v2', auth: client as any })

  const accountId = process.env.GTM_ACCOUNT_ID!

  const account = await gtm.accounts.get({ path: `accounts/${accountId}` })
  console.log('=== Account ===')
  console.log(`  Name: ${account.data.name}`)
  console.log(`  ID: ${account.data.accountId}`)

  const containers = await gtm.accounts.containers.list({ parent: `accounts/${accountId}` })
  console.log(`\n=== Container 목록 (${containers.data.container?.length ?? 0}개) ===`)
  for (const c of containers.data.container ?? []) {
    const isTarget = c.containerId === process.env.GTM_CONTAINER_ID
    const prefix = isTarget ? '👉' : '  '
    console.log(`${prefix} ${c.name} (${c.publicId}) | ID: ${c.containerId} | Domain: ${c.domainName?.join(', ') || 'N/A'}`)
  }
}
main().catch(e => console.error(e.message))
