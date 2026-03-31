'use client';

import { useEffect, useState } from 'react';
import type { VideoStatusData } from '@/lib/canvas-store';

export function VideoStatusPanel({ data: initial }: { data: VideoStatusData }) {
  const [data, setData] = useState<VideoStatusData>(initial);

  // Poll every 10s while job is in progress
  useEffect(() => {
    if (!data.jobId || data.progress >= 100) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/video/status');
        if (res.ok) {
          const d = (await res.json()) as { jobId?: string; progress?: number; url?: string };
          if (d.jobId === data.jobId) {
            setData((prev) => ({ ...prev, progress: d.progress ?? prev.progress, url: d.url }));
          }
        }
      } catch {}
    }, 10_000);
    return () => clearInterval(id);
  }, [data.jobId, data.progress]);

  if (!data.jobId) return <div className="p-1 text-[12px] text-[var(--shell-text-muted)]">진행 중인 영상 없음</div>;
  return (
    <div className="p-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] text-[var(--shell-text-muted)]">진행률</span>
        <span className="text-[13px] font-semibold text-[var(--shell-text-primary)]">{data.progress}%</span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--shell-border)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${data.progress}%`, background: 'var(--shell-accent)' }} />
      </div>
      {data.url && (
        <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-[11px] mt-2 block" style={{ color: 'var(--shell-accent)' }}>
          영상 다운로드 →
        </a>
      )}
      <div className="text-[11px] text-[var(--shell-text-muted)] mt-1">Job: {data.jobId}</div>
    </div>
  );
}
