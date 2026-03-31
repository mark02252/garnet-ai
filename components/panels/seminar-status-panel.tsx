import type { SeminarStatusData } from '@/lib/canvas-store';

export function SeminarStatusPanel({ data }: { data: SeminarStatusData }) {
  const progress = (data.round / data.maxRounds) * 100;

  return (
    <div className="p-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] text-[var(--shell-text-muted)]">Round</span>
        <span className="text-[13px] font-semibold text-[var(--shell-text-primary)]">
          {data.round} / {data.maxRounds}
        </span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--shell-border)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${progress}%`, background: 'var(--shell-accent)' }}
        />
      </div>
      <div className="text-[11px] text-[var(--shell-text-muted)] mt-2">{data.status}</div>
    </div>
  );
}
