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
      'https://www.googleapis.com/auth/tagmanager.publish',
      'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
    ],
  })
  const client = await auth.getClient()
  const gtm = google.tagmanager({ version: 'v2', auth: client as any })

  const containerParent = `accounts/${process.env.GTM_ACCOUNT_ID}/containers/${process.env.GTM_CONTAINER_ID}`

  // 1. 새 워크스페이스
  console.log('=== 워크스페이스 생성 ===')
  const { data: ws } = await gtm.accounts.containers.workspaces.create({
    parent: containerParent,
    requestBody: {
      name: 'Fix theater mapping + normalize naming',
      description: 'Map theater_code to theater, normalize naming inconsistency',
    },
  })
  console.log('ID:', ws.workspaceId)
  const wsPath = ws.path!

  const { data: tagData } = await gtm.accounts.containers.workspaces.tags.list({ parent: wsPath })
  const tags = tagData.tag ?? []

  // 2. 정규화 JS 변수 생성
  console.log('\n=== 정규화 변수 생성 ===')
  const jsCode = [
    'function() {',
    '  var v = {{theater_code}};',
    '  if (!v) return v;',
    '  v = v.replace("\\uBAA8\\uB178\\uD50C\\uB809\\uC2A4 \\uC563 \\uB77C\\uC774\\uC988", "\\uBAA8\\uB178\\uD50C\\uB809\\uC2A4\\uC563\\uB77C\\uC774\\uC988");',
    '  return v;',
    '}',
  ].join('\n')

  // Unicode escape for the Korean text
  const jsCodeActual = 'function() { var v = {{theater_code}}; if (!v) return v; return v.replace(/\\uc560\\ub77c\\uc774\\uc988/g, v); }'

  const { data: normVar } = await gtm.accounts.containers.workspaces.variables.create({
    parent: wsPath,
    requestBody: {
      name: 'Normalized - theater_code',
      type: 'jsm',
      parameter: [
        {
          type: 'template',
          key: 'javascript',
          value: 'function(){var v={{theater_code}};if(!v)return v;if(v.indexOf("\\uD50C\\uB809\\uC2A4 \\uC563 ")>-1){v=v.replace("\\uD50C\\uB809\\uC2A4 \\uC563 ","\\uD50C\\uB809\\uC2A4\\uC563");}return v;}',
        },
      ],
    },
  })
  console.log('Created:', normVar.name)

  // Actually let's use a simpler approach with direct Korean
  // Delete and recreate with proper encoding
  await gtm.accounts.containers.workspaces.variables.delete({ path: normVar.path! })

  const normJS = `function(){var v={{theater_code}};if(!v)return v;return v.split("플렉스 앳 라").join("플렉스앳라");}`

  const { data: normVar2 } = await gtm.accounts.containers.workspaces.variables.create({
    parent: wsPath,
    requestBody: {
      name: 'Normalized - theater_code',
      type: 'jsm',
      parameter: [
        {
          type: 'template',
          key: 'javascript',
          value: normJS,
        },
      ],
    },
  })
  console.log('Created (v2):', normVar2.name)

  // 3. theater_code 사용하는 태그 찾기 + 수정
  console.log('\n=== 태그 수정 ===')

  const tagsWithTheaterCode = tags.filter((t: any) => {
    const settings = t.parameter?.find((p: any) => p.key === 'eventSettingsTable')
    return settings?.list?.some((item: any) => {
      const param = item.map?.find((m: any) => m.key === 'parameter')?.value
      return param === 'theater_code'
    })
  })

  for (const tag of tagsWithTheaterCode) {
    const settings = tag.parameter?.find((p: any) => p.key === 'eventSettingsTable')
    if (!settings?.list) continue

    // theater_code 값을 정규화 변수로 교체
    const newList = settings.list.map((item: any) => {
      const param = item.map?.find((m: any) => m.key === 'parameter')?.value
      if (param === 'theater_code') {
        return {
          ...item,
          map: item.map.map((m: any) => {
            if (m.key === 'parameterValue') {
              return { ...m, value: '{{Normalized - theater_code}}' }
            }
            return m
          }),
        }
      }
      return item
    })

    // theater 파라미터 추가
    const hasTheater = newList.some((item: any) => {
      return item.map?.find((m: any) => m.key === 'parameter')?.value === 'theater'
    })

    if (!hasTheater) {
      newList.push({
        type: 'map',
        map: [
          { type: 'template', key: 'parameter', value: 'theater' },
          { type: 'template', key: 'parameterValue', value: '{{Normalized - theater_code}}' },
        ],
      })
    }

    const updatedParams = tag.parameter!.map((p: any) => {
      if (p.key === 'eventSettingsTable') {
        return { ...p, list: newList }
      }
      return p
    })

    await gtm.accounts.containers.workspaces.tags.update({
      path: tag.path!,
      requestBody: { ...tag, parameter: updatedParams },
    })
    console.log('  Updated:', tag.name)
  }

  // 4. 게시
  console.log('\n=== 게시 ===')
  const { data: version } = await gtm.accounts.containers.workspaces.create_version({
    path: wsPath,
    requestBody: {
      name: 'Fix theater mapping + normalize naming',
      notes: '1. theater_code normalize (spacing fix for Rise)\n2. theater param mapped from theater_code',
    },
  })

  const versionPath = version.containerVersion?.path
  if (versionPath) {
    await gtm.accounts.containers.versions.publish({ path: versionPath })
    console.log('Published! Version:', version.containerVersion?.containerVersionId)
  }
}

main().catch(e => console.error('ERROR:', e.message))
