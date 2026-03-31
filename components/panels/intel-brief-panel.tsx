import type { IntelBriefData } from '@/lib/canvas-store';

export function IntelBriefPanel({ data }: { data: IntelBriefData }) {
  return (
    <div className="p-1">
      <div className="text-[24px] font-bold text-[var(--shell-accent)]">{data.trendCount}</div>
      <div className="text-[11px] text-[var(--shell-text-muted)] mb-2">트렌드 감지됨</div>
      <p className="text-[12px] text-[var(--shell-text-secondary)] leading-relaxed">{data.summary}</p>
    </div>
  );
}
