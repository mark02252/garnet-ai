/**
 * 지점 코드 → 이름 매핑
 * GA4의 theater_code 파라미터를 사람이 읽기 좋은 이름으로 변환
 *
 * 3가지 형식 모두 지원:
 * - Raw 코드: m001, m002, o001 등
 * - 암호화 코드: 해시 문자열
 * - 한글 이름: theater 필드에서 직접 올 때
 *
 * ⚠️ 실제 지점 데이터는 theater-mapping.local.ts에 정의하세요.
 *    이 파일은 예시 데이터입니다.
 */

import * as fs from 'fs'
import * as path from 'path'

type TheaterInfo = {
  raw: string
  encrypted: string
  name: string
  type: 'general' | 'outdoor'
}

// 예시 데이터 (실제 운영 시 theater-mapping.local.ts로 교체)
const EXAMPLE_THEATERS: TheaterInfo[] = [
  { raw: 'm001', encrypted: 'example_hash_001', name: 'Cinema A', type: 'general' },
  { raw: 'm002', encrypted: 'example_hash_002', name: 'Cinema B', type: 'general' },
  { raw: 'm003', encrypted: 'example_hash_003', name: 'Cinema C', type: 'general' },
  { raw: 'o001', encrypted: 'example_hash_o01', name: 'Outdoor Cinema', type: 'outdoor' },
]

// 로컬 파일이 있으면 로드, 없으면 예시 데이터 사용
function loadTheaters(): TheaterInfo[] {
  try {
    const localPath = path.join(__dirname, 'theater-mapping.local')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const local = require(localPath)
    if (Array.isArray(local.THEATERS)) return local.THEATERS
    if (local.default && Array.isArray(local.default)) return local.default
  } catch { /* local file not found, use examples */ }
  return EXAMPLE_THEATERS
}

const THEATERS = loadTheaters()

// 모든 형식 → 이름 매핑 (raw, encrypted, 한글 모두)
const _lookup = new Map<string, string>()
for (const t of THEATERS) {
  _lookup.set(t.raw, t.name)
  _lookup.set(t.encrypted, t.name)
  _lookup.set(t.name, t.name)
}

/**
 * 어떤 형식이든 이름으로 변환
 * raw(m001), encrypted, 한글 모두 지원
 */
export function mapTheaterCode(code: string | null | undefined): string {
  if (!code) return '(미분류)'
  const trimmed = code.trim()
  return _lookup.get(trimmed) || _lookup.get(code) || trimmed
}

/**
 * 이름 표시 (매핑 안 되면 코드 그대로 + 미등록 표시)
 */
export function formatTheaterLabel(code: string | null | undefined): string {
  if (!code) return '(미분류)'
  const trimmed = code.trim()
  const name = _lookup.get(trimmed) || _lookup.get(code)
  return name || `${trimmed} (미등록)`
}

/**
 * 전체 지점 목록 조회
 */
export function getAllTheaters(): TheaterInfo[] {
  return THEATERS
}

/**
 * 기존 THEATER_MAPPING 호환 (레거시)
 */
export const THEATER_MAPPING: Record<string, string> = Object.fromEntries(
  THEATERS.flatMap(t => [[t.raw, t.name], [t.encrypted, t.name]])
)
