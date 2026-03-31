import type { GA4SummaryData } from '@/lib/canvas-store';

export function GA4SummaryPanel({ data }: { data: GA4SummaryData }) {
  const wowSign  = data.wow >= 0 ? '+' : '';
  const wowColor = data.wow >= 0 ? 'var(--shell-status-success)' : 'var(--shell-status-error)';
  return (
    <div className="p-1">
      <div className="text-[28px] font-bold text-[var(--shell-text-primary)]">{data.value.toLocaleString()}</div>
      <div className="text-[12px] text-[var(--shell-text-muted)] mt-1">{data.metric}</div>
      <div className="text-[13px] font-semibold mt-2" style={{ color: wowColor }}>{wowSign}{data.wow}% WoW</div>
    </div>
  );
}
