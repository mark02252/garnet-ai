import type { VideoStatusData } from '@/lib/canvas-store';

export function VideoStatusPanel({ data }: { data: VideoStatusData }) {
  return (
    <div className="p-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] text-[var(--shell-text-muted)]">진행률</span>
        <span className="text-[13px] font-semibold text-[var(--shell-text-primary)]">
          {data.progress}%
        </span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--shell-border)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${data.progress}%`, background: 'var(--shell-accent)' }}
        />
      </div>
      {data.url && (
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] mt-2 block"
          style={{ color: 'var(--shell-accent)' }}
        >
          영상 다운로드 →
        </a>
      )}
      <div className="text-[11px] text-[var(--shell-text-muted)] mt-1">Job: {data.jobId}</div>
    </div>
  );
}
