import { PageTransition } from '@/components/page-transition'
import * as fs from 'fs'
import * as path from 'path'

export const dynamic = 'force-dynamic'

type GarnetRole = {
  id: string
  name: string
  description: string
  domains: string[]
  active: boolean
  activatedAt?: string
}

function loadRoles(): GarnetRole[] {
  try {
    const rolesPath = path.join(process.cwd(), '.garnet-config', 'roles.json')
    if (fs.existsSync(rolesPath)) {
      return JSON.parse(fs.readFileSync(rolesPath, 'utf-8'))
    }
  } catch { /* */ }
  return [
    { id: 'marketing_analyst', name: '마케팅 분석가', description: 'SNS/콘텐츠/캠페인 전략 분석 및 제안', domains: ['marketing', 'content_strategy'], active: true },
    { id: 'competitive_intel', name: '경쟁 정보 분석가', description: '경쟁사 동향 모니터링 및 대응 전략', domains: ['competitive'], active: true },
    { id: 'data_analyst', name: '데이터 분석가', description: 'GA4/SNS 데이터 해석 및 인사이트 도출', domains: ['marketing'], active: true },
  ]
}

export default async function RolesPage() {
  const roles = loadRoles()
  const activeRoles = roles.filter(r => r.active)
  const inactiveRoles = roles.filter(r => !r.active)

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-widest text-[var(--accent-text)] mb-1">Role Manager</p>
          <h1 className="text-2xl font-bold text-zinc-100">역할 관리</h1>
          <p className="text-sm text-zinc-500 mt-1">Garnet이 수행하는 역할과 확장 가능한 역할</p>
        </header>

        {/* Active Roles */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-green-400 uppercase tracking-wide mb-4">활성 역할 ({activeRoles.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeRoles.map(r => (
              <div key={r.id} className="rounded-xl border border-green-900/30 bg-green-950/10 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-sm font-medium text-zinc-200">{r.name}</span>
                </div>
                <p className="text-xs text-zinc-500 mb-3">{r.description}</p>
                <div className="flex flex-wrap gap-1">
                  {r.domains.map(d => (
                    <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{d}</span>
                  ))}
                </div>
                {r.activatedAt && (
                  <p className="text-[10px] text-zinc-600 mt-2">활성화: {new Date(r.activatedAt).toLocaleDateString('ko-KR')}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Inactive/Proposed Roles */}
        {inactiveRoles.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-yellow-400 uppercase tracking-wide mb-4">제안된 역할 ({inactiveRoles.length})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {inactiveRoles.map(r => (
                <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-400" />
                    <span className="text-sm font-medium text-zinc-300">{r.name}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mb-3">{r.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {r.domains.map(d => (
                      <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{d}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* How Roles Expand */}
        <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">역할은 어떻게 확장되나요?</h2>
          <div className="text-xs text-zinc-500 space-y-2">
            <p>1. Garnet이 특정 도메인의 지식을 충분히 축적하면 (50건+, 신뢰도 70%+)</p>
            <p>2. Emergence Detector가 새 능력 창발을 감지합니다</p>
            <p>3. 새 역할이 제안되고, 사용자 승인 시 활성화됩니다</p>
            <p>4. 활성화된 역할은 Reasoner의 판단에 반영됩니다</p>
          </div>
        </section>
      </div>
    </PageTransition>
  )
}
