import * as fs from 'fs'
import * as path from 'path'
import { isTelegramConfigured, sendMessage } from '@/lib/telegram'

type GarnetRole = {
  id: string
  name: string
  description: string
  domains: string[]
  active: boolean
  activatedAt?: string
}

const ROLES_PATH = path.join(process.cwd(), '.garnet-config', 'roles.json')

const DEFAULT_ROLES: GarnetRole[] = [
  { id: 'marketing_analyst', name: '마케팅 분석가', description: 'SNS/콘텐츠/캠페인 전략 분석 및 제안', domains: ['marketing', 'content_strategy'], active: true },
  { id: 'competitive_intel', name: '경쟁 정보 분석가', description: '경쟁사 동향 모니터링 및 대응 전략', domains: ['competitive'], active: true },
  { id: 'data_analyst', name: '데이터 분석가', description: 'GA4/SNS 데이터 해석 및 인사이트 도출', domains: ['marketing'], active: true },
]

export function loadRoles(): GarnetRole[] {
  try {
    if (fs.existsSync(ROLES_PATH)) {
      return JSON.parse(fs.readFileSync(ROLES_PATH, 'utf-8'))
    }
  } catch { /* fall through */ }
  return DEFAULT_ROLES
}

export function saveRoles(roles: GarnetRole[]): void {
  try {
    const dir = path.dirname(ROLES_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(ROLES_PATH, JSON.stringify(roles, null, 2))
  } catch { /* non-critical */ }
}

/** 새 역할 제안 (Emergence Detector + Self Benchmark 기반) */
export async function proposeNewRoles(emergentCapabilities: Array<{
  name: string; description: string; readiness: number; requiredDomains: string[]
}>): Promise<GarnetRole[]> {
  const currentRoles = loadRoles()
  const currentIds = new Set(currentRoles.map(r => r.id))
  const proposed: GarnetRole[] = []

  for (const cap of emergentCapabilities) {
    if (cap.readiness < 70) continue // 70% 이상만 제안

    const roleId = cap.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    if (currentIds.has(roleId)) continue

    const newRole: GarnetRole = {
      id: roleId,
      name: cap.name,
      description: cap.description,
      domains: cap.requiredDomains,
      active: false, // 사용자 승인 필요
    }
    proposed.push(newRole)

    // 알림
    if (isTelegramConfigured()) {
      await sendMessage(
        `🆕 *새 역할 제안*\n\n*${cap.name}* (준비도 ${cap.readiness}%)\n${cap.description}\n\n이 역할을 활성화하시겠습니까?`,
        { parseMode: 'Markdown' },
      ).catch(() => {})
    }
  }

  return proposed
}

/** 역할 활성화 */
export function activateRole(roleId: string): boolean {
  const roles = loadRoles()
  const role = roles.find(r => r.id === roleId)
  if (!role) return false
  role.active = true
  role.activatedAt = new Date().toISOString()
  saveRoles(roles)
  return true
}

/** Reasoner용: 활성화된 역할 요약 */
export function getActiveRolesSummary(): string {
  const roles = loadRoles()
  const active = roles.filter(r => r.active)
  if (active.length === 0) return '활성 역할 없음'
  return active.map(r => `- ${r.name}: ${r.description}`).join('\n')
}
