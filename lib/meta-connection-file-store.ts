// lib/meta-connection-file-store.ts
// 파일 기반 Meta 연결 정보 백업 저장소
// localStorage/Electron safeStorage와 별개로 로컬 파일에 백업
// dev 서버 재시작 시에도 토큰이 유지되도록 함

import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const STORE_DIR = join(process.cwd(), '.garnet-config')
const META_CONNECTION_FILE = join(STORE_DIR, 'meta-connection.json')

export type MetaConnectionFileData = {
  appId: string
  appSecret: string
  accessToken: string
  instagramBusinessAccountId: string
  loginMode: string
  tokenSource: string
  tokenExpiresIn: number | null
  lastConnectedAt: string
  savedAt: string
}

export async function saveMetaConnectionToFile(data: Partial<MetaConnectionFileData>): Promise<void> {
  try {
    if (!existsSync(STORE_DIR)) {
      await mkdir(STORE_DIR, { recursive: true })
    }
    // 기존 데이터 읽어서 병합
    const existing = await loadMetaConnectionFromFile()
    const merged = { ...existing, ...data, savedAt: new Date().toISOString() }
    await writeFile(META_CONNECTION_FILE, JSON.stringify(merged, null, 2), 'utf-8')
  } catch (error) {
    console.error('[meta-file-store] 저장 실패:', error)
  }
}

export async function loadMetaConnectionFromFile(): Promise<MetaConnectionFileData | null> {
  try {
    if (!existsSync(META_CONNECTION_FILE)) return null
    const raw = await readFile(META_CONNECTION_FILE, 'utf-8')
    return JSON.parse(raw) as MetaConnectionFileData
  } catch {
    return null
  }
}
