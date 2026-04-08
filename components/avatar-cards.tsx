import type { AgentCard } from '@/lib/agent-ui';

const defaultCards: AgentCard[] = [
  { id: 'strategist', nickname: '전략가', specialty: '시장 문제 정의 및 포지셔닝', roleLabel: '기본 슬롯' },
  { id: 'content', nickname: '콘텐츠 디렉터', specialty: '메시지 설계와 채널별 카피', roleLabel: '기본 슬롯' },
  { id: 'performance', nickname: '퍼포먼스 마케터', specialty: 'KPI, 측정, 테스트 설계', roleLabel: '기본 슬롯' },
  { id: 'operations', nickname: '운영 매니저', specialty: '실행 계획과 운영 리스크 관리', roleLabel: '기본 슬롯' },
  { id: 'pm', nickname: 'PM', specialty: '최종 의사결정 및 산출물 확정', roleLabel: '최종 결정' }
];

export function AvatarCards({ cards }: { cards?: AgentCard[] }) {
  const items = cards && cards.length > 0 ? cards : defaultCards;

  return (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((avatar) => (
        <div key={avatar.id} className="list-card">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-text)]">
              {avatar.nickname.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-[var(--text-strong)]">{avatar.nickname}</p>
                {avatar.roleLabel && <span className="pill-option">{avatar.roleLabel}</span>}
              </div>
              <p className="mt-1 line-clamp-1 text-xs leading-5 text-[var(--text-muted)]">{avatar.specialty}</p>
              {avatar.phaseLabel && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{avatar.phaseLabel}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
